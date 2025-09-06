const { Worker } = require('bullmq');
const { connection, QUEUE_NAMES } = require('../../config/queue');
const fs = require('fs').promises;
const path = require('path');

/**
 * Cleanup Job Processor
 * Handles background cleanup tasks like removing temporary files, old operations, etc.
 */
class CleanupProcessor {
  constructor() {
    this.worker = null;
    this.isRunning = false;
  }

  /**
   * Start the cleanup worker
   */
  start() {
    if (this.isRunning) {
      console.log('Cleanup processor is already running');
      return;
    }

    this.worker = new Worker(
      QUEUE_NAMES.CLEANUP,
      this.processCleanup.bind(this),
      {
        connection,
        concurrency: 1, // Process cleanup jobs one at a time
        removeOnComplete: 50,
        removeOnFail: 25,
      }
    );

    // Event listeners for monitoring
    this.worker.on('completed', (job) => {
      console.log(`Cleanup job ${job.id} completed successfully`);
    });

    this.worker.on('failed', (job, err) => {
      console.error(`Cleanup job ${job.id} failed:`, err.message);
    });

    this.worker.on('error', (err) => {
      console.error('Cleanup worker error:', err);
    });

    this.isRunning = true;
    console.log('Cleanup processor started');
  }

  /**
   * Stop the cleanup worker
   */
  async stop() {
    if (!this.isRunning || !this.worker) {
      return;
    }

    await this.worker.close();
    this.isRunning = false;
    console.log('Cleanup processor stopped');
  }

  /**
   * Process a cleanup job
   * @param {Object} job - The BullMQ job object
   * @returns {Object} Job result
   */
  async processCleanup(job) {
    const { type, data } = job.data;
    
    try {
      console.log(`Starting cleanup job ${job.id} of type ${type}`);
      
      let result;
      
      switch (type) {
        case 'temp_files':
          result = await this.cleanupTempFiles(job, data);
          break;
        case 'old_operations':
          result = await this.cleanupOldOperations(job, data);
          break;
        case 'failed_jobs':
          result = await this.cleanupFailedJobs(job, data);
          break;
        case 'cache_cleanup':
          result = await this.cleanupCache(job, data);
          break;
        default:
          throw new Error(`Unknown cleanup type: ${type}`);
      }

      console.log(`Cleanup job ${job.id} completed successfully`);
      return result;

    } catch (error) {
      console.error(`Cleanup job ${job.id} failed:`, error);
      throw error;
    }
  }

