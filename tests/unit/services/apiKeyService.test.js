const apiKeyService = require('../../../src/services/apiKeyService');

describe('ApiKeyService', () => {
  beforeEach(() => {
    // Clear all keys and stats before each test
    apiKeyService.apiKeys.clear();
    apiKeyService.usageStats.clear();
    apiKeyService.rateLimits.clear();
  });

  describe('generateApiKey', () => {
    it('should generate a valid API key with default options', () => {
      const keyData = apiKeyService.generateApiKey({
        name: 'Test Key',
        description: 'Test description'
      });

      expect(keyData).toHaveProperty('id');
      expect(keyData).toHaveProperty('key');
      expect(keyData.key).toMatch(/^ugc_[a-f0-9]{32}_[a-f0-9]{64}$/);
      expect(keyData.name).toBe('Test Key');
      expect(keyData.description).toBe('Test description');
      expect(keyData.permissions).toEqual(['ugc:generate']);
      expect(keyData.isActive).toBe(true);
      expect(keyData.createdAt).toBeInstanceOf(Date);
    });

    it('should generate API key with custom permissions', () => {
      const keyData = apiKeyService.generateApiKey({
        name: 'Admin Key',
        permissions: ['*']
      });

      expect(keyData.permissions).toEqual(['*']);
    });

    it('should generate API key with custom rate limits', () => {
      const customRateLimit = {
        windowMs: 60000,
        maxRequests: 50,
        maxDailyRequests: 500
      };

      const keyData = apiKeyService.generateApiKey({
        name: 'Limited Key',
        rateLimit: customRateLimit
      });

      expect(keyData.rateLimit).toEqual(customRateLimit);
    });

    it('should initialize usage stats and rate limits', () => {
      const keyData = apiKeyService.generateApiKey({
        name: 'Test Key'
      });

      const usageStats = apiKeyService.usageStats.get(keyData.id);
      const rateLimits = apiKeyService.rateLimits.get(keyData.id);

      expect(usageStats).toBeDefined();
      expect(usageStats.totalRequests).toBe(0);
      expect(usageStats.dailyRequests).toBe(0);
      expect(usageStats.errors).toBe(0);

      expect(rateLimits).toBeDefined();
      expect(rateLimits.requestCount).toBe(0);
      expect(rateLimits.dailyCount).toBe(0);
    });
  });

  describe('validateApiKey', () => {
    let testKey;

    beforeEach(() => {
      testKey = apiKeyService.generateApiKey({
        name: 'Test Key'
      });
    });

    it('should validate a correct API key', async () => {
      const result = await apiKeyService.validateApiKey(testKey.key);

      expect(result).toBeDefined();
      expect(result.id).toBe(testKey.id);
      expect(result.name).toBe('Test Key');
      expect(result.isActive).toBe(true);
    });

    it('should reject invalid API key format', async () => {
      const result = await apiKeyService.validateApiKey('invalid_key');
      expect(result).toBeNull();
    });

    it('should reject non-existent API key', async () => {
      const result = await apiKeyService.validateApiKey('ugc_nonexistent_key');
      expect(result).toBeNull();
    });

    it('should reject inactive API key', async () => {
      apiKeyService.deactivateApiKey(testKey.id);
      const result = await apiKeyService.validateApiKey(testKey.key);
      expect(result).toBeNull();
    });

    it('should update lastUsed timestamp on validation', async () => {
      const beforeValidation = new Date();
      await apiKeyService.validateApiKey(testKey.key);
      
      const keyData = apiKeyService.apiKeys.get(testKey.id);
      expect(keyData.lastUsed).toBeInstanceOf(Date);
      expect(keyData.lastUsed.getTime()).toBeGreaterThanOrEqual(beforeValidation.getTime());
    });
  });

  describe('checkRateLimit', () => {
    let testKey;

    beforeEach(() => {
      testKey = apiKeyService.generateApiKey({
        name: 'Test Key',
        rateLimit: {
          windowMs: 60000, // 1 minute
          maxRequests: 5,
          maxDailyRequests: 10
        }
      });
    });

    it('should allow requests within rate limit', () => {
      const result = apiKeyService.checkRateLimit(testKey.id);

      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(5);
      expect(result.remaining).toBe(5);
      expect(result.dailyLimit).toBe(10);
      expect(result.dailyRemaining).toBe(10);
    });

    it('should reject requests exceeding window rate limit', () => {
      const rateLimitData = apiKeyService.rateLimits.get(testKey.id);
      rateLimitData.requestCount = 5; // At limit
      
      const result = apiKeyService.checkRateLimit(testKey.id);

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Rate limit exceeded');
      expect(result.remaining).toBe(0);
    });

    it('should reject requests exceeding daily rate limit', () => {
      const rateLimitData = apiKeyService.rateLimits.get(testKey.id);
      rateLimitData.dailyCount = 10; // At daily limit
      
      const result = apiKeyService.checkRateLimit(testKey.id);

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Daily rate limit exceeded');
    });

    it('should reset window counter after window expires', () => {
      const rateLimitData = apiKeyService.rateLimits.get(testKey.id);
      rateLimitData.requestCount = 5;
      rateLimitData.windowStart = Date.now() - 61000; // 61 seconds ago
      
      const result = apiKeyService.checkRateLimit(testKey.id);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(5); // Reset to full limit
    });
  });

  describe('recordUsage', () => {
    let testKey;

    beforeEach(() => {
      testKey = apiKeyService.generateApiKey({
        name: 'Test Key'
      });
    });

    it('should record usage statistics', () => {
      apiKeyService.recordUsage(testKey.id, {
        endpoint: '/api/v1/ugc/generate',
        method: 'POST',
        statusCode: 200,
        responseTime: 1500,
        userAgent: 'test-agent'
      });

      const usageData = apiKeyService.usageStats.get(testKey.id);
      const rateLimitData = apiKeyService.rateLimits.get(testKey.id);

      expect(usageData.totalRequests).toBe(1);
      expect(usageData.dailyRequests).toBe(1);
      expect(usageData.requestHistory).toHaveLength(1);
      expect(usageData.requestHistory[0]).toMatchObject({
        endpoint: '/api/v1/ugc/generate',
        method: 'POST',
        statusCode: 200,
        responseTime: 1500,
        userAgent: 'test-agent'
      });

      expect(rateLimitData.requestCount).toBe(1);
      expect(rateLimitData.dailyCount).toBe(1);
    });

    it('should limit request history to 100 entries', () => {
      // Record 150 requests
      for (let i = 0; i < 150; i++) {
        apiKeyService.recordUsage(testKey.id, {
          endpoint: `/api/test/${i}`,
          method: 'GET'
        });
      }

      const usageData = apiKeyService.usageStats.get(testKey.id);
      expect(usageData.requestHistory).toHaveLength(100);
      expect(usageData.totalRequests).toBe(150);
    });
  });

  describe('recordError', () => {
    let testKey;

    beforeEach(() => {
      testKey = apiKeyService.generateApiKey({
        name: 'Test Key'
      });
    });

    it('should record error information', () => {
      apiKeyService.recordError(testKey.id, {
        message: 'Test error',
        endpoint: '/api/v1/ugc/generate',
        statusCode: 500
      });

      const usageData = apiKeyService.usageStats.get(testKey.id);
      expect(usageData.errors).toBe(1);
      expect(usageData.lastError).toMatchObject({
        message: 'Test error',
        endpoint: '/api/v1/ugc/generate',
        statusCode: 500
      });
      expect(usageData.lastError.timestamp).toBeInstanceOf(Date);
    });
  });

  describe('hasPermission', () => {
    let testKey, adminKey;

    beforeEach(() => {
      testKey = apiKeyService.generateApiKey({
        name: 'Test Key',
        permissions: ['ugc:generate', 'cache:read']
      });

      adminKey = apiKeyService.generateApiKey({
        name: 'Admin Key',
        permissions: ['*']
      });
    });

    it('should return true for granted permissions', () => {
      expect(apiKeyService.hasPermission(testKey.id, 'ugc:generate')).toBe(true);
      expect(apiKeyService.hasPermission(testKey.id, 'cache:read')).toBe(true);
    });

    it('should return false for denied permissions', () => {
      expect(apiKeyService.hasPermission(testKey.id, 'cache:write')).toBe(false);
      expect(apiKeyService.hasPermission(testKey.id, 'analytics:read')).toBe(false);
    });

    it('should return true for admin key with wildcard permission', () => {
      expect(apiKeyService.hasPermission(adminKey.id, 'ugc:generate')).toBe(true);
      expect(apiKeyService.hasPermission(adminKey.id, 'cache:write')).toBe(true);
      expect(apiKeyService.hasPermission(adminKey.id, 'analytics:read')).toBe(true);
    });

    it('should return false for inactive key', () => {
      apiKeyService.deactivateApiKey(testKey.id);
      expect(apiKeyService.hasPermission(testKey.id, 'ugc:generate')).toBe(false);
    });
  });

  describe('getUsageStats', () => {
    let testKey;

    beforeEach(() => {
      testKey = apiKeyService.generateApiKey({
        name: 'Test Key'
      });
    });

    it('should return usage statistics', () => {
      apiKeyService.recordUsage(testKey.id, {
        endpoint: '/api/v1/ugc/generate',
        method: 'POST'
      });

      const stats = apiKeyService.getUsageStats(testKey.id);

      expect(stats).toBeDefined();
      expect(stats.keyInfo.id).toBe(testKey.id);
      expect(stats.keyInfo.name).toBe('Test Key');
      expect(stats.usage.totalRequests).toBe(1);
      expect(stats.usage.dailyRequests).toBe(1);
      expect(stats.rateLimit.limit).toBeDefined();
      expect(stats.rateLimit.remaining).toBeDefined();
    });

    it('should return null for non-existent key', () => {
      const stats = apiKeyService.getUsageStats('non-existent');
      expect(stats).toBeNull();
    });
  });

  describe('listApiKeys', () => {
    it('should return list of API keys without sensitive data', () => {
      const key1 = apiKeyService.generateApiKey({ name: 'Key 1' });
      const key2 = apiKeyService.generateApiKey({ name: 'Key 2' });

      const keys = apiKeyService.listApiKeys();

      expect(keys).toHaveLength(2);
      expect(keys[0]).toHaveProperty('id');
      expect(keys[0]).toHaveProperty('name');
      expect(keys[0]).not.toHaveProperty('key');
      expect(keys[0]).not.toHaveProperty('hashedKey');
    });
  });

  describe('deactivateApiKey and reactivateApiKey', () => {
    let testKey;

    beforeEach(() => {
      testKey = apiKeyService.generateApiKey({
        name: 'Test Key'
      });
    });

    it('should deactivate API key', () => {
      const result = apiKeyService.deactivateApiKey(testKey.id);
      expect(result).toBe(true);

      const keyData = apiKeyService.apiKeys.get(testKey.id);
      expect(keyData.isActive).toBe(false);
    });

    it('should reactivate API key', () => {
      apiKeyService.deactivateApiKey(testKey.id);
      const result = apiKeyService.reactivateApiKey(testKey.id);
      expect(result).toBe(true);

      const keyData = apiKeyService.apiKeys.get(testKey.id);
      expect(keyData.isActive).toBe(true);
    });

    it('should return false for non-existent key', () => {
      expect(apiKeyService.deactivateApiKey('non-existent')).toBe(false);
      expect(apiKeyService.reactivateApiKey('non-existent')).toBe(false);
    });
  });

  describe('getAnalytics', () => {
    it('should return analytics summary', () => {
      const key1 = apiKeyService.generateApiKey({ name: 'Key 1' });
      const key2 = apiKeyService.generateApiKey({ name: 'Key 2' });

      apiKeyService.recordUsage(key1.id, { endpoint: '/test' });
      apiKeyService.recordUsage(key1.id, { endpoint: '/test' });
      apiKeyService.recordUsage(key2.id, { endpoint: '/test' });

      const analytics = apiKeyService.getAnalytics();

      expect(analytics.totalKeys).toBe(2);
      expect(analytics.activeKeys).toBe(2);
      expect(analytics.totalRequests).toBe(3);
      expect(analytics.dailyRequests).toBe(3);
      expect(analytics.topKeys).toHaveLength(2);
      expect(analytics.topKeys[0].totalRequests).toBe(2); // key1 should be first
    });
  });
});