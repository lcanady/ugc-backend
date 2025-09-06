const cacheService = require('../../../src/services/cacheService');
const redis = require('redis');

// Mock Redis client
jest.mock('redis', () => ({
  createClient: jest.fn(() => ({
    connect: jest.fn(),
    get: jest.fn(),
    setEx: jest.fn(),
    del: jest.fn(),
    keys: jest.fn(),
    info: jest.fn(),
    dbSize: jest.fn(),
    quit: jest.fn(),
    on: jest.fn()
  }))
}));

describe('CacheService', () => {
  let mockRedisClient;

  beforeEach(() => {
    mockRedisClient = {
      connect: jest.fn().mockResolvedValue(undefined),
      get: jest.fn(),
      setEx: jest.fn(),
      del: jest.fn(),
      keys: jest.fn(),
      info: jest.fn(),
      dbSize: jest.fn(),
      quit: jest.fn(),
      on: jest.fn()
    };
    
    redis.createClient.mockReturnValue(mockRedisClient);
    
    // Reset cache service state
    cacheService.client = null;
    cacheService.isConnected = false;
    cacheService.resetMetrics();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialize', () => {
    it('should initialize Redis connection successfully', async () => {
      await cacheService.initialize();
      
      expect(redis.createClient).toHaveBeenCalledWith({
        url: 'redis://localhost:6379',
        retry_strategy: expect.any(Function)
      });
      expect(mockRedisClient.connect).toHaveBeenCalled();
      expect(mockRedisClient.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockRedisClient.on).toHaveBeenCalledWith('connect', expect.any(Function));
    });

    it('should handle Redis connection failure gracefully', async () => {
      mockRedisClient.connect.mockRejectedValue(new Error('Connection failed'));
      
      await cacheService.initialize();
      
      expect(cacheService.isConnected).toBe(false);
    });
  });

  describe('generateImageAnalysisKey', () => {
    it('should generate consistent keys for same input', () => {
      const buffer = Buffer.from('test image data');
      const options = { focusAreas: ['objects'] };
      
      const key1 = cacheService.generateImageAnalysisKey(buffer, options);
      const key2 = cacheService.generateImageAnalysisKey(buffer, options);
      
      expect(key1).toBe(key2);
      expect(key1).toMatch(/^ugc-api:image-analysis:/);
    });

    it('should generate different keys for different inputs', () => {
      const buffer1 = Buffer.from('test image data 1');
      const buffer2 = Buffer.from('test image data 2');
      
      const key1 = cacheService.generateImageAnalysisKey(buffer1);
      const key2 = cacheService.generateImageAnalysisKey(buffer2);
      
      expect(key1).not.toBe(key2);
    });
  });

  describe('generateScriptKey', () => {
    it('should generate consistent keys for same input', () => {
      const creativeBrief = 'Test brief';
      const imageAnalysis = [{ description: 'test' }];
      const optionalScript = 'test script';
      
      const key1 = cacheService.generateScriptKey(creativeBrief, imageAnalysis, optionalScript);
      const key2 = cacheService.generateScriptKey(creativeBrief, imageAnalysis, optionalScript);
      
      expect(key1).toBe(key2);
      expect(key1).toMatch(/^ugc-api:script:/);
    });

    it('should generate different keys for different scripts', () => {
      const creativeBrief = 'Test brief';
      const imageAnalysis = [{ description: 'test' }];
      
      const key1 = cacheService.generateScriptKey(creativeBrief, imageAnalysis, 'script 1');
      const key2 = cacheService.generateScriptKey(creativeBrief, imageAnalysis, 'script 2');
      
      expect(key1).not.toBe(key2);
    });
  });

  describe('getCachedImageAnalysis', () => {
    beforeEach(() => {
      cacheService.isConnected = true;
      cacheService.client = mockRedisClient;
    });

    it('should return cached result when available', async () => {
      const buffer = Buffer.from('test image');
      const cachedResult = { objects: ['test'], timestamp: '2023-01-01' };
      
      mockRedisClient.get.mockResolvedValue(JSON.stringify(cachedResult));
      
      const result = await cacheService.getCachedImageAnalysis(buffer);
      
      expect(result).toEqual(cachedResult);
      expect(cacheService.metrics.hits).toBe(1);
      expect(cacheService.metrics.totalRequests).toBe(1);
    });

    it('should return null when cache miss', async () => {
      const buffer = Buffer.from('test image');
      
      mockRedisClient.get.mockResolvedValue(null);
      
      const result = await cacheService.getCachedImageAnalysis(buffer);
      
      expect(result).toBeNull();
      expect(cacheService.metrics.misses).toBe(1);
      expect(cacheService.metrics.totalRequests).toBe(1);
    });

    it('should return null when not connected', async () => {
      cacheService.isConnected = false;
      const buffer = Buffer.from('test image');
      
      const result = await cacheService.getCachedImageAnalysis(buffer);
      
      expect(result).toBeNull();
      expect(mockRedisClient.get).not.toHaveBeenCalled();
    });

    it('should handle Redis errors gracefully', async () => {
      const buffer = Buffer.from('test image');
      
      mockRedisClient.get.mockRejectedValue(new Error('Redis error'));
      
      const result = await cacheService.getCachedImageAnalysis(buffer);
      
      expect(result).toBeNull();
      expect(cacheService.metrics.errors).toBe(1);
    });
  });

  describe('setCachedImageAnalysis', () => {
    beforeEach(() => {
      cacheService.isConnected = true;
      cacheService.client = mockRedisClient;
    });

    it('should cache image analysis result successfully', async () => {
      const buffer = Buffer.from('test image');
      const result = { objects: ['test'], timestamp: '2023-01-01' };
      
      mockRedisClient.setEx.mockResolvedValue('OK');
      
      const success = await cacheService.setCachedImageAnalysis(buffer, {}, result);
      
      expect(success).toBe(true);
      expect(mockRedisClient.setEx).toHaveBeenCalledWith(
        expect.stringMatching(/^ugc-api:image-analysis:/),
        86400, // 24 hours TTL
        expect.stringContaining('"objects":["test"]')
      );
      expect(cacheService.metrics.sets).toBe(1);
    });

    it('should return false when not connected', async () => {
      cacheService.isConnected = false;
      const buffer = Buffer.from('test image');
      const result = { objects: ['test'] };
      
      const success = await cacheService.setCachedImageAnalysis(buffer, {}, result);
      
      expect(success).toBe(false);
      expect(mockRedisClient.setEx).not.toHaveBeenCalled();
    });

    it('should handle Redis errors gracefully', async () => {
      const buffer = Buffer.from('test image');
      const result = { objects: ['test'] };
      
      mockRedisClient.setEx.mockRejectedValue(new Error('Redis error'));
      
      const success = await cacheService.setCachedImageAnalysis(buffer, {}, result);
      
      expect(success).toBe(false);
      expect(cacheService.metrics.errors).toBe(1);
    });
  });

  describe('getCachedScript', () => {
    beforeEach(() => {
      cacheService.isConnected = true;
      cacheService.client = mockRedisClient;
    });

    it('should return cached script when available', async () => {
      const creativeBrief = 'Test brief';
      const imageAnalysis = [{ description: 'test' }];
      const cachedScript = { 'segment-1': 'test', 'segment-2': 'test' };
      
      mockRedisClient.get.mockResolvedValue(JSON.stringify(cachedScript));
      
      const result = await cacheService.getCachedScript(creativeBrief, imageAnalysis);
      
      expect(result).toEqual(cachedScript);
      expect(cacheService.metrics.hits).toBe(1);
    });

    it('should return null when cache miss', async () => {
      const creativeBrief = 'Test brief';
      const imageAnalysis = [{ description: 'test' }];
      
      mockRedisClient.get.mockResolvedValue(null);
      
      const result = await cacheService.getCachedScript(creativeBrief, imageAnalysis);
      
      expect(result).toBeNull();
      expect(cacheService.metrics.misses).toBe(1);
    });
  });

  describe('setCachedScript', () => {
    beforeEach(() => {
      cacheService.isConnected = true;
      cacheService.client = mockRedisClient;
    });

    it('should cache script result successfully', async () => {
      const creativeBrief = 'Test brief';
      const imageAnalysis = [{ description: 'test' }];
      const script = { 'segment-1': 'test', 'segment-2': 'test' };
      
      mockRedisClient.setEx.mockResolvedValue('OK');
      
      const success = await cacheService.setCachedScript(creativeBrief, imageAnalysis, null, script);
      
      expect(success).toBe(true);
      expect(mockRedisClient.setEx).toHaveBeenCalledWith(
        expect.stringMatching(/^ugc-api:script:/),
        14400, // 4 hours TTL
        expect.stringContaining('"segment-1":"test"')
      );
      expect(cacheService.metrics.sets).toBe(1);
    });
  });

  describe('invalidateByPattern', () => {
    beforeEach(() => {
      cacheService.isConnected = true;
      cacheService.client = mockRedisClient;
    });

    it('should invalidate keys matching pattern', async () => {
      const pattern = 'image-analysis:*';
      const keys = ['ugc-api:image-analysis:key1', 'ugc-api:image-analysis:key2'];
      
      mockRedisClient.keys.mockResolvedValue(keys);
      mockRedisClient.del.mockResolvedValue(2);
      
      const deletedCount = await cacheService.invalidateByPattern(pattern);
      
      expect(deletedCount).toBe(2);
      expect(mockRedisClient.keys).toHaveBeenCalledWith('ugc-api:image-analysis:*');
      expect(mockRedisClient.del).toHaveBeenCalledWith(keys);
    });

    it('should return 0 when no keys match pattern', async () => {
      const pattern = 'nonexistent:*';
      
      mockRedisClient.keys.mockResolvedValue([]);
      
      const deletedCount = await cacheService.invalidateByPattern(pattern);
      
      expect(deletedCount).toBe(0);
      expect(mockRedisClient.del).not.toHaveBeenCalled();
    });
  });

  describe('getMetrics', () => {
    beforeEach(() => {
      cacheService.isConnected = true;
      cacheService.client = mockRedisClient;
    });

    it('should return comprehensive metrics', async () => {
      // Set up some metrics
      cacheService.metrics.hits = 10;
      cacheService.metrics.misses = 5;
      cacheService.metrics.totalRequests = 15;
      
      mockRedisClient.info.mockResolvedValue('used_memory:1024\nused_memory_peak:2048');
      mockRedisClient.dbSize.mockResolvedValue(100);
      
      const metrics = await cacheService.getMetrics();
      
      expect(metrics.hits).toBe(10);
      expect(metrics.misses).toBe(5);
      expect(metrics.hitRate).toBe('66.67%');
      expect(metrics.isConnected).toBe(true);
      expect(metrics.redis.keyCount).toBe(100);
    });

    it('should handle Redis info errors gracefully', async () => {
      mockRedisClient.info.mockRejectedValue(new Error('Info error'));
      
      const metrics = await cacheService.getMetrics();
      
      expect(metrics.redis.error).toBe('Info error');
    });
  });

  describe('healthCheck', () => {
    beforeEach(() => {
      cacheService.isConnected = true;
      cacheService.client = mockRedisClient;
    });

    it('should return healthy status when Redis is working', async () => {
      mockRedisClient.setEx.mockResolvedValue('OK');
      mockRedisClient.get.mockResolvedValue('ok');
      mockRedisClient.del.mockResolvedValue(1);
      
      const health = await cacheService.healthCheck();
      
      expect(health.status).toBe('healthy');
      expect(health.connected).toBe(true);
    });

    it('should return unhealthy status when not connected', async () => {
      cacheService.isConnected = false;
      
      const health = await cacheService.healthCheck();
      
      expect(health.status).toBe('unhealthy');
      expect(health.connected).toBe(false);
    });

    it('should return degraded status on Redis errors', async () => {
      mockRedisClient.setEx.mockRejectedValue(new Error('Redis error'));
      
      const health = await cacheService.healthCheck();
      
      expect(health.status).toBe('degraded');
      expect(health.error).toBe('Redis error');
    });
  });

  describe('close', () => {
    beforeEach(() => {
      cacheService.isConnected = true;
      cacheService.client = mockRedisClient;
    });

    it('should close Redis connection gracefully', async () => {
      mockRedisClient.quit.mockResolvedValue('OK');
      
      await cacheService.close();
      
      expect(mockRedisClient.quit).toHaveBeenCalled();
    });

    it('should handle close errors gracefully', async () => {
      mockRedisClient.quit.mockRejectedValue(new Error('Close error'));
      
      await cacheService.close();
      
      expect(mockRedisClient.quit).toHaveBeenCalled();
    });
  });

  describe('resetMetrics', () => {
    it('should reset all metrics to zero', () => {
      cacheService.metrics.hits = 10;
      cacheService.metrics.misses = 5;
      cacheService.metrics.sets = 3;
      cacheService.metrics.errors = 2;
      cacheService.metrics.totalRequests = 15;
      
      cacheService.resetMetrics();
      
      expect(cacheService.metrics.hits).toBe(0);
      expect(cacheService.metrics.misses).toBe(0);
      expect(cacheService.metrics.sets).toBe(0);
      expect(cacheService.metrics.errors).toBe(0);
      expect(cacheService.metrics.totalRequests).toBe(0);
    });
  });
});