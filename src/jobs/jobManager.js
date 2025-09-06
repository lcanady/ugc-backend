const videoGenerationProcessor = require('./processors/videoGenerationProcessor');
const videoProcessingProcessor = require('./processors/videoProcessingProcessor');
const cleanupProcessor = require('./processors/cleanupProcessor');
const { queues, events } = require('../config/queue');

/**
 * Job Manager
 * Coordinates all job processors and provides a unified interface for job management
 */
class JobManager {
  constructor() {
    this.processors = {
      videoGeneration: videoGenerationProcessor,
      videoProcessing: videoProcessingProcessor,
      cleanup: cleanupProcessor,
    };
    
    this.isRunning = false;
    this.setupEventListeners();
  }

  /**
   * Start all job processors
   */
  async start() {
    if (this.isRunning) {
      console.log('Job manager is already running');
      return;
    }

    console.log('Starting job manager...');

    try {
      // Start all processors
      await Promise.all([
        this.processors.videoGeneration.start(),
        this.processors.videoProcessing.start(),
        this.processors.cleanup.start(),
      ]);

      this.isRunning = true;
      console.log('Job manager started successfully');

      // Schedule recurring cleanup jobs
      await this.scheduleRecurringJobs();

    } catch (error) {
      console.error('Failed to start job manager:', error);
      throw error;
    }
  }

  /**
   * Stop all job processors
   */
  async stop() {
    if (!this.isRunning) {
      console.log('Job manager is not running');
      return;
    }

    console.log('Stopping job manager...');

    try {
      // Stop all processors
      await Promise.all([
        this.processors.videoGeneration.stop(),
        this.processors.videoProcessing.stop(),
        this.processors.cleanup.stop(),
      ]);

      this.isRunning = false;
      console.log('Job manager stopped successfully');

    } catch (error) {
      console.error('Error stopping job manager:', error);
      throw error;
    }
  }

  /**
   * Add a video generation job to the queue with priority and scheduling
   * @param {Object} jobData - Job data
   * @param {Object} options - Job options
   * @returns {Object} Job instance
   */
  async addVideoGenerationJob(jobData, options = {}) {
    // Calculate priority based on user type and request urgency
    const priority = this.calculateJobPriority(jobData, options);
    
    // Calculate delay based on scheduling preferences
    const delay = this.calculateJobDelay(jobData, options);

    const defaultOptions = {
      priority,
      delay,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: 100,
      removeOnFail: 50,
    };

    const jobOptions = { ...defaultOptions, ...options };
    
    return await queues.videoGeneration.add('generate-video', jobData, jobOptions);
  }

  /**
   * Calculate job priority based on various factors
   * @param {Object} jobData - Job data
   * @param {Object} options - Job options
   * @returns {number} Priority (lower number = higher priority)
   */
  calculateJobPriority(jobData, options) {
    let priority = 5; // Default priority

    // Premium users get higher priority
    if (jobData.userTier === 'premium') {
      priority = 1;
    } else if (jobData.userTier === 'pro') {
      priority = 2;
    } else if (jobData.userTier === 'basic') {
      priority = 3;
    }

    // API requests get higher priority than batch jobs
    if (options.source === 'api') {
      priority = Math.max(1, priority - 1);
    }

    // Urgent requests get highest priority
    if (options.urgent === true) {
      priority = 1;
    }

    // Retry jobs get lower priority to not block new requests
    if (options.isRetry === true) {
      priority = Math.min(10, priority + 2);
    }

    return priority;
  }

  /**
   * Calculate job delay based on scheduling preferences
   * @param {Object} jobData - Job data
   * @param {Object} options - Job options
   * @returns {number} Delay in milliseconds
   */
  calculateJobDelay(jobData, options) {
    // Immediate processing by default
    if (!options.scheduledFor) {
      return 0;
    }

    // Schedule for specific time
    const scheduledTime = new Date(options.scheduledFor);
    const now = new Date();
    
    if (scheduledTime > now) {
      return scheduledTime.getTime() - now.getTime();
    }

    return 0; // Past time, process immediately
  }

  /**
   * Add a video processing job to the queue
   * @param {Object} jobData - Job data
   * @param {Object} options - Job options
   * @returns {Object} Job instance
   */
  async addVideoProcessingJob(jobData, options = {}) {
    const defaultOptions = {
      priority: 2,
      delay: 0,
      attempts: 2,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
      removeOnComplete: 100,
      removeOnFail: 50,
    };

    const jobOptions = { ...defaultOptions, ...options };
    
    return await queues.videoProcessing.add('process-video', jobData, jobOptions);
  }

