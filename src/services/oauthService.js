const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const bcrypt = require('bcrypt');

/**
 * OAuth2 Service for managing JWT tokens and user authentication
 */
class OAuthService {
  constructor() {
    // In-memory storage for demo purposes
    // In production, this should be replaced with a database
    this.users = new Map();
    this.refreshTokens = new Map();
    
    // JWT configuration
    this.jwtSecret = process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex');
    this.jwtExpiresIn = process.env.JWT_EXPIRES_IN || '1h';
    this.refreshTokenExpiresIn = process.env.REFRESH_TOKEN_EXPIRES_IN || '7d';
    
    // Password hashing configuration
    this.saltRounds = 12;
    
    // Default roles and permissions
    this.roles = {
      'admin': ['*'],
      'user': ['ugc:generate', 'cache:read'],
      'viewer': ['cache:read', 'analytics:read']
    };
    
    // Initialize default users asynchronously
    this.initializeDefaultUsers().catch(console.error);
  }

  /**
   * Initialize some default users for testing
   */
  async initializeDefaultUsers() {
    // Create a default admin user with hashed password
    const adminUser = await this.createUser({
      email: 'admin@example.com',
      name: 'Admin User',
      provider: 'local',
      providerId: 'admin-local',
      role: 'admin',
      password: 'admin123'
    });
    
    console.log(`👤 Default admin user created: ${adminUser.email}`);
    console.log('   Password: admin123');
  }

  /**
   * Create a new user
   * @param {Object} userData - User data
   * @returns {Object} Created user
   */
  async createUser(userData) {
    const userId = crypto.randomUUID();
    
    // Hash password if provided
    let hashedPassword = null;
    if (userData.password) {
      hashedPassword = await bcrypt.hash(userData.password, this.saltRounds);
    }
    
    const user = {
      id: userId,
      email: userData.email,
      name: userData.name,
      provider: userData.provider || 'local',
      providerId: userData.providerId || userData.email,
      role: userData.role || 'user',
      permissions: this.roles[userData.role || 'user'] || this.roles.user,
      passwordHash: hashedPassword,
      createdAt: new Date(),
      lastLogin: null,
      isActive: true,
      metadata: userData.metadata || {}
    };
    
    this.users.set(userId, user);
    return user;
  }

  /**
   * Find user by provider ID
   * @param {string} provider - OAuth provider (google, etc.)
   * @param {string} providerId - Provider-specific user ID
   * @returns {Object|null} User if found
   */
  findUserByProvider(provider, providerId) {
    for (const [userId, user] of this.users.entries()) {
      if (user.provider === provider && user.providerId === providerId) {
        return user;
      }
    }
    return null;
  }

  /**
   * Find user by email
   * @param {string} email - User email
   * @returns {Object|null} User if found
   */
  findUserByEmail(email) {
    for (const [userId, user] of this.users.entries()) {
      if (user.email === email) {
        return user;
      }
    }
    return null;
  }

  /**
   * Verify user password
   * @param {string} email - User email
   * @param {string} password - Plain text password
   * @returns {Object|null} User if credentials are valid
   */
  async verifyUserCredentials(email, password) {
    const user = this.findUserByEmail(email);
    if (!user || !user.passwordHash) {
      return null;
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    return isValid ? user : null;
  }

  /**
   * Find user by ID
   * @param {string} userId - User ID
   * @returns {Object|null} User if found
   */
  findUserById(userId) {
    return this.users.get(userId) || null;
  }

  /**
   * Generate JWT access token
   * @param {Object} user - User object
   * @returns {string} JWT token
   */
  generateAccessToken(user) {
    const payload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      permissions: user.permissions,
      type: 'access'
    };
    
    return jwt.sign(payload, this.jwtSecret, {
      expiresIn: this.jwtExpiresIn,
      issuer: 'ugc-ad-creator-api',
      audience: 'ugc-ad-creator-clients'
    });
  }

  /**
   * Generate refresh token
   * @param {Object} user - User object
   * @returns {string} Refresh token
   */
  generateRefreshToken(user) {
    const tokenId = crypto.randomUUID();
    const token = crypto.randomBytes(64).toString('hex');
    
    const refreshTokenData = {
      id: tokenId,
      token: token,
      userId: user.id,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + this.parseTimeToMs(this.refreshTokenExpiresIn)),
      isActive: true
    };
    
