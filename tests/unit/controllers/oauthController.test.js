const request = require('supertest');
const express = require('express');
const oauthController = require('../../../src/controllers/oauthController');
const oauthService = require('../../../src/services/oauthService');

// Mock the oauthService
jest.mock('../../../src/services/oauthService', () => ({
  findUserByEmail: jest.fn(),
  createUser: jest.fn(),
  updateLastLogin: jest.fn(),
  generateAccessToken: jest.fn(),
  generateRefreshToken: jest.fn(),
  parseTimeToMs: jest.fn(),
  refreshAccessToken: jest.fn(),
  revokeRefreshToken: jest.fn(),
  getUserProfile: jest.fn(),
  getAllUsers: jest.fn(),
  updateUserRole: jest.fn(),
  deactivateUser: jest.fn(),
  getAuthStats: jest.fn(),
  jwtExpiresIn: '1h'
}));

describe('OAuthController', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    
    // Setup routes
    app.post('/api/v1/oauth/login', oauthController.login.bind(oauthController));
    app.post('/api/v1/oauth/refresh', oauthController.refresh.bind(oauthController));
    app.post('/api/v1/oauth/revoke', oauthController.revoke.bind(oauthController));
    app.get('/api/v1/oauth/profile', (req, res, next) => {
      req.user = { id: 'test-user-id' };
      next();
    }, oauthController.getProfile.bind(oauthController));
    app.get('/api/v1/oauth/users', oauthController.listUsers.bind(oauthController));
    app.put('/api/v1/oauth/users/:userId/role', oauthController.updateUserRole.bind(oauthController));
    app.post('/api/v1/oauth/users/:userId/deactivate', oauthController.deactivateUser.bind(oauthController));
    app.get('/api/v1/oauth/stats', oauthController.getAuthStats.bind(oauthController));
    app.get('/api/v1/oauth/google/callback', oauthController.googleCallback.bind(oauthController));

    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('POST /api/v1/oauth/login', () => {
    it('should login existing user successfully', async () => {
      const mockUser = {
        id: 'user-id',
        email: 'test@example.com',
        name: 'Test User',
        role: 'user',
        permissions: ['ugc:generate'],
        isActive: true
      };

      oauthService.findUserByEmail.mockReturnValue(mockUser);
      oauthService.generateAccessToken.mockReturnValue('access-token');
      oauthService.generateRefreshToken.mockReturnValue('refresh-token');
      oauthService.parseTimeToMs.mockReturnValue(3600000); // 1 hour

      const response = await request(app)
        .post('/api/v1/oauth/login')
        .send({
          email: 'test@example.com',
          password: 'password'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('accessToken', 'access-token');
      expect(response.body.data).toHaveProperty('refreshToken', 'refresh-token');
      expect(response.body.data).toHaveProperty('tokenType', 'Bearer');
      expect(response.body.data.user).toMatchObject({
        id: 'user-id',
        email: 'test@example.com',
        name: 'Test User',
        role: 'user'
      });
      expect(oauthService.updateLastLogin).toHaveBeenCalledWith('user-id');
    });

    it('should create new user if not exists', async () => {
      const mockUser = {
        id: 'new-user-id',
        email: 'newuser@example.com',
        name: 'newuser',
        role: 'user',
        permissions: ['ugc:generate'],
        isActive: true
      };

      oauthService.findUserByEmail.mockReturnValue(null);
      oauthService.createUser.mockReturnValue(mockUser);
      oauthService.generateAccessToken.mockReturnValue('access-token');
      oauthService.generateRefreshToken.mockReturnValue('refresh-token');
      oauthService.parseTimeToMs.mockReturnValue(3600000);

      const response = await request(app)
        .post('/api/v1/oauth/login')
        .send({
          email: 'newuser@example.com',
          password: 'password'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(oauthService.createUser).toHaveBeenCalledWith({
        email: 'newuser@example.com',
        name: 'newuser',
        provider: 'local',
        providerId: 'newuser@example.com',
        role: 'user'
      });
    });

    it('should return error for missing email', async () => {
      const response = await request(app)
        .post('/api/v1/oauth/login')
        .send({
          password: 'password'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('MISSING_EMAIL');
    });

    it('should return error for inactive user', async () => {
      const mockUser = {
        id: 'user-id',
        email: 'test@example.com',
        name: 'Test User',
        role: 'user',
        permissions: ['ugc:generate'],
        isActive: false
      };

      oauthService.findUserByEmail.mockReturnValue(mockUser);

      const response = await request(app)
        .post('/api/v1/oauth/login')
        .send({
          email: 'test@example.com',
          password: 'password'
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('USER_INACTIVE');
    });

    it('should handle service errors', async () => {
      oauthService.findUserByEmail.mockImplementation(() => {
        throw new Error('Service error');
      });

      const response = await request(app)
        .post('/api/v1/oauth/login')
        .send({
          email: 'test@example.com',
          password: 'password'
        });

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('LOGIN_ERROR');
    });
  });

  describe('POST /api/v1/oauth/refresh', () => {
    it('should refresh tokens successfully', async () => {
      const mockTokens = {
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        tokenType: 'Bearer',
        expiresIn: 3600
      };

      oauthService.refreshAccessToken.mockReturnValue(mockTokens);

      const response = await request(app)
        .post('/api/v1/oauth/refresh')
        .send({
          refreshToken: 'valid-refresh-token'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockTokens);
    });

    it('should return error for missing refresh token', async () => {
      const response = await request(app)
        .post('/api/v1/oauth/refresh')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('MISSING_REFRESH_TOKEN');
    });

    it('should return error for invalid refresh token', async () => {
      oauthService.refreshAccessToken.mockReturnValue(null);

      const response = await request(app)
        .post('/api/v1/oauth/refresh')
        .send({
          refreshToken: 'invalid-refresh-token'
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_REFRESH_TOKEN');
    });
  });

  describe('POST /api/v1/oauth/revoke', () => {
    it('should revoke refresh token successfully', async () => {
      oauthService.revokeRefreshToken.mockReturnValue(true);

      const response = await request(app)
        .post('/api/v1/oauth/revoke')
        .send({
          refreshToken: 'valid-refresh-token'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('revoked successfully');
    });

    it('should return error for missing refresh token', async () => {
      const response = await request(app)
        .post('/api/v1/oauth/revoke')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('MISSING_REFRESH_TOKEN');
    });

    it('should return error for non-existent token', async () => {
      oauthService.revokeRefreshToken.mockReturnValue(false);

      const response = await request(app)
        .post('/api/v1/oauth/revoke')
        .send({
          refreshToken: 'non-existent-token'
        });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('TOKEN_NOT_FOUND');
    });
  });

  describe('GET /api/v1/oauth/profile', () => {
    it('should return user profile', async () => {
      const mockProfile = {
        id: 'test-user-id',
        email: 'test@example.com',
        name: 'Test User',
        role: 'user',
        permissions: ['ugc:generate'],
        provider: 'google',
        createdAt: new Date(),
        lastLogin: new Date(),
        isActive: true
      };

      oauthService.getUserProfile.mockReturnValue(mockProfile);

      const response = await request(app)
        .get('/api/v1/oauth/profile');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        id: 'test-user-id',
        email: 'test@example.com',
        name: 'Test User',
        role: 'user'
      });
    });

    it('should return error when not authenticated', async () => {
      // Create app without authentication middleware
      const unauthApp = express();
      unauthApp.use(express.json());
      unauthApp.get('/api/v1/oauth/profile', oauthController.getProfile.bind(oauthController));

      const response = await request(unauthApp)
        .get('/api/v1/oauth/profile');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('NOT_AUTHENTICATED');
    });

    it('should return error for non-existent profile', async () => {
      oauthService.getUserProfile.mockReturnValue(null);

      const response = await request(app)
        .get('/api/v1/oauth/profile');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('USER_NOT_FOUND');
    });
  });

  describe('GET /api/v1/oauth/users', () => {
    it('should list all users', async () => {
      const mockUsers = [
        {
          id: 'user-1',
          email: 'user1@example.com',
          name: 'User 1',
          role: 'user',
          provider: 'google',
          createdAt: new Date(),
          isActive: true
        },
        {
          id: 'user-2',
          email: 'user2@example.com',
          name: 'User 2',
          role: 'admin',
          provider: 'local',
          createdAt: new Date(),
          isActive: false
        }
      ];

      oauthService.getAllUsers.mockReturnValue(mockUsers);

      const response = await request(app)
        .get('/api/v1/oauth/users');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.users).toEqual(mockUsers);
      expect(response.body.data.total).toBe(2);
      expect(response.body.data.active).toBe(1);
    });
  });

  describe('PUT /api/v1/oauth/users/:userId/role', () => {
    it('should update user role successfully', async () => {
      oauthService.updateUserRole.mockReturnValue(true);

      const response = await request(app)
        .put('/api/v1/oauth/users/user-id/role')
        .send({
          role: 'admin'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('updated successfully');
      expect(oauthService.updateUserRole).toHaveBeenCalledWith('user-id', 'admin');
    });

    it('should return error for missing role', async () => {
      const response = await request(app)
        .put('/api/v1/oauth/users/user-id/role')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('MISSING_ROLE');
    });

    it('should return error for invalid role', async () => {
      const response = await request(app)
        .put('/api/v1/oauth/users/user-id/role')
        .send({
          role: 'invalid-role'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_ROLE');
    });

    it('should return error for non-existent user', async () => {
      oauthService.updateUserRole.mockReturnValue(false);

      const response = await request(app)
        .put('/api/v1/oauth/users/non-existent/role')
        .send({
          role: 'admin'
        });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('USER_NOT_FOUND');
    });
  });

  describe('POST /api/v1/oauth/users/:userId/deactivate', () => {
    it('should deactivate user successfully', async () => {
      oauthService.deactivateUser.mockReturnValue(true);

      const response = await request(app)
        .post('/api/v1/oauth/users/user-id/deactivate');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('deactivated successfully');
    });

    it('should return error for non-existent user', async () => {
      oauthService.deactivateUser.mockReturnValue(false);

      const response = await request(app)
        .post('/api/v1/oauth/users/non-existent/deactivate');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('USER_NOT_FOUND');
    });
  });

  describe('GET /api/v1/oauth/stats', () => {
    it('should return authentication statistics', async () => {
      const mockStats = {
        totalUsers: 10,
        activeUsers: 8,
        activeTokens: 15,
        roleStats: { admin: 2, user: 8 },
        providerStats: { google: 6, local: 4 },
        recentLogins: []
      };

      oauthService.getAuthStats.mockReturnValue(mockStats);

      const response = await request(app)
        .get('/api/v1/oauth/stats');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockStats);
    });
  });

  describe('GET /api/v1/oauth/google/callback', () => {
    it('should return not implemented message', async () => {
      const response = await request(app)
        .get('/api/v1/oauth/google/callback');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('NOT_IMPLEMENTED');
      expect(response.body.error.message).toContain('Google OAuth integration not yet implemented');
    });
  });
});