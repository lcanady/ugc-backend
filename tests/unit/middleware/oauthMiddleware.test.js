const OAuthMiddleware = require('../../../src/middleware/oauthMiddleware');
const oauthService = require('../../../src/services/oauthService');

// Mock the oauthService
jest.mock('../../../src/services/oauthService', () => ({
  verifyAccessToken: jest.fn(),
  findUserById: jest.fn(),
  hasPermission: jest.fn()
}));

describe('OAuthMiddleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      headers: {},
      path: '/api/v1/test',
      method: 'GET'
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    next = jest.fn();

    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('validateJWT', () => {
    it('should pass valid JWT token with correct permissions', async () => {
      const middleware = OAuthMiddleware.validateJWT({
        requiredPermissions: ['ugc:generate']
      });

      req.headers.authorization = 'Bearer valid-jwt-token';

      const mockDecoded = {
        sub: 'user-id',
        email: 'test@example.com',
        name: 'Test User',
        role: 'user',
        permissions: ['ugc:generate']
      };

      const mockUser = {
        id: 'user-id',
        email: 'test@example.com',
        name: 'Test User',
        isActive: true
      };

      oauthService.verifyAccessToken.mockReturnValue(mockDecoded);
      oauthService.findUserById.mockReturnValue(mockUser);
      oauthService.hasPermission.mockReturnValue(true);

      await middleware(req, res, next);

      expect(oauthService.verifyAccessToken).toHaveBeenCalledWith('valid-jwt-token');
      expect(oauthService.findUserById).toHaveBeenCalledWith('user-id');
      expect(oauthService.hasPermission).toHaveBeenCalledWith(mockDecoded, 'ugc:generate');
      expect(req.user).toEqual({
        id: 'user-id',
        email: 'test@example.com',
        name: 'Test User',
        role: 'user',
        permissions: ['ugc:generate'],
        type: 'oauth2'
      });
      expect(next).toHaveBeenCalled();
    });

    it('should reject request without JWT token', async () => {
      const middleware = OAuthMiddleware.validateJWT();

      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'MISSING_TOKEN',
          message: 'JWT token is required. Please provide it in the Authorization header as Bearer token.'
        }
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should allow request without JWT token when optional', async () => {
      const middleware = OAuthMiddleware.validateJWT({ optional: true });

      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should reject invalid JWT token', async () => {
      const middleware = OAuthMiddleware.validateJWT();

      req.headers.authorization = 'Bearer invalid-jwt-token';
      oauthService.verifyAccessToken.mockReturnValue(null);

      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid or expired JWT token.'
        }
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject token for inactive user', async () => {
      const middleware = OAuthMiddleware.validateJWT();

      req.headers.authorization = 'Bearer valid-jwt-token';

      const mockDecoded = {
        sub: 'user-id',
        email: 'test@example.com',
        name: 'Test User',
        role: 'user',
        permissions: ['ugc:generate']
      };

      const mockUser = {
        id: 'user-id',
        email: 'test@example.com',
        name: 'Test User',
        isActive: false
      };

      oauthService.verifyAccessToken.mockReturnValue(mockDecoded);
      oauthService.findUserById.mockReturnValue(mockUser);

      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'USER_INACTIVE',
          message: 'User account is inactive.'
        }
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject request with insufficient permissions', async () => {
      const middleware = OAuthMiddleware.validateJWT({
        requiredPermissions: ['admin:write']
      });

      req.headers.authorization = 'Bearer valid-jwt-token';

      const mockDecoded = {
        sub: 'user-id',
        email: 'test@example.com',
        name: 'Test User',
        role: 'user',
        permissions: ['ugc:generate']
      };

      const mockUser = {
        id: 'user-id',
        email: 'test@example.com',
        name: 'Test User',
        isActive: true
      };

      oauthService.verifyAccessToken.mockReturnValue(mockDecoded);
      oauthService.findUserById.mockReturnValue(mockUser);
      oauthService.hasPermission.mockReturnValue(false);

      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'INSUFFICIENT_PERMISSIONS',
          message: 'This user does not have the required permissions: admin:write',
          details: {
            required: ['admin:write'],
            available: ['ugc:generate']
          }
        }
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should handle authentication errors gracefully', async () => {
      const middleware = OAuthMiddleware.validateJWT();

      req.headers.authorization = 'Bearer valid-jwt-token';
      oauthService.verifyAccessToken.mockImplementation(() => {
        throw new Error('Database error');
      });

      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Authentication error occurred.'
        }
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('requirePermissions', () => {
    it('should create middleware with required permissions', async () => {
      const middleware = OAuthMiddleware.requirePermissions(['admin:write']);

      req.headers.authorization = 'Bearer admin-jwt-token';

      const mockDecoded = {
        sub: 'admin-id',
        email: 'admin@example.com',
        name: 'Admin User',
        role: 'admin',
        permissions: ['*']
      };

      const mockUser = {
        id: 'admin-id',
        email: 'admin@example.com',
        name: 'Admin User',
        isActive: true
      };

      oauthService.verifyAccessToken.mockReturnValue(mockDecoded);
      oauthService.findUserById.mockReturnValue(mockUser);
      oauthService.hasPermission.mockReturnValue(true);

      await middleware(req, res, next);

      expect(oauthService.hasPermission).toHaveBeenCalledWith(mockDecoded, 'admin:write');
      expect(next).toHaveBeenCalled();
    });
  });

  describe('optionalAuth', () => {
    it('should create optional authentication middleware', async () => {
      const middleware = OAuthMiddleware.optionalAuth();

      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('validateAny', () => {
    it('should use API key authentication when X-API-Key header is present', async () => {
      const middleware = OAuthMiddleware.validateAny();
      req.headers['x-api-key'] = 'test-api-key';

      // Mock AuthMiddleware
      const AuthMiddleware = require('../../../src/middleware/authMiddleware');
      const mockApiKeyMiddleware = jest.fn((req, res, next) => next());
      AuthMiddleware.validateApiKey = jest.fn(() => mockApiKeyMiddleware);

      await middleware(req, res, next);

      expect(AuthMiddleware.validateApiKey).toHaveBeenCalled();
      expect(mockApiKeyMiddleware).toHaveBeenCalled();
    });

    it('should use JWT authentication when Bearer token is JWT', async () => {
      const middleware = OAuthMiddleware.validateAny();
      req.headers.authorization = 'Bearer jwt-token-not-api-key';

      const mockDecoded = {
        sub: 'user-id',
        email: 'test@example.com',
        name: 'Test User',
        role: 'user',
        permissions: ['ugc:generate']
      };

      const mockUser = {
        id: 'user-id',
        email: 'test@example.com',
        name: 'Test User',
        isActive: true
      };

      oauthService.verifyAccessToken.mockReturnValue(mockDecoded);
      oauthService.findUserById.mockReturnValue(mockUser);

      await middleware(req, res, next);

      expect(oauthService.verifyAccessToken).toHaveBeenCalledWith('jwt-token-not-api-key');
      expect(next).toHaveBeenCalled();
    });

    it('should use API key authentication when Bearer token is API key', async () => {
      const middleware = OAuthMiddleware.validateAny();
      req.headers.authorization = 'Bearer ugc_api_key_format';

      // Mock AuthMiddleware
      const AuthMiddleware = require('../../../src/middleware/authMiddleware');
      const mockApiKeyMiddleware = jest.fn((req, res, next) => next());
      AuthMiddleware.validateApiKey = jest.fn(() => mockApiKeyMiddleware);

      await middleware(req, res, next);

      expect(AuthMiddleware.validateApiKey).toHaveBeenCalled();
      expect(mockApiKeyMiddleware).toHaveBeenCalled();
    });

    it('should reject when no authentication is provided and not optional', async () => {
      const middleware = OAuthMiddleware.validateAny();

      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'MISSING_AUTHENTICATION',
          message: 'Authentication is required. Please provide either an API key (X-API-Key header) or JWT token (Authorization: Bearer header).'
        }
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should allow when no authentication is provided and optional', async () => {
      const middleware = OAuthMiddleware.validateAny({ optional: true });

      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('extractUserInfo', () => {
    it('should pass through without modification', () => {
      req.user = {
        id: 'user-id',
        email: 'test@example.com',
        name: 'Test User',
        type: 'oauth2'
      };

      OAuthMiddleware.extractUserInfo(req, res, next);

      expect(req.user).toBeDefined();
      expect(next).toHaveBeenCalled();
    });
  });
});