const request = require('supertest');
const express = require('express');
const batchController = require('../../../src/controllers/batchController');
const batchService = require('../../../src/services/batchService');

// Mock dependencies
jest.mock('../../../src/services/batchService');

const app = express();
app.use(express.json());

// Mock middleware
app.use((req, res, next) => {
  req.user = { id: 'user-123', hasPermission: jest.fn().mockReturnValue(true) };
  req.apiKey = { id: 'key-123', hasPermission: jest.fn().mockReturnValue(true) };
  next();
});

// Add routes
app.post('/batch/generate', batchController.createBatch.bind(batchController));
app.get('/batch/:batchId/status', batchController.getBatchStatus.bind(batchController));
app.get('/batch/:batchId/results', batchController.getBatchResults.bind(batchController));
app.post('/batch/:batchId/cancel', batchController.cancelBatch.bind(batchController));
app.get('/batch/history', batchController.getBatchHistory.bind(batchController));
app.get('/batch/analytics', batchController.getBatchAnalytics.bind(batchController));

describe('BatchController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /batch/generate', () => {
    it('should create batch with valid data', async () => {
      const mockResult = {
        batch: {
          batchId: 'batch_123_abc',
          name: 'Test Batch',
          description: 'Test Description',
          status: 'pending',
          priority: 5,
          created_at: new Date(),
          metadata: { estimatedDuration: 600 }
        },
        operations: [
          { operationId: 'op1', metadata: { batchIndex: 0 } },
          { operationId: 'op2', metadata: { batchIndex: 1 } }
        ],
        totalRequests: 2
      };

      batchService.createBatch.mockResolvedValue(mockResult);

      const batchData = {
        name: 'Test Batch',
        description: 'Test Description',
        requests: [
          { creativeBrief: 'Brief 1', images: [{ buffer: 'image1' }] },
          { creativeBrief: 'Brief 2', images: [{ buffer: 'image2' }] }
        ],
        priority: 5
      };

      const response = await request(app)
        .post('/batch/generate')
        .send(batchData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.batchId).toBe('batch_123_abc');
      expect(response.body.data.totalRequests).toBe(2);
      expect(response.body.data.operations).toHaveLength(2);

      expect(batchService.createBatch).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Test Batch',
          description: 'Test Description',
          requests: batchData.requests,
          userId: 'user-123',
          apiKeyId: 'key-123',
          priority: 5
        })
      );
    });

    it('should return 400 for missing name', async () => {
      const batchData = {
        requests: [{ creativeBrief: 'Brief 1' }]
      };

      const response = await request(app)
        .post('/batch/generate')
        .send(batchData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('INVALID_BATCH_NAME');
    });

    it('should return 400 for empty requests', async () => {
      const batchData = {
        name: 'Test Batch',
        requests: []
      };

      const response = await request(app)
        .post('/batch/generate')
        .send(batchData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('NO_REQUESTS_PROVIDED');
    });

    it('should return 400 for too many requests', async () => {
      const batchData = {
        name: 'Test Batch',
        requests: new Array(101).fill({ creativeBrief: 'Brief' })
      };

      const response = await request(app)
        .post('/batch/generate')
        .send(batchData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('TOO_MANY_REQUESTS');
    });

    it('should return 400 for invalid priority', async () => {
      const batchData = {
        name: 'Test Batch',
        requests: [{ creativeBrief: 'Brief 1' }],
        priority: 15
      };

      const response = await request(app)
        .post('/batch/generate')
        .send(batchData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('INVALID_PRIORITY');
    });

    it('should return 400 for past scheduled date', async () => {
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // Yesterday

      const batchData = {
        name: 'Test Batch',
        requests: [{ creativeBrief: 'Brief 1' }],
        scheduledFor: pastDate.toISOString()
      };

      const response = await request(app)
        .post('/batch/generate')
        .send(batchData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('PAST_SCHEDULED_DATE');
    });

    it('should handle service errors', async () => {
      batchService.createBatch.mockRejectedValue(new Error('Service error'));

      const batchData = {
        name: 'Test Batch',
        requests: [{ creativeBrief: 'Brief 1' }]
      };

      const response = await request(app)
        .post('/batch/generate')
        .send(batchData)
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('BATCH_CREATION_ERROR');
    });
  });

  describe('GET /batch/:batchId/status', () => {
    it('should return batch status', async () => {
      const mockStatus = {
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
        operations: [
          { operationId: 'op1', status: 'completed' },
          { operationId: 'op2', status: 'processing' }
        ]
      };

      batchService.getBatchStatus.mockResolvedValue(mockStatus);

      const response = await request(app)
        .get('/batch/batch_123_abc/status')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockStatus);
      expect(batchService.getBatchStatus).toHaveBeenCalledWith('batch_123_abc');
    });

    it('should return 404 for non-existent batch', async () => {
      batchService.getBatchStatus.mockResolvedValue(null);

      const response = await request(app)
        .get('/batch/non-existent/status')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('BATCH_NOT_FOUND');
    });

    it('should return 400 for missing batch ID', async () => {
      const response = await request(app)
        .get('/batch//status')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('MISSING_BATCH_ID');
    });
  });

  describe('GET /batch/:batchId/results', () => {
    it('should return batch results', async () => {
      const mockResults = {
        batchId: 'batch_123_abc',
        name: 'Test Batch',
        status: 'completed',
        results: {
          successful: [
            { operationId: 'op1', videoUrls: ['video1.mp4'] }
          ],
          failed: [],
          total: 1
        },
        downloadUrl: '/api/v1/batch/batch_123_abc/download'
      };

      batchService.getBatchResults.mockResolvedValue(mockResults);

      const response = await request(app)
        .get('/batch/batch_123_abc/results')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockResults);
    });

    it('should return 404 for non-existent batch', async () => {
      batchService.getBatchResults.mockRejectedValue(new Error('Batch not found'));

      const response = await request(app)
        .get('/batch/non-existent/results')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('BATCH_NOT_FOUND');
    });

    it('should return 400 for incomplete batch', async () => {
      batchService.getBatchResults.mockRejectedValue(new Error('Batch is not yet completed'));

      const response = await request(app)
        .get('/batch/batch_123_abc/results')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('BATCH_NOT_COMPLETED');
    });
  });

  describe('POST /batch/:batchId/cancel', () => {
    it('should cancel batch', async () => {
      const mockResult = {
        batchId: 'batch_123_abc',
        status: 'cancelled',
        cancelledOperations: 2,
        totalOperations: 2
      };

      batchService.cancelBatch.mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/batch/batch_123_abc/cancel')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockResult);
      expect(response.body.message).toBe('Batch cancelled successfully');
    });

    it('should return 404 for non-existent batch', async () => {
      batchService.cancelBatch.mockRejectedValue(new Error('Batch not found'));

      const response = await request(app)
        .post('/batch/non-existent/cancel')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('BATCH_NOT_FOUND');
    });

    it('should return 400 for completed batch', async () => {
      batchService.cancelBatch.mockRejectedValue(new Error('Cannot cancel completed batch'));

      const response = await request(app)
        .post('/batch/batch_123_abc/cancel')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('BATCH_ALREADY_COMPLETED');
    });
  });

  describe('GET /batch/history', () => {
    it('should return batch history', async () => {
      const mockHistory = [
        {
          batchId: 'batch1',
          name: 'Batch 1',
          status: 'completed',
          progress: { percentage: 100 },
          createdAt: new Date()
        }
      ];

      batchService.getBatchHistory.mockResolvedValue(mockHistory);

      const response = await request(app)
        .get('/batch/history?limit=10&status=completed')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.batches).toEqual(mockHistory);
      expect(response.body.data.total).toBe(1);

      expect(batchService.getBatchHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-123',
          apiKeyId: 'key-123',
          limit: 10,
          status: 'completed'
        })
      );
    });

    it('should return 401 without authentication', async () => {
      // Create app without auth middleware
      const noAuthApp = express();
      noAuthApp.use(express.json());
      noAuthApp.get('/batch/history', batchController.getBatchHistory.bind(batchController));

      const response = await request(noAuthApp)
        .get('/batch/history')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('AUTHENTICATION_REQUIRED');
    });
  });

  describe('GET /batch/analytics', () => {
    it('should return batch analytics', async () => {
      const mockAnalytics = {
        summary: {
          totalBatches: 10,
          totalOperations: 100,
          completedOperations: 90,
          failedOperations: 10,
          successRate: 90,
          averageOperationsPerBatch: 10
        },
        statusBreakdown: [
          {
            status: 'completed',
            count: 8,
            totalOperations: 80,
            completedOperations: 80,
            failedOperations: 0
          }
        ]
      };

      batchService.getBatchAnalytics.mockResolvedValue(mockAnalytics);

      const response = await request(app)
        .get('/batch/analytics')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockAnalytics);
    });

    it('should handle date filters', async () => {
      batchService.getBatchAnalytics.mockResolvedValue({
        summary: {},
        statusBreakdown: []
      });

      const startDate = '2024-01-01';
      const endDate = '2024-12-31';

      await request(app)
        .get(`/batch/analytics?startDate=${startDate}&endDate=${endDate}`)
        .expect(200);

      expect(batchService.getBatchAnalytics).toHaveBeenCalledWith(
        expect.objectContaining({
          startDate: new Date(startDate),
          endDate: new Date(endDate)
        })
      );
    });
  });
});