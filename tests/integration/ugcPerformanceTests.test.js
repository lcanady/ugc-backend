// Setup test environment first
require('../fixtures/testEnv');

const request = require('supertest');
const app = require('../../server');
const { testImages } = require('../fixtures/createTestImage');

describe('UGC Performance and Load Tests', () => {
  let server;

  beforeAll((done) => {
    server = app.listen(0, done);
  });

  afterAll((done) => {
    if (server) {
      server.close(done);
    } else {
      done();
    }
  });

  describe('Load Testing', () => {
    it('should handle multiple sequential requests without degradation', async () => {
      const requestCount = 5;
      const results = [];

      for (let i = 0; i < requestCount; i++) {
        const startTime = Date.now();
        
        const response = await request(app)
          .post('/api/v1/ugc/generate')
          .field('creativeBrief', `Load test request ${i + 1}`)
          .attach('images', testImages.validJpeg, `load-test-${i}.jpg`)
          .expect(500); // Will fail due to API keys

        const responseTime = Date.now() - startTime;
        results.push(responseTime);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toMatch(/Image analysis failed|API key|authentication/i);
      }

      // Verify response times don't degrade significantly
      const avgResponseTime = results.reduce((sum, time) => sum + time, 0) / results.length;
      const maxResponseTime = Math.max(...results);
      
      expect(avgResponseTime).toBeLessThan(5000); // Average under 5 seconds
      expect(maxResponseTime).toBeLessThan(10000); // Max under 10 seconds
    });

    it('should handle burst of concurrent requests', async () => {
      const concurrentCount = 10;
      const startTime = Date.now();

      const requests = Array.from({ length: concurrentCount }, (_, i) =>
        request(app)
          .post('/api/v1/ugc/generate')
          .field('creativeBrief', `Concurrent burst test ${i + 1}`)
          .attach('images', testImages.validJpeg, `burst-${i}.jpg`)
      );

      const responses = await Promise.all(requests);
      const totalTime = Date.now() - startTime;

      // All requests should complete
      expect(responses).toHaveLength(concurrentCount);
      
      // All should fail consistently (due to API keys)
      responses.forEach((response, index) => {
        expect(response.status).toBe(500);
        expect(response.body.success).toBe(false);
      });

      // Should complete within reasonable time
      expect(totalTime).toBeLessThan(15000); // 15 seconds for 10 concurrent requests
    });
  });

  describe('Memory Usage Tests', () => {
    it('should not leak memory during multiple image processing', async () => {
      const initialMemory = process.memoryUsage();
      
      // Process multiple requests
      for (let i = 0; i < 3; i++) {
        await request(app)
          .post('/api/v1/ugc/generate')
          .field('creativeBrief', `Memory test ${i + 1}`)
          .attach('images', testImages.validJpeg, `memory-test-${i}.jpg`)
          .expect(500);
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;

      // Memory increase should be reasonable (less than 30MB)
      expect(memoryIncrease).toBeLessThan(30 * 1024 * 1024);
    });

    it('should handle large payloads without excessive memory usage', async () => {
      const initialMemory = process.memoryUsage();
      
      // Create a large creative brief
      const largeBrief = 'A'.repeat(50000); // 50KB brief

      await request(app)
        .post('/api/v1/ugc/generate')
        .field('creativeBrief', largeBrief)
        .attach('images', testImages.validJpeg, 'large-payload.jpg')
        .expect(500);

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;

      // Should handle large payloads efficiently
      expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024); // Less than 100MB
    });
  });

  describe('Error Recovery Tests', () => {
    it('should recover gracefully from malformed requests', async () => {
      // Send malformed request
      await request(app)
        .post('/api/v1/ugc/generate')
        .send('invalid-data')
        .expect(400);

      // Verify server is still responsive
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.status).toBe('OK');
    });

    it('should handle rapid successive requests with errors', async () => {
      const errorRequests = Array.from({ length: 5 }, (_, i) =>
        request(app)
          .post('/api/v1/ugc/generate')
          .field('creativeBrief', '') // Invalid brief
          .attach('images', testImages.validJpeg, `error-test-${i}.jpg`)
      );

      const responses = await Promise.all(errorRequests);

      // All should return 400 for invalid brief
      responses.forEach(response => {
        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
      });

      // Server should still be healthy
      const healthResponse = await request(app)
        .get('/health')
        .expect(200);

      expect(healthResponse.body.status).toBe('OK');
    });
  });

  describe('Resource Limits Tests', () => {
    it('should enforce file size limits consistently', async () => {
      const responses = await Promise.all([
        request(app)
          .post('/api/v1/ugc/generate')
          .field('creativeBrief', 'File size test 1')
          .attach('images', testImages.largeImage, 'large1.jpg'),
        request(app)
          .post('/api/v1/ugc/generate')
          .field('creativeBrief', 'File size test 2')
          .attach('images', testImages.largeImage, 'large2.jpg')
      ]);

      responses.forEach(response => {
        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
        expect(response.body.error).toMatchObject({
          message: expect.stringContaining('File size too large'),
          code: 'FILE_UPLOAD_ERROR'
        });
      });
    });

    it('should enforce image count limits', async () => {
      const maxImages = 4;
      const requestBuilder = request(app)
        .post('/api/v1/ugc/generate')
        .field('creativeBrief', 'Image count limit test');

      // Add one more than the limit
      for (let i = 0; i <= maxImages; i++) {
        requestBuilder.attach('images', testImages.validJpeg, `limit-test-${i}.jpg`);
      }

      const response = await requestBuilder.expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toMatchObject({
        message: expect.stringContaining('Too many files'),
        code: 'FILE_UPLOAD_ERROR'
      });
    });
  });

  describe('API Response Time Tests', () => {
    it('should respond to health checks quickly', async () => {
      const startTime = Date.now();
      
      await request(app)
        .get('/health')
        .expect(200);

      const responseTime = Date.now() - startTime;
      expect(responseTime).toBeLessThan(100); // Should respond in under 100ms
    });

    it('should respond to status requests quickly', async () => {
      const startTime = Date.now();
      
      await request(app)
        .get('/api/v1/ugc/status/test-operation')
        .expect(200);

      const responseTime = Date.now() - startTime;
      expect(responseTime).toBeLessThan(200); // Should respond in under 200ms
    });

    it('should fail fast on validation errors', async () => {
      const startTime = Date.now();
      
      await request(app)
        .post('/api/v1/ugc/generate')
        .field('creativeBrief', '') // Invalid brief
        .expect(400);

      const responseTime = Date.now() - startTime;
      expect(responseTime).toBeLessThan(500); // Should fail quickly
    });
  });

  describe('Stress Testing', () => {
    it('should maintain stability under sustained load', async () => {
      const duration = 5000; // 5 seconds
      const startTime = Date.now();
      const requests = [];

      // Generate requests for 5 seconds
      while (Date.now() - startTime < duration) {
        const requestPromise = request(app)
          .get('/health')
          .expect(200);
        
        requests.push(requestPromise);
        
        // Small delay to prevent overwhelming
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const responses = await Promise.all(requests);
      
      // All health checks should succeed
      responses.forEach(response => {
        expect(response.body.status).toBe('OK');
      });

      expect(requests.length).toBeGreaterThan(10); // Should have made multiple requests
    });
  });
});