  /**
   * Add a cleanup job to the queue
   * @param {Object} jobData - Job data
   * @param {Object} options - Job options
   * @returns {Object} Job instance
   */
  async addCleanupJob(jobData, options = {}) {
    const defaultOptions = {
      priority: 3,
      delay: 0,
      attempts: 1,
      removeOnComplete: 50,
      removeOnFail: 25,
    };

    const jobOptions = { ...defaultOptions, ...options };
    
    return await queues.cleanup.add('cleanup', jobData, jobOptions);
  }

  /**
   * Get job status by ID
   * @param {string} queueName - Queue name
   * @param {string} jobId - Job ID
   * @returns {Object} Job status
   */
  async getJobStatus(queueName, jobId) {
    const queue = queues[queueName];
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    const job = await queue.getJob(jobId);
    if (!job) {
      return null;
    }

    return {
      id: job.id,
      name: job.name,
      data: job.data,
      progress: job.progress,
      returnvalue: job.returnvalue,
      failedReason: job.failedReason,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
      opts: job.opts,
    };
  }

  /**
   * Get queue statistics
   * @param {string} queueName - Queue name
   * @returns {Object} Queue statistics
   */
  async getQueueStats(queueName) {
    const queue = queues[queueName];
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    const waiting = await queue.getWaiting();
    const active = await queue.getActive();
    const completed = await queue.getCompleted();
    const failed = await queue.getFailed();
    const delayed = await queue.getDelayed();

    return {
      name: queueName,
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      delayed: delayed.length,
      total: waiting.length + active.length + completed.length + failed.length + delayed.length,
    };
  }

  /**
   * Get all queue statistics
   * @returns {Object} All queue statistics
   */
  async getAllQueueStats() {
    const stats = {};
    
    for (const queueName of Object.keys(queues)) {
      stats[queueName] = await this.getQueueStats(queueName);
    }
    
    return stats;
  }

  /**
   * Schedule recurring cleanup jobs
   */
  async scheduleRecurringJobs() {
    try {
      // Schedule daily temp file cleanup
      await queues.cleanup.add(
        'daily-temp-cleanup',
        {
          type: 'temp_files',
          data: {
            directory: './temp',
            maxAge: 24 * 60 * 60 * 1000, // 24 hours
          },
        },
        {
          repeat: { cron: '0 2 * * *' }, // Daily at 2 AM
          removeOnComplete: 5,
          removeOnFail: 5,
        }
      );

      // Schedule weekly old operations cleanup
      await queues.cleanup.add(
        'weekly-operations-cleanup',
        {
          type: 'old_operations',
          data: {
            maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
          },
        },
        {
          repeat: { cron: '0 3 * * 0' }, // Weekly on Sunday at 3 AM
          removeOnComplete: 5,
          removeOnFail: 5,
        }
      );

      // Schedule daily failed jobs cleanup
      await queues.cleanup.add(
        'daily-failed-jobs-cleanup',
        {
          type: 'failed_jobs',
          data: {
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
          },
        },
        {
          repeat: { cron: '0 4 * * *' }, // Daily at 4 AM
          removeOnComplete: 5,
          removeOnFail: 5,
        }
      );

      console.log('Recurring cleanup jobs scheduled successfully');

    } catch (error) {
      console.error('Failed to schedule recurring jobs:', error);
    }
  }

  /**
   * Setup event listeners for monitoring
   */
  setupEventListeners() {
    // Video generation queue events
    events.videoGeneration.on('completed', ({ jobId, returnvalue }) => {
      console.log(`Video generation job ${jobId} completed:`, returnvalue);
    });

    events.videoGeneration.on('failed', ({ jobId, failedReason }) => {
      console.error(`Video generation job ${jobId} failed:`, failedReason);
    });

    events.videoGeneration.on('progress', ({ jobId, data }) => {
      console.log(`Video generation job ${jobId} progress: ${data}%`);
    });

    // Video processing queue events
    events.videoProcessing.on('completed', ({ jobId, returnvalue }) => {
      console.log(`Video processing job ${jobId} completed:`, returnvalue);
    });

    events.videoProcessing.on('failed', ({ jobId, failedReason }) => {
      console.error(`Video processing job ${jobId} failed:`, failedReason);
    });

    // Cleanup queue events
    events.cleanup.on('completed', ({ jobId, returnvalue }) => {
      console.log(`Cleanup job ${jobId} completed:`, returnvalue);
    });

    events.cleanup.on('failed', ({ jobId, failedReason }) => {
      console.error(`Cleanup job ${jobId} failed:`, failedReason);
    });
  }

  /**
   * Health check for job manager
   * @returns {Object} Health status
   */
  async healthCheck() {
    try {
      const stats = await this.getAllQueueStats();
      
      return {
        status: 'healthy',
        isRunning: this.isRunning,
        processors: {
          videoGeneration: this.processors.videoGeneration.isRunning,
          videoProcessing: this.processors.videoProcessing.isRunning,
          cleanup: this.processors.cleanup.isRunning,
        },
        queues: stats,
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date(),
      };
    }
  }
}

module.exports = new JobManager();