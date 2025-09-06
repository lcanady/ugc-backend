const jobManager = require('../jobs/jobManager');
const operationService = require('./operationService');

/**
 * Job Status Service
 * Provides job status polling and webhook functionality
 */
class JobStatusService {
  constructor() {
    this.webhookEndpoints = new Map(); // Store webhook URLs by operation ID
    this.pollingIntervals = new Map();  // Store active polling intervals
  }

  /**
   * Register a webhook endpoint for job completion notifications
   * @param {string} operationId - Operation ID
   * @param {string} webhookUrl - Webhook URL to notify
   * @param {Object} options - Webhook options
   */
  registerWebhook(operationId, webhookUrl, options = {}) {
    this.webhookEndpoints.set(operationId, {
      url: webhookUrl,
      secret: options.secret,
      events: options.events || ['completed', 'failed'],
      retries: options.retries || 3,
      timeout: options.timeout || 10000,
      registeredAt: new Date()
    });
  }

  /**
   * Remove webhook registration
   * @param {string} operationId - Operation ID
   */
  unregisterWebhook(operationId) {
    this.webhookEndpoints.delete(operationId);
  }

  /**
   * Get job status with enhanced information
   * @param {string} operationId - Operation ID
   * @returns {Object} Enhanced job status
   */
  async getJobStatus(operationId) {
    try {
      // Get operation details
      const operation = await operationService.getOperation(operationId);
      if (!operation) {
        return null;
      }

      // Get job status if video generation is in progress
      let jobStatus = null;
      let queuePosition = null;
      
      if (operation.metadata?.videoJobId) {
        try {
          jobStatus = await jobManager.getJobStatus('videoGeneration', operation.metadata.videoJobId);
          
          // Get queue position if job is waiting
          if (jobStatus && !jobStatus.processedOn) {
            queuePosition = await this.getQueuePosition('videoGeneration', operation.metadata.videoJobId);
          }
        } catch (jobError) {
          console.warn('Could not retrieve job status:', jobError.message);
        }
      }

      return {
        operationId: operation.operationId,
        status: operation.status,
        progress: this.calculateOverallProgress(operation, jobStatus),
        stage: this.getCurrentStage(operation, jobStatus),
        jobDetails: jobStatus ? {
          jobId: operation.metadata.videoJobId,
          jobStatus: this.mapJobStatusToUserFriendly(jobStatus),
          jobProgress: jobStatus.progress || 0,
          queuePosition,
          estimatedTimeRemaining: this.estimateTimeRemaining(jobStatus),
          startedAt: jobStatus.processedOn ? new Date(jobStatus.processedOn) : null,
          completedAt: jobStatus.finishedOn ? new Date(jobStatus.finishedOn) : null
        } : null,
        creativeBrief: operation.creativeBrief,
        scriptContent: operation.scriptContent,
        videoUrls: operation.videoUrls,
        errorMessage: operation.errorMessage,
        metadata: operation.metadata,
        createdAt: operation.created_at,
        updatedAt: operation.updated_at,
        completedAt: operation.completedAt,
        webhookRegistered: this.webhookEndpoints.has(operationId)
      };

    } catch (error) {
      console.error('Error getting job status:', error);
      throw error;
    }
  }

  /**
   * Get position of job in queue
   * @param {string} queueName - Queue name
   * @param {string} jobId - Job ID
   * @returns {number|null} Position in queue (0-based)
   */
  async getQueuePosition(queueName, jobId) {
    try {
      const queue = require('../config/queue').queues[queueName];
      if (!queue) return null;

      const waitingJobs = await queue.getWaiting();
      const position = waitingJobs.findIndex(job => job.id === jobId);
      
      return position >= 0 ? position : null;
    } catch (error) {
      console.warn('Could not get queue position:', error.message);
      return null;
    }
  }

  /**
   * Calculate overall progress percentage
   * @param {Object} operation - Operation object
   * @param {Object} jobStatus - Job status object
   * @returns {number} Progress percentage (0-100)
   */
  calculateOverallProgress(operation, jobStatus) {
    if (operation.status === 'completed') return 100;
    if (operation.status === 'failed') return 0;

    // Base progress for completed steps
    let progress = 0;
    
    // Image analysis and script generation are typically quick (30% total)
    if (operation.scriptContent) {
      progress += 30;
    }

    // Video generation is the main work (70% of total)
    if (jobStatus && jobStatus.progress) {
      progress += (jobStatus.progress / 100) * 70;
    } else if (operation.status === 'processing') {
      progress += 5; // Small progress for queued video generation
    }

    return Math.min(100, Math.round(progress));
  }

  /**
   * Get current processing stage
   * @param {Object} operation - Operation object
   * @param {Object} jobStatus - Job status object
   * @returns {string} Current stage
   */
  getCurrentStage(operation, jobStatus) {
    if (operation.status === 'completed') return 'completed';
    if (operation.status === 'failed') return 'failed';

    if (!operation.scriptContent) {
      return 'script_generation';
    }

    if (jobStatus) {
      if (jobStatus.processedOn && !jobStatus.finishedOn) {
        return 'video_generation';
      } else if (!jobStatus.processedOn) {
        return 'queued';
      }
    }

    return 'processing';
  }

