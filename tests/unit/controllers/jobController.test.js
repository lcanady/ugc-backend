const request = require('supertest');
const express = require('express');
const jobController = require('../../../src/controllers/jobController');
const jobManager = require('../../../src/jobs/jobManager');
const jobMonitoringService = require('../../../src/services/jobMonitoringService');

// Mock dependencies
jest.mock('../../../src/jobs/jobManager');
jest.mock('../../../src/services/jobMonitoringService');

// Create Express app for testing
const app = express();
app.use(express.json());

// Define routes
app.get('/api/v1/jobs/dashboard', jobController.getDashboard.bind(jobController));
app.get('/api/v1/jobs/queues/:queueName/stats', jobController.getQueueStats.bind(jobController));
app.get('/api/v1/jobs/queues/stats', jobController.getAllQueueStats.bind(jobController));
app.get('/api/v1/jobs/queues/:queueName/jobs/:jobId', jobController.getJobStatus.bind(jobController));
app.get('/api/v1/jobs/queues/:queueName/jobs/:jobId/details', jobController.getJobDetails.bind(jobController));
app.get('/api/v1/jobs/recent', jobController.getRecentJobs.bind(jobController));
app.get('/api/v1/jobs/queues/:queueName/trends', jobController.getQueueTrends.bind(jobController));
app.get('/api/v1/jobs/metrics', jobController.getPerformanceMetrics.bind(jobController));
app.get('/api/v1/jobs/export', jobController.exportQueueData.bind(jobController));
app.get('/api/v1/jobs/health', jobController.healthCheck.bind(jobController));
app.post('/api/v1/jobs/queues/:queueName/jobs/:jobId/retry', jobController.retryJob.bind(jobController));
app.delete('/api/v1/jobs/queues/:queueName/jobs/:jobId', jobController.cancelJob.bind(jobController));

