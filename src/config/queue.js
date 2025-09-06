const { Queue, Worker, QueueEvents } = require('bullmq');
const Redis = require('ioredis');
const config = require('../utils/config');

// Redis connection configuration
const redisConfig = {
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100,
  enableReadyCheck: false,
  maxRetriesPerRequest: null,
};

// Create Redis connection
const connection = new Redis(redisConfig);

// Queue names
const QUEUE_NAMES = {
  VIDEO_GENERATION: 'video-generation',
  VIDEO_PROCESSING: 'video-processing',
  CLEANUP: 'cleanup'
};

// Queue configurations
const queueConfig = {
  connection,
  defaultJobOptions: {
    removeOnComplete: 100, // Keep last 100 completed jobs
    removeOnFail: 50,      // Keep last 50 failed jobs
    attempts: 3,           // Retry failed jobs 3 times
    backoff: {
      type: 'exponential',
      delay: 2000,         // Start with 2 second delay
    },
  },
};

// Create queues
const videoGenerationQueue = new Queue(QUEUE_NAMES.VIDEO_GENERATION, queueConfig);
const videoProcessingQueue = new Queue(QUEUE_NAMES.VIDEO_PROCESSING, queueConfig);
const cleanupQueue = new Queue(QUEUE_NAMES.CLEANUP, queueConfig);

// Queue events for monitoring
const videoGenerationEvents = new QueueEvents(QUEUE_NAMES.VIDEO_GENERATION, { connection });
const videoProcessingEvents = new QueueEvents(QUEUE_NAMES.VIDEO_PROCESSING, { connection });
const cleanupEvents = new QueueEvents(QUEUE_NAMES.CLEANUP, { connection });

// Export queues and configuration
module.exports = {
  connection,
  QUEUE_NAMES,
  queues: {
    videoGeneration: videoGenerationQueue,
    videoProcessing: videoProcessingQueue,
    cleanup: cleanupQueue,
  },
  events: {
    videoGeneration: videoGenerationEvents,
    videoProcessing: videoProcessingEvents,
    cleanup: cleanupEvents,
  },
  queueConfig,
};