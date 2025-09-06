const { Worker } = require('bullmq');
const { connection, QUEUE_NAMES } = require('../../config/queue');
const videoGenerationService = require('../../services/videoGenerationService');
const operationService = require('../../services/operationService');

/**
 * Video Generation Job Processor
 * Handles background video generation tasks
 */
class VideoGenerationProcessor {
  constructor() {
    this.worker = null;
    this.isRunning = false;
  }

  /**
   * Start the video generation worker
   */
  start() {
    if (this.isRunning) {
      console.log('Video generation processor is already running');
      return;
    }

    this.worker = new Worker(
      QUEUE_NAMES.VIDEO_GENERATION,
      this.processVideoGeneration.bind(this),
      {
        connection,
        concurrency: 2, // Process 2 video generation jobs concurrently
        removeOnComplete: 100,
        removeOnFail: 50,
      }
    );

    // Event listeners for monitoring
    this.worker.on('completed', (job) => {
      console.log(`Video generation job ${job.id} completed successfully`);
    });

    this.worker.on('failed', (job, err) => {
      console.error(`Video generation job ${job.id} failed:`, err.message);
    });

    this.worker.on('error', (err) => {
      console.error('Video generation worker error:', err);
    });

    this.isRunning = true;
    console.log('Video generation processor started');
  }

  /**
   * Stop the video generation worker
   */
  async stop() {
    if (!this.isRunning || !this.worker) {
      return;
    }

    await this.worker.close();
    this.isRunning = false;
    console.log('Video generation processor stopped');
  }

  /**
   * Process a video generation job
   * @param {Object} job - The BullMQ job object
   * @returns {Object} Job result
   */
  async processVideoGeneration(job) {
    const { operationId, script, images, userId } = job.data;
    
    try {
      // Update operation status to processing
      await operationService.updateOperationStatus(operationId, 'processing', {
        stage: 'video_generation',
        progress: 0
      });

      // Update job progress
      await job.updateProgress(10);

      // Generate videos for each script segment
      console.log(`Starting video generation for operation ${operationId}`);
      
      const videoResults = await videoGenerationService.generateVideo(script, images, {
        onProgress: async (progress) => {
          await job.updateProgress(10 + (progress * 0.8)); // 10-90% progress
          await operationService.updateOperationStatus(operationId, 'processing', {
            stage: 'video_generation',
            progress: 10 + (progress * 0.8)
          });
        }
      });

      // Update progress to merging stage
      await job.updateProgress(90);
      await operationService.updateOperationStatus(operationId, 'processing', {
        stage: 'video_merging',
        progress: 90
      });

      // The video service should return the final merged video URL
      const finalVideoUrl = videoResults.videoUrl;

      // Update operation with final result
      await operationService.updateOperationStatus(operationId, 'completed', {
        stage: 'completed',
        progress: 100,
        videoUrl: finalVideoUrl,
        completedAt: new Date()
      });

      await job.updateProgress(100);

      console.log(`Video generation completed for operation ${operationId}`);

      // Send webhook notification
      const jobStatusService = require('../../services/jobStatusService');
      await jobStatusService.sendWebhookNotification(operationId, 'completed', {
        videoUrl: finalVideoUrl,
        completedAt: new Date()
      });

      return {
        success: true,
        operationId,
        videoUrl: finalVideoUrl,
        completedAt: new Date()
      };

    } catch (error) {
      console.error(`Video generation failed for operation ${operationId}:`, error);

      // Update operation status to failed
      await operationService.updateOperationStatus(operationId, 'failed', {
        stage: 'failed',
        error: error.message,
        failedAt: new Date()
      });

      // Send webhook notification for failure
      const jobStatusService = require('../../services/jobStatusService');
      await jobStatusService.sendWebhookNotification(operationId, 'failed', {
        error: error.message,
        failedAt: new Date()
      });

      throw error;
    }
  }
}

module.exports = new VideoGenerationProcessor();