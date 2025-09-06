const AuthMiddleware = require('../../../src/middleware/authMiddleware');
const apiKeyService = require('../../../src/services/apiKeyService');

// Mock the apiKeyService
jest.mock('../../../src/services/apiKeyService', () => ({
  validateApiKey: jest.fn(),
  checkRateLimit: jest.fn(),
  hasPermission: jest.fn(),
  recordUsage: jest.fn(),
  recordError: jest.fn()
}));

describe('AuthMiddleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      headers: {},
      path: '/api/v1/test',
      method: 'GET'
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      send: jest.fn(),
      statusCode: 200
    };
    next = jest.fn();

    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('validateApiKey', () => {
    it('should pass valid API key with correct permissions', async () => {
      const middleware = AuthMiddleware.validateApiKey({
        requiredPermissions: ['ugc:generate']
      });

      req.headers['x-api-key'] = 'valid-api-key';

      apiKeyService.validateApiKey.mockResolvedValue({
        id: 'key-id',
        name: 'Test Key',
        permissions: ['ugc:generate'],
        isActive: true,
        metadata: {}
      });

      apiKeyService.checkRateLimit.mockReturnValue({
        allowed: true,
        limit: 100,
        remaining: 99,
        dailyLimit: 1000,
        dailyRemaining: 999,
        resetTime: Date.now() + 900000
      });

      apiKeyService.hasPermission.mockReturnValue(true);

      await middleware(req, res, next);

      expect(apiKeyService.validateApiKey).toHaveBeenCalledWith('valid-api-key');
      expect(apiKeyService.checkRateLimit).toHaveBeenCalledWith('key-id');
      expect(apiKeyService.hasPermission).toHaveBeenCalledWith('key-id', 'ugc:generate');
      expect(res.set).toHaveBeenCalledWith({
        'X-RateLimit-Limit': 100,
        'X-RateLimit-Remaining': 99,
        'X-RateLimit-Reset': expect.any(Number),
        'X-RateLimit-Daily-Limit': 1000,
        'X-RateLimit-Daily-Remaining': 999
      });
      expect(req.apiKey).toEqual({
        id: 'key-id',
        name: 'Test Key',
        permissions: ['ugc:generate'],
        metadata: {}
      });
      expect(next).toHaveBeenCalled();
    });

    it('should reject request without API key', async () => {
      const middleware = AuthMiddleware.validateApiKey();

      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'MISSING_API_KEY',
          message: 'API key is required. Please provide it in the X-API-Key header or Authorization header as Bearer token.'
        }
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should allow request without API key when optional', async () => {
      const middleware = AuthMiddleware.validateApiKey({ optional: true });

      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should reject invalid API key', async () => {
      const middleware = AuthMiddleware.validateApiKey();

      req.headers['x-api-key'] = 'invalid-api-key';
      apiKeyService.validateApiKey.mockResolvedValue(null);

      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'INVALID_API_KEY',
          message: 'Invalid API key provided.'
        }
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject inactive API key', async () => {
      const middleware = AuthMiddleware.validateApiKey();

      req.headers['x-api-key'] = 'inactive-api-key';
      apiKeyService.validateApiKey.mockResolvedValue({
        id: 'key-id',
        name: 'Inactive Key',
        permissions: ['ugc:generate'],
        isActive: false
      });

      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'INACTIVE_API_KEY',
          message: 'API key has been deactivated.'
        }
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject request exceeding rate limit', async () => {
      const middleware = AuthMiddleware.validateApiKey();

      req.headers['x-api-key'] = 'rate-limited-key';
      apiKeyService.validateApiKey.mockResolvedValue({
        id: 'key-id',
        name: 'Rate Limited Key',
        permissions: ['ugc:generate'],
        isActive: true
      });

      apiKeyService.checkRateLimit.mockReturnValue({
        allowed: false,
        reason: 'Rate limit exceeded',
        limit: 100,
        remaining: 0,
        resetTime: Date.now() + 900000
      });

      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.set).toHaveBeenCalledWith({
        'X-RateLimit-Limit': 100,
        'X-RateLimit-Remaining': 0,
        'X-RateLimit-Reset': expect.any(Number)
      });
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Rate limit exceeded',
          details: {
            limit: 100,
            remaining: 0,
            resetTime: expect.any(Number)
          }
        }
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject request with insufficient permissions', async () => {
      const middleware = AuthMiddleware.validateApiKey({
        requiredPermissions: ['admin:write']
      });

      req.headers['x-api-key'] = 'limited-key';
      apiKeyService.validateApiKey.mockResolvedValue({
        id: 'key-id',
        name: 'Limited Key',
        permissions: ['ugc:generate'],
        isActive: true
      });

      apiKeyService.checkRateLimit.mockReturnValue({
        allowed: true,
        limit: 100,
        remaining: 99
      });

      apiKeyService.hasPermission.mockReturnValue(false);

      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'INSUFFICIENT_PERMISSIONS',
          message: 'This API key does not have the required permissions: admin:write',
          details: {
            required: ['admin:write'],
            available: ['ugc:generate']
          }
        }
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should extract API key from Authorization header', async () => {
      const middleware = AuthMiddleware.validateApiKey();

      req.headers['authorization'] = 'Bearer valid-api-key';

      apiKeyService.validateApiKey.mockResolvedValue({
        id: 'key-id',
        name: 'Test Key',
        permissions: ['ugc:generate'],
        isActive: true
      });

      apiKeyService.checkRateLimit.mockReturnValue({
        allowed: true,
        limit: 100,
        remaining: 99
      });

      await middleware(req, res, next);

      expect(apiKeyService.validateApiKey).toHaveBeenCalledWith('valid-api-key');
      expect(next).toHaveBeenCalled();
    });

    it('should record usage after response', async () => {
      const middleware = AuthMiddleware.validateApiKey();

      req.headers['x-api-key'] = 'valid-api-key';

      apiKeyService.validateApiKey.mockResolvedValue({
        id: 'key-id',
        name: 'Test Key',
        permissions: ['ugc:generate'],
        isActive: true
      });

      apiKeyService.checkRateLimit.mockReturnValue({
        allowed: true,
        limit: 100,
        remaining: 99
      });

      await middleware(req, res, next);

      // Simulate response
      res.statusCode = 200;
      res.send('test response');

      expect(apiKeyService.recordUsage).toHaveBeenCalledWith('key-id', {
        endpoint: '/api/v1/test',
        method: 'GET',
        statusCode: 200,
        responseTime: expect.any(Number),
        userAgent: undefined
      });
    });

    it('should record error for error responses', async () => {
      const middleware = AuthMiddleware.validateApiKey();

      req.headers['x-api-key'] = 'valid-api-key';

      apiKeyService.validateApiKey.mockResolvedValue({
        id: 'key-id',
        name: 'Test Key',
        permissions: ['ugc:generate'],
        isActive: true
      });

      apiKeyService.checkRateLimit.mockReturnValue({
        allowed: true,
        limit: 100,
        remaining: 99
      });

      await middleware(req, res, next);

      // Simulate error response
      res.statusCode = 500;
      res.send('error response');

      expect(apiKeyService.recordError).toHaveBeenCalledWith('key-id', {
        message: 'HTTP 500',
        endpoint: '/api/v1/test',
        statusCode: 500
      });
    });

    it('should handle authentication errors gracefully', async () => {
      const middleware = AuthMiddleware.validateApiKey();

      req.headers['x-api-key'] = 'valid-api-key';
      apiKeyService.validateApiKey.mockRejectedValue(new Error('Database error'));

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
      const middleware = AuthMiddleware.requirePermissions(['admin:write']);

      req.headers['x-api-key'] = 'admin-key';

      apiKeyService.validateApiKey.mockResolvedValue({
        id: 'key-id',
        name: 'Admin Key',
        permissions: ['admin:write'],
        isActive: true
      });

      apiKeyService.checkRateLimit.mockReturnValue({
        allowed: true,
        limit: 100,
        remaining: 99
      });

      apiKeyService.hasPermission.mockReturnValue(true);

      await middleware(req, res, next);

      expect(apiKeyService.hasPermission).toHaveBeenCalledWith('key-id', 'admin:write');
      expect(next).toHaveBeenCalled();
    });
  });

  describe('optionalAuth', () => {
    it('should create optional authentication middleware', async () => {
      const middleware = AuthMiddleware.optionalAuth();

      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('extractUserInfo', () => {
    it('should extract user info from API key', () => {
      req.apiKey = {
        id: 'key-id',
        name: 'Test Key',
        permissions: ['ugc:generate']
      };

      AuthMiddleware.extractUserInfo(req, res, next);

      expect(req.user).toEqual({
        id: 'key-id',
        name: 'Test Key',
        type: 'api_key',
        permissions: ['ugc:generate']
      });
      expect(next).toHaveBeenCalled();
    });

    it('should not set user info if no API key', () => {
      AuthMiddleware.extractUserInfo(req, res, next);

      expect(req.user).toBeUndefined();
      expect(next).toHaveBeenCalled();
    });
  });
});