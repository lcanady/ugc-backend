const jobManager = require('../jobs/jobManager');
const { queues } = require('../config/queue');

/**
 * Job Monitoring Service
 * Provides monitoring and dashboard functionality for job queues
 */
class JobMonitoringService {
  constructor() {
    this.metrics = {
      totalJobs: 0,
      completedJobs: 0,
      failedJobs: 0,
      activeJobs: 0,
      startTime: new Date(),
    };
  }

  /**
   * Get comprehensive dashboard data
   * @returns {Object} Dashboard data
   */
  async getDashboardData() {
    try {
      const queueStats = await jobManager.getAllQueueStats();
      const healthStatus = await jobManager.healthCheck();
      const recentJobs = await this.getRecentJobs();
      const performanceMetrics = await this.getPerformanceMetrics();

      return {
        overview: {
          totalQueues: Object.keys(queues).length,
          totalJobs: Object.values(queueStats).reduce((sum, stats) => sum + stats.total, 0),
          activeJobs: Object.values(queueStats).reduce((sum, stats) => sum + stats.active, 0),
          failedJobs: Object.values(queueStats).reduce((sum, stats) => sum + stats.failed, 0),
          completedJobs: Object.values(queueStats).reduce((sum, stats) => sum + stats.completed, 0),
          uptime: Date.now() - this.metrics.startTime.getTime(),
        },
        queues: queueStats,
        health: healthStatus,
        recentJobs,
        performance: performanceMetrics,
        timestamp: new Date(),
      };
    } catch (error) {
      console.error('Error getting dashboard data:', error);
      throw error;
    }
  }

  /**
   * Get recent jobs across all queues
   * @param {number} limit - Number of jobs to return
   * @returns {Array} Recent jobs
   */
  async getRecentJobs(limit = 20) {
    const recentJobs = [];

    try {
      for (const [queueName, queue] of Object.entries(queues)) {
        // Get recent completed jobs
        const completed = await queue.getCompleted(0, Math.floor(limit / 3));
        const failed = await queue.getFailed(0, Math.floor(limit / 3));
        const active = await queue.getActive(0, Math.floor(limit / 3));

        // Format completed jobs
        for (const job of completed) {
          recentJobs.push({
            id: job.id,
            name: job.name,
            queue: queueName,
            status: 'completed',
            progress: 100,
            data: job.data,
            processedOn: job.processedOn,
            finishedOn: job.finishedOn,
            duration: job.finishedOn - job.processedOn,
            returnvalue: job.returnvalue,
          });
        }

        // Format failed jobs
        for (const job of failed) {
          recentJobs.push({
            id: job.id,
            name: job.name,
            queue: queueName,
            status: 'failed',
            progress: job.progress || 0,
            data: job.data,
            processedOn: job.processedOn,
            finishedOn: job.finishedOn,
            failedReason: job.failedReason,
            attemptsMade: job.attemptsMade,
          });
        }

        // Format active jobs
        for (const job of active) {
          recentJobs.push({
            id: job.id,
            name: job.name,
            queue: queueName,
            status: 'active',
            progress: job.progress || 0,
            data: job.data,
            processedOn: job.processedOn,
          });
        }
      }

      // Sort by most recent first
      recentJobs.sort((a, b) => {
        const aTime = a.finishedOn || a.processedOn || 0;
        const bTime = b.finishedOn || b.processedOn || 0;
        return bTime - aTime;
      });

      return recentJobs.slice(0, limit);

    } catch (error) {
      console.error('Error getting recent jobs:', error);
      return [];
    }
  }

  /**
   * Get performance metrics
   * @returns {Object} Performance metrics
   */
  async getPerformanceMetrics() {
    try {
      const metrics = {
        averageProcessingTime: {},
        throughput: {},
        errorRate: {},
        queueHealth: {},
      };

      for (const [queueName, queue] of Object.entries(queues)) {
        // Get completed jobs for metrics calculation
        const completed = await queue.getCompleted(0, 100);
        const failed = await queue.getFailed(0, 100);

        if (completed.length > 0) {
          // Calculate average processing time
          const totalProcessingTime = completed.reduce((sum, job) => {
            return sum + (job.finishedOn - job.processedOn);
          }, 0);
          metrics.averageProcessingTime[queueName] = Math.round(totalProcessingTime / completed.length);

          // Calculate throughput (jobs per hour)
          const now = Date.now();
          const oneHourAgo = now - (60 * 60 * 1000);
          const recentJobs = completed.filter(job => job.finishedOn > oneHourAgo);
          metrics.throughput[queueName] = recentJobs.length;
        } else {
          metrics.averageProcessingTime[queueName] = 0;
          metrics.throughput[queueName] = 0;
        }

        // Calculate error rate
        const totalJobs = completed.length + failed.length;
        metrics.errorRate[queueName] = totalJobs > 0 ? (failed.length / totalJobs) * 100 : 0;

        // Queue health score (0-100)
        const stats = await jobManager.getQueueStats(queueName);
        const healthScore = this.calculateQueueHealthScore(stats);
        metrics.queueHealth[queueName] = healthScore;
      }

      return metrics;

    } catch (error) {
      console.error('Error calculating performance metrics:', error);
      return {
        averageProcessingTime: {},
        throughput: {},
        errorRate: {},
        queueHealth: {},
      };
    }
  }

