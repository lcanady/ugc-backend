const request = require('supertest');
const app = require('../../server');
const cacheService = require('../../src/services/cacheService');
const imageAnalysisService = require('../../src/services/imageAnalysisService');
const scriptGenerationService = require('../../src/services/scriptGenerationService');

// Mock external APIs
jest.mock('axios');

describe('Cache Integration Tests', () => {
  let server;

  beforeAll(async () => {
    // Initialize cache service for testing
    await cacheService.initialize();
  });

  afterAll(async () => {
    // Clean up
    await cacheService.close();
    if (server) {
      server.close();
    }
  });

  beforeEach(async () => {
    // Clear cache before each test
    await cacheService.invalidateByPattern('*');
    cacheService.resetMetrics();
  });

  describe('Cache Management Endpoints', () => {
    it('should get cache metrics', async () => {
      const response = await request(app)
        .get('/api/v1/cache/metrics')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.metrics).toHaveProperty('hits');
      expect(response.body.data.metrics).toHaveProperty('misses');
      expect(response.body.data.metrics).toHaveProperty('hitRate');
      expect(response.body.data.metrics).toHaveProperty('isConnected');
    });

    it('should get cache health status', async () => {
      const response = await request(app)
        .get('/api/v1/cache/health')
        .expect(200);

      expect(response.body.data).toHaveProperty('status');
      expect(response.body.data).toHaveProperty('connected');
      expect(response.body.data).toHaveProperty('timestamp');
    });

    it('should invalidate image analysis cache', async () => {
      // First, add some cache entries
      const buffer = Buffer.from('test image data');
      const result = { objects: ['test'], timestamp: new Date().toISOString() };
      
      await cacheService.setCachedImageAnalysis(buffer, {}, result);

      const response = await request(app)
        .post('/api/v1/cache/invalidate')
        .send({ type: 'image-analysis' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.deletedCount).toBeGreaterThanOrEqual(0);
      expect(response.body.data.type).toBe('image-analysis');
    });

    it('should invalidate script generation cache', async () => {
      // First, add some cache entries
      const creativeBrief = 'Test brief';
      const imageAnalysis = [{ description: 'test' }];
      const script = { 'segment-1': 'test', 'segment-2': 'test' };
      
      await cacheService.setCachedScript(creativeBrief, imageAnalysis, null, script);

      const response = await request(app)
        .post('/api/v1/cache/invalidate')
        .send({ type: 'script-generation' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.deletedCount).toBeGreaterThanOrEqual(0);
      expect(response.body.data.type).toBe('script-generation');
    });

    it('should reset cache metrics', async () => {
      // Generate some metrics first
      const buffer = Buffer.from('test');
      await cacheService.getCachedImageAnalysis(buffer); // This will be a miss

      const response = await request(app)
        .post('/api/v1/cache/reset-metrics')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.message).toBe('Cache metrics reset successfully');

      // Verify metrics are reset
      const metrics = await cacheService.getMetrics();
      expect(metrics.hits).toBe(0);
      expect(metrics.misses).toBe(0);
      expect(metrics.totalRequests).toBe(0);
    });

    it('should warm cache with provided data', async () => {
      const images = [
        {
          buffer: Buffer.from('test image 1'),
          mimeType: 'image/jpeg',
          analysisResult: {
            objects: ['phone', 'table'],
            people: ['young woman'],
            setting: 'indoor office',
            actions: ['holding phone'],
            timestamp: new Date().toISOString()
          }
        }
      ];

      const response = await request(app)
        .post('/api/v1/cache/warm')
        .send({ images })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.warmedCount).toBeGreaterThanOrEqual(0);
      expect(response.body.data.totalProvided).toBe(1);
    });
  });

  describe('Image Analysis Caching', () => {
    it('should cache and retrieve image analysis results', async () => {
      const buffer = Buffer.from('test image data');
      const options = { focusAreas: ['objects', 'people'] };
      const analysisResult = {
        objects: ['phone', 'laptop'],
        people: ['person'],
        setting: 'office',
        actions: ['working'],
        timestamp: new Date().toISOString()
      };

      // Cache the result
      const cached = await cacheService.setCachedImageAnalysis(buffer, options, analysisResult);
      expect(cached).toBe(true);

      // Retrieve from cache
      const retrieved = await cacheService.getCachedImageAnalysis(buffer, options);
      expect(retrieved).toMatchObject(analysisResult);
      expect(retrieved.cachedAt).toBeDefined();
      expect(retrieved.cacheKey).toBeDefined();
    });

    it('should generate different cache keys for different options', async () => {
      const buffer = Buffer.from('test image data');
      const options1 = { focusAreas: ['objects'] };
      const options2 = { focusAreas: ['people'] };

      const key1 = cacheService.generateImageAnalysisKey(buffer, options1);
      const key2 = cacheService.generateImageAnalysisKey(buffer, options2);

      expect(key1).not.toBe(key2);
    });

    it('should handle cache misses gracefully', async () => {
      const buffer = Buffer.from('nonexistent image');
      const result = await cacheService.getCachedImageAnalysis(buffer);
      
      expect(result).toBeNull();
    });
  });

  describe('Script Generation Caching', () => {
    it('should cache and retrieve script generation results', async () => {
      const creativeBrief = 'Create an engaging UGC ad for a smartphone';
      const imageAnalysis = [
        {
          objects: ['smartphone', 'table'],
          people: ['young person'],
          setting: 'modern room',
          actions: ['using phone']
        }
      ];
      const scriptResult = {
        'segment-1': 'Person picks up smartphone from table and starts using it',
        'segment-2': 'Person demonstrates key features with satisfied expression',
        timestamp: new Date().toISOString()
      };

      // Cache the result
      const cached = await cacheService.setCachedScript(creativeBrief, imageAnalysis, null, scriptResult);
      expect(cached).toBe(true);

      // Retrieve from cache
      const retrieved = await cacheService.getCachedScript(creativeBrief, imageAnalysis, null);
      expect(retrieved).toMatchObject(scriptResult);
      expect(retrieved.cachedAt).toBeDefined();
      expect(retrieved.cacheKey).toBeDefined();
    });

    it('should generate different cache keys for different scripts', async () => {
      const creativeBrief = 'Test brief';
      const imageAnalysis = [{ description: 'test' }];
      const script1 = 'First script';
      const script2 = 'Second script';

      const key1 = cacheService.generateScriptKey(creativeBrief, imageAnalysis, script1);
      const key2 = cacheService.generateScriptKey(creativeBrief, imageAnalysis, script2);

      expect(key1).not.toBe(key2);
    });

    it('should handle optional script parameter correctly', async () => {
      const creativeBrief = 'Test brief';
      const imageAnalysis = [{ description: 'test' }];

      const keyWithoutScript = cacheService.generateScriptKey(creativeBrief, imageAnalysis, null);
      const keyWithScript = cacheService.generateScriptKey(creativeBrief, imageAnalysis, 'user script');

      expect(keyWithoutScript).not.toBe(keyWithScript);
      expect(keyWithoutScript).toContain(':none');
    });
  });

  describe('Cache Metrics and Monitoring', () => {
    it('should track cache hits and misses correctly', async () => {
      const buffer = Buffer.from('test image');
      const result = { objects: ['test'] };

      // First call should be a miss
      await cacheService.getCachedImageAnalysis(buffer);
      let metrics = await cacheService.getMetrics();
      expect(metrics.misses).toBe(1);
      expect(metrics.hits).toBe(0);

      // Cache the result
      await cacheService.setCachedImageAnalysis(buffer, {}, result);

      // Second call should be a hit
      await cacheService.getCachedImageAnalysis(buffer);
      metrics = await cacheService.getMetrics();
      expect(metrics.hits).toBe(1);
      expect(metrics.misses).toBe(1);
      expect(metrics.totalRequests).toBe(2);
    });

    it('should calculate hit rate correctly', async () => {
      const buffer1 = Buffer.from('test image 1');
      const buffer2 = Buffer.from('test image 2');
      const result = { objects: ['test'] };

      // Cache one result
      await cacheService.setCachedImageAnalysis(buffer1, {}, result);

      // One hit, one miss
      await cacheService.getCachedImageAnalysis(buffer1); // hit
      await cacheService.getCachedImageAnalysis(buffer2); // miss

      const metrics = await cacheService.getMetrics();
      expect(metrics.hitRate).toBe('50.00%');
    });

    it('should track cache operations in metrics', async () => {
      const buffer = Buffer.from('test image');
      const result = { objects: ['test'] };

      await cacheService.setCachedImageAnalysis(buffer, {}, result);
      
      const metrics = await cacheService.getMetrics();
      expect(metrics.sets).toBe(1);
    });
  });

  describe('Cache Invalidation', () => {
    it('should invalidate specific cache patterns', async () => {
      const buffer1 = Buffer.from('image 1');
      const buffer2 = Buffer.from('image 2');
      const result = { objects: ['test'] };

      // Cache multiple results
      await cacheService.setCachedImageAnalysis(buffer1, {}, result);
      await cacheService.setCachedImageAnalysis(buffer2, {}, result);

      // Invalidate all image analysis cache
      const deletedCount = await cacheService.invalidateImageAnalysisCache();
      expect(deletedCount).toBeGreaterThanOrEqual(0);

      // Verify cache is cleared
      const retrieved1 = await cacheService.getCachedImageAnalysis(buffer1);
      const retrieved2 = await cacheService.getCachedImageAnalysis(buffer2);
      expect(retrieved1).toBeNull();
      expect(retrieved2).toBeNull();
    });
  });

  describe('Error Handling', () => {
    it('should handle Redis connection errors gracefully', async () => {
      // Temporarily disconnect
      const originalConnected = cacheService.isConnected;
      cacheService.isConnected = false;

      const buffer = Buffer.from('test');
      const result = await cacheService.getCachedImageAnalysis(buffer);
      
      expect(result).toBeNull();

      // Restore connection state
      cacheService.isConnected = originalConnected;
    });

    it('should continue working when cache is unavailable', async () => {
      // This test would require actual service integration
      // For now, we verify that cache failures don't break the application
      const originalConnected = cacheService.isConnected;
      cacheService.isConnected = false;

      const buffer = Buffer.from('test');
      const success = await cacheService.setCachedImageAnalysis(buffer, {}, { test: 'data' });
      
      expect(success).toBe(false);

      // Restore connection state
      cacheService.isConnected = originalConnected;
    });
  });
});