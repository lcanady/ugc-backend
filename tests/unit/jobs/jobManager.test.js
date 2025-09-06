const jobManager = require('../../../src/jobs/jobManager');
const { queues } = require('../../../src/config/queue');

// Mock the queue configuration
jest.mock('../../../src/config/queue', () => ({
  queues: {
    videoGeneration: {
      add: jest.fn(),
      getJob: jest.fn(),
      getWaiting: jest.fn(),
      getActive: jest.fn(),
      getCompleted: jest.fn(),
      getFailed: jest.fn(),
      getDelayed: jest.fn(),
    },
    videoProcessing: {
      add: jest.fn(),
      getJob: jest.fn(),
      getWaiting: jest.fn(),
      getActive: jest.fn(),
      getCompleted: jest.fn(),
      getFailed: jest.fn(),
      getDelayed: jest.fn(),
    },
    cleanup: {
      add: jest.fn(),
      getJob: jest.fn(),
      getWaiting: jest.fn(),
      getActive: jest.fn(),
      getCompleted: jest.fn(),
      getFailed: jest.fn(),
      getDelayed: jest.fn(),
    },
  },
  events: {
    videoGeneration: { on: jest.fn() },
    videoProcessing: { on: jest.fn() },
    cleanup: { on: jest.fn() },
  },
}));

// Mock processors
jest.mock('../../../src/jobs/processors/videoGenerationProcessor', () => ({
  start: jest.fn(),
  stop: jest.fn(),
  isRunning: false,
}));

jest.mock('../../../src/jobs/processors/videoProcessingProcessor', () => ({
  start: jest.fn(),
  stop: jest.fn(),
  isRunning: false,
}));

jest.mock('../../../src/jobs/processors/cleanupProcessor', () => ({
  start: jest.fn(),
  stop: jest.fn(),
  isRunning: false,
}));

