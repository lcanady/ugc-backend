const batchService = require('../../../src/services/batchService');
const { BatchOperation, UgcOperation } = require('../../../src/models');
const operationService = require('../../../src/services/operationService');
const jobManager = require('../../../src/jobs/jobManager');

// Mock dependencies
jest.mock('../../../src/models');
jest.mock('../../../src/services/operationService');
jest.mock('../../../src/jobs/jobManager');

describe('BatchService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createBatch', () => {
    it('should create a batch with valid data', async () => {
      const mockBatch = {
        id: 'batch-uuid',
        batchId: 'batch_123_abc',
        name: 'Test Batch',
        description: 'Test Description',
        totalOperations: 2,
        priority: 5,
        created_at: new Date(),
        metadata: {
          createdBy: 'user',
          requestCount: 2,
          estimatedDuration: 600,
          contentTypes: {
            totalRequests: 2,
            hasCustomScripts: 0,
            averageImageCount: 1,
            averageBriefLength: 100
          }
        }
      };

      const mockOperations = [
        { operationId: 'op1', metadata: { batchIndex: 0 } },
        { operationId: 'op2', metadata: { batchIndex: 1 } }
      ];

      BatchOperation.create.mockResolvedValue(mockBatch);
      operationService.createOperation.mockResolvedValueOnce(mockOperations[0]);
      operationService.createOperation.mockResolvedValueOnce(mockOperations[1]);

      const batchData = {
        name: 'Test Batch',
        description: 'Test Description',
        requests: [
          { creativeBrief: 'Brief 1', images: [{ buffer: Buffer.from('image1') }] },
          { creativeBrief: 'Brief 2', images: [{ buffer: Buffer.from('image2') }] }
        ],
        userId: 'user-123',
        priority: 5
      };

      const result = await batchService.createBatch(batchData);

      expect(BatchOperation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Test Batch',
          description: 'Test Description',
          totalOperations: 2,
          priority: 5,
          userId: 'user-123'
        })
      );

      expect(operationService.createOperation).toHaveBeenCalledTimes(2);
      expect(result.batch).toEqual(mockBatch);
      expect(result.operations).toHaveLength(2);
      expect(result.totalRequests).toBe(2);
    });

    it('should throw error for empty requests', async () => {
      const batchData = {
        name: 'Test Batch',
        requests: [],
        userId: 'user-123'
      };

      await expect(batchService.createBatch(batchData)).rejects.toThrow(
        'Batch must contain at least one request'
      );
    });

    it('should throw error for too many requests', async () => {
      const batchData = {
        name: 'Test Batch',
        requests: new Array(101).fill({ creativeBrief: 'Brief' }),
        userId: 'user-123'
      };

      await expect(batchService.createBatch(batchData)).rejects.toThrow(
        'Batch cannot contain more than 100 requests'
      );
    });

    it('should validate individual requests', async () => {
      const batchData = {
        name: 'Test Batch',
        requests: [
          { creativeBrief: '' } // Invalid brief
        ],
        userId: 'user-123'
      };

      await expect(batchService.createBatch(batchData)).rejects.toThrow(
        'Request 1: Creative brief is required'
      );
    });
  });

  describe('getBatchStatus', () => {
    it('should return batch status with operations', async () => {
      const mockBatch = {
        id: 'batch-uuid',
        batchId: 'batch_123_abc',
        name: 'Test Batch',
        status: 'processing',
        totalOperations: 2,
        completedOperations: 1,
        failedOperations: 0,
        getProgress: jest.fn().mockReturnValue({
          total: 2,
          completed: 1,
          failed: 0,
          pending: 1,
          percentage: 50
        }),
        getDuration: jest.fn().mockReturnValue(30000),
        getEstimatedTimeRemaining: jest.fn().mockReturnValue(30),
        created_at: new Date(),
        updated_at: new Date()
      };

      const mockOperations = [
        {
          operationId: 'op1',
          status: 'completed',
          metadata: { batchIndex: 0 },
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          operationId: 'op2',
          status: 'processing',
          metadata: { batchIndex: 1 },
          created_at: new Date(),
          updated_at: new Date()
        }
      ];

      BatchOperation.findByBatchId.mockResolvedValue(mockBatch);
      UgcOperation.findAll.mockResolvedValue(mockOperations);

      const result = await batchService.getBatchStatus('batch_123_abc');

      expect(result).toEqual(
        expect.objectContaining({
          batchId: 'batch_123_abc',
          name: 'Test Batch',
          status: 'processing',
          progress: {
            total: 2,
            completed: 1,
            failed: 0,
            pending: 1,
            percentage: 50
          },
          duration: 30,
          estimatedTimeRemaining: 30,
          operations: expect.arrayContaining([
            expect.objectContaining({
              operationId: 'op1',
              status: 'completed',
              batchIndex: 0
            }),
            expect.objectContaining({
              operationId: 'op2',
              status: 'processing',
              batchIndex: 1
            })
          ])
        })
      );
    });

    it('should return null for non-existent batch', async () => {
      BatchOperation.findByBatchId.mockResolvedValue(null);

      const result = await batchService.getBatchStatus('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('updateBatchProgress', () => {
    it('should update batch progress based on operations', async () => {
      const mockBatch = {
        id: 'batch-uuid',
        completedOperations: 0,
        failedOperations: 0,
        updateProgress: jest.fn().mockResolvedValue(true)
      };

      const mockOperations = [
        { status: 'completed' },
        { status: 'completed' },
        { status: 'failed' },
        { status: 'processing' }
      ];

      BatchOperation.findByPk.mockResolvedValue(mockBatch);
      UgcOperation.findAll.mockResolvedValue(mockOperations);

      const result = await batchService.updateBatchProgress('batch-uuid');

      expect(mockBatch.completedOperations).toBe(2);
      expect(mockBatch.failedOperations).toBe(1);
      expect(mockBatch.updateProgress).toHaveBeenCalled();
    });

    it('should throw error for non-existent batch', async () => {
      BatchOperation.findByPk.mockResolvedValue(null);

      await expect(batchService.updateBatchProgress('non-existent')).rejects.toThrow(
        'Batch not found'
      );
    });
  });

  describe('cancelBatch', () => {
    it('should cancel batch and pending operations', async () => {
      const mockBatch = {
        batchId: 'batch_123_abc',
        id: 'batch-uuid',
        status: 'processing',
        isCompleted: jest.fn().mockReturnValue(false),
        save: jest.fn().mockResolvedValue(true)
      };

      const mockOperations = [
        { operationId: 'op1', status: 'pending' },
        { operationId: 'op2', status: 'processing' }
      ];

      BatchOperation.findByBatchId.mockResolvedValue(mockBatch);
      UgcOperation.findAll.mockResolvedValue(mockOperations);
      operationService.updateOperationStatus.mockResolvedValue(true);

      const result = await batchService.cancelBatch('batch_123_abc');

      expect(operationService.updateOperationStatus).toHaveBeenCalledTimes(2);
      expect(operationService.updateOperationStatus).toHaveBeenCalledWith(
        'op1',
        'cancelled',
        expect.objectContaining({
          cancelReason: 'Batch cancelled by user'
        })
      );
      expect(mockBatch.status).toBe('cancelled');
      expect(result.cancelledOperations).toBe(2);
    });

    it('should throw error for completed batch', async () => {
      const mockBatch = {
        isCompleted: jest.fn().mockReturnValue(true)
      };

      BatchOperation.findByBatchId.mockResolvedValue(mockBatch);

      await expect(batchService.cancelBatch('batch_123_abc')).rejects.toThrow(
        'Cannot cancel completed batch'
      );
    });
  });

  describe('getBatchHistory', () => {
    it('should return batch history with filters', async () => {
      const mockBatches = [
        {
          batchId: 'batch1',
          name: 'Batch 1',
          status: 'completed',
          getProgress: jest.fn().mockReturnValue({ percentage: 100 }),
          getDuration: jest.fn().mockReturnValue(60000),
          created_at: new Date(),
          apiKey: { id: 'key1', name: 'Key 1' },
          user: null
        }
      ];

      BatchOperation.findAll.mockResolvedValue(mockBatches);

      const filters = {
        userId: 'user-123',
        limit: 10,
        status: 'completed'
      };

      const result = await batchService.getBatchHistory(filters);

      expect(BatchOperation.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'user-123',
            status: 'completed'
          }),
          limit: 10,
          order: [['created_at', 'DESC']]
        })
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(
        expect.objectContaining({
          batchId: 'batch1',
          name: 'Batch 1',
          status: 'completed'
        })
      );
    });
  });

  describe('getBatchAnalytics', () => {
    it('should return batch analytics', async () => {
      const mockStats = [
        {
          status: 'completed',
          dataValues: {
            count: '5',
            totalOperations: '50',
            completedOperations: '45',
            failedOperations: '5',
            avgDurationSeconds: '300'
          }
        },
        {
          status: 'failed',
          dataValues: {
            count: '2',
            totalOperations: '20',
            completedOperations: '0',
            failedOperations: '20',
            avgDurationSeconds: '0'
          }
        }
      ];

      BatchOperation.getBatchStats.mockResolvedValue(mockStats);

      const result = await batchService.getBatchAnalytics({});

      expect(result.summary).toEqual(
        expect.objectContaining({
          totalBatches: 7,
          totalOperations: 70,
          completedOperations: 45,
          failedOperations: 25,
          successRate: 64, // 45/70 * 100
          averageOperationsPerBatch: 10 // 70/7
        })
      );

      expect(result.statusBreakdown).toHaveLength(2);
      expect(result.statusBreakdown[0]).toEqual(
        expect.objectContaining({
          status: 'completed',
          count: 5,
          totalOperations: 50,
          completedOperations: 45,
          failedOperations: 5,
          avgDurationSeconds: 300
        })
      );
    });
  });

  describe('Helper methods', () => {
    describe('validateBatchRequest', () => {
      it('should validate creative brief', () => {
        expect(() => {
          batchService.validateBatchRequest({ creativeBrief: '' }, 0);
        }).toThrow('Request 1: Creative brief is required');

        expect(() => {
          batchService.validateBatchRequest({ creativeBrief: 'a'.repeat(5001) }, 0);
        }).toThrow('Request 1: Creative brief too long (max 5000 characters)');
      });

      it('should validate images', () => {
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
      });
    });

    describe('estimateBatchDuration', () => {
      it('should estimate duration based on requests', () => {
        const requests = [
          { creativeBrief: 'Brief 1', images: [{}] },
          { creativeBrief: 'Brief 2', images: [{}, {}] },
          { creativeBrief: 'a'.repeat(1500), images: [{}] }
        ];

        const duration = batchService.estimateBatchDuration(requests);

        // Base: 3 * 5 minutes = 900 seconds
        // Additional images: 1 * 30 seconds = 30 seconds
        // Long brief: 1 * 30 seconds = 30 seconds
        // Total: 960 seconds
        expect(duration).toBe(960);
      });
    });

    describe('analyzeContentTypes', () => {
      it('should analyze content types', () => {
        const requests = [
          { creativeBrief: 'Brief 1', images: [{}], script: 'Custom script' },
          { creativeBrief: 'Brief 2 longer', images: [{}, {}] }
        ];

        const analysis = batchService.analyzeContentTypes(requests);

        expect(analysis).toEqual({
          totalRequests: 2,
          hasCustomScripts: 1,
          averageImageCount: 2, // (1 + 2) / 2 = 1.5 -> 2
          averageBriefLength: 11 // (7 + 14) / 2 = 10.5 -> 11
        });
      });
    });

    describe('chunkArray', () => {
      it('should split array into chunks', () => {
        const array = [1, 2, 3, 4, 5, 6, 7];
        const chunks = batchService.chunkArray(array, 3);

        expect(chunks).toEqual([
          [1, 2, 3],
          [4, 5, 6],
          [7]
        ]);
      });
    });
  });
});