const oauthService = require('../services/oauthService');

/**
 * Controller for OAuth2 authentication endpoints
 */
class OAuthController {
  /**
   * Register a new user
   * POST /api/v1/oauth/register
   */
  async register(req, res) {
    try {
      // Check if request body exists and is properly parsed
      if (!req.body || typeof req.body !== 'object') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_REQUEST_BODY',
            message: 'Request body must be valid JSON with Content-Type: application/json'
          }
        });
      }

      const { email, password, name } = req.body;
      
      if (!email) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_EMAIL',
            message: 'Email is required.'
          }
        });
      }
      
      if (!password) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_PASSWORD',
            message: 'Password is required.'
          }
        });
      }
      
      if (password.length < 6) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'WEAK_PASSWORD',
            message: 'Password must be at least 6 characters long.'
          }
        });
      }
      
      // Check if user already exists
      const existingUser = oauthService.findUserByEmail(email);
      if (existingUser) {
        return res.status(409).json({
          success: false,
          error: {
            code: 'USER_EXISTS',
            message: 'User with this email already exists.'
          }
        });
      }
      
      // Create new user with hashed password
      const user = await oauthService.createUser({
        email: email,
        name: name || email.split('@')[0],
        provider: 'local',
        providerId: email,
        role: 'user',
        password: password
      });
      
      // Generate tokens
      const accessToken = oauthService.generateAccessToken(user);
      const refreshToken = oauthService.generateRefreshToken(user);
      
      res.status(201).json({
        success: true,
        message: 'User registered successfully.',
        data: {
          accessToken,
          refreshToken,
          tokenType: 'Bearer',
          expiresIn: oauthService.parseTimeToMs(oauthService.jwtExpiresIn) / 1000,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            permissions: user.permissions
          }
        }
      });
    } catch (error) {
      console.error('Error during registration:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'REGISTRATION_ERROR',
          message: 'Registration failed.'
        }
      });
    }
  }

  /**
   * Login with email/password (for testing purposes)
   * POST /api/v1/oauth/login
   */
  async login(req, res) {
    try {
      // Check if request body exists and is properly parsed
      if (!req.body || typeof req.body !== 'object') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_REQUEST_BODY',
            message: 'Request body must be valid JSON with Content-Type: application/json'
          }
        });
      }

      const { email, password } = req.body;
      
      if (!email) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_EMAIL',
            message: 'Email is required.'
          }
        });
      }

      if (!password) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_PASSWORD',
            message: 'Password is required.'
          }
        });
      }
      
      // Verify user credentials
      const user = await oauthService.verifyUserCredentials(email, password);
      
      if (!user) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid email or password.'
          }
        });
      }
      
      if (!user.isActive) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'USER_INACTIVE',
            message: 'User account is inactive.'
          }
        });
      }
      
      // Update last login
      oauthService.updateLastLogin(user.id);
      
      // Generate tokens
      const accessToken = oauthService.generateAccessToken(user);
      const refreshToken = oauthService.generateRefreshToken(user);
      
      res.json({
        success: true,
        data: {
          accessToken,
          refreshToken,
          tokenType: 'Bearer',
          expiresIn: oauthService.parseTimeToMs(oauthService.jwtExpiresIn) / 1000,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            permissions: user.permissions
          }
        }
      });
    } catch (error) {
      console.error('Error during login:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'LOGIN_ERROR',
          message: 'Login failed.'
        }
      });
    }
  }
  
  /**
   * Refresh access token
   * POST /api/v1/oauth/refresh
   */
  async refresh(req, res) {
    try {
      const { refreshToken } = req.body;
      
      if (!refreshToken) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_REFRESH_TOKEN',
            message: 'Refresh token is required.'
          }
        });
      }
      
      const tokens = oauthService.refreshAccessToken(refreshToken);
      
      if (!tokens) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'INVALID_REFRESH_TOKEN',
            message: 'Invalid or expired refresh token.'
          }
        });
      }
      
      res.json({
        success: true,
        data: tokens
      });
    } catch (error) {
      console.error('Error refreshing token:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'REFRESH_ERROR',
          message: 'Token refresh failed.'
        }
      });
    }
  }
  
  /**
   * Revoke refresh token (logout)
   * POST /api/v1/oauth/revoke
   */
  async revoke(req, res) {
    try {
      const { refreshToken } = req.body;
      
      if (!refreshToken) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_REFRESH_TOKEN',
            message: 'Refresh token is required.'
          }
        });
      }
      
      const success = oauthService.revokeRefreshToken(refreshToken);
      
      if (!success) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'TOKEN_NOT_FOUND',
            message: 'Refresh token not found.'
          }
        });
      }
      
      res.json({
        success: true,
        message: 'Token revoked successfully.'
      });
    } catch (error) {
      console.error('Error revoking token:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'REVOKE_ERROR',
          message: 'Token revocation failed.'
        }
      });
    }
  }
  
  /**
   * Get current user profile
   * GET /api/v1/oauth/profile
   */
  async getProfile(req, res) {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'NOT_AUTHENTICATED',
            message: 'User not authenticated.'
          }
        });
      }
      
      const profile = oauthService.getUserProfile(req.user.id);
      
      if (!profile) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User profile not found.'
          }
        });
      }
      
      res.json({
        success: true,
        data: profile
      });
    } catch (error) {
      console.error('Error getting profile:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'PROFILE_ERROR',
          message: 'Failed to get user profile.'
        }
      });
    }
  }
  
  /**
   * List all users (admin only)
   * GET /api/v1/oauth/users
   */
  async listUsers(req, res) {
    try {
      const users = oauthService.getAllUsers();
      
      res.json({
        success: true,
        data: {
          users,
          total: users.length,
          active: users.filter(u => u.isActive).length
        }
      });
    } catch (error) {
      console.error('Error listing users:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'LIST_USERS_ERROR',
          message: 'Failed to list users.'
        }
      });
    }
  }
  
  /**
   * Update user role (admin only)
   * PUT /api/v1/oauth/users/:userId/role
   */
  async updateUserRole(req, res) {
    try {
      const { userId } = req.params;
      const { role } = req.body;
      
      if (!role) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_ROLE',
            message: 'Role is required.'
          }
        });
      }
      
      const validRoles = ['admin', 'user', 'viewer'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_ROLE',
            message: `Invalid role. Valid roles are: ${validRoles.join(', ')}`
          }
        });
      }
      
      const success = oauthService.updateUserRole(userId, role);
      
      if (!success) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found.'
          }
        });
      }
      
      res.json({
        success: true,
        message: 'User role updated successfully.'
      });
    } catch (error) {
      console.error('Error updating user role:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'UPDATE_ROLE_ERROR',
          message: 'Failed to update user role.'
        }
      });
    }
  }
  
  /**
   * Deactivate user (admin only)
   * POST /api/v1/oauth/users/:userId/deactivate
   */
  async deactivateUser(req, res) {
    try {
      const { userId } = req.params;
      
      const success = oauthService.deactivateUser(userId);
      
      if (!success) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found.'
          }
        });
      }
      
      res.json({
        success: true,
        message: 'User deactivated successfully.'
      });
    } catch (error) {
      console.error('Error deactivating user:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'DEACTIVATE_ERROR',
          message: 'Failed to deactivate user.'
        }
      });
    }
  }
  
  /**
   * Get authentication statistics (admin only)
   * GET /api/v1/oauth/stats
   */
  async getAuthStats(req, res) {
    try {
      const stats = oauthService.getAuthStats();
      
      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Error getting auth stats:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'STATS_ERROR',
          message: 'Failed to get authentication statistics.'
        }
      });
    }
  }
  
  /**
   * Google OAuth callback (placeholder for future implementation)
   * GET /api/v1/oauth/google/callback
   */
  async googleCallback(req, res) {
    try {
      // This would be implemented with passport-google-oauth20
      // For now, return a placeholder response
      res.json({
        success: false,
        error: {
          code: 'NOT_IMPLEMENTED',
          message: 'Google OAuth integration not yet implemented. Use /api/v1/oauth/login for testing.'
        }
      });
    } catch (error) {
      console.error('Error in Google OAuth callback:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'OAUTH_ERROR',
          message: 'OAuth callback failed.'
        }
      });
    }
  }
}

module.exports = new OAuthController();