describe('JobController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/v1/jobs/dashboard', () => {
    it('should return dashboard data successfully', async () => {
      const mockDashboardData = {
        overview: {
          totalQueues: 3,
          totalJobs: 100,
          activeJobs: 5,
          failedJobs: 2,
          completedJobs: 93,
          uptime: 3600000,
        },
        queues: {},
        health: { status: 'healthy' },
        recentJobs: [],
        performance: {},
        timestamp: new Date(),
      };

      jobMonitoringService.getDashboardData.mockResolvedValue(mockDashboardData);

      const response = await request(app)
        .get('/api/v1/jobs/dashboard')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: mockDashboardData,
      });

      expect(jobMonitoringService.getDashboardData).toHaveBeenCalledTimes(1);
    });

    it('should handle errors', async () => {
      jobMonitoringService.getDashboardData.mockRejectedValue(new Error('Dashboard error'));

      const response = await request(app)
        .get('/api/v1/jobs/dashboard')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: {
          code: 'DASHBOARD_ERROR',
          message: 'Failed to get job dashboard data',
          details: 'Dashboard error',
        },
      });
    });
  });

  describe('GET /api/v1/jobs/queues/:queueName/stats', () => {
    it('should return queue stats successfully', async () => {
      const mockStats = {
        name: 'videoGeneration',
        waiting: 2,
        active: 1,
        completed: 10,
        failed: 1,
        delayed: 0,
        total: 14,
      };

      jobManager.getQueueStats.mockResolvedValue(mockStats);

      const response = await request(app)
        .get('/api/v1/jobs/queues/videoGeneration/stats')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: mockStats,
      });

      expect(jobManager.getQueueStats).toHaveBeenCalledWith('videoGeneration');
    });

    it('should handle queue not found', async () => {
      jobManager.getQueueStats.mockRejectedValue(new Error('Queue invalidQueue not found'));

      const response = await request(app)
        .get('/api/v1/jobs/queues/invalidQueue/stats')
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        error: {
          code: 'QUEUE_NOT_FOUND',
          message: 'Queue invalidQueue not found',
        },
      });
    });

    it('should handle other errors', async () => {
      jobManager.getQueueStats.mockRejectedValue(new Error('Redis connection failed'));

      const response = await request(app)
        .get('/api/v1/jobs/queues/videoGeneration/stats')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: {
          code: 'QUEUE_STATS_ERROR',
          message: 'Failed to get queue statistics',
          details: 'Redis connection failed',
        },
      });
    });
  });

  describe('GET /api/v1/jobs/queues/stats', () => {
    it('should return all queue stats successfully', async () => {
      const mockAllStats = {
        videoGeneration: { name: 'videoGeneration', total: 14 },
        videoProcessing: { name: 'videoProcessing', total: 5 },
        cleanup: { name: 'cleanup', total: 3 },
      };

      jobManager.getAllQueueStats.mockResolvedValue(mockAllStats);

      const response = await request(app)
        .get('/api/v1/jobs/queues/stats')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: mockAllStats,
      });

      expect(jobManager.getAllQueueStats).toHaveBeenCalledTimes(1);
    });

    it('should handle errors', async () => {
      jobManager.getAllQueueStats.mockRejectedValue(new Error('Stats error'));

      const response = await request(app)
        .get('/api/v1/jobs/queues/stats')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: {
          code: 'ALL_QUEUE_STATS_ERROR',
          message: 'Failed to get all queue statistics',
          details: 'Stats error',
        },
      });
    });
  });

  describe('GET /api/v1/jobs/queues/:queueName/jobs/:jobId', () => {
    it('should return job status successfully', async () => {
      const mockJobStatus = {
        id: 'job-123',
        name: 'generate-video',
        data: { operationId: 'op-123' },
        progress: 50,
        returnvalue: null,
        failedReason: null,
        processedOn: Date.now(),
        finishedOn: null,
        opts: {},
      };

      jobManager.getJobStatus.mockResolvedValue(mockJobStatus);

      const response = await request(app)
        .get('/api/v1/jobs/queues/videoGeneration/jobs/job-123')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: mockJobStatus,
      });

      expect(jobManager.getJobStatus).toHaveBeenCalledWith('videoGeneration', 'job-123');
    });

    it('should handle job not found', async () => {
      jobManager.getJobStatus.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/v1/jobs/queues/videoGeneration/jobs/non-existent')
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        error: {
          code: 'JOB_NOT_FOUND',
          message: 'Job non-existent not found in queue videoGeneration',
        },
      });
    });

    it('should handle errors', async () => {
      jobManager.getJobStatus.mockRejectedValue(new Error('Job status error'));

      const response = await request(app)
        .get('/api/v1/jobs/queues/videoGeneration/jobs/job-123')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: {
          code: 'JOB_STATUS_ERROR',
          message: 'Failed to get job status',
          details: 'Job status error',
        },
      });
    });
  });

  describe('GET /api/v1/jobs/queues/:queueName/jobs/:jobId/details', () => {
    it('should return job details successfully', async () => {
      const mockJobDetails = {
        id: 'job-123',
        name: 'generate-video',
        data: { operationId: 'op-123' },
        logs: [],
        queue: 'videoGeneration',
      };

      jobMonitoringService.getJobDetails.mockResolvedValue(mockJobDetails);

      const response = await request(app)
        .get('/api/v1/jobs/queues/videoGeneration/jobs/job-123/details')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: mockJobDetails,
      });

      expect(jobMonitoringService.getJobDetails).toHaveBeenCalledWith('videoGeneration', 'job-123');
    });

    it('should handle job not found', async () => {
      jobMonitoringService.getJobDetails.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/v1/jobs/queues/videoGeneration/jobs/non-existent/details')
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        error: {
          code: 'JOB_NOT_FOUND',
          message: 'Job non-existent not found in queue videoGeneration',
        },
      });
    });
  });

  describe('GET /api/v1/jobs/recent', () => {
    it('should return recent jobs successfully', async () => {
      const mockRecentJobs = [
        { id: 'job-1', name: 'generate-video', status: 'completed' },
        { id: 'job-2', name: 'process-video', status: 'active' },
      ];

      jobMonitoringService.getRecentJobs.mockResolvedValue(mockRecentJobs);

      const response = await request(app)
        .get('/api/v1/jobs/recent?limit=10')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: {
          jobs: mockRecentJobs,
          limit: 10,
          count: 2,
        },
      });

      expect(jobMonitoringService.getRecentJobs).toHaveBeenCalledWith(10);
    });

    it('should use default limit when not specified', async () => {
      jobMonitoringService.getRecentJobs.mockResolvedValue([]);

      await request(app)
        .get('/api/v1/jobs/recent')
        .expect(200);

      expect(jobMonitoringService.getRecentJobs).toHaveBeenCalledWith(20);
    });
  });

  describe('GET /api/v1/jobs/queues/:queueName/trends', () => {
    it('should return queue trends successfully', async () => {
      const mockTrends = {
        queueName: 'videoGeneration',
        timeWindow: 24,
        buckets: {},
        summary: { totalCompleted: 10, totalFailed: 1, successRate: 90.9 },
      };

      jobMonitoringService.getQueueTrends.mockResolvedValue(mockTrends);

      const response = await request(app)
        .get('/api/v1/jobs/queues/videoGeneration/trends?hours=12')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: mockTrends,
      });

      expect(jobMonitoringService.getQueueTrends).toHaveBeenCalledWith('videoGeneration', 12);
    });

    it('should use default hours when not specified', async () => {
      jobMonitoringService.getQueueTrends.mockResolvedValue({});

      await request(app)
        .get('/api/v1/jobs/queues/videoGeneration/trends')
        .expect(200);

      expect(jobMonitoringService.getQueueTrends).toHaveBeenCalledWith('videoGeneration', 24);
    });

    it('should handle queue not found', async () => {
      jobMonitoringService.getQueueTrends.mockRejectedValue(new Error('Queue invalidQueue not found'));

      const response = await request(app)
        .get('/api/v1/jobs/queues/invalidQueue/trends')
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        error: {
          code: 'QUEUE_NOT_FOUND',
          message: 'Queue invalidQueue not found',
        },
      });
    });
  });

  describe('GET /api/v1/jobs/metrics', () => {
    it('should return performance metrics successfully', async () => {
      const mockMetrics = {
        averageProcessingTime: { videoGeneration: 5000 },
        throughput: { videoGeneration: 10 },
        errorRate: { videoGeneration: 5.5 },
        queueHealth: { videoGeneration: 95 },
      };

      jobMonitoringService.getPerformanceMetrics.mockResolvedValue(mockMetrics);

      const response = await request(app)
        .get('/api/v1/jobs/metrics')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: mockMetrics,
      });

      expect(jobMonitoringService.getPerformanceMetrics).toHaveBeenCalledTimes(1);
    });
  });

  describe('GET /api/v1/jobs/export', () => {
    it('should export queue data successfully', async () => {
      const mockExportData = {
        timestamp: new Date(),
        queues: {
          videoGeneration: { stats: {}, recentJobs: {} },
        },
      };

      jobMonitoringService.exportQueueData.mockResolvedValue(mockExportData);

      const response = await request(app)
        .get('/api/v1/jobs/export?queueName=videoGeneration&format=json')
        .expect(200);

      expect(response.body).toEqual(mockExportData);
      expect(response.headers['content-disposition']).toContain('attachment');
      expect(response.headers['content-type']).toContain('application/json');

      expect(jobMonitoringService.exportQueueData).toHaveBeenCalledWith('videoGeneration', 'json');
    });

    it('should handle export errors', async () => {
      jobMonitoringService.exportQueueData.mockRejectedValue(new Error('Export failed'));

      const response = await request(app)
        .get('/api/v1/jobs/export')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: {
          code: 'EXPORT_ERROR',
          message: 'Failed to export queue data',
          details: 'Export failed',
        },
      });
    });
  });

  describe('GET /api/v1/jobs/health', () => {
    it('should return healthy status', async () => {
      const mockHealth = {
        status: 'healthy',
        isRunning: true,
        processors: { videoGeneration: true },
        queues: {},
        timestamp: new Date(),
      };

      jobManager.healthCheck.mockResolvedValue(mockHealth);

      const response = await request(app)
        .get('/api/v1/jobs/health')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: mockHealth,
      });
    });

    it('should return unhealthy status with 503', async () => {
      const mockHealth = {
        status: 'unhealthy',
        error: 'Redis connection failed',
        timestamp: new Date(),
      };

      jobManager.healthCheck.mockResolvedValue(mockHealth);

      const response = await request(app)
        .get('/api/v1/jobs/health')
        .expect(503);

      expect(response.body).toEqual({
        success: false,
        data: mockHealth,
      });
    });

    it('should handle health check errors', async () => {
      jobManager.healthCheck.mockRejectedValue(new Error('Health check failed'));

      const response = await request(app)
        .get('/api/v1/jobs/health')
        .expect(503);

      expect(response.body).toEqual({
        success: false,
        error: {
          code: 'HEALTH_CHECK_ERROR',
          message: 'Failed to check job system health',
          details: 'Health check failed',
        },
      });
    });
  });

  describe('POST /api/v1/jobs/queues/:queueName/jobs/:jobId/retry', () => {
    it('should return not implemented', async () => {
      const response = await request(app)
        .post('/api/v1/jobs/queues/videoGeneration/jobs/job-123/retry')
        .expect(501);

      expect(response.body).toEqual({
        success: false,
        error: {
          code: 'NOT_IMPLEMENTED',
          message: 'Job retry functionality not yet implemented',
        },
      });
    });
  });

  describe('DELETE /api/v1/jobs/queues/:queueName/jobs/:jobId', () => {
    it('should return not implemented', async () => {
      const response = await request(app)
        .delete('/api/v1/jobs/queues/videoGeneration/jobs/job-123')
        .expect(501);

      expect(response.body).toEqual({
        success: false,
        error: {
          code: 'NOT_IMPLEMENTED',
          message: 'Job cancellation functionality not yet implemented',
        },
      });
    });
  });
});