const request = require('supertest');
const app = require('../../server');
const apiKeyService = require('../../src/services/apiKeyService');

describe('Authentication Integration Tests', () => {
  let testApiKey;

  beforeAll(async () => {
    // Clear existing keys and create a test key
    apiKeyService.apiKeys.clear();
    apiKeyService.usageStats.clear();
    apiKeyService.rateLimits.clear();

    testApiKey = apiKeyService.generateApiKey({
      name: 'Integration Test Key',
      description: 'Key for integration testing',
      permissions: ['ugc:generate', 'cache:read', 'cache:write', 'analytics:read'],
      rateLimit: {
        windowMs: 60000, // 1 minute
        maxRequests: 10,
        maxDailyRequests: 100
      }
    });
  });

  afterAll(async () => {
    // Clean up
    if (app && app.close) {
      await app.close();
    }
  });

  describe('API Key Generation', () => {
    it('should generate a new API key', async () => {
      const response = await request(app)
        .post('/api/v1/auth/keys')
        .send({
          name: 'Test Generated Key',
          description: 'Generated during integration test',
          permissions: ['ugc:generate']
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('key');
      expect(response.body.data.key).toMatch(/^ugc_[a-f0-9]{32}_[a-f0-9]{64}$/);
      expect(response.body.data.name).toBe('Test Generated Key');
      expect(response.body.data.permissions).toEqual(['ugc:generate']);
    });

    it('should reject key generation with invalid permissions', async () => {
      const response = await request(app)
        .post('/api/v1/auth/keys')
        .send({
          name: 'Invalid Key',
          permissions: ['invalid:permission']
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_PERMISSIONS');
    });
  });

  describe('Protected Endpoints', () => {
    it('should allow access to UGC endpoint with valid API key', async () => {
      const response = await request(app)
        .get('/api/v1/ugc/status/test-operation')
        .set('X-API-Key', testApiKey.key);

      // Should not return 401/403 (might return 404 for non-existent operation)
      expect(response.status).not.toBe(401);
      expect(response.status).not.toBe(403);
    });

    it('should deny access to UGC endpoint without API key', async () => {
      const response = await request(app)
        .get('/api/v1/ugc/status/test-operation');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('MISSING_API_KEY');
    });

    it('should deny access to UGC endpoint with invalid API key', async () => {
      const response = await request(app)
        .get('/api/v1/ugc/status/test-operation')
        .set('X-API-Key', 'invalid-key');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_API_KEY');
    });

    it('should allow access to cache endpoint with cache permissions', async () => {
      const response = await request(app)
        .get('/api/v1/cache/health')
        .set('X-API-Key', testApiKey.key);

      expect(response.status).not.toBe(401);
      expect(response.status).not.toBe(403);
    });

    it('should deny access to analytics without analytics permission', async () => {
      // Create a key without analytics permission
      const limitedKey = apiKeyService.generateApiKey({
        name: 'Limited Key',
        permissions: ['ugc:generate']
      });

      const response = await request(app)
        .get('/api/v1/auth/analytics')
        .set('X-API-Key', limitedKey.key);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits', async () => {
      // Create a key with very low rate limit for testing
      const rateLimitedKey = apiKeyService.generateApiKey({
        name: 'Rate Limited Key',
        permissions: ['ugc:generate'],
        rateLimit: {
          windowMs: 60000,
          maxRequests: 2,
          maxDailyRequests: 10
        }
      });

      // Make requests up to the limit
      const response1 = await request(app)
        .get('/api/v1/ugc/status/test1')
        .set('X-API-Key', rateLimitedKey.key);
      
      const response2 = await request(app)
        .get('/api/v1/ugc/status/test2')
        .set('X-API-Key', rateLimitedKey.key);

      // Both should succeed (or return non-rate-limit errors)
      expect(response1.status).not.toBe(429);
      expect(response2.status).not.toBe(429);

      // Third request should be rate limited
      const response3 = await request(app)
        .get('/api/v1/ugc/status/test3')
        .set('X-API-Key', rateLimitedKey.key);

      expect(response3.status).toBe(429);
      expect(response3.body.success).toBe(false);
      expect(response3.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(response3.headers).toHaveProperty('x-ratelimit-limit');
      expect(response3.headers).toHaveProperty('x-ratelimit-remaining');
      expect(response3.headers).toHaveProperty('x-ratelimit-reset');
    });

    it('should include rate limit headers in successful responses', async () => {
      const response = await request(app)
        .get('/api/v1/ugc/status/test-headers')
        .set('X-API-Key', testApiKey.key);

      expect(response.headers).toHaveProperty('x-ratelimit-limit');
      expect(response.headers).toHaveProperty('x-ratelimit-remaining');
      expect(response.headers).toHaveProperty('x-ratelimit-reset');
      expect(response.headers).toHaveProperty('x-ratelimit-daily-limit');
      expect(response.headers).toHaveProperty('x-ratelimit-daily-remaining');
    });
  });

  describe('Usage Tracking', () => {
    it('should track API usage', async () => {
      const trackingKey = apiKeyService.generateApiKey({
        name: 'Tracking Test Key',
        permissions: ['ugc:generate', 'analytics:read']
      });

      // Make a few requests
      await request(app)
        .get('/api/v1/ugc/status/track1')
        .set('X-API-Key', trackingKey.key);

      await request(app)
        .get('/api/v1/ugc/status/track2')
        .set('X-API-Key', trackingKey.key);

      // Check usage stats
      const statsResponse = await request(app)
        .get('/api/v1/auth/me')
        .set('X-API-Key', trackingKey.key);

      expect(statsResponse.status).toBe(200);
      expect(statsResponse.body.data.usage.totalRequests).toBeGreaterThanOrEqual(2);
      expect(statsResponse.body.data.usage.recentRequests).toBeDefined();
      expect(statsResponse.body.data.usage.recentRequests.length).toBeGreaterThan(0);
    });

    it('should track errors separately', async () => {
      const errorTrackingKey = apiKeyService.generateApiKey({
        name: 'Error Tracking Key',
        permissions: ['analytics:read']
      });

      // Make a request that should cause an error (insufficient permissions)
      await request(app)
        .get('/api/v1/ugc/status/error-test')
        .set('X-API-Key', errorTrackingKey.key);

      // Check that error was tracked
      const statsResponse = await request(app)
        .get('/api/v1/auth/me')
        .set('X-API-Key', errorTrackingKey.key);

      expect(statsResponse.status).toBe(200);
      expect(statsResponse.body.data.usage.errors).toBeGreaterThan(0);
    });
  });

  describe('API Key Management', () => {
    it('should list API keys with analytics permission', async () => {
      const response = await request(app)
        .get('/api/v1/auth/keys')
        .set('X-API-Key', testApiKey.key);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.keys).toBeDefined();
      expect(Array.isArray(response.body.data.keys)).toBe(true);
      expect(response.body.data.total).toBeGreaterThan(0);
    });

    it('should get specific API key details', async () => {
      const response = await request(app)
        .get(`/api/v1/auth/keys/${testApiKey.id}`)
        .set('X-API-Key', testApiKey.key);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.keyInfo.id).toBe(testApiKey.id);
      expect(response.body.data.keyInfo.name).toBe('Integration Test Key');
    });

    it('should deactivate and reactivate API keys', async () => {
      const managementKey = apiKeyService.generateApiKey({
        name: 'Management Test Key',
        permissions: ['analytics:read']
      });

      // Deactivate the key
      const deactivateResponse = await request(app)
        .post(`/api/v1/auth/keys/${managementKey.id}/deactivate`)
        .set('X-API-Key', testApiKey.key);

      expect(deactivateResponse.status).toBe(200);
      expect(deactivateResponse.body.success).toBe(true);

      // Try to use the deactivated key (should fail)
      const useDeactivatedResponse = await request(app)
        .get('/api/v1/auth/me')
        .set('X-API-Key', managementKey.key);

      expect(useDeactivatedResponse.status).toBe(401);
      expect(useDeactivatedResponse.body.error.code).toBe('INACTIVE_API_KEY');

      // Reactivate the key
      const reactivateResponse = await request(app)
        .post(`/api/v1/auth/keys/${managementKey.id}/reactivate`)
        .set('X-API-Key', testApiKey.key);

      expect(reactivateResponse.status).toBe(200);
      expect(reactivateResponse.body.success).toBe(true);

      // Try to use the reactivated key (should work)
      const useReactivatedResponse = await request(app)
        .get('/api/v1/auth/me')
        .set('X-API-Key', managementKey.key);

      expect(useReactivatedResponse.status).toBe(404); // Key not found in stats, but auth should work
    });
  });

  describe('Analytics', () => {
    it('should provide system analytics', async () => {
      const response = await request(app)
        .get('/api/v1/auth/analytics')
        .set('X-API-Key', testApiKey.key);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('totalKeys');
      expect(response.body.data).toHaveProperty('activeKeys');
      expect(response.body.data).toHaveProperty('totalRequests');
      expect(response.body.data).toHaveProperty('dailyRequests');
      expect(response.body.data).toHaveProperty('topKeys');
      expect(response.body.data).toHaveProperty('recentActivity');
    });
  });

  describe('Authorization Header Support', () => {
    it('should accept API key via Authorization header', async () => {
      const response = await request(app)
        .get('/api/v1/ugc/status/auth-header-test')
        .set('Authorization', `Bearer ${testApiKey.key}`);

      expect(response.status).not.toBe(401);
      expect(response.status).not.toBe(403);
    });

    it('should prefer X-API-Key header over Authorization header', async () => {
      const response = await request(app)
        .get('/api/v1/ugc/status/header-preference-test')
        .set('X-API-Key', testApiKey.key)
        .set('Authorization', 'Bearer invalid-key');

      expect(response.status).not.toBe(401);
      expect(response.status).not.toBe(403);
    });
  });

  describe('CORS Headers', () => {
    it('should include rate limit headers in CORS exposed headers', async () => {
      const response = await request(app)
        .options('/api/v1/ugc/status/cors-test')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'GET')
        .set('Access-Control-Request-Headers', 'X-API-Key');

      expect(response.headers['access-control-expose-headers']).toContain('X-RateLimit-Limit');
      expect(response.headers['access-control-expose-headers']).toContain('X-RateLimit-Remaining');
      expect(response.headers['access-control-expose-headers']).toContain('X-RateLimit-Reset');
    });
  });
});