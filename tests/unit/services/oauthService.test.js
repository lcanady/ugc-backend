const oauthService = require('../../../src/services/oauthService');
const jwt = require('jsonwebtoken');

describe('OAuthService', () => {
  beforeEach(() => {
    // Clear all users and tokens before each test
    oauthService.users.clear();
    oauthService.refreshTokens.clear();
    oauthService.initializeDefaultUsers();
  });

  describe('createUser', () => {
    it('should create a new user with default values', () => {
      const userData = {
        email: 'test@example.com',
        name: 'Test User',
        provider: 'google',
        providerId: 'google123'
      };

      const user = oauthService.createUser(userData);

      expect(user).toHaveProperty('id');
      expect(user.email).toBe('test@example.com');
      expect(user.name).toBe('Test User');
      expect(user.provider).toBe('google');
      expect(user.providerId).toBe('google123');
      expect(user.role).toBe('user');
      expect(user.permissions).toEqual(['ugc:generate', 'cache:read']);
      expect(user.isActive).toBe(true);
      expect(user.createdAt).toBeInstanceOf(Date);
    });

    it('should create user with custom role and permissions', () => {
      const userData = {
        email: 'admin@example.com',
        name: 'Admin User',
        provider: 'local',
        providerId: 'admin123',
        role: 'admin'
      };

      const user = oauthService.createUser(userData);

      expect(user.role).toBe('admin');
      expect(user.permissions).toEqual(['*']);
    });
  });

  describe('findUserByProvider', () => {
    it('should find user by provider and provider ID', () => {
      const userData = {
        email: 'test@example.com',
        name: 'Test User',
        provider: 'google',
        providerId: 'google123'
      };

      const createdUser = oauthService.createUser(userData);
      const foundUser = oauthService.findUserByProvider('google', 'google123');

      expect(foundUser).toBeDefined();
      expect(foundUser.id).toBe(createdUser.id);
      expect(foundUser.email).toBe('test@example.com');
    });

    it('should return null for non-existent user', () => {
      const foundUser = oauthService.findUserByProvider('google', 'nonexistent');
      expect(foundUser).toBeNull();
    });
  });

  describe('findUserByEmail', () => {
    it('should find user by email', () => {
      const userData = {
        email: 'test@example.com',
        name: 'Test User',
        provider: 'google',
        providerId: 'google123'
      };

      const createdUser = oauthService.createUser(userData);
      const foundUser = oauthService.findUserByEmail('test@example.com');

      expect(foundUser).toBeDefined();
      expect(foundUser.id).toBe(createdUser.id);
    });

    it('should return null for non-existent email', () => {
      const foundUser = oauthService.findUserByEmail('nonexistent@example.com');
      expect(foundUser).toBeNull();
    });
  });

  describe('generateAccessToken', () => {
    it('should generate valid JWT access token', () => {
      const user = oauthService.createUser({
        email: 'test@example.com',
        name: 'Test User',
        provider: 'google',
        providerId: 'google123'
      });

      const token = oauthService.generateAccessToken(user);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');

      // Verify token structure
      const decoded = jwt.decode(token);
      expect(decoded.sub).toBe(user.id);
      expect(decoded.email).toBe(user.email);
      expect(decoded.name).toBe(user.name);
      expect(decoded.role).toBe(user.role);
      expect(decoded.permissions).toEqual(user.permissions);
      expect(decoded.type).toBe('access');
    });
  });

  describe('generateRefreshToken', () => {
    it('should generate refresh token and store it', () => {
      const user = oauthService.createUser({
        email: 'test@example.com',
        name: 'Test User',
        provider: 'google',
        providerId: 'google123'
      });

      const refreshToken = oauthService.generateRefreshToken(user);

      expect(refreshToken).toBeDefined();
      expect(typeof refreshToken).toBe('string');

      // Check if token is stored
      const tokenData = oauthService.refreshTokens.get(refreshToken);
      expect(tokenData).toBeDefined();
      expect(tokenData.userId).toBe(user.id);
      expect(tokenData.isActive).toBe(true);
    });
  });

  describe('verifyAccessToken', () => {
    it('should verify valid access token', () => {
      const user = oauthService.createUser({
        email: 'test@example.com',
        name: 'Test User',
        provider: 'google',
        providerId: 'google123'
      });

      const token = oauthService.generateAccessToken(user);
      const decoded = oauthService.verifyAccessToken(token);

      expect(decoded).toBeDefined();
      expect(decoded.sub).toBe(user.id);
      expect(decoded.email).toBe(user.email);
    });

    it('should reject invalid token', () => {
      const decoded = oauthService.verifyAccessToken('invalid-token');
      expect(decoded).toBeNull();
    });

    it('should reject token for inactive user', () => {
      const user = oauthService.createUser({
        email: 'test@example.com',
        name: 'Test User',
        provider: 'google',
        providerId: 'google123'
      });

      const token = oauthService.generateAccessToken(user);
      
      // Deactivate user
      oauthService.deactivateUser(user.id);
      
      const decoded = oauthService.verifyAccessToken(token);
      expect(decoded).toBeNull();
    });
  });

  describe('refreshAccessToken', () => {
    it('should generate new tokens with valid refresh token', () => {
      const user = oauthService.createUser({
        email: 'test@example.com',
        name: 'Test User',
        provider: 'google',
        providerId: 'google123'
      });

      const refreshToken = oauthService.generateRefreshToken(user);
      const newTokens = oauthService.refreshAccessToken(refreshToken);

      expect(newTokens).toBeDefined();
      expect(newTokens.accessToken).toBeDefined();
      expect(newTokens.refreshToken).toBeDefined();
      expect(newTokens.tokenType).toBe('Bearer');
      expect(newTokens.expiresIn).toBeGreaterThan(0);

      // Old refresh token should be inactive
      const oldTokenData = oauthService.refreshTokens.get(refreshToken);
      expect(oldTokenData.isActive).toBe(false);
    });

    it('should reject invalid refresh token', () => {
      const newTokens = oauthService.refreshAccessToken('invalid-token');
      expect(newTokens).toBeNull();
    });

    it('should reject expired refresh token', () => {
      const user = oauthService.createUser({
        email: 'test@example.com',
        name: 'Test User',
        provider: 'google',
        providerId: 'google123'
      });

      const refreshToken = oauthService.generateRefreshToken(user);
      
      // Manually expire the token
      const tokenData = oauthService.refreshTokens.get(refreshToken);
      tokenData.expiresAt = new Date(Date.now() - 1000); // 1 second ago
      
      const newTokens = oauthService.refreshAccessToken(refreshToken);
      expect(newTokens).toBeNull();
      
      // Token should be removed
      expect(oauthService.refreshTokens.has(refreshToken)).toBe(false);
    });
  });

  describe('revokeRefreshToken', () => {
    it('should revoke valid refresh token', () => {
      const user = oauthService.createUser({
        email: 'test@example.com',
        name: 'Test User',
        provider: 'google',
        providerId: 'google123'
      });

      const refreshToken = oauthService.generateRefreshToken(user);
      const success = oauthService.revokeRefreshToken(refreshToken);

      expect(success).toBe(true);

      const tokenData = oauthService.refreshTokens.get(refreshToken);
      expect(tokenData.isActive).toBe(false);
    });

    it('should return false for non-existent token', () => {
      const success = oauthService.revokeRefreshToken('non-existent-token');
      expect(success).toBe(false);
    });
  });

  describe('hasPermission', () => {
    it('should return true for granted permissions', () => {
      const user = { permissions: ['ugc:generate', 'cache:read'] };
      
      expect(oauthService.hasPermission(user, 'ugc:generate')).toBe(true);
      expect(oauthService.hasPermission(user, 'cache:read')).toBe(true);
    });

    it('should return false for denied permissions', () => {
      const user = { permissions: ['ugc:generate'] };
      
      expect(oauthService.hasPermission(user, 'cache:write')).toBe(false);
      expect(oauthService.hasPermission(user, 'analytics:read')).toBe(false);
    });

    it('should return true for admin user with wildcard permission', () => {
      const user = { permissions: ['*'] };
      
      expect(oauthService.hasPermission(user, 'ugc:generate')).toBe(true);
      expect(oauthService.hasPermission(user, 'cache:write')).toBe(true);
      expect(oauthService.hasPermission(user, 'analytics:read')).toBe(true);
    });

    it('should return false for user without permissions', () => {
      const user = {};
      expect(oauthService.hasPermission(user, 'ugc:generate')).toBe(false);
    });
  });

  describe('updateUserRole', () => {
    it('should update user role and permissions', () => {
      const user = oauthService.createUser({
        email: 'test@example.com',
        name: 'Test User',
        provider: 'google',
        providerId: 'google123',
        role: 'user'
      });

      const success = oauthService.updateUserRole(user.id, 'admin');
      expect(success).toBe(true);

      const updatedUser = oauthService.findUserById(user.id);
      expect(updatedUser.role).toBe('admin');
      expect(updatedUser.permissions).toEqual(['*']);
    });

    it('should return false for invalid role', () => {
      const user = oauthService.createUser({
        email: 'test@example.com',
        name: 'Test User',
        provider: 'google',
        providerId: 'google123'
      });

      const success = oauthService.updateUserRole(user.id, 'invalid-role');
      expect(success).toBe(false);
    });

    it('should return false for non-existent user', () => {
      const success = oauthService.updateUserRole('non-existent-id', 'admin');
      expect(success).toBe(false);
    });
  });

  describe('deactivateUser', () => {
    it('should deactivate user and revoke refresh tokens', () => {
      const user = oauthService.createUser({
        email: 'test@example.com',
        name: 'Test User',
        provider: 'google',
        providerId: 'google123'
      });

      const refreshToken = oauthService.generateRefreshToken(user);
      const success = oauthService.deactivateUser(user.id);

      expect(success).toBe(true);

      const updatedUser = oauthService.findUserById(user.id);
      expect(updatedUser.isActive).toBe(false);

      // Refresh token should be inactive
      const tokenData = oauthService.refreshTokens.get(refreshToken);
      expect(tokenData.isActive).toBe(false);
    });

    it('should return false for non-existent user', () => {
      const success = oauthService.deactivateUser('non-existent-id');
      expect(success).toBe(false);
    });
  });

  describe('getAuthStats', () => {
    it('should return authentication statistics', () => {
      // Create some test users
      oauthService.createUser({
        email: 'user1@example.com',
        name: 'User 1',
        provider: 'google',
        providerId: 'google1',
        role: 'user'
      });

      oauthService.createUser({
        email: 'admin1@example.com',
        name: 'Admin 1',
        provider: 'local',
        providerId: 'admin1',
        role: 'admin'
      });

      const stats = oauthService.getAuthStats();

      expect(stats.totalUsers).toBeGreaterThan(0);
      expect(stats.activeUsers).toBeGreaterThan(0);
      expect(stats.roleStats).toBeDefined();
      expect(stats.providerStats).toBeDefined();
      expect(stats.recentLogins).toBeDefined();
    });
  });

  describe('parseTimeToMs', () => {
    it('should parse time strings correctly', () => {
      expect(oauthService.parseTimeToMs('30s')).toBe(30 * 1000);
      expect(oauthService.parseTimeToMs('5m')).toBe(5 * 60 * 1000);
      expect(oauthService.parseTimeToMs('2h')).toBe(2 * 60 * 60 * 1000);
      expect(oauthService.parseTimeToMs('7d')).toBe(7 * 24 * 60 * 60 * 1000);
    });

    it('should return default for invalid time string', () => {
      expect(oauthService.parseTimeToMs('invalid')).toBe(60 * 60 * 1000); // 1 hour
    });
  });
});