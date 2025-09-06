const jobMonitoringService = require('../../../src/services/jobMonitoringService');
const jobManager = require('../../../src/jobs/jobManager');
const { queues } = require('../../../src/config/queue');

// Mock dependencies
jest.mock('../../../src/jobs/jobManager');
jest.mock('../../../src/config/queue', () => ({
  queues: {
    videoGeneration: {
      getCompleted: jest.fn(),
      getFailed: jest.fn(),
      getActive: jest.fn(),
    },
    videoProcessing: {
      getCompleted: jest.fn(),
      getFailed: jest.fn(),
      getActive: jest.fn(),
    },
    cleanup: {
      getCompleted: jest.fn(),
      getFailed: jest.fn(),
      getActive: jest.fn(),
    },
  },
}));

describe('JobMonitoringService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getDashboardData', () => {
    it('should return comprehensive dashboard data', async () => {
      const mockQueueStats = {
        videoGeneration: { name: 'videoGeneration', waiting: 2, active: 1, completed: 10, failed: 1, delayed: 0, total: 14 },
        videoProcessing: { name: 'videoProcessing', waiting: 0, active: 0, completed: 5, failed: 0, delayed: 0, total: 5 },
        cleanup: { name: 'cleanup', waiting: 1, active: 0, completed: 3, failed: 0, delayed: 0, total: 4 },
      };

      const mockHealthStatus = {
        status: 'healthy',
        isRunning: true,
        processors: { videoGeneration: true, videoProcessing: true, cleanup: true },
      };

      jobManager.getAllQueueStats.mockResolvedValue(mockQueueStats);
      jobManager.healthCheck.mockResolvedValue(mockHealthStatus);

      // Mock recent jobs
      const mockJobs = [
        { id: 'job-1', name: 'generate-video', queue: 'videoGeneration', status: 'completed', finishedOn: Date.now() },
        { id: 'job-2', name: 'process-video', queue: 'videoProcessing', status: 'active', processedOn: Date.now() },
      ];

      Object.values(queues).forEach(queue => {
        queue.getCompleted.mockResolvedValue([mockJobs[0]]);
        queue.getFailed.mockResolvedValue([]);
        queue.getActive.mockResolvedValue([mockJobs[1]]);
      });

      const result = await jobMonitoringService.getDashboardData();

      expect(result).toHaveProperty('overview');
      expect(result).toHaveProperty('queues');
      expect(result).toHaveProperty('health');
      expect(result).toHaveProperty('recentJobs');
      expect(result).toHaveProperty('performance');
      expect(result).toHaveProperty('timestamp');

      expect(result.overview).toEqual({
        totalQueues: 3,
        totalJobs: 23, // Sum of all queue totals
        activeJobs: 1,  // Sum of all active jobs
        failedJobs: 1,  // Sum of all failed jobs
        completedJobs: 18, // Sum of all completed jobs
        uptime: expect.any(Number),
      });

      expect(result.queues).toBe(mockQueueStats);
      expect(result.health).toBe(mockHealthStatus);
    });

    it('should handle errors gracefully', async () => {
      jobManager.getAllQueueStats.mockRejectedValue(new Error('Redis connection failed'));

      await expect(jobMonitoringService.getDashboardData()).rejects.toThrow('Redis connection failed');
    });
  });

  describe('getRecentJobs', () => {
    it('should return recent jobs from all queues', async () => {
      const now = Date.now();
      const mockCompletedJobs = [
        {
          id: 'job-1',
          name: 'generate-video',
          data: { operationId: 'op-1' },
          processedOn: now - 1000,
          finishedOn: now,
          returnvalue: { success: true },
        },
      ];

      const mockFailedJobs = [
        {
          id: 'job-2',
          name: 'generate-video',
          data: { operationId: 'op-2' },
          processedOn: now - 2000,
          finishedOn: now - 1000,
          failedReason: 'API timeout',
          attemptsMade: 3,
        },
      ];

      const mockActiveJobs = [
        {
          id: 'job-3',
          name: 'process-video',
          data: { operationId: 'op-3' },
          processedOn: now - 500,
          progress: 50,
        },
      ];

      Object.values(queues).forEach(queue => {
        queue.getCompleted.mockResolvedValue(mockCompletedJobs);
        queue.getFailed.mockResolvedValue(mockFailedJobs);
        queue.getActive.mockResolvedValue(mockActiveJobs);
      });

      const result = await jobMonitoringService.getRecentJobs(10);

      expect(result).toBeInstanceOf(Array);
      expect(result.length).toBeGreaterThan(0);

      // Check that jobs have the expected structure
      result.forEach(job => {
        expect(job).toHaveProperty('id');
        expect(job).toHaveProperty('name');
        expect(job).toHaveProperty('queue');
        expect(job).toHaveProperty('status');
        expect(job).toHaveProperty('data');
      });

      // Check that completed jobs have the right properties
      const completedJob = result.find(job => job.status === 'completed');
      if (completedJob) {
        expect(completedJob).toHaveProperty('returnvalue');
        expect(completedJob).toHaveProperty('duration');
      }

      // Check that failed jobs have the right properties
      const failedJob = result.find(job => job.status === 'failed');
      if (failedJob) {
        expect(failedJob).toHaveProperty('failedReason');
        expect(failedJob).toHaveProperty('attemptsMade');
      }

      // Check that active jobs have the right properties
      const activeJob = result.find(job => job.status === 'active');
      if (activeJob) {
        expect(activeJob).toHaveProperty('progress');
      }
    });

    it('should handle errors gracefully and return empty array', async () => {
      Object.values(queues).forEach(queue => {
        queue.getCompleted.mockRejectedValue(new Error('Queue error'));
        queue.getFailed.mockRejectedValue(new Error('Queue error'));
        queue.getActive.mockRejectedValue(new Error('Queue error'));
      });

      const result = await jobMonitoringService.getRecentJobs(10);

      expect(result).toEqual([]);
    });

    it('should limit results to specified number', async () => {
      const mockJobs = Array.from({ length: 50 }, (_, i) => ({
        id: `job-${i}`,
        name: 'test-job',
        data: {},
        processedOn: Date.now() - i * 1000,
        finishedOn: Date.now() - i * 1000 + 500,
      }));

      Object.values(queues).forEach(queue => {
        queue.getCompleted.mockResolvedValue(mockJobs);
        queue.getFailed.mockResolvedValue([]);
        queue.getActive.mockResolvedValue([]);
      });

      const result = await jobMonitoringService.getRecentJobs(5);

      expect(result.length).toBeLessThanOrEqual(5);
    });
  });

  describe('getPerformanceMetrics', () => {
    it('should calculate performance metrics for all queues', async () => {
      const now = Date.now();
      const mockCompletedJobs = [
        {
          id: 'job-1',
          processedOn: now - 5000,
          finishedOn: now - 1000,
        },
        {
          id: 'job-2',
          processedOn: now - 10000,
          finishedOn: now - 6000,
        },
      ];

      const mockFailedJobs = [
        {
          id: 'job-3',
          processedOn: now - 8000,
          finishedOn: now - 7000,
        },
      ];

      jobManager.getQueueStats.mockResolvedValue({
        name: 'videoGeneration',
        waiting: 1,
        active: 0,
        completed: 2,
        failed: 1,
        delayed: 0,
        total: 4,
      });

      Object.values(queues).forEach(queue => {
        queue.getCompleted.mockResolvedValue(mockCompletedJobs);
        queue.getFailed.mockResolvedValue(mockFailedJobs);
      });

      const result = await jobMonitoringService.getPerformanceMetrics();

      expect(result).toHaveProperty('averageProcessingTime');
      expect(result).toHaveProperty('throughput');
      expect(result).toHaveProperty('errorRate');
      expect(result).toHaveProperty('queueHealth');

      // Check that metrics are calculated for each queue
      Object.keys(queues).forEach(queueName => {
        expect(result.averageProcessingTime).toHaveProperty(queueName);
        expect(result.throughput).toHaveProperty(queueName);
        expect(result.errorRate).toHaveProperty(queueName);
        expect(result.queueHealth).toHaveProperty(queueName);

        expect(typeof result.averageProcessingTime[queueName]).toBe('number');
        expect(typeof result.throughput[queueName]).toBe('number');
        expect(typeof result.errorRate[queueName]).toBe('number');
        expect(typeof result.queueHealth[queueName]).toBe('number');
      });
    });

    it('should handle queues with no jobs', async () => {
      jobManager.getQueueStats.mockResolvedValue({
        name: 'videoGeneration',
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
        total: 0,
      });

      Object.values(queues).forEach(queue => {
        queue.getCompleted.mockResolvedValue([]);
        queue.getFailed.mockResolvedValue([]);
      });

      const result = await jobMonitoringService.getPerformanceMetrics();

      Object.keys(queues).forEach(queueName => {
        expect(result.averageProcessingTime[queueName]).toBe(0);
        expect(result.throughput[queueName]).toBe(0);
        expect(result.errorRate[queueName]).toBe(0);
        expect(result.queueHealth[queueName]).toBeGreaterThanOrEqual(0);
        expect(result.queueHealth[queueName]).toBeLessThanOrEqual(100);
      });
    });

    it('should handle errors gracefully', async () => {
      Object.values(queues).forEach(queue => {
        queue.getCompleted.mockRejectedValue(new Error('Queue error'));
        queue.getFailed.mockRejectedValue(new Error('Queue error'));
      });

      const result = await jobMonitoringService.getPerformanceMetrics();

      expect(result).toEqual({
        averageProcessingTime: {},
        throughput: {},
        errorRate: {},
        queueHealth: {},
      });
    });
  });

  describe('getJobDetails', () => {
    it('should return job details with logs', async () => {
      const mockJobStatus = {
        id: 'job-123',
        name: 'generate-video',
        data: { operationId: 'op-123' },
        progress: 100,
        returnvalue: { success: true },
        processedOn: Date.now() - 5000,
        finishedOn: Date.now(),
      };

      jobManager.getJobStatus.mockResolvedValue(mockJobStatus);

      const result = await jobMonitoringService.getJobDetails('videoGeneration', 'job-123');

      expect(result).toEqual({
        ...mockJobStatus,
        logs: [], // Empty logs for now
        queue: 'videoGeneration',
      });

      expect(jobManager.getJobStatus).toHaveBeenCalledWith('videoGeneration', 'job-123');
    });

    it('should return null for non-existent job', async () => {
      jobManager.getJobStatus.mockResolvedValue(null);

      const result = await jobMonitoringService.getJobDetails('videoGeneration', 'non-existent');

      expect(result).toBeNull();
    });

    it('should handle errors', async () => {
      jobManager.getJobStatus.mockRejectedValue(new Error('Job not found'));

      await expect(jobMonitoringService.getJobDetails('videoGeneration', 'job-123'))
        .rejects.toThrow('Job not found');
    });
  });

  describe('calculateQueueHealthScore', () => {
    it('should return 100 for perfect queue', () => {
      const stats = {
        name: 'test',
        waiting: 0,
        active: 1,
        completed: 100,
        failed: 0,
        delayed: 0,
        total: 101,
      };

      const score = jobMonitoringService.calculateQueueHealthScore(stats);
      expect(score).toBe(100);
    });

    it('should penalize for failed jobs', () => {
      const stats = {
        name: 'test',
        waiting: 0,
        active: 0,
        completed: 50,
        failed: 50,
        delayed: 0,
        total: 100,
      };

      const score = jobMonitoringService.calculateQueueHealthScore(stats);
      expect(score).toBeLessThan(100);
      expect(score).toBeGreaterThanOrEqual(0);
    });

    it('should penalize for too many waiting jobs', () => {
      const stats = {
        name: 'test',
        waiting: 50,
        active: 0,
        completed: 50,
        failed: 0,
        delayed: 0,
        total: 100,
      };

      const score = jobMonitoringService.calculateQueueHealthScore(stats);
      expect(score).toBeLessThan(100);
      expect(score).toBeGreaterThanOrEqual(0);
    });

    it('should penalize for too many active jobs', () => {
      const stats = {
        name: 'test',
        waiting: 0,
        active: 20,
        completed: 50,
        failed: 0,
        delayed: 0,
        total: 70,
      };

      const score = jobMonitoringService.calculateQueueHealthScore(stats);
      expect(score).toBeLessThan(100);
      expect(score).toBeGreaterThanOrEqual(0);
    });

    it('should never return negative score', () => {
      const stats = {
        name: 'test',
        waiting: 100,
        active: 50,
        completed: 10,
        failed: 90,
        delayed: 0,
        total: 250,
      };

      const score = jobMonitoringService.calculateQueueHealthScore(stats);
      expect(score).toBeGreaterThanOrEqual(0);
    });
  });
});