describe('JobManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('addVideoGenerationJob', () => {
    it('should add a video generation job with default options', async () => {
      const jobData = {
        operationId: 'test-operation-id',
        script: { 'segment-1': 'Test segment 1', 'segment-2': 'Test segment 2' },
        images: ['image1.jpg', 'image2.jpg'],
        userId: 'test-user-id',
      };

      const mockJob = { id: 'job-123', data: jobData };
      queues.videoGeneration.add.mockResolvedValue(mockJob);

      const result = await jobManager.addVideoGenerationJob(jobData);

      expect(queues.videoGeneration.add).toHaveBeenCalledWith(
        'generate-video',
        jobData,
        expect.objectContaining({
          priority: 1,
          delay: 0,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
          removeOnComplete: 100,
          removeOnFail: 50,
        })
      );
      expect(result).toBe(mockJob);
    });

    it('should add a video generation job with custom options', async () => {
      const jobData = { operationId: 'test-operation-id' };
      const customOptions = { priority: 5, delay: 1000 };

      const mockJob = { id: 'job-123', data: jobData };
      queues.videoGeneration.add.mockResolvedValue(mockJob);

      await jobManager.addVideoGenerationJob(jobData, customOptions);

      expect(queues.videoGeneration.add).toHaveBeenCalledWith(
        'generate-video',
        jobData,
        expect.objectContaining({
          priority: 5,
          delay: 1000,
        })
      );
    });
  });

  describe('addVideoProcessingJob', () => {
    it('should add a video processing job with default options', async () => {
      const jobData = {
        type: 'merge_segments',
        operationId: 'test-operation-id',
        data: { videoSegments: ['segment1.mp4', 'segment2.mp4'] },
      };

      const mockJob = { id: 'job-456', data: jobData };
      queues.videoProcessing.add.mockResolvedValue(mockJob);

      const result = await jobManager.addVideoProcessingJob(jobData);

      expect(queues.videoProcessing.add).toHaveBeenCalledWith(
        'process-video',
        jobData,
        expect.objectContaining({
          priority: 2,
          delay: 0,
          attempts: 2,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
          removeOnComplete: 100,
          removeOnFail: 50,
        })
      );
      expect(result).toBe(mockJob);
    });
  });

  describe('addCleanupJob', () => {
    it('should add a cleanup job with default options', async () => {
      const jobData = {
        type: 'temp_files',
        data: { directory: './temp', maxAge: 86400000 },
      };

      const mockJob = { id: 'job-789', data: jobData };
      queues.cleanup.add.mockResolvedValue(mockJob);

      const result = await jobManager.addCleanupJob(jobData);

      expect(queues.cleanup.add).toHaveBeenCalledWith(
        'cleanup',
        jobData,
        expect.objectContaining({
          priority: 3,
          delay: 0,
          attempts: 1,
          removeOnComplete: 50,
          removeOnFail: 25,
        })
      );
      expect(result).toBe(mockJob);
    });
  });

  describe('getJobStatus', () => {
    it('should return job status for existing job', async () => {
      const mockJob = {
        id: 'job-123',
        name: 'generate-video',
        data: { operationId: 'test-operation-id' },
        progress: 50,
        returnvalue: null,
        failedReason: null,
        processedOn: Date.now(),
        finishedOn: null,
        opts: {},
      };

      queues.videoGeneration.getJob.mockResolvedValue(mockJob);

      const result = await jobManager.getJobStatus('videoGeneration', 'job-123');

      expect(queues.videoGeneration.getJob).toHaveBeenCalledWith('job-123');
      expect(result).toEqual({
        id: 'job-123',
        name: 'generate-video',
        data: { operationId: 'test-operation-id' },
        progress: 50,
        returnvalue: null,
        failedReason: null,
        processedOn: mockJob.processedOn,
        finishedOn: null,
        opts: {},
      });
    });

    it('should return null for non-existent job', async () => {
      queues.videoGeneration.getJob.mockResolvedValue(null);

      const result = await jobManager.getJobStatus('videoGeneration', 'non-existent-job');

      expect(result).toBeNull();
    });

    it('should throw error for invalid queue name', async () => {
      await expect(jobManager.getJobStatus('invalidQueue', 'job-123'))
        .rejects.toThrow('Queue invalidQueue not found');
    });
  });

  describe('getQueueStats', () => {
    it('should return queue statistics', async () => {
      const mockWaiting = [{ id: 'job-1' }, { id: 'job-2' }];
      const mockActive = [{ id: 'job-3' }];
      const mockCompleted = [{ id: 'job-4' }, { id: 'job-5' }, { id: 'job-6' }];
      const mockFailed = [{ id: 'job-7' }];
      const mockDelayed = [];

      queues.videoGeneration.getWaiting.mockResolvedValue(mockWaiting);
      queues.videoGeneration.getActive.mockResolvedValue(mockActive);
      queues.videoGeneration.getCompleted.mockResolvedValue(mockCompleted);
      queues.videoGeneration.getFailed.mockResolvedValue(mockFailed);
      queues.videoGeneration.getDelayed.mockResolvedValue(mockDelayed);

      const result = await jobManager.getQueueStats('videoGeneration');

      expect(result).toEqual({
        name: 'videoGeneration',
        waiting: 2,
        active: 1,
        completed: 3,
        failed: 1,
        delayed: 0,
        total: 7,
      });
    });

    it('should throw error for invalid queue name', async () => {
      await expect(jobManager.getQueueStats('invalidQueue'))
        .rejects.toThrow('Queue invalidQueue not found');
    });
  });

  describe('getAllQueueStats', () => {
    it('should return statistics for all queues', async () => {
      // Mock stats for each queue
      const mockStats = {
        waiting: [],
        active: [],
        completed: [],
        failed: [],
        delayed: [],
      };

      Object.values(queues).forEach(queue => {
        queue.getWaiting.mockResolvedValue(mockStats.waiting);
        queue.getActive.mockResolvedValue(mockStats.active);
        queue.getCompleted.mockResolvedValue(mockStats.completed);
        queue.getFailed.mockResolvedValue(mockStats.failed);
        queue.getDelayed.mockResolvedValue(mockStats.delayed);
      });

      const result = await jobManager.getAllQueueStats();

      expect(result).toHaveProperty('videoGeneration');
      expect(result).toHaveProperty('videoProcessing');
      expect(result).toHaveProperty('cleanup');

      Object.values(result).forEach(stats => {
        expect(stats).toEqual({
          name: expect.any(String),
          waiting: 0,
          active: 0,
          completed: 0,
          failed: 0,
          delayed: 0,
          total: 0,
        });
      });
    });
  });

  describe('healthCheck', () => {
    it('should return healthy status when all systems are working', async () => {
      // Mock successful queue stats
      Object.values(queues).forEach(queue => {
        queue.getWaiting.mockResolvedValue([]);
        queue.getActive.mockResolvedValue([]);
        queue.getCompleted.mockResolvedValue([]);
        queue.getFailed.mockResolvedValue([]);
        queue.getDelayed.mockResolvedValue([]);
      });

      const result = await jobManager.healthCheck();

      expect(result).toEqual({
        status: 'healthy',
        isRunning: false, // Not started in tests
        processors: {
          videoGeneration: false,
          videoProcessing: false,
          cleanup: false,
        },
        queues: expect.any(Object),
        timestamp: expect.any(Date),
      });
    });

    it('should return unhealthy status when there is an error', async () => {
      // Mock error in queue stats
      queues.videoGeneration.getWaiting.mockRejectedValue(new Error('Redis connection failed'));

      const result = await jobManager.healthCheck();

      expect(result).toEqual({
        status: 'unhealthy',
        error: 'Redis connection failed',
        timestamp: expect.any(Date),
      });
    });
  });
});