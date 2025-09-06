const cacheService = require('../../src/services/cacheService');
const imageAnalysisService = require('../../src/services/imageAnalysisService');
const scriptGenerationService = require('../../src/services/scriptGenerationService');

// Mock external APIs to control timing
jest.mock('axios');
const axios = require('axios');

describe('Cache Performance Tests', () => {
  beforeAll(async () => {
    await cacheService.initialize();
  });

  afterAll(async () => {
    await cacheService.close();
  });

  beforeEach(async () => {
    // Clear cache and reset metrics
    await cacheService.invalidateByPattern('*');
    cacheService.resetMetrics();
    jest.clearAllMocks();
  });

  describe('Image Analysis Performance', () => {
    it('should significantly improve performance with caching', async () => {
      const testImage = Buffer.from('test image data for performance test');
      const mimeType = 'image/jpeg';
      const mockAnalysisResponse = {
        data: {
          candidates: [{
            content: {
              parts: [{
                text: 'OBJECTS: smartphone, table\nPEOPLE: young person\nSETTING: modern office\nACTIONS: using phone'
              }]
            }
          }]
        }
      };

      // Mock API call with delay to simulate real API
      axios.post.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve(mockAnalysisResponse), 100))
      );

      // First call - should hit API (cache miss)
      const start1 = Date.now();
      const result1 = await imageAnalysisService.analyzeImage(testImage, mimeType);
      const time1 = Date.now() - start1;

      expect(axios.post).toHaveBeenCalledTimes(1);
      expect(result1).toBeDefined();
      expect(time1).toBeGreaterThan(90); // Should take at least 100ms due to mock delay

      // Second call - should use cache (cache hit)
      const start2 = Date.now();
      const result2 = await imageAnalysisService.analyzeImage(testImage, mimeType);
      const time2 = Date.now() - start2;

      expect(axios.post).toHaveBeenCalledTimes(1); // No additional API calls
      expect(result2).toEqual(result1);
      expect(time2).toBeLessThan(50); // Should be much faster from cache

      // Verify cache metrics
      const metrics = await cacheService.getMetrics();
      expect(metrics.hits).toBe(1);
      expect(metrics.misses).toBe(1);
      expect(metrics.hitRate).toBe('50.00%');

      console.log(`Performance improvement: ${Math.round((time1 - time2) / time1 * 100)}% faster with cache`);
    });

    it('should handle multiple concurrent requests efficiently', async () => {
      const testImage = Buffer.from('concurrent test image');
      const mimeType = 'image/jpeg';
      const mockResponse = {
        data: {
          candidates: [{
            content: {
              parts: [{
                text: 'OBJECTS: laptop\nPEOPLE: person\nSETTING: office'
              }]
            }
          }]
        }
      };

      axios.post.mockResolvedValue(mockResponse);

      // Make multiple concurrent requests for the same image
      const promises = Array(5).fill().map(() => 
        imageAnalysisService.analyzeImage(testImage, mimeType)
      );

      const start = Date.now();
      const results = await Promise.all(promises);
      const totalTime = Date.now() - start;

      // All results should be identical
      results.forEach(result => {
        expect(result).toEqual(results[0]);
      });

      // Should only make one API call due to caching
      expect(axios.post).toHaveBeenCalledTimes(1);

      console.log(`Concurrent requests completed in ${totalTime}ms`);
    });
  });

  describe('Script Generation Performance', () => {
    it('should improve script generation performance with caching', async () => {
      const creativeBrief = 'Create an engaging UGC ad for a new smartphone app';
      const imageAnalysis = [
        {
          objects: ['smartphone', 'app interface'],
          people: ['young professional'],
          setting: 'modern office',
          actions: ['using app', 'smiling']
        }
      ];

      const mockScriptResponse = {
        data: {
          choices: [{
            message: {
              content: JSON.stringify({
                'segment-1': 'Person opens smartphone app with excited expression',
                'segment-2': 'Person demonstrates app features while smiling at camera'
              })
            }
          }],
          model: 'gpt-4',
          usage: { total_tokens: 150 }
        }
      };

      // Mock API call with delay
      axios.post.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve(mockScriptResponse), 200))
      );

      // First call - should hit API
      const start1 = Date.now();
      const result1 = await scriptGenerationService.generateScript(creativeBrief, imageAnalysis);
      const time1 = Date.now() - start1;

      expect(axios.post).toHaveBeenCalledTimes(1);
      expect(result1['segment-1']).toBeDefined();
      expect(result1['segment-2']).toBeDefined();
      expect(time1).toBeGreaterThan(190);

      // Second call - should use cache
      const start2 = Date.now();
      const result2 = await scriptGenerationService.generateScript(creativeBrief, imageAnalysis);
      const time2 = Date.now() - start2;

      expect(axios.post).toHaveBeenCalledTimes(1); // No additional calls
      expect(result2['segment-1']).toBe(result1['segment-1']);
      expect(result2['segment-2']).toBe(result1['segment-2']);
      expect(time2).toBeLessThan(50);

      console.log(`Script generation performance improvement: ${Math.round((time1 - time2) / time1 * 100)}%`);
    });

    it('should cache different scripts for different briefs', async () => {
      const imageAnalysis = [{ objects: ['phone'], people: ['person'] }];
      const brief1 = 'Create a fun UGC ad';
      const brief2 = 'Create a professional UGC ad';

      const mockResponse1 = {
        data: {
          choices: [{
            message: {
              content: JSON.stringify({
                'segment-1': 'Fun segment 1',
                'segment-2': 'Fun segment 2'
              })
            }
          }]
        }
      };

      const mockResponse2 = {
        data: {
          choices: [{
            message: {
              content: JSON.stringify({
                'segment-1': 'Professional segment 1',
                'segment-2': 'Professional segment 2'
              })
            }
          }]
        }
      };

      axios.post
        .mockResolvedValueOnce(mockResponse1)
        .mockResolvedValueOnce(mockResponse2);

      // Generate scripts for different briefs
      const result1 = await scriptGenerationService.generateScript(brief1, imageAnalysis);
      const result2 = await scriptGenerationService.generateScript(brief2, imageAnalysis);

      expect(result1['segment-1']).toContain('Fun');
      expect(result2['segment-1']).toContain('Professional');
      expect(axios.post).toHaveBeenCalledTimes(2);

      // Subsequent calls should use cache
      const cachedResult1 = await scriptGenerationService.generateScript(brief1, imageAnalysis);
      const cachedResult2 = await scriptGenerationService.generateScript(brief2, imageAnalysis);

      expect(cachedResult1).toEqual(result1);
      expect(cachedResult2).toEqual(result2);
      expect(axios.post).toHaveBeenCalledTimes(2); // No additional calls
    });
  });

  describe('Cache Efficiency Metrics', () => {
    it('should track cache efficiency over multiple operations', async () => {
      const images = [
        Buffer.from('image 1'),
        Buffer.from('image 2'),
        Buffer.from('image 1'), // Duplicate
        Buffer.from('image 3'),
        Buffer.from('image 2'), // Duplicate
        Buffer.from('image 1')  // Duplicate
      ];

      const mockResponse = {
        data: {
          candidates: [{
            content: {
              parts: [{
                text: 'OBJECTS: test\nPEOPLE: person'
              }]
            }
          }]
        }
      };

      axios.post.mockResolvedValue(mockResponse);

      // Process all images
      for (const image of images) {
        await imageAnalysisService.analyzeImage(image, 'image/jpeg');
      }

      const metrics = await cacheService.getMetrics();
      
      // Should have 3 unique images, so 3 API calls and 3 cache hits
      expect(metrics.totalRequests).toBe(6);
      expect(metrics.hits).toBe(3); // 3 cache hits from duplicates
      expect(metrics.misses).toBe(3); // 3 cache misses from unique images
      expect(metrics.hitRate).toBe('50.00%');
      expect(axios.post).toHaveBeenCalledTimes(3); // Only 3 unique API calls

      console.log(`Cache efficiency: ${metrics.hitRate} hit rate with ${metrics.hits} hits out of ${metrics.totalRequests} requests`);
    });

    it('should demonstrate cost savings through caching', async () => {
      const testImage = Buffer.from('cost test image');
      const mimeType = 'image/jpeg';
      
      // Simulate API cost per call
      const apiCostPerCall = 0.01; // $0.01 per API call
      let totalApiCalls = 0;

      axios.post.mockImplementation(() => {
        totalApiCalls++;
        return Promise.resolve({
          data: {
            candidates: [{
              content: {
                parts: [{
                  text: 'OBJECTS: product\nPEOPLE: customer'
                }]
              }
            }]
          }
        });
      });

      // Make 10 requests for the same image
      const requests = Array(10).fill().map(() => 
        imageAnalysisService.analyzeImage(testImage, mimeType)
      );

      await Promise.all(requests);

      const costWithoutCache = 10 * apiCostPerCall;
      const actualCost = totalApiCalls * apiCostPerCall;
      const savings = costWithoutCache - actualCost;
      const savingsPercentage = (savings / costWithoutCache) * 100;

      expect(totalApiCalls).toBe(1); // Only one API call due to caching
      expect(savings).toBe(0.09); // $0.09 saved
      expect(savingsPercentage).toBe(90); // 90% cost reduction

      console.log(`Cost savings: $${savings.toFixed(2)} (${savingsPercentage}%) saved through caching`);
    });
  });

  describe('Cache Warming Performance', () => {
    it('should efficiently warm cache with batch data', async () => {
      const warmingData = Array(5).fill().map((_, index) => ({
        buffer: Buffer.from(`warming image ${index}`),
        mimeType: 'image/jpeg',
        analysisResult: {
          objects: [`object${index}`],
          people: [`person${index}`],
          setting: `setting${index}`,
          actions: [`action${index}`],
          timestamp: new Date().toISOString()
        }
      }));

      const start = Date.now();
      const warmedCount = await cacheService.warmImageAnalysisCache(warmingData);
      const warmingTime = Date.now() - start;

      expect(warmedCount).toBe(5);
      expect(warmingTime).toBeLessThan(1000); // Should complete quickly

      // Verify all entries are cached
      for (const data of warmingData) {
        const cached = await cacheService.getCachedImageAnalysis(data.buffer);
        expect(cached).toMatchObject(data.analysisResult);
      }

      console.log(`Cache warming: ${warmedCount} entries warmed in ${warmingTime}ms`);
    });
  });
});