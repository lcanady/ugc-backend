const request = require('supertest');
const app = require('../../server');
const { sequelize, BatchOperation, UgcOperation } = require('../../src/models');
const batchOptimizationService = require('../../src/services/batchOptimizationService');

describe('Batch Optimization Integration', () => {
  beforeAll(async () => {
    // Ensure database is connected
    await sequelize.authenticate();
  });

  beforeEach(async () => {
    // Clean up test data
    await UgcOperation.destroy({ where: {}, force: true });
    await BatchOperation.destroy({ where: {}, force: true });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  describe('Content Similarity and Clustering', () => {
    it('should identify similar content and suggest optimizations', async () => {
      const requests = [
        {
          creativeBrief: 'Create a coffee shop advertisement with morning vibes and cozy atmosphere for customers',
          images: [{ buffer: Buffer.from('coffee-image-1'), mimeType: 'image/jpeg' }],
          options: { aspectRatio: '16:9' }
        },
        {
          creativeBrief: 'Create a coffee house promotion with morning energy and warm cozy feeling',
          images: [{ buffer: Buffer.from('coffee-image-2'), mimeType: 'image/jpeg' }],
          options: { aspectRatio: '16:9' }
        },
        {
          creativeBrief: 'Tech startup innovation showcase with digital transformation and modern solutions',
          images: [
            { buffer: Buffer.from('tech-image-1'), mimeType: 'image/png' },
            { buffer: Buffer.from('tech-image-2'), mimeType: 'image/png' }
          ],
          script: 'Custom tech script for innovation',
          options: { aspectRatio: '9:16' }
        },
        {
          creativeBrief: 'Technology company digital solutions and software development services',
          images: [{ buffer: Buffer.from('tech-image-3'), mimeType: 'image/png' }],
          options: { aspectRatio: '9:16' }
        }
      ];

      const analysis = await batchOptimizationService.analyzeBatchOptimization(requests);

      // Should identify content clusters
      expect(analysis.totalRequests).toBe(4);
      expect(analysis.contentClusters.length).toBeGreaterThan(0);
      expect(analysis.contentClusters.length).toBeLessThan(4); // Should cluster similar content

      // Should find coffee-related cluster
      const coffeeCluster = analysis.contentClusters.find(cluster =>
        cluster.requests.some(req => 
          req.request.creativeBrief.toLowerCase().includes('coffee')
        )
      );
      expect(coffeeCluster).toBeDefined();
      expect(coffeeCluster.requests.length).toBe(2); // Two coffee requests

      // Should find tech-related cluster
      const techCluster = analysis.contentClusters.find(cluster =>
        cluster.requests.some(req => 
          req.request.creativeBrief.toLowerCase().includes('tech') ||
          req.request.creativeBrief.toLowerCase().includes('digital')
        )
      );
      expect(techCluster).toBeDefined();
      expect(techCluster.requests.length).toBe(2); // Two tech requests

      // Should provide optimization suggestions
      expect(analysis.optimizationSuggestions.length).toBeGreaterThan(0);
      
      const clusterOptimization = analysis.optimizationSuggestions.find(s => 
        s.type === 'cluster_optimization'
      );
      expect(clusterOptimization).toBeDefined();
      expect(clusterOptimization.title).toBe('Similar Content Detected');

      // Should estimate cost savings
      expect(analysis.estimatedCostSavings).toBeGreaterThan(0);
      expect(analysis.estimatedCostSavings).toBeLessThanOrEqual(30);

      // Should provide batching recommendations
      expect(analysis.recommendedBatching.length).toBeGreaterThan(0);
    });

    it('should categorize requests correctly', () => {
      const requests = [
        { creativeBrief: 'Coffee shop morning advertisement' },
        { creativeBrief: 'Restaurant food promotion' },
        { creativeBrief: 'Tech startup software development' },
        { creativeBrief: 'Fashion brand clothing showcase' },
        { creativeBrief: 'Health and fitness wellness program' },
        { creativeBrief: 'Travel destination vacation booking' },
        { creativeBrief: 'Generic business promotion' }
      ];

      requests.forEach(request => {
        const characteristics = batchOptimizationService.analyzeRequestCharacteristics(request);
        expect(characteristics.category).toBeDefined();
      });

      // Test specific categorizations
      expect(batchOptimizationService.categorizeRequest(requests[0])).toBe('food_beverage');
      expect(batchOptimizationService.categorizeRequest(requests[1])).toBe('food_beverage');
      expect(batchOptimizationService.categorizeRequest(requests[2])).toBe('technology');
      expect(batchOptimizationService.categorizeRequest(requests[3])).toBe('fashion');
      expect(batchOptimizationService.categorizeRequest(requests[4])).toBe('health_fitness');
      expect(batchOptimizationService.categorizeRequest(requests[5])).toBe('travel');
      expect(batchOptimizationService.categorizeRequest(requests[6])).toBe('general');
    });

    it('should estimate complexity accurately', () => {
      const simpleRequest = {
        creativeBrief: 'Simple ad',
        images: [{ buffer: Buffer.from('image') }]
      };

      const complexRequest = {
        creativeBrief: 'a'.repeat(1500), // Long brief
        images: new Array(8).fill({ buffer: Buffer.from('image') }), // Many images
        script: 'Custom complex script with detailed instructions',
        options: {
          aspectRatio: '16:9',
          personGeneration: 'allow_adult',
          useFastModel: false,
          customOption: 'value'
        }
      };

      const mediumRequest = {
        creativeBrief: 'a'.repeat(750), // Medium brief
        images: new Array(3).fill({ buffer: Buffer.from('image') }),
        options: { aspectRatio: '16:9' }
      };

      expect(batchOptimizationService.estimateComplexity(simpleRequest)).toBe('low');
      expect(batchOptimizationService.estimateComplexity(complexRequest)).toBe('high');
      expect(batchOptimizationService.estimateComplexity(mediumRequest)).toBe('medium');
    });
  });

  describe('Scheduling Optimization', () => {
    it('should optimize scheduling for different scenarios', async () => {
      // Test immediate processing for high priority
      const highPriorityBatch = {
        requests: [{ creativeBrief: 'Urgent request' }],
        priority: 1
      };

      const highPriorityOpt = await batchOptimizationService.optimizeScheduling(highPriorityBatch);
      expect(highPriorityOpt.optimizedSchedule).toBeDefined();
      expect(new Date(highPriorityOpt.optimizedSchedule).getTime()).toBeCloseTo(Date.now(), -5000);

      // Test scheduling for large batch
      const largeBatch = {
        requests: new Array(25).fill({ creativeBrief: 'Large batch request' }),
        priority: 5
      };

      const largeBatchOpt = await batchOptimizationService.optimizeScheduling(largeBatch);
      expect(largeBatchOpt.optimizedSchedule).toBeDefined();
      expect(largeBatchOpt.reasoning.length).toBeGreaterThan(0);
      expect(largeBatchOpt.estimatedCostSavings).toBeGreaterThan(0);

      // Test rescheduling optimization
      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000); // Tomorrow
      const scheduledBatch = {
        requests: new Array(10).fill({ creativeBrief: 'Scheduled request' }),
        priority: 6,
        scheduledFor: futureDate.toISOString()
      };

      const scheduledOpt = await batchOptimizationService.optimizeScheduling(scheduledBatch);
      expect(scheduledOpt.originalSchedule).toBe(futureDate.toISOString());
    });

    it('should find optimal processing times based on system patterns', () => {
      // Test high priority (immediate)
      const highPriorityTime = batchOptimizationService.findOptimalProcessingTime(5, 1);
      expect(highPriorityTime.getTime()).toBeCloseTo(Date.now(), -1000);

      // Test large batch (should prefer off-peak)
      const largeBatchTime = batchOptimizationService.findOptimalProcessingTime(30, 5);
      expect(largeBatchTime).toBeInstanceOf(Date);

      // Test medium batch
      const mediumBatchTime = batchOptimizationService.findOptimalProcessingTime(8, 5);
      expect(mediumBatchTime).toBeInstanceOf(Date);
    });
  });

  describe('Cost Optimization', () => {
    it('should calculate realistic cost savings', () => {
      // Test with similar content clusters
      const similarClusters = [
        {
          id: 'cluster_1',
          requests: [
            { index: 0, request: { creativeBrief: 'Coffee ad 1' } },
            { index: 1, request: { creativeBrief: 'Coffee ad 2' } },
            { index: 2, request: { creativeBrief: 'Coffee ad 3' } }
          ],
          characteristics: { estimatedComplexity: 'low' }
        },
        {
          id: 'cluster_2',
          requests: [
            { index: 3, request: { creativeBrief: 'Tech ad 1' } },
            { index: 4, request: { creativeBrief: 'Tech ad 2' } }
          ],
          characteristics: { estimatedComplexity: 'medium' }
        }
      ];

      const savings = batchOptimizationService.calculateCostSavings(similarClusters);
      expect(savings).toBeGreaterThan(0);
      expect(savings).toBeLessThanOrEqual(30);

      // Test with large batch
      const largeClusters = new Array(20).fill(null).map((_, i) => ({
        id: `cluster_${i}`,
        requests: [{ index: i, request: { creativeBrief: `Request ${i}` } }],
        characteristics: { estimatedComplexity: 'low' }
      }));

      const largeBatchSavings = batchOptimizationService.calculateCostSavings(largeClusters);
      expect(largeBatchSavings).toBeGreaterThan(savings); // Should have higher savings
    });

    it('should generate appropriate optimization suggestions', () => {
      // Test cluster optimization suggestion
      const clustersWithSimilar = [
        {
          id: 'cluster_1',
          requests: [{ index: 0 }, { index: 1 }, { index: 2 }],
          characteristics: { estimatedComplexity: 'low' }
        }
      ];

      const suggestions = batchOptimizationService.generateOptimizationSuggestions(clustersWithSimilar);
      const clusterSuggestion = suggestions.find(s => s.type === 'cluster_optimization');
      expect(clusterSuggestion).toBeDefined();

      // Test processing strategy suggestion
      const complexClusters = [
        {
          id: 'cluster_1',
          requests: [{ index: 0 }, { index: 1 }],
          characteristics: { estimatedComplexity: 'high' }
        }
      ];

      const complexSuggestions = batchOptimizationService.generateOptimizationSuggestions(complexClusters);
      const processingSuggestion = complexSuggestions.find(s => s.type === 'processing_strategy');
      expect(processingSuggestion).toBeDefined();
      expect(processingSuggestion.recommendation).toBe('sequential');

      // Test scheduling suggestion for large batch
      const largeClusters = new Array(25).fill(null).map((_, i) => ({
        id: `cluster_${i}`,
        requests: [{ index: i }],
        characteristics: { estimatedComplexity: 'low' }
      }));

      const largeSuggestions = batchOptimizationService.generateOptimizationSuggestions(largeClusters);
      const schedulingSuggestion = largeSuggestions.find(s => s.type === 'scheduling');
      expect(schedulingSuggestion).toBeDefined();
    });
  });

  describe('Batch Analytics and Reporting', () => {
    it('should generate comprehensive batch analytics', async () => {
      // Create a test batch with operations
      const batchData = {
        name: 'Analytics Test Batch',
        requests: [
          { creativeBrief: 'Request 1', images: [{}] },
          { creativeBrief: 'Request 2', images: [{}] },
          { creativeBrief: 'Request 3', images: [{}] }
        ],
        userId: 'test-user-123',
        options: {
          processingStrategy: 'parallel',
          maxConcurrency: 2
        }
      };

      const batchService = require('../../src/services/batchService');
      const result = await batchService.createBatch(batchData);

      // Simulate batch completion with different outcomes
      await UgcOperation.update(
        { 
          status: 'completed',
          completedAt: new Date(),
          metadata: { ...result.operations[0].metadata, estimatedComplexity: 'low' }
        },
        { where: { id: result.operations[0].id } }
      );

      await UgcOperation.update(
        { 
          status: 'completed',
          completedAt: new Date(),
          metadata: { ...result.operations[1].metadata, estimatedComplexity: 'medium' }
        },
        { where: { id: result.operations[1].id } }
      );

      await UgcOperation.update(
        { 
          status: 'failed',
          errorMessage: 'Test failure',
          completedAt: new Date(),
          metadata: { ...result.operations[2].metadata, estimatedComplexity: 'high' }
        },
        { where: { id: result.operations[2].id } }
      );

      // Update batch with completion info
      await BatchOperation.update(
        {
          status: 'partial',
          completedOperations: 2,
          failedOperations: 1,
          startedAt: new Date(Date.now() - 300000), // 5 minutes ago
          completedAt: new Date(),
          metadata: {
            ...result.batch.metadata,
            estimatedCostSavings: 15
          }
        },
        { where: { id: result.batch.id } }
      );

      // Generate analytics
      const analytics = await batchOptimizationService.generateBatchAnalytics(result.batch.batchId);

      expect(analytics).toEqual(
        expect.objectContaining({
          batchId: result.batch.batchId,
          name: 'Analytics Test Batch',
          performance: expect.objectContaining({
            totalDuration: expect.any(Number),
            averageTimePerOperation: expect.any(Number),
            successRate: 67, // 2/3 * 100
            statusBreakdown: expect.objectContaining({
              completed: 2,
              failed: 1
            }),
            throughput: expect.any(Number)
          }),
          costAnalysis: expect.objectContaining({
            totalCost: expect.any(Number),
            costPerOperation: expect.any(Number),
            costBreakdown: expect.objectContaining({
              imageAnalysis: expect.any(Number),
              scriptGeneration: expect.any(Number),
              videoGeneration: expect.any(Number)
            }),
            estimatedSavings: 15
          }),
          efficiency: expect.objectContaining({
            completionRate: 67,
            failureRate: 33,
            resourceUtilization: expect.any(Number),
            parallelismEfficiency: expect.any(Number),
            cacheHitRate: expect.any(Number)
          }),
          recommendations: expect.any(Array)
        })
      );

      // Check that recommendations are generated based on performance
      expect(analytics.recommendations.length).toBeGreaterThan(0);
      
      // Should have reliability recommendation due to 67% success rate
      const reliabilityRec = analytics.recommendations.find(r => r.type === 'reliability');
      expect(reliabilityRec).toBeDefined();
      expect(reliabilityRec.priority).toBe('high');
    });

    it('should calculate resource utilization and parallelism efficiency', () => {
      const parallelBatch = {
        options: { processingStrategy: 'parallel', maxConcurrency: 4 },
        priority: 3
      };

      const sequentialBatch = {
        options: { processingStrategy: 'sequential' },
        priority: 7
      };

      const parallelUtilization = batchOptimizationService.calculateResourceUtilization(parallelBatch);
      const sequentialUtilization = batchOptimizationService.calculateResourceUtilization(sequentialBatch);

      expect(parallelUtilization).toBeGreaterThan(sequentialUtilization);
      expect(parallelUtilization).toBeLessThanOrEqual(100);
      expect(sequentialUtilization).toBeLessThanOrEqual(100);

      // Test parallelism efficiency
      const operations = new Array(6).fill({});
      const parallelEfficiency = batchOptimizationService.calculateParallelismEfficiency(parallelBatch, operations);
      const sequentialEfficiency = batchOptimizationService.calculateParallelismEfficiency(sequentialBatch, operations);

      expect(sequentialEfficiency).toBe(100); // Sequential is always 100% efficient for its strategy
      expect(parallelEfficiency).toBeLessThanOrEqual(100);
      expect(parallelEfficiency).toBeGreaterThan(0);
    });

    it('should generate performance recommendations based on metrics', () => {
      const lowPerformanceBatch = {
        options: { processingStrategy: 'sequential' },
        priority: 8
      };

      const lowPerformanceOps = [
        { status: 'completed' },
        { status: 'failed' },
        { status: 'failed' }
      ];

      const recommendations = batchOptimizationService.generatePerformanceRecommendations(
        lowPerformanceBatch,
        lowPerformanceOps
      );

      expect(recommendations.length).toBeGreaterThan(0);

      // Should recommend reliability improvements due to low success rate
      const reliabilityRec = recommendations.find(r => r.type === 'reliability');
      expect(reliabilityRec).toBeDefined();
      expect(reliabilityRec.priority).toBe('high');
    });
  });

  describe('Processing Strategy Optimization', () => {
    it('should recommend optimal batching strategies', () => {
      const mixedComplexityClusters = [
        {
          id: 'cluster_1',
          requests: [{ index: 0 }, { index: 1 }],
          characteristics: { estimatedComplexity: 'high' }
        },
        {
          id: 'cluster_2',
          requests: [{ index: 2 }, { index: 3 }, { index: 4 }],
          characteristics: { estimatedComplexity: 'medium' }
        },
        {
          id: 'cluster_3',
          requests: [{ index: 5 }, { index: 6 }, { index: 7 }, { index: 8 }],
          characteristics: { estimatedComplexity: 'low' }
        }
      ];

      const recommendations = batchOptimizationService.recommendBatchingStrategy(mixedComplexityClusters);

      expect(recommendations.length).toBe(3); // One for each complexity level

      // High complexity should be processed first sequentially
      const highComplexityRec = recommendations.find(r => r.priority === 1);
      expect(highComplexityRec).toBeDefined();
      expect(highComplexityRec.processingStrategy).toBe('sequential');
      expect(highComplexityRec.title).toBe('Process High Complexity First');

      // Medium complexity should be processed in parallel with limited concurrency
      const mediumComplexityRec = recommendations.find(r => r.priority === 2);
      expect(mediumComplexityRec).toBeDefined();
      expect(mediumComplexityRec.processingStrategy).toBe('parallel');
      expect(mediumComplexityRec.maxConcurrency).toBe(3);

      // Low complexity should be processed in parallel with higher concurrency
      const lowComplexityRec = recommendations.find(r => r.priority === 3);
      expect(lowComplexityRec).toBeDefined();
      expect(lowComplexityRec.processingStrategy).toBe('parallel');
      expect(lowComplexityRec.maxConcurrency).toBe(5);
    });

    it('should recommend batch splitting for large batches', () => {
      const largeClusters = new Array(60).fill(null).map((_, i) => ({
        id: `cluster_${i}`,
        requests: [{ index: i }],
        characteristics: { estimatedComplexity: 'low' }
      }));

      const recommendations = batchOptimizationService.recommendBatchingStrategy(largeClusters);

      const splittingRec = recommendations.find(r => r.type === 'batch_splitting');
      expect(splittingRec).toBeDefined();
      expect(splittingRec.recommendedBatchSize).toBe(50);
      expect(splittingRec.totalBatches).toBe(2); // Math.ceil(60/50) = 2
    });

    it('should estimate processing times accurately', () => {
      const lowComplexityClusters = [
        {
          requests: [{ index: 0 }, { index: 1 }],
          characteristics: { estimatedComplexity: 'low' }
        }
      ];

      const highComplexityClusters = [
        {
          requests: [{ index: 0 }, { index: 1 }],
          characteristics: { estimatedComplexity: 'high' }
        }
      ];

      const lowTime = batchOptimizationService.estimateProcessingTime(lowComplexityClusters);
      const highTime = batchOptimizationService.estimateProcessingTime(highComplexityClusters);

      expect(highTime).toBeGreaterThan(lowTime);
      expect(lowTime).toBeGreaterThan(0);
      expect(highTime).toBeGreaterThan(0);
    });
  });
});