  /**
   * Calculate queue health score
   * @param {Object} stats - Queue statistics
   * @returns {number} Health score (0-100)
   */
  calculateQueueHealthScore(stats) {
    let score = 100;

    // Penalize for failed jobs
    if (stats.total > 0) {
      const failureRate = stats.failed / stats.total;
      score -= failureRate * 50; // Up to 50 points penalty for failures
    }

    // Penalize for too many waiting jobs
    if (stats.waiting > 10) {
      score -= Math.min(25, stats.waiting * 2); // Up to 25 points penalty for backlog
    }

    // Penalize for stuck active jobs (this would need more sophisticated logic)
    if (stats.active > 5) {
      score -= Math.min(15, stats.active * 1.5); // Up to 15 points penalty for too many active
    }

    return Math.max(0, Math.round(score));
  }

  /**
   * Get job details by ID
   * @param {string} queueName - Queue name
   * @param {string} jobId - Job ID
   * @returns {Object} Job details
   */
  async getJobDetails(queueName, jobId) {
    try {
      const jobStatus = await jobManager.getJobStatus(queueName, jobId);
      
      if (!jobStatus) {
        return null;
      }

      // Get additional job logs if available
      const logs = await this.getJobLogs(queueName, jobId);

      return {
        ...jobStatus,
        logs,
        queue: queueName,
      };

    } catch (error) {
      console.error(`Error getting job details for ${queueName}:${jobId}:`, error);
      throw error;
    }
  }

  /**
   * Get job logs (placeholder for future implementation)
   * @param {string} queueName - Queue name
   * @param {string} jobId - Job ID
   * @returns {Array} Job logs
   */
  async getJobLogs(queueName, jobId) {
    // TODO: Implement job logging system
    // This could store logs in Redis, database, or file system
    return [];
  }

  /**
   * Get queue trends over time
   * @param {string} queueName - Queue name
   * @param {number} hours - Number of hours to look back
   * @returns {Object} Queue trends
   */
  async getQueueTrends(queueName, hours = 24) {
    try {
      const queue = queues[queueName];
      if (!queue) {
        throw new Error(`Queue ${queueName} not found`);
      }

      // This is a simplified implementation
      // In a real system, you'd want to store historical data
      const now = Date.now();
      const timeWindow = hours * 60 * 60 * 1000;
      const startTime = now - timeWindow;

      const completed = await queue.getCompleted(0, 1000);
      const failed = await queue.getFailed(0, 1000);

      // Filter jobs within time window
      const recentCompleted = completed.filter(job => job.finishedOn > startTime);
      const recentFailed = failed.filter(job => job.finishedOn > startTime);

      // Create hourly buckets
      const buckets = {};
      for (let i = 0; i < hours; i++) {
        const bucketTime = now - (i * 60 * 60 * 1000);
        const bucketKey = new Date(bucketTime).toISOString().slice(0, 13) + ':00:00.000Z';
        buckets[bucketKey] = { completed: 0, failed: 0 };
      }

      // Fill buckets with job data
      recentCompleted.forEach(job => {
        const bucketKey = new Date(job.finishedOn).toISOString().slice(0, 13) + ':00:00.000Z';
        if (buckets[bucketKey]) {
          buckets[bucketKey].completed++;
        }
      });

      recentFailed.forEach(job => {
        const bucketKey = new Date(job.finishedOn).toISOString().slice(0, 13) + ':00:00.000Z';
        if (buckets[bucketKey]) {
          buckets[bucketKey].failed++;
        }
      });

      return {
        queueName,
        timeWindow: hours,
        buckets,
        summary: {
          totalCompleted: recentCompleted.length,
          totalFailed: recentFailed.length,
          successRate: recentCompleted.length + recentFailed.length > 0 
            ? (recentCompleted.length / (recentCompleted.length + recentFailed.length)) * 100 
            : 0,
        },
      };

    } catch (error) {
      console.error(`Error getting queue trends for ${queueName}:`, error);
      throw error;
    }
  }

  /**
   * Export queue data for analysis
   * @param {string} queueName - Queue name (optional, exports all if not specified)
   * @param {string} format - Export format ('json' or 'csv')
   * @returns {Object} Exported data
   */
  async exportQueueData(queueName = null, format = 'json') {
    try {
      const exportData = {
        timestamp: new Date(),
        queues: {},
      };

      const queuesToExport = queueName ? { [queueName]: queues[queueName] } : queues;

      for (const [name, queue] of Object.entries(queuesToExport)) {
        const stats = await jobManager.getQueueStats(name);
        const completed = await queue.getCompleted(0, 1000);
        const failed = await queue.getFailed(0, 1000);

        exportData.queues[name] = {
          stats,
          recentJobs: {
            completed: completed.map(job => ({
              id: job.id,
              name: job.name,
              data: job.data,
              processedOn: job.processedOn,
              finishedOn: job.finishedOn,
              duration: job.finishedOn - job.processedOn,
            })),
            failed: failed.map(job => ({
              id: job.id,
              name: job.name,
              data: job.data,
              processedOn: job.processedOn,
              finishedOn: job.finishedOn,
              failedReason: job.failedReason,
              attemptsMade: job.attemptsMade,
            })),
          },
        };
      }

      if (format === 'csv') {
        // TODO: Implement CSV conversion
        throw new Error('CSV export not yet implemented');
      }

      return exportData;

    } catch (error) {
      console.error('Error exporting queue data:', error);
      throw error;
    }
  }
}

module.exports = new JobMonitoringService();