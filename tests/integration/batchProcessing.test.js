const request = require('supertest');
const app = require('../../server');
const { sequelize, BatchOperation, UgcOperation } = require('../../src/models');
const batchService = require('../../src/services/batchService');

describe('Batch Processing Integration', () => {
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

  describe('Batch Creation and Management', () => {
    it('should create batch and track operations', async () => {
      const batchData = {
        name: 'Integration Test Batch',
        description: 'Test batch for integration testing',
        requests: [
          {
            creativeBrief: 'Create an ad for a coffee shop with morning vibes',
            images: [{ buffer: Buffer.from('fake-image-1'), mimeType: 'image/jpeg' }]
          },
          {
            creativeBrief: 'Create an ad for a tech startup with innovation theme',
            images: [{ buffer: Buffer.from('fake-image-2'), mimeType: 'image/png' }]
          }
        ],
        priority: 3,
        options: {
          processingStrategy: 'sequential',
          maxConcurrency: 2
        }
      };

      // Create batch
      const result = await batchService.createBatch({
        ...batchData,
        userId: 'test-user-123'
      });

      expect(result.batch).toBeDefined();
      expect(result.batch.batchId).toMatch(/^batch_\d+_[a-z0-9]+$/);
      expect(result.batch.name).toBe('Integration Test Batch');
      expect(result.batch.totalOperations).toBe(2);
      expect(result.batch.status).toBe('pending');
      expect(result.operations).toHaveLength(2);

      // Verify database records
      const batchFromDb = await BatchOperation.findByBatchId(result.batch.batchId);
      expect(batchFromDb).toBeDefined();
      expect(batchFromDb.name).toBe('Integration Test Batch');
      expect(batchFromDb.totalOperations).toBe(2);

      const operationsFromDb = await UgcOperation.findAll({
        where: { batchId: batchFromDb.id }
      });
      expect(operationsFromDb).toHaveLength(2);
      expect(operationsFromDb[0].metadata.batchIndex).toBe(0);
      expect(operationsFromDb[1].metadata.batchIndex).toBe(1);
    });

    it('should update batch progress as operations complete', async () => {
      // Create a batch
      const result = await batchService.createBatch({
        name: 'Progress Test Batch',
        requests: [
          { creativeBrief: 'Brief 1', images: [{}] },
          { creativeBrief: 'Brief 2', images: [{}] },
          { creativeBrief: 'Brief 3', images: [{}] }
        ],
        userId: 'test-user-123'
      });

      const batchId = result.batch.id;
      const operations = result.operations;

      // Initially, no operations completed
      let batch = await BatchOperation.findByPk(batchId);
      expect(batch.completedOperations).toBe(0);
      expect(batch.failedOperations).toBe(0);
      expect(batch.status).toBe('pending');

      // Complete first operation
      await UgcOperation.update(
        { status: 'completed' },
        { where: { id: operations[0].id } }
      );
      await batchService.updateBatchProgress(batchId);

      batch = await BatchOperation.findByPk(batchId);
      expect(batch.completedOperations).toBe(1);
      expect(batch.status).toBe('processing');

      // Fail second operation
      await UgcOperation.update(
        { status: 'failed' },
        { where: { id: operations[1].id } }
      );
      await batchService.updateBatchProgress(batchId);

      batch = await BatchOperation.findByPk(batchId);
      expect(batch.failedOperations).toBe(1);
      expect(batch.status).toBe('processing');

      // Complete third operation
      await UgcOperation.update(
        { status: 'completed' },
        { where: { id: operations[2].id } }
      );
      await batchService.updateBatchProgress(batchId);

      batch = await BatchOperation.findByPk(batchId);
      expect(batch.completedOperations).toBe(2);
      expect(batch.failedOperations).toBe(1);
      expect(batch.status).toBe('partial'); // Some succeeded, some failed
    });

    it('should get comprehensive batch status', async () => {
      // Create and set up batch
      const result = await batchService.createBatch({
        name: 'Status Test Batch',
        description: 'Testing status retrieval',
        requests: [
          { creativeBrief: 'Brief 1', images: [{}] },
          { creativeBrief: 'Brief 2', images: [{}] }
        ],
        userId: 'test-user-123',
        priority: 2
      });

      // Update one operation to completed
      await UgcOperation.update(
        { 
          status: 'completed',
          scriptContent: { 'segment-1': 'Test script 1', 'segment-2': 'Test script 2' },
          videoUrls: ['http://example.com/video1.mp4']
        },
        { where: { id: result.operations[0].id } }
      );

      await batchService.updateBatchProgress(result.batch.id);

      // Get status
      const status = await batchService.getBatchStatus(result.batch.batchId);

      expect(status).toEqual(
        expect.objectContaining({
          batchId: result.batch.batchId,
          name: 'Status Test Batch',
          description: 'Testing status retrieval',
          status: 'processing',
          priority: 2,
          progress: expect.objectContaining({
            total: 2,
            completed: 1,
            failed: 0,
            pending: 1,
            percentage: 50
          }),
          operations: expect.arrayContaining([
            expect.objectContaining({
              status: 'completed',
              batchIndex: 0
            }),
            expect.objectContaining({
              status: 'pending',
              batchIndex: 1
            })
          ])
        })
      );
    });

    it('should cancel batch and operations', async () => {
      // Create batch
      const result = await batchService.createBatch({
        name: 'Cancel Test Batch',
        requests: [
          { creativeBrief: 'Brief 1', images: [{}] },
          { creativeBrief: 'Brief 2', images: [{}] }
        ],
        userId: 'test-user-123'
      });

      // Start processing (simulate)
      await BatchOperation.update(
        { status: 'processing', startedAt: new Date() },
        { where: { id: result.batch.id } }
      );

      // Cancel batch
      const cancelResult = await batchService.cancelBatch(result.batch.batchId);

      expect(cancelResult.status).toBe('cancelled');
      expect(cancelResult.cancelledOperations).toBe(2);

      // Verify batch is cancelled
      const batch = await BatchOperation.findByPk(result.batch.id);
      expect(batch.status).toBe('cancelled');
      expect(batch.completedAt).toBeDefined();

      // Verify operations are cancelled
      const operations = await UgcOperation.findAll({
        where: { batchId: result.batch.id }
      });
      operations.forEach(op => {
        expect(op.status).toBe('cancelled');
      });
    });

    it('should get batch results for completed batch', async () => {
      // Create batch
      const result = await batchService.createBatch({
        name: 'Results Test Batch',
        requests: [
          { creativeBrief: 'Brief 1', images: [{}] },
          { creativeBrief: 'Brief 2', images: [{}] }
        ],
        userId: 'test-user-123'
      });

      // Complete operations with results
      await UgcOperation.update(
        { 
          status: 'completed',
          scriptContent: { 'segment-1': 'Script 1A', 'segment-2': 'Script 1B' },
          videoUrls: ['video1.mp4'],
          completedAt: new Date()
        },
        { where: { id: result.operations[0].id } }
      );

      await UgcOperation.update(
        { 
          status: 'failed',
          errorMessage: 'Test error',
          completedAt: new Date()
        },
        { where: { id: result.operations[1].id } }
      );

      // Update batch status
      await batchService.updateBatchProgress(result.batch.id);

      // Get results
      const results = await batchService.getBatchResults(result.batch.batchId);

      expect(results).toEqual(
        expect.objectContaining({
          batchId: result.batch.batchId,
          name: 'Results Test Batch',
          status: 'partial',
          results: expect.objectContaining({
            successful: expect.arrayContaining([
              expect.objectContaining({
                operationId: result.operations[0].operationId,
                status: 'completed',
                videoUrls: ['video1.mp4'],
                batchIndex: 0
              })
            ]),
            failed: expect.arrayContaining([
              expect.objectContaining({
                operationId: result.operations[1].operationId,
                status: 'failed',
                errorMessage: 'Test error',
                batchIndex: 1
              })
            ]),
            total: 2
          })
        })
      );

      expect(results.results.successful).toHaveLength(1);
      expect(results.results.failed).toHaveLength(1);
      expect(results.downloadUrl).toBe(`/api/v1/batch/${result.batch.batchId}/download`);
    });

    it('should get batch history with filters', async () => {
      // Create multiple batches
      const batch1 = await batchService.createBatch({
        name: 'History Batch 1',
        requests: [{ creativeBrief: 'Brief 1', images: [{}] }],
        userId: 'test-user-123'
      });

      const batch2 = await batchService.createBatch({
        name: 'History Batch 2',
        requests: [{ creativeBrief: 'Brief 2', images: [{}] }],
        userId: 'test-user-456'
      });

      // Complete one batch
      await BatchOperation.update(
        { status: 'completed', completedAt: new Date() },
        { where: { id: batch1.batch.id } }
      );

      // Get history for specific user
      const history = await batchService.getBatchHistory({
        userId: 'test-user-123',
        limit: 10
      });

      expect(history).toHaveLength(1);
      expect(history[0].batchId).toBe(batch1.batch.batchId);
      expect(history[0].name).toBe('History Batch 1');

      // Get history with status filter
      const completedHistory = await batchService.getBatchHistory({
        status: 'completed',
        limit: 10
      });

      expect(completedHistory).toHaveLength(1);
      expect(completedHistory[0].status).toBe('completed');
    });

    it('should generate batch analytics', async () => {
      // Create batches with different statuses
      const batch1 = await batchService.createBatch({
        name: 'Analytics Batch 1',
        requests: [
          { creativeBrief: 'Brief 1', images: [{}] },
          { creativeBrief: 'Brief 2', images: [{}] }
        ],
        userId: 'test-user-123'
      });

      const batch2 = await batchService.createBatch({
        name: 'Analytics Batch 2',
        requests: [{ creativeBrief: 'Brief 3', images: [{}] }],
        userId: 'test-user-123'
      });

      // Set different statuses
      await BatchOperation.update(
        { 
          status: 'completed', 
          completedOperations: 2,
          completedAt: new Date(),
          startedAt: new Date(Date.now() - 300000) // 5 minutes ago
        },
        { where: { id: batch1.batch.id } }
      );

      await BatchOperation.update(
        { 
          status: 'failed',
          failedOperations: 1,
          completedAt: new Date(),
          startedAt: new Date(Date.now() - 60000) // 1 minute ago
        },
        { where: { id: batch2.batch.id } }
      );

      // Get analytics
      const analytics = await batchService.getBatchAnalytics({
        userId: 'test-user-123'
      });

      expect(analytics.summary).toEqual(
        expect.objectContaining({
          totalBatches: 2,
          totalOperations: 3,
          completedOperations: 2,
          failedOperations: 1,
          successRate: 67, // 2/3 * 100 = 66.67 -> 67
          averageOperationsPerBatch: 2 // 3/2 = 1.5 -> 2
        })
      );

      expect(analytics.statusBreakdown).toHaveLength(2);
      
      const completedStats = analytics.statusBreakdown.find(s => s.status === 'completed');
      expect(completedStats).toEqual(
        expect.objectContaining({
          status: 'completed',
          count: 1,
          totalOperations: 2,
          completedOperations: 2,
          failedOperations: 0
        })
      );

      const failedStats = analytics.statusBreakdown.find(s => s.status === 'failed');
      expect(failedStats).toEqual(
        expect.objectContaining({
          status: 'failed',
          count: 1,
          totalOperations: 1,
          completedOperations: 0,
          failedOperations: 1
        })
      );
    });
  });

  describe('Batch Validation', () => {
    it('should validate batch requests properly', () => {
      // Test creative brief validation
      expect(() => {
        batchService.validateBatchRequest({ creativeBrief: '' }, 0);
      }).toThrow('Request 1: Creative brief is required');

      expect(() => {
        batchService.validateBatchRequest({ creativeBrief: 'a'.repeat(5001) }, 0);
      }).toThrow('Request 1: Creative brief too long (max 5000 characters)');

      // Test image validation
      expect(() => {
        batchService.validateBatchRequest({ 
          creativeBrief: 'Valid brief',
          images: []
        }, 0);
      }).toThrow('Request 1: At least one image is required');

      expect(() => {
        batchService.validateBatchRequest({ 
          creativeBrief: 'Valid brief',
          images: new Array(11).fill({})
        }, 0);
      }).toThrow('Request 1: Too many images (max 10)');

      // Test valid request
      expect(() => {
        batchService.validateBatchRequest({ 
          creativeBrief: 'Valid creative brief',
          images: [{ buffer: Buffer.from('image') }]
        }, 0);
      }).not.toThrow();
    });

    it('should reject batch with too many requests', async () => {
      const batchData = {
        name: 'Too Many Requests',
        requests: new Array(101).fill({ creativeBrief: 'Brief', images: [{}] }),
        userId: 'test-user-123'
      };

      await expect(batchService.createBatch(batchData)).rejects.toThrow(
        'Batch cannot contain more than 100 requests'
      );
    });

    it('should reject batch with no requests', async () => {
      const batchData = {
        name: 'No Requests',
        requests: [],
        userId: 'test-user-123'
      };

      await expect(batchService.createBatch(batchData)).rejects.toThrow(
        'Batch must contain at least one request'
      );
    });
  });

  describe('Helper Functions', () => {
    it('should estimate batch duration correctly', () => {
      const requests = [
        { 
          creativeBrief: 'Short brief',
          images: [{}] // 1 image
        },
        { 
          creativeBrief: 'a'.repeat(1500), // Long brief
          images: [{}, {}] // 2 images
        },
        { 
          creativeBrief: 'Medium brief',
          images: [{}, {}, {}] // 3 images
        }
      ];

      const duration = batchService.estimateBatchDuration(requests);

      // Base: 3 requests * 5 minutes = 900 seconds
      // Additional images: (0 + 1 + 2) * 30 = 90 seconds
      // Long brief: 1 * 30 = 30 seconds
      // Total: 1020 seconds
      expect(duration).toBe(1020);
    });

    it('should analyze content types correctly', () => {
      const requests = [
        {
          creativeBrief: 'Brief one',
          images: [{}],
          script: 'Custom script'
        },
        {
          creativeBrief: 'Brief two longer',
          images: [{}, {}]
        },
        {
          creativeBrief: 'Brief three',
          images: [{}]
        }
      ];

      const analysis = batchService.analyzeContentTypes(requests);

      expect(analysis).toEqual({
        totalRequests: 3,
        hasCustomScripts: 1,
        averageImageCount: 1, // (1 + 2 + 1) / 3 = 1.33 -> 1
        averageBriefLength: 13 // (9 + 17 + 11) / 3 = 12.33 -> 13
      });
    });

    it('should chunk arrays correctly', () => {
      const array = [1, 2, 3, 4, 5, 6, 7, 8, 9];
      const chunks = batchService.chunkArray(array, 3);

      expect(chunks).toEqual([
        [1, 2, 3],
        [4, 5, 6],
        [7, 8, 9]
      ]);

      // Test with remainder
      const array2 = [1, 2, 3, 4, 5];
      const chunks2 = batchService.chunkArray(array2, 2);

      expect(chunks2).toEqual([
        [1, 2],
        [3, 4],
        [5]
      ]);
    });
  });
});