  /**
   * Maps job status to user-friendly status
   * @param {Object} jobStatus - Job status from queue
   * @returns {string} User-friendly status
   */
  mapJobStatusToUserFriendly(jobStatus) {
    if (!jobStatus) return 'unknown';
    
    if (jobStatus.finishedOn && jobStatus.returnvalue) {
      return 'completed';
    } else if (jobStatus.failedReason) {
      return 'failed';
    } else if (jobStatus.processedOn) {
      return 'processing';
    } else {
      return 'queued';
    }
  }

  /**
   * Estimates remaining time for job completion
   * @param {Object} jobStatus - Job status from queue
   * @returns {number|null} Estimated seconds remaining
   */
  estimateTimeRemaining(jobStatus) {
    if (!jobStatus || !jobStatus.processedOn || jobStatus.finishedOn) {
      return null;
    }

    const progress = jobStatus.progress || 0;
    if (progress <= 0) {
      return 300; // Default estimate of 5 minutes
    }

    const elapsedTime = Date.now() - jobStatus.processedOn;
    const estimatedTotalTime = elapsedTime / (progress / 100);
    const remainingTime = Math.max(0, estimatedTotalTime - elapsedTime);
    
    return Math.round(remainingTime / 1000); // Return seconds
  }

  /**
   * Send webhook notification
   * @param {string} operationId - Operation ID
   * @param {string} event - Event type (completed, failed, etc.)
   * @param {Object} data - Event data
   */
  async sendWebhookNotification(operationId, event, data) {
    const webhook = this.webhookEndpoints.get(operationId);
    if (!webhook || !webhook.events.includes(event)) {
      return;
    }

    const payload = {
      operationId,
      event,
      timestamp: new Date().toISOString(),
      data
    };

    let attempt = 0;
    const maxRetries = webhook.retries;

    while (attempt <= maxRetries) {
      try {
        const response = await fetch(webhook.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'UGC-Ad-Creator-Webhook/1.0',
            ...(webhook.secret && {
              'X-Webhook-Signature': this.generateWebhookSignature(payload, webhook.secret)
            })
          },
          body: JSON.stringify(payload),
          timeout: webhook.timeout
        });

        if (response.ok) {
          console.log(`Webhook notification sent successfully for operation ${operationId}`);
          break;
        } else {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

      } catch (error) {
        attempt++;
        console.warn(`Webhook notification attempt ${attempt} failed for operation ${operationId}:`, error.message);
        
        if (attempt <= maxRetries) {
          // Exponential backoff
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 30000);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          console.error(`All webhook notification attempts failed for operation ${operationId}`);
        }
      }
    }

    // Clean up webhook after completion or failure
    if (event === 'completed' || event === 'failed') {
      this.unregisterWebhook(operationId);
    }
  }

  /**
   * Generate webhook signature for security
   * @param {Object} payload - Webhook payload
   * @param {string} secret - Webhook secret
   * @returns {string} HMAC signature
   */
  generateWebhookSignature(payload, secret) {
    const crypto = require('crypto');
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(JSON.stringify(payload));
    return `sha256=${hmac.digest('hex')}`;
  }

  /**
   * Start polling for job status updates
   * @param {string} operationId - Operation ID
   * @param {Function} callback - Callback function for status updates
   * @param {number} interval - Polling interval in milliseconds
   */
  startPolling(operationId, callback, interval = 5000) {
    // Clear existing polling if any
    this.stopPolling(operationId);

    const pollInterval = setInterval(async () => {
      try {
        const status = await this.getJobStatus(operationId);
        callback(null, status);

        // Stop polling if job is completed or failed
        if (status && (status.status === 'completed' || status.status === 'failed')) {
          this.stopPolling(operationId);
        }
      } catch (error) {
        callback(error, null);
      }
    }, interval);

    this.pollingIntervals.set(operationId, pollInterval);
  }

  /**
   * Stop polling for job status updates
   * @param {string} operationId - Operation ID
   */
  stopPolling(operationId) {
    const interval = this.pollingIntervals.get(operationId);
    if (interval) {
      clearInterval(interval);
      this.pollingIntervals.delete(operationId);
    }
  }

  /**
   * Get all active polling operations
   * @returns {Array} Array of operation IDs with active polling
   */
  getActivePolling() {
    return Array.from(this.pollingIntervals.keys());
  }

  /**
   * Get all registered webhooks
   * @returns {Array} Array of webhook registrations
   */
  getRegisteredWebhooks() {
    return Array.from(this.webhookEndpoints.entries()).map(([operationId, webhook]) => ({
      operationId,
      url: webhook.url,
      events: webhook.events,
      registeredAt: webhook.registeredAt
    }));
  }

  /**
   * Cleanup expired webhooks and polling intervals
   */
  cleanup() {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    // Clean up old webhooks
    for (const [operationId, webhook] of this.webhookEndpoints.entries()) {
      if (now - webhook.registeredAt.getTime() > maxAge) {
        this.unregisterWebhook(operationId);
        console.log(`Cleaned up expired webhook for operation ${operationId}`);
      }
    }

    // Clean up orphaned polling intervals
    for (const operationId of this.pollingIntervals.keys()) {
      // This would need additional logic to check if operation still exists
      // For now, we'll rely on the polling logic to stop itself when jobs complete
    }
  }
}

module.exports = new JobStatusService();