const request = require('supertest');
const express = require('express');
const cacheController = require('../../../src/controllers/cacheController');
const cacheService = require('../../../src/services/cacheService');

// Mock cache service
jest.mock('../../../src/services/cacheService', () => ({
  getMetrics: jest.fn(),
  healthCheck: jest.fn(),
  invalidateImageAnalysisCache: jest.fn(),
  invalidateScriptCache: jest.fn(),
  invalidateByPattern: jest.fn(),
  resetMetrics: jest.fn(),
  warmImageAnalysisCache: jest.fn()
}));

describe('CacheController', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    
    // Set up routes
    app.get('/cache/metrics', cacheController.getMetrics.bind(cacheController));
    app.get('/cache/health', cacheController.getHealth.bind(cacheController));
    app.post('/cache/invalidate', cacheController.invalidateCache.bind(cacheController));
    app.post('/cache/reset-metrics', cacheController.resetMetrics.bind(cacheController));
    app.post('/cache/warm', cacheController.warmCache.bind(cacheController));
    
    jest.clearAllMocks();
  });

  describe('GET /cache/metrics', () => {
    it('should return cache metrics successfully', async () => {
      const mockMetrics = {
        hits: 10,
        misses: 5,
        hitRate: '66.67%',
        isConnected: true,
        redis: { keyCount: 100 }
      };
      
      cacheService.getMetrics.mockResolvedValue(mockMetrics);
      
      const response = await request(app)
        .get('/cache/metrics')
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data.metrics).toEqual(mockMetrics);
      expect(response.body.data.timestamp).toBeDefined();
    });

    it('should handle metrics retrieval errors', async () => {
      cacheService.getMetrics.mockRejectedValue(new Error('Metrics error'));
      
      const response = await request(app)
        .get('/cache/metrics')
        .expect(500);
      
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('CACHE_METRICS_ERROR');
      expect(response.body.error.message).toBe('Failed to retrieve cache metrics');
    });
  });

  describe('GET /cache/health', () => {
    it('should return healthy status', async () => {
      const mockHealth = {
        status: 'healthy',
        connected: true,
        timestamp: '2023-01-01T00:00:00.000Z'
      };
      
      cacheService.healthCheck.mockResolvedValue(mockHealth);
      
      const response = await request(app)
        .get('/cache/health')
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockHealth);
    });

    it('should return degraded status with 200', async () => {
      const mockHealth = {
        status: 'degraded',
        connected: true,
        error: 'Some issue'
      };
      
      cacheService.healthCheck.mockResolvedValue(mockHealth);
      
      const response = await request(app)
        .get('/cache/health')
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('degraded');
    });

    it('should return unhealthy status with 503', async () => {
      const mockHealth = {
        status: 'unhealthy',
        connected: false
      };
      
      cacheService.healthCheck.mockResolvedValue(mockHealth);
      
      const response = await request(app)
        .get('/cache/health')
        .expect(503);
      
      expect(response.body.success).toBe(false);
      expect(response.body.data.status).toBe('unhealthy');
    });

    it('should handle health check errors', async () => {
      cacheService.healthCheck.mockRejectedValue(new Error('Health check error'));
      
      const response = await request(app)
        .get('/cache/health')
        .expect(503);
      
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('CACHE_HEALTH_ERROR');
    });
  });

  describe('POST /cache/invalidate', () => {
    it('should invalidate image analysis cache', async () => {
      cacheService.invalidateImageAnalysisCache.mockResolvedValue(5);
      
      const response = await request(app)
        .post('/cache/invalidate')
        .send({ type: 'image-analysis' })
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data.deletedCount).toBe(5);
      expect(response.body.data.type).toBe('image-analysis');
      expect(cacheService.invalidateImageAnalysisCache).toHaveBeenCalled();
    });

    it('should invalidate script generation cache', async () => {
      cacheService.invalidateScriptCache.mockResolvedValue(3);
      
      const response = await request(app)
        .post('/cache/invalidate')
        .send({ type: 'script-generation' })
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data.deletedCount).toBe(3);
      expect(response.body.data.type).toBe('script-generation');
      expect(cacheService.invalidateScriptCache).toHaveBeenCalled();
    });

    it('should invalidate by custom pattern', async () => {
      cacheService.invalidateByPattern.mockResolvedValue(7);
      
      const response = await request(app)
        .post('/cache/invalidate')
        .send({ pattern: 'custom:*' })
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data.deletedCount).toBe(7);
      expect(response.body.data.pattern).toBe('custom:*');
      expect(cacheService.invalidateByPattern).toHaveBeenCalledWith('custom:*');
    });

    it('should return error for invalid request', async () => {
      const response = await request(app)
        .post('/cache/invalidate')
        .send({})
        .expect(400);
      
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_INVALIDATION_REQUEST');
    });

    it('should handle invalidation errors', async () => {
      cacheService.invalidateImageAnalysisCache.mockRejectedValue(new Error('Invalidation error'));
      
      const response = await request(app)
        .post('/cache/invalidate')
        .send({ type: 'image-analysis' })
        .expect(500);
      
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('CACHE_INVALIDATION_ERROR');
    });
  });

  describe('POST /cache/reset-metrics', () => {
    it('should reset metrics successfully', async () => {
      const response = await request(app)
        .post('/cache/reset-metrics')
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data.message).toBe('Cache metrics reset successfully');
      expect(cacheService.resetMetrics).toHaveBeenCalled();
    });

    it('should handle reset errors', async () => {
      cacheService.resetMetrics.mockImplementation(() => {
        throw new Error('Reset error');
      });
      
      const response = await request(app)
        .post('/cache/reset-metrics')
        .expect(500);
      
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('CACHE_RESET_ERROR');
    });
  });

  describe('POST /cache/warm', () => {
    it('should warm cache successfully', async () => {
      const images = [
        { buffer: Buffer.from('test'), analysisResult: { objects: ['test'] } }
      ];
      
      cacheService.warmImageAnalysisCache.mockResolvedValue(1);
      
      const response = await request(app)
        .post('/cache/warm')
        .send({ images })
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data.warmedCount).toBe(1);
      expect(response.body.data.totalProvided).toBe(1);
      expect(cacheService.warmImageAnalysisCache).toHaveBeenCalledWith(images);
    });

    it('should return error for invalid images array', async () => {
      const response = await request(app)
        .post('/cache/warm')
        .send({ images: 'not-an-array' })
        .expect(400);
      
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_WARM_REQUEST');
    });

    it('should handle warming errors', async () => {
      cacheService.warmImageAnalysisCache.mockRejectedValue(new Error('Warm error'));
      
      const response = await request(app)
        .post('/cache/warm')
        .send({ images: [] })
        .expect(500);
      
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('CACHE_WARM_ERROR');
    });
  });
});