  /**
   * Clean up temporary files
   * @param {Object} job - The BullMQ job object
   * @param {Object} data - Job data containing cleanup parameters
   * @returns {Object} Cleanup result
   */
  async cleanupTempFiles(job, data) {
    const { directory = './temp', maxAge = 24 * 60 * 60 * 1000 } = data; // Default 24 hours
    
    await job.updateProgress(10);
    
    let cleanedFiles = 0;
    let totalSize = 0;
    
    try {
      const files = await fs.readdir(directory);
      const now = Date.now();
      
      await job.updateProgress(20);
      
      for (let i = 0; i < files.length; i++) {
        const filePath = path.join(directory, files[i]);
        
        try {
          const stats = await fs.stat(filePath);
          const fileAge = now - stats.mtime.getTime();
          
          if (fileAge > maxAge) {
            totalSize += stats.size;
            await fs.unlink(filePath);
            cleanedFiles++;
            console.log(`Cleaned up temp file: ${filePath}`);
          }
        } catch (fileError) {
          console.warn(`Could not process file ${filePath}:`, fileError.message);
        }
        
        await job.updateProgress(20 + (i / files.length) * 70);
      }
      
      await job.updateProgress(100);
      
      return {
        success: true,
        type: 'temp_files',
        cleanedFiles,
        totalSize,
        directory,
        cleanedAt: new Date()
      };
      
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log(`Temp directory ${directory} does not exist, skipping cleanup`);
        return {
          success: true,
          type: 'temp_files',
          cleanedFiles: 0,
          totalSize: 0,
          directory,
          message: 'Directory does not exist',
          cleanedAt: new Date()
        };
      }
      throw error;
    }
  }

  /**
   * Clean up old operations from database
   * @param {Object} job - The BullMQ job object
   * @param {Object} data - Job data containing cleanup parameters
   * @returns {Object} Cleanup result
   */
  async cleanupOldOperations(job, data) {
    const { maxAge = 30 * 24 * 60 * 60 * 1000 } = data; // Default 30 days
    
    await job.updateProgress(10);
    
    try {
      // TODO: Implement actual database cleanup
      // This would typically involve:
      // 1. Finding operations older than maxAge
      // 2. Removing associated files
      // 3. Deleting database records
      
      console.log(`Cleaning up operations older than ${maxAge}ms`);
      
      // Simulate cleanup process
      await new Promise(resolve => setTimeout(resolve, 1000));
      await job.updateProgress(50);
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      await job.updateProgress(90);
      
      await new Promise(resolve => setTimeout(resolve, 200));
      await job.updateProgress(100);
      
      const cleanedOperations = 0; // Placeholder
      
      return {
        success: true,
        type: 'old_operations',
        cleanedOperations,
        maxAge,
        cleanedAt: new Date()
      };
      
    } catch (error) {
      throw error;
    }
  }

  /**
   * Clean up failed jobs from queues
   * @param {Object} job - The BullMQ job object
   * @param {Object} data - Job data containing cleanup parameters
   * @returns {Object} Cleanup result
   */
  async cleanupFailedJobs(job, data) {
    const { maxAge = 7 * 24 * 60 * 60 * 1000 } = data; // Default 7 days
    
    await job.updateProgress(10);
    
    try {
      console.log(`Cleaning up failed jobs older than ${maxAge}ms`);
      
      // TODO: Implement actual failed job cleanup
      // This would involve cleaning up failed jobs from all queues
      
      // Simulate cleanup process
      await new Promise(resolve => setTimeout(resolve, 500));
      await job.updateProgress(50);
      
      await new Promise(resolve => setTimeout(resolve, 500));
      await job.updateProgress(90);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      await job.updateProgress(100);
      
      const cleanedJobs = 0; // Placeholder
      
      return {
        success: true,
        type: 'failed_jobs',
        cleanedJobs,
        maxAge,
        cleanedAt: new Date()
      };
      
    } catch (error) {
      throw error;
    }
  }

  /**
   * Clean up cache entries
   * @param {Object} job - The BullMQ job object
   * @param {Object} data - Job data containing cleanup parameters
   * @returns {Object} Cleanup result
   */
  async cleanupCache(job, data) {
    const { pattern = '*', maxAge = 24 * 60 * 60 * 1000 } = data; // Default 24 hours
    
    await job.updateProgress(10);
    
    try {
      console.log(`Cleaning up cache entries matching pattern: ${pattern}`);
      
      // TODO: Implement actual cache cleanup using Redis
      // This would involve:
      // 1. Scanning for keys matching the pattern
      // 2. Checking TTL or age of entries
      // 3. Removing expired entries
      
      // Simulate cleanup process
      await new Promise(resolve => setTimeout(resolve, 800));
      await job.updateProgress(50);
      
      await new Promise(resolve => setTimeout(resolve, 800));
      await job.updateProgress(90);
      
      await new Promise(resolve => setTimeout(resolve, 200));
      await job.updateProgress(100);
      
      const cleanedEntries = 0; // Placeholder
      
      return {
        success: true,
        type: 'cache_cleanup',
        cleanedEntries,
        pattern,
        maxAge,
        cleanedAt: new Date()
      };
      
    } catch (error) {
      throw error;
    }
  }
}

module.exports = new CleanupProcessor();