const jobManager = require('../jobs/jobManager');
const jobMonitoringService = require('../services/jobMonitoringService');

/**
 * Job Controller
 * Handles HTTP requests for job management and monitoring
 */
class JobController {
  /**
   * Get job dashboard data
   * GET /api/v1/jobs/dashboard
   */
  async getDashboard(req, res) {
    try {
      const dashboardData = await jobMonitoringService.getDashboardData();
      
      res.json({
        success: true,
        data: dashboardData
      });
    } catch (error) {
      console.error('Error getting job dashboard:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'DASHBOARD_ERROR',
          message: 'Failed to get job dashboard data',
          details: error.message
        }
      });
    }
  }

  /**
   * Get queue statistics
   * GET /api/v1/jobs/queues/:queueName/stats
   */
  async getQueueStats(req, res) {
    try {
      const { queueName } = req.params;
      
      const stats = await jobManager.getQueueStats(queueName);
      
      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error(`Error getting queue stats for ${req.params.queueName}:`, error);
      
      if (error.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'QUEUE_NOT_FOUND',
            message: `Queue ${req.params.queueName} not found`
          }
        });
      }
      
      res.status(500).json({
        success: false,
        error: {
          code: 'QUEUE_STATS_ERROR',
          message: 'Failed to get queue statistics',
          details: error.message
        }
      });
    }
  }

  /**
   * Get all queue statistics
   * GET /api/v1/jobs/queues/stats
   */
  async getAllQueueStats(req, res) {
    try {
      const stats = await jobManager.getAllQueueStats();
      
      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Error getting all queue stats:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'ALL_QUEUE_STATS_ERROR',
          message: 'Failed to get all queue statistics',
          details: error.message
        }
      });
    }
  }

  /**
   * Get enhanced job status for operation
   * GET /api/v1/jobs/operations/:operationId/status
   */
  async getOperationJobStatus(req, res) {
    try {
      const { operationId } = req.params;
      const jobStatusService = require('../services/jobStatusService');
      
      const status = await jobStatusService.getJobStatus(operationId);
      
      if (!status) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'OPERATION_NOT_FOUND',
            message: `Operation ${operationId} not found`
          }
        });
      }
      
      res.json({
        success: true,
        data: status
      });
    } catch (error) {
      console.error(`Error getting operation job status for ${req.params.operationId}:`, error);
      res.status(500).json({
        success: false,
        error: {
          code: 'OPERATION_STATUS_ERROR',
          message: 'Failed to get operation job status',
          details: error.message
        }
      });
    }
  }

  /**
   * Register webhook for job completion notifications
   * POST /api/v1/jobs/operations/:operationId/webhook
   */
  async registerWebhook(req, res) {
    try {
      const { operationId } = req.params;
      const { webhookUrl, secret, events, retries, timeout } = req.body;
      
      if (!webhookUrl) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_WEBHOOK_URL',
            message: 'Webhook URL is required'
          }
        });
      }

      // Validate webhook URL
      try {
        new URL(webhookUrl);
      } catch (urlError) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_WEBHOOK_URL',
            message: 'Invalid webhook URL format'
          }
        });
      }

      const jobStatusService = require('../services/jobStatusService');
      
      jobStatusService.registerWebhook(operationId, webhookUrl, {
        secret,
        events: events || ['completed', 'failed'],
        retries: retries || 3,
        timeout: timeout || 10000
      });
      
      res.json({
        success: true,
        data: {
          operationId,
          webhookUrl,
          events: events || ['completed', 'failed'],
          registeredAt: new Date()
        },
        message: 'Webhook registered successfully'
      });
    } catch (error) {
      console.error(`Error registering webhook for ${req.params.operationId}:`, error);
      res.status(500).json({
        success: false,
        error: {
          code: 'WEBHOOK_REGISTRATION_ERROR',
          message: 'Failed to register webhook',
          details: error.message
        }
      });
    }
  }

  /**
   * Unregister webhook
   * DELETE /api/v1/jobs/operations/:operationId/webhook
   */
  async unregisterWebhook(req, res) {
    try {
      const { operationId } = req.params;
      const jobStatusService = require('../services/jobStatusService');
      
      jobStatusService.unregisterWebhook(operationId);
      
      res.json({
        success: true,
        message: 'Webhook unregistered successfully'
      });
    } catch (error) {
      console.error(`Error unregistering webhook for ${req.params.operationId}:`, error);
      res.status(500).json({
        success: false,
        error: {
          code: 'WEBHOOK_UNREGISTRATION_ERROR',
          message: 'Failed to unregister webhook',
          details: error.message
        }
      });
    }
  }

  /**
   * Get job status
   * GET /api/v1/jobs/queues/:queueName/jobs/:jobId
   */
  async getJobStatus(req, res) {
    try {
      const { queueName, jobId } = req.params;
      
      const jobStatus = await jobManager.getJobStatus(queueName, jobId);
      
      if (!jobStatus) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'JOB_NOT_FOUND',
            message: `Job ${jobId} not found in queue ${queueName}`
          }
        });
      }
      
      res.json({
        success: true,
        data: jobStatus
      });
    } catch (error) {
      console.error(`Error getting job status for ${req.params.queueName}:${req.params.jobId}:`, error);
      res.status(500).json({
        success: false,
        error: {
          code: 'JOB_STATUS_ERROR',
          message: 'Failed to get job status',
          details: error.message
        }
      });
    }
  }

  /**
   * Get job details with logs
   * GET /api/v1/jobs/queues/:queueName/jobs/:jobId/details
   */
  async getJobDetails(req, res) {
    try {
      const { queueName, jobId } = req.params;
      
      const jobDetails = await jobMonitoringService.getJobDetails(queueName, jobId);
      
      if (!jobDetails) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'JOB_NOT_FOUND',
            message: `Job ${jobId} not found in queue ${queueName}`
          }
        });
      }
      
      res.json({
        success: true,
        data: jobDetails
      });
    } catch (error) {
      console.error(`Error getting job details for ${req.params.queueName}:${req.params.jobId}:`, error);
      res.status(500).json({
        success: false,
        error: {
          code: 'JOB_DETAILS_ERROR',
          message: 'Failed to get job details',
          details: error.message
        }
      });
    }
  }

  /**
   * Get recent jobs across all queues
   * GET /api/v1/jobs/recent
   */
  async getRecentJobs(req, res) {
    try {
      const limit = parseInt(req.query.limit) || 20;
      
      const recentJobs = await jobMonitoringService.getRecentJobs(limit);
      
      res.json({
        success: true,
        data: {
          jobs: recentJobs,
          limit,
          count: recentJobs.length
        }
      });
    } catch (error) {
      console.error('Error getting recent jobs:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'RECENT_JOBS_ERROR',
          message: 'Failed to get recent jobs',
          details: error.message
        }
      });
    }
  }

  /**
   * Get queue trends
   * GET /api/v1/jobs/queues/:queueName/trends
   */
  async getQueueTrends(req, res) {
    try {
      const { queueName } = req.params;
      const hours = parseInt(req.query.hours) || 24;
      
      const trends = await jobMonitoringService.getQueueTrends(queueName, hours);
      
      res.json({
        success: true,
        data: trends
      });
    } catch (error) {
      console.error(`Error getting queue trends for ${req.params.queueName}:`, error);
      
      if (error.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'QUEUE_NOT_FOUND',
            message: `Queue ${req.params.queueName} not found`
          }
        });
      }
      
      res.status(500).json({
        success: false,
        error: {
          code: 'QUEUE_TRENDS_ERROR',
          message: 'Failed to get queue trends',
          details: error.message
        }
      });
    }
  }

  /**
   * Get performance metrics
   * GET /api/v1/jobs/metrics
   */
  async getPerformanceMetrics(req, res) {
    try {
      const metrics = await jobMonitoringService.getPerformanceMetrics();
      
      res.json({
        success: true,
        data: metrics
      });
    } catch (error) {
      console.error('Error getting performance metrics:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'METRICS_ERROR',
          message: 'Failed to get performance metrics',
          details: error.message
        }
      });
    }
  }

  /**
   * Export queue data
   * GET /api/v1/jobs/export
   */
  async exportQueueData(req, res) {
    try {
      const { queueName, format = 'json' } = req.query;
      
      const exportData = await jobMonitoringService.exportQueueData(queueName, format);
      
      // Set appropriate headers for download
      const filename = queueName 
        ? `queue-${queueName}-export-${Date.now()}.${format}`
        : `all-queues-export-${Date.now()}.${format}`;
        
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Type', format === 'csv' ? 'text/csv' : 'application/json');
      
      if (format === 'json') {
        res.json(exportData);
      } else {
        res.send(exportData);
      }
    } catch (error) {
      console.error('Error exporting queue data:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'EXPORT_ERROR',
          message: 'Failed to export queue data',
          details: error.message
        }
      });
    }
  }

  /**
   * Health check for job system
   * GET /api/v1/jobs/health
   */
  async healthCheck(req, res) {
    try {
      const health = await jobManager.healthCheck();
      
      const statusCode = health.status === 'healthy' ? 200 : 503;
      
      res.status(statusCode).json({
        success: health.status === 'healthy',
        data: health
      });
    } catch (error) {
      console.error('Error getting job system health:', error);
      res.status(503).json({
        success: false,
        error: {
          code: 'HEALTH_CHECK_ERROR',
          message: 'Failed to check job system health',
          details: error.message
        }
      });
    }
  }

  /**
   * Retry a failed job
   * POST /api/v1/jobs/queues/:queueName/jobs/:jobId/retry
   */
  async retryJob(req, res) {
    try {
      const { queueName, jobId } = req.params;
      
      // TODO: Implement job retry functionality
      // This would involve getting the failed job and re-adding it to the queue
      
      res.status(501).json({
        success: false,
        error: {
          code: 'NOT_IMPLEMENTED',
          message: 'Job retry functionality not yet implemented'
        }
      });
    } catch (error) {
      console.error(`Error retrying job ${req.params.queueName}:${req.params.jobId}:`, error);
      res.status(500).json({
        success: false,
        error: {
          code: 'RETRY_ERROR',
          message: 'Failed to retry job',
          details: error.message
        }
      });
    }
  }

  /**
   * Cancel a job
   * DELETE /api/v1/jobs/queues/:queueName/jobs/:jobId
   */
  async cancelJob(req, res) {
    try {
      const { queueName, jobId } = req.params;
      
      // TODO: Implement job cancellation functionality
      // This would involve removing the job from the queue if it's waiting
      // or marking it for cancellation if it's active
      
      res.status(501).json({
        success: false,
        error: {
          code: 'NOT_IMPLEMENTED',
          message: 'Job cancellation functionality not yet implemented'
        }
      });
    } catch (error) {
      console.error(`Error cancelling job ${req.params.queueName}:${req.params.jobId}:`, error);
      res.status(500).json({
        success: false,
        error: {
          code: 'CANCEL_ERROR',
          message: 'Failed to cancel job',
          details: error.message
        }
      });
    }
  }
}

module.exports = new JobController();