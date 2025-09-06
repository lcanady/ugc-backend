const request = require('supertest');
const express = require('express');
const apiKeyController = require('../../../src/controllers/apiKeyController');
const apiKeyService = require('../../../src/services/apiKeyService');

// Mock the apiKeyService
jest.mock('../../../src/services/apiKeyService', () => ({
  generateApiKey: jest.fn(),
  listApiKeys: jest.fn(),
  getUsageStats: jest.fn(),
  deactivateApiKey: jest.fn(),
  reactivateApiKey: jest.fn(),
  getAnalytics: jest.fn()
}));

describe('ApiKeyController', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    
    // Setup routes
    app.post('/api/v1/auth/keys', apiKeyController.generateApiKey.bind(apiKeyController));
    app.get('/api/v1/auth/keys', apiKeyController.listApiKeys.bind(apiKeyController));
    app.get('/api/v1/auth/keys/:keyId', apiKeyController.getApiKeyDetails.bind(apiKeyController));
    app.post('/api/v1/auth/keys/:keyId/deactivate', apiKeyController.deactivateApiKey.bind(apiKeyController));
    app.post('/api/v1/auth/keys/:keyId/reactivate', apiKeyController.reactivateApiKey.bind(apiKeyController));
    app.get('/api/v1/auth/analytics', apiKeyController.getAnalytics.bind(apiKeyController));
    app.get('/api/v1/auth/me', (req, res, next) => {
      req.apiKey = { id: 'test-key-id' };
      next();
    }, apiKeyController.getCurrentKeyInfo.bind(apiKeyController));

    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('POST /api/v1/auth/keys', () => {
    it('should generate a new API key with valid data', async () => {
      const mockKeyData = {
        id: 'key-id',
        key: 'ugc_test_key',
        name: 'Test Key',
        description: 'Test description',
        permissions: ['ugc:generate'],
        rateLimit: { windowMs: 900000, maxRequests: 100, maxDailyRequests: 1000 },
        createdAt: new Date(),
        isActive: true
      };

      apiKeyService.generateApiKey.mockReturnValue(mockKeyData);

      const response = await request(app)
        .post('/api/v1/auth/keys')
        .send({
          name: 'Test Key',
          description: 'Test description',
          permissions: ['ugc:generate']
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        id: 'key-id',
        key: 'ugc_test_key',
        name: 'Test Key',
        description: 'Test description',
        permissions: ['ugc:generate']
      });
      expect(response.body.message).toContain('API key generated successfully');
    });

    it('should return error for missing name', async () => {
      const response = await request(app)
        .post('/api/v1/auth/keys')
        .send({
          description: 'Test description'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('MISSING_NAME');
    });

    it('should return error for invalid permissions format', async () => {
      const response = await request(app)
        .post('/api/v1/auth/keys')
        .send({
          name: 'Test Key',
          permissions: 'invalid-format'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_PERMISSIONS');
    });

    it('should return error for invalid permission values', async () => {
      const response = await request(app)
        .post('/api/v1/auth/keys')
        .send({
          name: 'Test Key',
          permissions: ['invalid:permission']
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_PERMISSIONS');
      expect(response.body.error.message).toContain('invalid:permission');
    });

    it('should handle service errors', async () => {
      apiKeyService.generateApiKey.mockImplementation(() => {
        throw new Error('Service error');
      });

      const response = await request(app)
        .post('/api/v1/auth/keys')
        .send({
          name: 'Test Key'
        });

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('KEY_GENERATION_ERROR');
    });
  });

  describe('GET /api/v1/auth/keys', () => {
    it('should list all API keys', async () => {
      const mockKeys = [
        {
          id: 'key-1',
          name: 'Key 1',
          description: 'First key',
          permissions: ['ugc:generate'],
          createdAt: new Date(),
          isActive: true,
          totalRequests: 10,
          dailyRequests: 5
        },
        {
          id: 'key-2',
          name: 'Key 2',
          description: 'Second key',
          permissions: ['cache:read'],
          createdAt: new Date(),
          isActive: false,
          totalRequests: 0,
          dailyRequests: 0
        }
      ];

      apiKeyService.listApiKeys.mockReturnValue(mockKeys);

      const response = await request(app)
        .get('/api/v1/auth/keys');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.keys).toHaveLength(2);
      expect(response.body.data.keys[0]).toMatchObject({
        id: 'key-1',
        name: 'Key 1',
        description: 'First key',
        permissions: ['ugc:generate'],
        isActive: true,
        totalRequests: 10,
        dailyRequests: 5
      });
      expect(response.body.data.total).toBe(2);
      expect(response.body.data.active).toBe(1);
    });

    it('should handle service errors', async () => {
      apiKeyService.listApiKeys.mockImplementation(() => {
        throw new Error('Service error');
      });

      const response = await request(app)
        .get('/api/v1/auth/keys');

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('LIST_ERROR');
    });
  });

  describe('GET /api/v1/auth/keys/:keyId', () => {
    it('should return API key details', async () => {
      const mockStats = {
        keyInfo: {
          id: 'key-id',
          name: 'Test Key',
          description: 'Test description',
          createdAt: new Date(),
          lastUsed: new Date(),
          isActive: true
        },
        usage: {
          totalRequests: 100,
          dailyRequests: 10,
          errors: 2,
          lastError: null,
          recentRequests: []
        },
        rateLimit: {
          limit: 100,
          remaining: 90,
          dailyLimit: 1000,
          dailyRemaining: 990
        }
      };

      apiKeyService.getUsageStats.mockReturnValue(mockStats);

      const response = await request(app)
        .get('/api/v1/auth/keys/key-id');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        keyInfo: {
          id: 'key-id',
          name: 'Test Key',
          description: 'Test description',
          isActive: true
        },
        usage: {
          totalRequests: 100,
          dailyRequests: 10,
          errors: 2,
          lastError: null,
          recentRequests: []
        },
        rateLimit: {
          limit: 100,
          remaining: 90,
          dailyLimit: 1000,
          dailyRemaining: 990
        }
      });
    });

    it('should return 404 for non-existent key', async () => {
      apiKeyService.getUsageStats.mockReturnValue(null);

      const response = await request(app)
        .get('/api/v1/auth/keys/non-existent');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('KEY_NOT_FOUND');
    });
  });

  describe('POST /api/v1/auth/keys/:keyId/deactivate', () => {
    it('should deactivate API key', async () => {
      apiKeyService.deactivateApiKey.mockReturnValue(true);

      const response = await request(app)
        .post('/api/v1/auth/keys/key-id/deactivate');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('deactivated successfully');
    });

    it('should return 404 for non-existent key', async () => {
      apiKeyService.deactivateApiKey.mockReturnValue(false);

      const response = await request(app)
        .post('/api/v1/auth/keys/non-existent/deactivate');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('KEY_NOT_FOUND');
    });
  });

  describe('POST /api/v1/auth/keys/:keyId/reactivate', () => {
    it('should reactivate API key', async () => {
      apiKeyService.reactivateApiKey.mockReturnValue(true);

      const response = await request(app)
        .post('/api/v1/auth/keys/key-id/reactivate');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('reactivated successfully');
    });

    it('should return 404 for non-existent key', async () => {
      apiKeyService.reactivateApiKey.mockReturnValue(false);

      const response = await request(app)
        .post('/api/v1/auth/keys/non-existent/reactivate');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('KEY_NOT_FOUND');
    });
  });

  describe('GET /api/v1/auth/analytics', () => {
    it('should return analytics data', async () => {
      const mockAnalytics = {
        totalKeys: 5,
        activeKeys: 4,
        totalRequests: 1000,
        dailyRequests: 100,
        totalErrors: 10,
        topKeys: [
          { id: 'key-1', name: 'Top Key', totalRequests: 500 }
        ],
        recentActivity: [
          { keyId: 'key-1', keyName: 'Top Key', timestamp: new Date() }
        ]
      };

      apiKeyService.getAnalytics.mockReturnValue(mockAnalytics);

      const response = await request(app)
        .get('/api/v1/auth/analytics');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        totalKeys: 5,
        activeKeys: 4,
        totalRequests: 1000,
        dailyRequests: 100,
        totalErrors: 10,
        topKeys: [
          { id: 'key-1', name: 'Top Key', totalRequests: 500 }
        ]
      });
      expect(response.body.data.recentActivity).toHaveLength(1);
      expect(response.body.data.recentActivity[0]).toMatchObject({
        keyId: 'key-1',
        keyName: 'Top Key'
      });
    });

    it('should handle service errors', async () => {
      apiKeyService.getAnalytics.mockImplementation(() => {
        throw new Error('Service error');
      });

      const response = await request(app)
        .get('/api/v1/auth/analytics');

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('ANALYTICS_ERROR');
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('should return current API key info', async () => {
      const mockStats = {
        keyInfo: {
          id: 'test-key-id',
          name: 'Current Key',
          description: 'Current key description',
          createdAt: new Date(),
          lastUsed: new Date(),
          isActive: true
        },
        usage: {
          totalRequests: 50,
          dailyRequests: 5,
          errors: 0,
          lastError: null,
          recentRequests: []
        },
        rateLimit: {
          limit: 100,
          remaining: 95,
          dailyLimit: 1000,
          dailyRemaining: 995
        }
      };

      apiKeyService.getUsageStats.mockReturnValue(mockStats);

      const response = await request(app)
        .get('/api/v1/auth/me');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        keyInfo: {
          id: 'test-key-id',
          name: 'Current Key',
          description: 'Current key description',
          isActive: true
        },
        usage: {
          totalRequests: 50,
          dailyRequests: 5,
          errors: 0,
          lastError: null,
          recentRequests: []
        },
        rateLimit: {
          limit: 100,
          remaining: 95,
          dailyLimit: 1000,
          dailyRemaining: 995
        }
      });
      expect(response.body.data.currentRequest).toBeDefined();
      expect(response.body.data.currentRequest.timestamp).toBeDefined();
    });

    it('should return error when not authenticated', async () => {
      // Create app without authentication middleware
      const unauthApp = express();
      unauthApp.use(express.json());
      unauthApp.get('/api/v1/auth/me', apiKeyController.getCurrentKeyInfo.bind(apiKeyController));

      const response = await request(unauthApp)
        .get('/api/v1/auth/me');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('NOT_AUTHENTICATED');
    });

    it('should return 404 for non-existent key', async () => {
      apiKeyService.getUsageStats.mockReturnValue(null);

      const response = await request(app)
        .get('/api/v1/auth/me');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('KEY_NOT_FOUND');
    });
  });
});