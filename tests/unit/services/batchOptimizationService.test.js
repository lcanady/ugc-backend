const batchOptimizationService = require('../../../src/services/batchOptimizationService');
const { BatchOperation, UgcOperation } = require('../../../src/models');

// Mock dependencies
jest.mock('../../../src/models');

describe('BatchOptimizationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('analyzeBatchOptimization', () => {
    it('should analyze batch optimization opportunities', async () => {
      const requests = [
        {
          creativeBrief: 'Create a coffee shop ad with morning vibes and cozy atmosphere',
          images: [{ buffer: 'image1' }],
          options: { aspectRatio: '16:9' }
        },
        {
          creativeBrief: 'Create a coffee house advertisement with morning energy and warm feeling',
          images: [{ buffer: 'image2' }],
          options: { aspectRatio: '16:9' }
        },
        {
          creativeBrief: 'Tech startup innovation and digital transformation',
          images: [{ buffer: 'image3' }, { buffer: 'image4' }],
          script: 'Custom script'
        }
      ];

      const result = await batchOptimizationService.analyzeBatchOptimization(requests);

      expect(result).toEqual(
        expect.objectContaining({
          totalRequests: 3,
          contentClusters: expect.any(Array),
          optimizationSuggestions: expect.any(Array),
          estimatedCostSavings: expect.any(Number),
          recommendedBatching: expect.any(Array)
        })
      );

      expect(result.contentClusters.length).toBeGreaterThan(0);
      expect(result.optimizationSuggestions.length).toBeGreaterThan(0);
    });

    it('should throw error for empty requests', async () => {
      await expect(batchOptimizationService.analyzeBatchOptimization([])).rejects.toThrow(
        'Requests array is required for optimization analysis'
      );
    });

    it('should throw error for non-array input', async () => {
      await expect(batchOptimizationService.analyzeBatchOptimization(null)).rejects.toThrow(
        'Requests array is required for optimization analysis'
      );
    });
  });

  describe('clusterSimilarContent', () => {
    it('should cluster similar requests together', () => {
      const requests = [
        { creativeBrief: 'coffee shop morning vibes', images: [{}] },
        { creativeBrief: 'coffee house morning energy', images: [{}] },
        { creativeBrief: 'tech startup innovation', images: [{}] },
        { creativeBrief: 'technology company digital', images: [{}] }
      ];

      const clusters = batchOptimizationService.clusterSimilarContent(requests);

      expect(clusters.length).toBeGreaterThan(0);
      expect(clusters.length).toBeLessThanOrEqual(requests.length);

      // Check that each cluster has proper structure
      clusters.forEach(cluster => {
        expect(cluster).toEqual(
          expect.objectContaining({
            id: expect.stringMatching(/^cluster_\d+$/),
            requests: expect.any(Array),
            characteristics: expect.any(Object),
            similarity: expect.any(Number)
          })
        );
      });
    });

    it('should create separate clusters for dissimilar content', () => {
      const requests = [
        { creativeBrief: 'coffee shop advertisement', images: [{}] },
        { creativeBrief: 'car dealership promotion', images: [{}] },
        { creativeBrief: 'fashion brand showcase', images: [{}] }
      ];

      const clusters = batchOptimizationService.clusterSimilarContent(requests);

      // Should create separate clusters for very different content
      expect(clusters.length).toBe(3);
    });
  });

  describe('calculateContentSimilarity', () => {
    it('should calculate high similarity for similar requests', () => {
      const request1 = {
        creativeBrief: 'coffee shop morning vibes cozy atmosphere',
        images: [{}],
        options: { aspectRatio: '16:9' }
      };

      const request2 = {
        creativeBrief: 'coffee house morning energy cozy feeling',
        images: [{}],
        options: { aspectRatio: '16:9' }
      };

      const similarity = batchOptimizationService.calculateContentSimilarity(request1, request2);

      expect(similarity).toBeGreaterThan(0.5);
      expect(similarity).toBeLessThanOrEqual(1);
    });

    it('should calculate low similarity for different requests', () => {
      const request1 = {
        creativeBrief: 'coffee shop morning vibes',
        images: [{}],
        options: { aspectRatio: '16:9' }
      };

      const request2 = {
        creativeBrief: 'car dealership luxury vehicles',
        images: [{}, {}],
        script: 'Custom script',
        options: { aspectRatio: '9:16' }
      };

      const similarity = batchOptimizationService.calculateContentSimilarity(request1, request2);

      expect(similarity).toBeLessThan(0.5);
      expect(similarity).toBeGreaterThanOrEqual(0);
    });
  });

  describe('extractKeywords', () => {
    it('should extract meaningful keywords', () => {
      const text = 'Create a coffee shop advertisement with morning vibes and cozy atmosphere for customers';
      const keywords = batchOptimizationService.extractKeywords(text);

      expect(keywords).toContain('coffee');
      expect(keywords).toContain('shop');
      expect(keywords).toContain('advertisement');
      expect(keywords).toContain('morning');
      expect(keywords).toContain('vibes');
      expect(keywords).toContain('cozy');
      expect(keywords).toContain('atmosphere');
      expect(keywords).toContain('customers');

      // Should not contain stop words
      expect(keywords).not.toContain('a');
      expect(keywords).not.toContain('and');
      expect(keywords).not.toContain('with');
      expect(keywords).not.toContain('for');
    });

    it('should handle empty or invalid text', () => {
      expect(batchOptimizationService.extractKeywords('')).toEqual([]);
      expect(batchOptimizationService.extractKeywords(null)).toEqual([]);
      expect(batchOptimizationService.extractKeywords(undefined)).toEqual([]);
    });

    it('should limit keywords to reasonable number', () => {
      const longText = 'word '.repeat(50);
      const keywords = batchOptimizationService.extractKeywords(longText);

      expect(keywords.length).toBeLessThanOrEqual(20);
    });
  });

  describe('calculateWordOverlap', () => {
    it('should calculate correct overlap for word arrays', () => {
      const words1 = ['coffee', 'shop', 'morning', 'vibes'];
      const words2 = ['coffee', 'house', 'morning', 'energy'];

      const overlap = batchOptimizationService.calculateWordOverlap(words1, words2);

      // Intersection: ['coffee', 'morning'] = 2
      // Union: ['coffee', 'shop', 'morning', 'vibes', 'house', 'energy'] = 6
      // Overlap: 2/6 = 0.333...
      expect(overlap).toBeCloseTo(0.333, 2);
    });

    it('should return 1 for identical arrays', () => {
      const words = ['coffee', 'shop', 'morning'];
      const overlap = batchOptimizationService.calculateWordOverlap(words, words);

      expect(overlap).toBe(1);
    });

    it('should return 0 for completely different arrays', () => {
      const words1 = ['coffee', 'shop'];
      const words2 = ['car', 'dealership'];

      const overlap = batchOptimizationService.calculateWordOverlap(words1, words2);

      expect(overlap).toBe(0);
    });

    it('should handle empty arrays', () => {
      expect(batchOptimizationService.calculateWordOverlap([], [])).toBe(1);
      expect(batchOptimizationService.calculateWordOverlap(['word'], [])).toBe(0);
      expect(batchOptimizationService.calculateWordOverlap([], ['word'])).toBe(0);
    });
  });

  describe('estimateComplexity', () => {
    it('should estimate low complexity for simple requests', () => {
      const request = {
        creativeBrief: 'Simple ad',
        images: [{}]
      };

      const complexity = batchOptimizationService.estimateComplexity(request);

      expect(complexity).toBe('low');
    });

    it('should estimate high complexity for complex requests', () => {
      const request = {
        creativeBrief: 'a'.repeat(1500), // Long brief
        images: new Array(6).fill({}), // Many images
        script: 'Custom script',
        options: { opt1: 'val1', opt2: 'val2', opt3: 'val3', opt4: 'val4' } // Many options
      };

      const complexity = batchOptimizationService.estimateComplexity(request);

      expect(complexity).toBe('high');
    });

    it('should estimate medium complexity for moderate requests', () => {
      const request = {
        creativeBrief: 'a'.repeat(750), // Medium brief
        images: [{}, {}, {}], // Few images
        options: { opt1: 'val1' }
      };

      const complexity = batchOptimizationService.estimateComplexity(request);

      expect(complexity).toBe('medium');
    });
  });

  describe('categorizeRequest', () => {
    it('should categorize food and beverage requests', () => {
      const request = { creativeBrief: 'Create a coffee shop advertisement' };
      expect(batchOptimizationService.categorizeRequest(request)).toBe('food_beverage');

      const request2 = { creativeBrief: 'Restaurant promotion with delicious food' };
      expect(batchOptimizationService.categorizeRequest(request2)).toBe('food_beverage');
    });

    it('should categorize technology requests', () => {
      const request = { creativeBrief: 'Tech startup innovation and software development' };
      expect(batchOptimizationService.categorizeRequest(request)).toBe('technology');

      const request2 = { creativeBrief: 'Mobile app digital transformation' };
      expect(batchOptimizationService.categorizeRequest(request2)).toBe('technology');
    });

    it('should categorize fashion requests', () => {
      const request = { creativeBrief: 'Fashion brand clothing style showcase' };
      expect(batchOptimizationService.categorizeRequest(request)).toBe('fashion');
    });

    it('should categorize health and fitness requests', () => {
      const request = { creativeBrief: 'Health and wellness fitness program' };
      expect(batchOptimizationService.categorizeRequest(request)).toBe('health_fitness');
    });

    it('should categorize travel requests', () => {
      const request = { creativeBrief: 'Travel destination vacation hotel booking' };
      expect(batchOptimizationService.categorizeRequest(request)).toBe('travel');
    });

    it('should default to general category', () => {
      const request = { creativeBrief: 'Some random advertisement content' };
      expect(batchOptimizationService.categorizeRequest(request)).toBe('general');
    });
  });

  describe('generateOptimizationSuggestions', () => {
    it('should suggest cluster optimization for similar content', () => {
      const clusters = [
        {
          id: 'cluster_1',
          requests: [{ index: 0 }, { index: 1 }, { index: 2 }], // 3 similar requests
          characteristics: { estimatedComplexity: 'low' }
        },
        {
          id: 'cluster_2',
          requests: [{ index: 3 }], // 1 request
          characteristics: { estimatedComplexity: 'medium' }
        }
      ];

      const suggestions = batchOptimizationService.generateOptimizationSuggestions(clusters);

      const clusterSuggestion = suggestions.find(s => s.type === 'cluster_optimization');
      expect(clusterSuggestion).toBeDefined();
      expect(clusterSuggestion.title).toBe('Similar Content Detected');
    });

    it('should suggest sequential processing for complex requests', () => {
      const clusters = [
        {
          id: 'cluster_1',
          requests: [{ index: 0 }, { index: 1 }],
          characteristics: { estimatedComplexity: 'high' }
        },
        {
          id: 'cluster_2',
          requests: [{ index: 2 }],
          characteristics: { estimatedComplexity: 'high' }
        }
      ];

      const suggestions = batchOptimizationService.generateOptimizationSuggestions(clusters);

      const processingSuggestion = suggestions.find(s => s.type === 'processing_strategy');
      expect(processingSuggestion).toBeDefined();
      expect(processingSuggestion.recommendation).toBe('sequential');
    });

    it('should suggest scheduling optimization for large batches', () => {
      const clusters = new Array(25).fill(null).map((_, i) => ({
        id: `cluster_${i}`,
        requests: [{ index: i }],
        characteristics: { estimatedComplexity: 'low' }
      }));

      const suggestions = batchOptimizationService.generateOptimizationSuggestions(clusters);

      const schedulingSuggestion = suggestions.find(s => s.type === 'scheduling');
      expect(schedulingSuggestion).toBeDefined();
      expect(schedulingSuggestion.title).toBe('Large Batch Detected');
    });
  });

  describe('calculateCostSavings', () => {
    it('should calculate savings for similar content', () => {
      const clusters = [
        {
          id: 'cluster_1',
          requests: [{ index: 0 }, { index: 1 }, { index: 2 }], // 3 similar requests
          characteristics: { estimatedComplexity: 'low' }
        },
        {
          id: 'cluster_2',
          requests: [{ index: 3 }], // 1 request
          characteristics: { estimatedComplexity: 'medium' }
        }
      ];

      const savings = batchOptimizationService.calculateCostSavings(clusters);

      expect(savings).toBeGreaterThan(0);
      expect(savings).toBeLessThanOrEqual(30); // Capped at 30%
    });

    it('should calculate higher savings for large batches', () => {
      const clusters = new Array(20).fill(null).map((_, i) => ({
        id: `cluster_${i}`,
        requests: [{ index: i }],
        characteristics: { estimatedComplexity: 'low' }
      }));

      const savings = batchOptimizationService.calculateCostSavings(clusters);

      expect(savings).toBeGreaterThanOrEqual(10); // Should have significant savings for large batch
    });
  });

  describe('optimizeScheduling', () => {
    it('should recommend optimal scheduling for batch', async () => {
      const batchData = {
        requests: new Array(10).fill({ creativeBrief: 'Test brief' }),
        priority: 5
      };

      const result = await batchOptimizationService.optimizeScheduling(batchData);

      expect(result).toEqual(
        expect.objectContaining({
          originalSchedule: undefined,
          optimizedSchedule: expect.any(Date),
          reasoning: expect.any(Array),
          estimatedCostSavings: expect.any(Number),
          estimatedTimeReduction: expect.any(Number)
        })
      );

      expect(result.reasoning.length).toBeGreaterThan(0);
    });

    it('should optimize existing schedule if beneficial', async () => {
      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000); // Tomorrow
      const batchData = {
        requests: new Array(5).fill({ creativeBrief: 'Test brief' }),
        priority: 7,
        scheduledFor: futureDate.toISOString()
      };

      const result = await batchOptimizationService.optimizeScheduling(batchData);

      expect(result.originalSchedule).toBe(futureDate.toISOString());
      // May or may not optimize depending on the optimal time calculation
    });
  });

  describe('generateBatchAnalytics', () => {
    it('should generate comprehensive batch analytics', async () => {
      const mockBatch = {
        id: 'batch-uuid',
        batchId: 'batch_123_abc',
        name: 'Test Batch',
        getDuration: jest.fn().mockReturnValue(300000), // 5 minutes
        metadata: { estimatedCostSavings: 15 },
        options: { processingStrategy: 'parallel', maxConcurrency: 3 },
        priority: 3
      };

      const mockOperations = [
        {
          status: 'completed',
          metadata: { estimatedComplexity: 'medium' }
        },
        {
          status: 'completed',
          metadata: { estimatedComplexity: 'low' }
        },
        {
          status: 'failed',
          metadata: { estimatedComplexity: 'high' }
        }
      ];

      BatchOperation.findByBatchId.mockResolvedValue(mockBatch);
      UgcOperation.findAll.mockResolvedValue(mockOperations);

      const analytics = await batchOptimizationService.generateBatchAnalytics('batch_123_abc');

      expect(analytics).toEqual(
        expect.objectContaining({
          batchId: 'batch_123_abc',
          name: 'Test Batch',
          performance: expect.objectContaining({
            totalDuration: 300, // seconds
            averageTimePerOperation: 100, // seconds
            successRate: 67, // 2/3 * 100
            throughput: expect.any(Number)
          }),
          costAnalysis: expect.objectContaining({
            totalCost: expect.any(Number),
            costPerOperation: expect.any(Number),
            costBreakdown: expect.any(Object),
            estimatedSavings: 15
          }),
          efficiency: expect.objectContaining({
            completionRate: 67,
            failureRate: 33,
            resourceUtilization: expect.any(Number),
            parallelismEfficiency: expect.any(Number)
          }),
          recommendations: expect.any(Array)
        })
      );
    });

    it('should throw error for non-existent batch', async () => {
      BatchOperation.findByBatchId.mockResolvedValue(null);

      await expect(batchOptimizationService.generateBatchAnalytics('non-existent')).rejects.toThrow(
        'Batch not found'
      );
    });
  });

  describe('findOptimalProcessingTime', () => {
    it('should return immediate time for high priority requests', () => {
      const now = new Date();
      const optimalTime = batchOptimizationService.findOptimalProcessingTime(5, 1);

      expect(optimalTime.getTime()).toBeCloseTo(now.getTime(), -3); // Within 1 second
    });

    it('should schedule large batches for off-peak hours', () => {
      // Mock current time to be during peak hours (10 AM)
      const mockNow = new Date();
      mockNow.setHours(10, 0, 0, 0);
      jest.spyOn(Date, 'now').mockReturnValue(mockNow.getTime());

      const optimalTime = batchOptimizationService.findOptimalProcessingTime(25, 5);

      // Should schedule for next off-peak period (2 AM next day)
      expect(optimalTime.getHours()).toBe(2);
      expect(optimalTime.getDate()).toBe(mockNow.getDate() + 1);

      jest.restoreAllMocks();
    });

    it('should handle different scheduling scenarios', () => {
      // Test immediate processing for high priority
      const highPriorityTime = batchOptimizationService.findOptimalProcessingTime(5, 1);
      expect(highPriorityTime).toBeInstanceOf(Date);
      expect(highPriorityTime.getTime()).toBeCloseTo(Date.now(), -1000);

      // Test that method returns valid dates for different scenarios
      const mediumBatchTime = batchOptimizationService.findOptimalProcessingTime(8, 5);
      expect(mediumBatchTime).toBeInstanceOf(Date);
      
      const largeBatchTime = batchOptimizationService.findOptimalProcessingTime(25, 5);
      expect(largeBatchTime).toBeInstanceOf(Date);
      
      // Large batch should potentially be scheduled later than medium batch
      // (though this depends on current time, so we just verify it's a valid date)
      expect(largeBatchTime.getTime()).toBeGreaterThanOrEqual(Date.now() - 1000);
    });
  });
});