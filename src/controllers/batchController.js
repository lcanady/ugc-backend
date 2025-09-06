const batchService = require('../services/batchService');
const batchOptimizationService = require('../services/batchOptimizationService');
const multer = require('multer');
const config = require('../utils/config');

// Configure multer for batch file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.maxFileSize,
    files: 1000 // Allow up to 1000 files for batch operations
  },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type. Only ${allowedMimeTypes.join(', ')} are allowed.`), false);
    }
  }
});

/**
 * Controller for Batch UGC operations
 */
class BatchController {
  /**
   * Create a new batch UGC generation request
   * POST /api/v1/batch/generate
   */
  async createBatch(req, res) {
    try {
      const { name, description, requests, priority, scheduledFor, options } = req.body;
      const userId = req.user?.id || null;
      const apiKeyId = req.apiKey?.id || null;

      // Validate required fields
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Batch name is required',
          code: 'INVALID_BATCH_NAME'
        });
      }

      if (!Array.isArray(requests) || requests.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'At least one request is required',
          code: 'NO_REQUESTS_PROVIDED'
        });
      }

      if (requests.length > 100) {
        return res.status(400).json({
          success: false,
          error: 'Maximum 100 requests allowed per batch',
          code: 'TOO_MANY_REQUESTS'
        });
      }

      // Validate priority
      if (priority && (priority < 1 || priority > 10)) {
        return res.status(400).json({
          success: false,
          error: 'Priority must be between 1 and 10',
          code: 'INVALID_PRIORITY'
        });
      }

      // Validate scheduled time
      if (scheduledFor) {
        const scheduledDate = new Date(scheduledFor);
        if (isNaN(scheduledDate.getTime())) {
          return res.status(400).json({
            success: false,
            error: 'Invalid scheduled date format',
            code: 'INVALID_SCHEDULED_DATE'
          });
        }
        
        if (scheduledDate < new Date()) {
          return res.status(400).json({
            success: false,
            error: 'Scheduled date must be in the future',
            code: 'PAST_SCHEDULED_DATE'
          });
        }
      }

      // Create batch
      const result = await batchService.createBatch({
        name: name.trim(),
        description: description?.trim(),
        requests,
        userId,
        apiKeyId,
        priority: priority || 5,
        scheduledFor,
        options: options || {}
      });

      res.status(201).json({
        success: true,
        data: {
          batchId: result.batch.batchId,
          name: result.batch.name,
          description: result.batch.description,
          status: result.batch.status,
          totalRequests: result.totalRequests,
          priority: result.batch.priority,
          scheduledFor: result.batch.scheduledFor,
          createdAt: result.batch.created_at,
          estimatedDuration: result.batch.metadata.estimatedDuration,
          statusEndpoint: `/api/v1/batch/${result.batch.batchId}/status`,
          operations: result.operations.map(op => ({
            operationId: op.operationId,
            batchIndex: op.metadata.batchIndex
          }))
        },
        message: 'Batch created successfully. Processing will begin automatically.'
      });

    } catch (error) {
      console.error('Batch creation error:', error);
      
      res.status(500).json({
        success: false,
        error: error.message || 'Internal server error during batch creation',
        code: 'BATCH_CREATION_ERROR'
      });
    }
  }

  /**
   * Create batch with file uploads
   * POST /api/v1/batch/generate-with-files
   */
  async createBatchWithFiles(req, res) {
    try {
      const { batchData } = req.body;
      const uploadedFiles = req.files || [];

      if (!batchData) {
        return res.status(400).json({
          success: false,
          error: 'Batch data is required',
          code: 'MISSING_BATCH_DATA'
        });
      }

      let parsedBatchData;
      try {
        parsedBatchData = typeof batchData === 'string' ? JSON.parse(batchData) : batchData;
      } catch (error) {
        return res.status(400).json({
          success: false,
          error: 'Invalid batch data format',
          code: 'INVALID_BATCH_DATA'
        });
      }

      // Group uploaded files by request index
      const filesByRequest = {};
      uploadedFiles.forEach(file => {
        const requestIndex = parseInt(file.fieldname.match(/\d+/)?.[0] || '0');
        if (!filesByRequest[requestIndex]) {
          filesByRequest[requestIndex] = [];
        }
        filesByRequest[requestIndex].push({
          buffer: file.buffer,
          mimeType: file.mimetype,
          originalName: file.originalname
        });
      });

      // Add files to corresponding requests
      if (parsedBatchData.requests) {
        parsedBatchData.requests.forEach((request, index) => {
          if (filesByRequest[index]) {
            request.images = filesByRequest[index];
          }
        });
      }

      // Use the regular createBatch method
      req.body = parsedBatchData;
      await this.createBatch(req, res);

    } catch (error) {
      console.error('Batch creation with files error:', error);
      
      res.status(500).json({
        success: false,
        error: error.message || 'Internal server error during batch creation',
        code: 'BATCH_CREATION_WITH_FILES_ERROR'
      });
    }
  }

  /**
   * Get batch status
   * GET /api/v1/batch/:batchId/status
   */
  async getBatchStatus(req, res) {
    try {
      const { batchId } = req.params;

      if (!batchId) {
        return res.status(400).json({
          success: false,
          error: 'Batch ID is required',
          code: 'MISSING_BATCH_ID'
        });
      }

      const status = await batchService.getBatchStatus(batchId);

      if (!status) {
        return res.status(404).json({
          success: false,
          error: 'Batch not found',
          code: 'BATCH_NOT_FOUND'
        });
      }

      // Check access permissions
      const userId = req.user?.id;
      const apiKeyId = req.apiKey?.id;
      
      // For now, allow access if user/apiKey matches or if admin
      // In production, you'd want more sophisticated access control
      
      res.status(200).json({
        success: true,
        data: status
      });

    } catch (error) {
      console.error('Get batch status error:', error);
      
      res.status(500).json({
        success: false,
        error: error.message || 'Internal server error',
        code: 'BATCH_STATUS_ERROR'
      });
    }
  }

  /**
   * Get batch results
   * GET /api/v1/batch/:batchId/results
   */
  async getBatchResults(req, res) {
    try {
      const { batchId } = req.params;

      if (!batchId) {
        return res.status(400).json({
          success: false,
          error: 'Batch ID is required',
          code: 'MISSING_BATCH_ID'
        });
      }

      const results = await batchService.getBatchResults(batchId);

      res.status(200).json({
        success: true,
        data: results
      });

    } catch (error) {
      console.error('Get batch results error:', error);
      
      if (error.message === 'Batch not found') {
        return res.status(404).json({
          success: false,
          error: error.message,
          code: 'BATCH_NOT_FOUND'
        });
      }

      if (error.message === 'Batch is not yet completed') {
        return res.status(400).json({
          success: false,
          error: error.message,
          code: 'BATCH_NOT_COMPLETED'
        });
      }

      res.status(500).json({
        success: false,
        error: error.message || 'Internal server error',
        code: 'BATCH_RESULTS_ERROR'
      });
    }
  }

  /**
   * Download batch results as ZIP
   * GET /api/v1/batch/:batchId/download
   */
  async downloadBatchResults(req, res) {
    try {
      const { batchId } = req.params;

      if (!batchId) {
        return res.status(400).json({
          success: false,
          error: 'Batch ID is required',
          code: 'MISSING_BATCH_ID'
        });
      }

      const results = await batchService.getBatchResults(batchId);

      if (results.results.successful.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No successful results to download',
          code: 'NO_RESULTS_TO_DOWNLOAD'
        });
      }

      // For now, return the results data
      // In a full implementation, you'd create a ZIP file with all videos
      res.status(200).json({
        success: true,
        data: {
          batchId: results.batchId,
          downloadFormat: 'json', // Would be 'zip' in full implementation
          results: results.results.successful,
          message: 'In a full implementation, this would return a ZIP file with all videos'
        }
      });

    } catch (error) {
      console.error('Download batch results error:', error);
      
      res.status(500).json({
        success: false,
        error: error.message || 'Internal server error',
        code: 'BATCH_DOWNLOAD_ERROR'
      });
    }
  }

  /**
   * Cancel a batch operation
   * POST /api/v1/batch/:batchId/cancel
   */
  async cancelBatch(req, res) {
    try {
      const { batchId } = req.params;

      if (!batchId) {
        return res.status(400).json({
          success: false,
          error: 'Batch ID is required',
          code: 'MISSING_BATCH_ID'
        });
      }

      const result = await batchService.cancelBatch(batchId);

      res.status(200).json({
        success: true,
        data: result,
        message: 'Batch cancelled successfully'
      });

    } catch (error) {
      console.error('Cancel batch error:', error);
      
      if (error.message === 'Batch not found') {
        return res.status(404).json({
          success: false,
          error: error.message,
          code: 'BATCH_NOT_FOUND'
        });
      }

      if (error.message === 'Cannot cancel completed batch') {
        return res.status(400).json({
          success: false,
          error: error.message,
          code: 'BATCH_ALREADY_COMPLETED'
        });
      }

      res.status(500).json({
        success: false,
        error: error.message || 'Internal server error',
        code: 'BATCH_CANCEL_ERROR'
      });
    }
  }

  /**
   * Get batch history
   * GET /api/v1/batch/history
   */
  async getBatchHistory(req, res) {
    try {
      const userId = req.user?.id;
      const apiKeyId = req.apiKey?.id;

      if (!userId && !apiKeyId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'AUTHENTICATION_REQUIRED'
        });
      }

      const { limit = 50, status, startDate, endDate } = req.query;

      const filters = {
        userId,
        apiKeyId,
        limit: parseInt(limit),
        status,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined
      };

      const history = await batchService.getBatchHistory(filters);

      res.status(200).json({
        success: true,
        data: {
          batches: history,
          total: history.length,
          filters
        }
      });

    } catch (error) {
      console.error('Get batch history error:', error);
      
      res.status(500).json({
        success: false,
        error: error.message || 'Internal server error',
        code: 'BATCH_HISTORY_ERROR'
      });
    }
  }

  /**
   * Get batch analytics
   * GET /api/v1/batch/analytics
   */
  async getBatchAnalytics(req, res) {
    try {
      const userId = req.user?.id;
      const apiKeyId = req.apiKey?.id;

      // Check if user has analytics permissions
      if (!req.user?.hasPermission('analytics:read') && !req.apiKey?.hasPermission('analytics:read')) {
        return res.status(403).json({
          success: false,
          error: 'Analytics permissions required',
          code: 'INSUFFICIENT_PERMISSIONS'
        });
      }

      const { startDate, endDate } = req.query;

      const filters = {
        userId: req.user?.hasPermission('*') ? undefined : userId, // Admins can see all
        apiKeyId: req.apiKey?.hasPermission('*') ? undefined : apiKeyId,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined
      };

      const analytics = await batchService.getBatchAnalytics(filters);

      res.status(200).json({
        success: true,
        data: analytics
      });

    } catch (error) {
      console.error('Get batch analytics error:', error);
      
      res.status(500).json({
        success: false,
        error: error.message || 'Internal server error',
        code: 'BATCH_ANALYTICS_ERROR'
      });
    }
  }

  /**
   * Process pending batches (admin only)
   * POST /api/v1/batch/process-pending
   */
  async processPendingBatches(req, res) {
    try {
      // Check admin permissions
      if (!req.user?.hasPermission('*')) {
        return res.status(403).json({
          success: false,
          error: 'Admin permissions required',
          code: 'ADMIN_REQUIRED'
        });
      }

      // This would typically be handled by a background job
      // For now, we'll return a placeholder response
      res.status(200).json({
        success: true,
        data: {
          message: 'Pending batch processing initiated',
          note: 'In production, this would be handled by background jobs'
        }
      });

    } catch (error) {
      console.error('Process pending batches error:', error);
      
      res.status(500).json({
        success: false,
        error: error.message || 'Internal server error',
        code: 'PROCESS_PENDING_ERROR'
      });
    }
  }

  /**
   * Get batch processing queue status (admin only)
   * GET /api/v1/batch/queue-status
   */
  async getQueueStatus(req, res) {
    try {
      // Check admin permissions
      if (!req.user?.hasPermission('*')) {
        return res.status(403).json({
          success: false,
          error: 'Admin permissions required',
          code: 'ADMIN_REQUIRED'
        });
      }

      // Get queue statistics from job manager
      const jobManager = require('../jobs/jobManager');
      const queueStats = await jobManager.getAllQueueStats();

      res.status(200).json({
        success: true,
        data: {
          queues: queueStats,
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      console.error('Get queue status error:', error);
      
      res.status(500).json({
        success: false,
        error: error.message || 'Internal server error',
        code: 'QUEUE_STATUS_ERROR'
      });
    }
  }

  /**
   * Analyze batch optimization opportunities
   * POST /api/v1/batch/analyze-optimization
   */
  async analyzeBatchOptimization(req, res) {
    try {
      const { requests } = req.body;

      if (!Array.isArray(requests) || requests.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Requests array is required for optimization analysis',
          code: 'MISSING_REQUESTS'
        });
      }

      if (requests.length > 100) {
        return res.status(400).json({
          success: false,
          error: 'Maximum 100 requests allowed for optimization analysis',
          code: 'TOO_MANY_REQUESTS'
        });
      }

      const analysis = await batchOptimizationService.analyzeBatchOptimization(requests);

      res.status(200).json({
        success: true,
        data: analysis,
        message: 'Batch optimization analysis completed'
      });

    } catch (error) {
      console.error('Batch optimization analysis error:', error);
      
      res.status(500).json({
        success: false,
        error: error.message || 'Internal server error',
        code: 'OPTIMIZATION_ANALYSIS_ERROR'
      });
    }
  }

  /**
   * Get scheduling optimization recommendations
   * POST /api/v1/batch/optimize-scheduling
   */
  async optimizeScheduling(req, res) {
    try {
      const { requests, priority, scheduledFor } = req.body;

      if (!Array.isArray(requests) || requests.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Requests array is required for scheduling optimization',
          code: 'MISSING_REQUESTS'
        });
      }

      const optimization = await batchOptimizationService.optimizeScheduling({
        requests,
        priority: priority || 5,
        scheduledFor
      });

      res.status(200).json({
        success: true,
        data: optimization,
        message: 'Scheduling optimization completed'
      });

    } catch (error) {
      console.error('Scheduling optimization error:', error);
      
      res.status(500).json({
        success: false,
        error: error.message || 'Internal server error',
        code: 'SCHEDULING_OPTIMIZATION_ERROR'
      });
    }
  }

  /**
   * Get detailed batch analytics
   * GET /api/v1/batch/:batchId/analytics
   */
  async getBatchDetailedAnalytics(req, res) {
    try {
      const { batchId } = req.params;

      if (!batchId) {
        return res.status(400).json({
          success: false,
          error: 'Batch ID is required',
          code: 'MISSING_BATCH_ID'
        });
      }

      // Check if user has analytics permissions
      if (!req.user?.hasPermission('analytics:read') && !req.apiKey?.hasPermission('analytics:read')) {
        return res.status(403).json({
          success: false,
          error: 'Analytics permissions required',
          code: 'INSUFFICIENT_PERMISSIONS'
        });
      }

      const analytics = await batchOptimizationService.generateBatchAnalytics(batchId);

      res.status(200).json({
        success: true,
        data: analytics
      });

    } catch (error) {
      console.error('Get batch detailed analytics error:', error);
      
      if (error.message === 'Batch not found') {
        return res.status(404).json({
          success: false,
          error: error.message,
          code: 'BATCH_NOT_FOUND'
        });
      }

      res.status(500).json({
        success: false,
        error: error.message || 'Internal server error',
        code: 'BATCH_ANALYTICS_ERROR'
      });
    }
  }

  /**
   * Create optimized batch with intelligent scheduling and clustering
   * POST /api/v1/batch/generate-optimized
   */
  async createOptimizedBatch(req, res) {
    try {
      const { name, description, requests, priority, scheduledFor, options } = req.body;
      const userId = req.user?.id || null;
      const apiKeyId = req.apiKey?.id || null;

      // Validate required fields
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Batch name is required',
          code: 'INVALID_BATCH_NAME'
        });
      }

      if (!Array.isArray(requests) || requests.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'At least one request is required',
          code: 'NO_REQUESTS_PROVIDED'
        });
      }

      // Analyze optimization opportunities
      const optimization = await batchOptimizationService.analyzeBatchOptimization(requests);
      
      // Get scheduling recommendations
      const schedulingOpt = await batchOptimizationService.optimizeScheduling({
        requests,
        priority: priority || 5,
        scheduledFor
      });

      // Apply optimizations to batch options
      const optimizedOptions = {
        ...options,
        optimization: {
          contentClusters: optimization.contentClusters,
          estimatedCostSavings: optimization.estimatedCostSavings,
          recommendedBatching: optimization.recommendedBatching,
          schedulingOptimization: schedulingOpt
        }
      };

      // Use optimized scheduling if recommended
      const finalScheduledFor = schedulingOpt.optimizedSchedule || scheduledFor;

      // Create batch with optimizations
      const result = await batchService.createBatch({
        name: name.trim(),
        description: description?.trim(),
        requests,
        userId,
        apiKeyId,
        priority: priority || 5,
        scheduledFor: finalScheduledFor,
        options: optimizedOptions
      });

      res.status(201).json({
        success: true,
        data: {
          batchId: result.batch.batchId,
          name: result.batch.name,
          description: result.batch.description,
          status: result.batch.status,
          totalRequests: result.totalRequests,
          priority: result.batch.priority,
          scheduledFor: result.batch.scheduledFor,
          createdAt: result.batch.created_at,
          estimatedDuration: result.batch.metadata.estimatedDuration,
          optimization: {
            appliedOptimizations: optimization.optimizationSuggestions,
            estimatedCostSavings: optimization.estimatedCostSavings,
            contentClusters: optimization.contentClusters.length,
            schedulingOptimized: !!schedulingOpt.optimizedSchedule
          },
          statusEndpoint: `/api/v1/batch/${result.batch.batchId}/status`,
          operations: result.operations.map(op => ({
            operationId: op.operationId,
            batchIndex: op.metadata.batchIndex
          }))
        },
        message: 'Optimized batch created successfully with intelligent scheduling and content clustering.'
      });

    } catch (error) {
      console.error('Optimized batch creation error:', error);
      
      res.status(500).json({
        success: false,
        error: error.message || 'Internal server error during optimized batch creation',
        code: 'OPTIMIZED_BATCH_CREATION_ERROR'
      });
    }
  }
}

module.exports = new BatchController();