    this.refreshTokens.set(token, refreshTokenData);
    return token;
  }

  /**
   * Verify JWT token
   * @param {string} token - JWT token
   * @returns {Object|null} Decoded token payload if valid
   */
  verifyAccessToken(token) {
    try {
      const decoded = jwt.verify(token, this.jwtSecret, {
        issuer: 'ugc-ad-creator-api',
        audience: 'ugc-ad-creator-clients'
      });
      
      // Check if user still exists and is active
      const user = this.findUserById(decoded.sub);
      if (!user || !user.isActive) {
        return null;
      }
      
      return decoded;
    } catch (error) {
      console.error('JWT verification error:', error.message);
      return null;
    }
  }

  /**
   * Refresh access token using refresh token
   * @param {string} refreshToken - Refresh token
   * @returns {Object|null} New tokens if valid
   */
  refreshAccessToken(refreshToken) {
    const tokenData = this.refreshTokens.get(refreshToken);
    
    if (!tokenData || !tokenData.isActive) {
      return null;
    }
    
    if (new Date() > tokenData.expiresAt) {
      // Token expired, remove it
      this.refreshTokens.delete(refreshToken);
      return null;
    }
    
    const user = this.findUserById(tokenData.userId);
    if (!user || !user.isActive) {
      return null;
    }
    
    // Generate new tokens
    const newAccessToken = this.generateAccessToken(user);
    const newRefreshToken = this.generateRefreshToken(user);
    
    // Invalidate old refresh token
    tokenData.isActive = false;
    
    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      tokenType: 'Bearer',
      expiresIn: this.parseTimeToMs(this.jwtExpiresIn) / 1000
    };
  }

  /**
   * Revoke refresh token
   * @param {string} refreshToken - Refresh token to revoke
   * @returns {boolean} Success status
   */
  revokeRefreshToken(refreshToken) {
    const tokenData = this.refreshTokens.get(refreshToken);
    if (tokenData) {
      tokenData.isActive = false;
      return true;
    }
    return false;
  }

  /**
   * Update user's last login time
   * @param {string} userId - User ID
   */
  updateLastLogin(userId) {
    const user = this.users.get(userId);
    if (user) {
      user.lastLogin = new Date();
      this.users.set(userId, user);
    }
  }

  /**
   * Check if user has specific permission
   * @param {Object} user - User object or JWT payload
   * @param {string} permission - Permission to check
   * @returns {boolean} Whether user has permission
   */
  hasPermission(user, permission) {
    if (!user || !user.permissions) return false;
    return user.permissions.includes(permission) || user.permissions.includes('*');
  }

  /**
   * Get user profile information
   * @param {string} userId - User ID
   * @returns {Object|null} User profile
   */
  getUserProfile(userId) {
    const user = this.findUserById(userId);
    if (!user) return null;
    
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      permissions: user.permissions,
      provider: user.provider,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin,
      isActive: user.isActive
    };
  }

  /**
   * Update user role and permissions
   * @param {string} userId - User ID
   * @param {string} role - New role
   * @returns {boolean} Success status
   */
  updateUserRole(userId, role) {
    const user = this.users.get(userId);
    if (!user || !this.roles[role]) return false;
    
    user.role = role;
    user.permissions = this.roles[role];
    this.users.set(userId, user);
    return true;
  }

  /**
   * Deactivate user
   * @param {string} userId - User ID
   * @returns {boolean} Success status
   */
  deactivateUser(userId) {
    const user = this.users.get(userId);
    if (!user) return false;
    
    user.isActive = false;
    this.users.set(userId, user);
    
    // Revoke all refresh tokens for this user
    for (const [token, tokenData] of this.refreshTokens.entries()) {
      if (tokenData.userId === userId) {
        tokenData.isActive = false;
      }
    }
    
    return true;
  }

  /**
   * Get all users (admin only)
   * @returns {Array} Array of user profiles
   */
  getAllUsers() {
    const users = [];
    for (const [userId, user] of this.users.entries()) {
      users.push({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        provider: user.provider,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin,
        isActive: user.isActive
      });
    }
    return users;
  }

  /**
   * Get authentication statistics
   * @returns {Object} Auth statistics
   */
  getAuthStats() {
    const totalUsers = this.users.size;
    const activeUsers = Array.from(this.users.values()).filter(u => u.isActive).length;
    const activeTokens = Array.from(this.refreshTokens.values()).filter(t => t.isActive).length;
    
    const roleStats = {};
    for (const user of this.users.values()) {
      roleStats[user.role] = (roleStats[user.role] || 0) + 1;
    }
    
    const providerStats = {};
    for (const user of this.users.values()) {
      providerStats[user.provider] = (providerStats[user.provider] || 0) + 1;
    }
    
    return {
      totalUsers,
      activeUsers,
      activeTokens,
      roleStats,
      providerStats,
      recentLogins: Array.from(this.users.values())
        .filter(u => u.lastLogin)
        .sort((a, b) => new Date(b.lastLogin) - new Date(a.lastLogin))
        .slice(0, 10)
        .map(u => ({
          id: u.id,
          email: u.email,
          name: u.name,
          lastLogin: u.lastLogin
        }))
    };
  }

  /**
   * Parse time string to milliseconds
   * @param {string} timeStr - Time string (e.g., '1h', '7d')
   * @returns {number} Milliseconds
   */
  parseTimeToMs(timeStr) {
    const units = {
      's': 1000,
      'm': 60 * 1000,
      'h': 60 * 60 * 1000,
      'd': 24 * 60 * 60 * 1000
    };
    
    const match = timeStr.match(/^(\d+)([smhd])$/);
    if (!match) return 60 * 60 * 1000; // Default 1 hour
    
    const [, value, unit] = match;
    return parseInt(value) * units[unit];
  }

  /**
   * Clean up expired refresh tokens
   */
  cleanupExpiredTokens() {
    const now = new Date();
    for (const [token, tokenData] of this.refreshTokens.entries()) {
      if (now > tokenData.expiresAt) {
        this.refreshTokens.delete(token);
      }
    }
  }
}

// Export singleton instance
const oauthService = new OAuthService();

// Clean up expired tokens every hour
setInterval(() => {
  oauthService.cleanupExpiredTokens();
}, 60 * 60 * 1000);

module.exports = oauthService;