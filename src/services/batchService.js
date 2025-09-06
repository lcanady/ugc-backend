const { BatchOperation, UgcOperation } = require('../models');
const operationService = require('./operationService');
const jobManager = require('../jobs/jobManager');
const crypto = require('crypto');

/**
 * Batch Service
 * Manages batch UGC generation operations
 */
class BatchService {
  /**
   * Create a new batch operation
   * @param {Object} batchData - Batch operation data
   * @returns {Promise<Object>} Created batch operation
   */
  async createBatch(batchData) {
    const {
      name,
      description,
      requests,
      userId,
      apiKeyId,
      priority = 5,
      scheduledFor,
      options = {}
    } = batchData;

    // Validate requests
    if (!Array.isArray(requests) || requests.length === 0) {
      throw new Error('Batch must contain at least one request');
    }

    if (requests.length > 100) {
      throw new Error('Batch cannot contain more than 100 requests');
    }

    // Generate batch ID
    const batchId = `batch_${Date.now()}_${crypto.randomBytes(5).toString('hex')}`;

    // Create batch operation
    const batch = await BatchOperation.create({
      batchId,
      name,
      description,
      userId,
      apiKeyId,
      totalOperations: requests.length,
      priority,
      scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
      options,
      metadata: {
        createdBy: userId ? 'user' : 'api_key',
        requestCount: requests.length,
        estimatedDuration: this.estimateBatchDuration(requests),
        contentTypes: this.analyzeContentTypes(requests)
      }
    });

    // Create individual operations for each request
    const operations = [];
    for (let i = 0; i < requests.length; i++) {
      const request = requests[i];
      
      // Validate individual request
      this.validateBatchRequest(request, i);

      const operationId = `${batchId}_op_${i + 1}`;
      
      const operation = await operationService.createOperation({
        operationId,
        creativeBrief: request.creativeBrief,
        apiKeyId,
        userId,
        batchId: batch.id,
        metadata: {
          batchIndex: i,
          batchId: batch.batchId,
          imageCount: request.images?.length || 0,
          hasProvidedScript: !!request.script,
          options: request.options || {},
          priority: batch.priority
        }
      });

      operations.push({
        operation,
        request
      });
    }

    return {
      batch,
      operations: operations.map(op => op.operation),
      totalRequests: requests.length
    };
  }

  /**
   * Process a batch operation
   * @param {string} batchId - Batch ID
   * @returns {Promise<Object>} Processing result
   */
  async processBatch(batchId) {
    const batch = await BatchOperation.findByBatchId(batchId);
    if (!batch) {
      throw new Error('Batch not found');
    }

    if (batch.status !== 'pending') {
      throw new Error(`Batch is not in pending status: ${batch.status}`);
    }

    // Check if scheduled for future
    if (batch.scheduledFor && batch.scheduledFor > new Date()) {
      throw new Error('Batch is scheduled for future processing');
    }

    // Get all operations for this batch
    const operations = await UgcOperation.findAll({
      where: { batchId: batch.id },
      order: [['metadata', 'ASC']] // Order by batch index
    });

    if (operations.length === 0) {
      throw new Error('No operations found for batch');
    }

    // Update batch status to processing
    batch.status = 'processing';
    batch.startedAt = new Date();
    await batch.save();

    // Process operations based on batch options
    const processingStrategy = batch.options.processingStrategy || 'sequential';
    
    let processedCount = 0;
    const results = [];

    try {
      if (processingStrategy === 'parallel') {
        // Process all operations in parallel (with concurrency limit)
        const concurrency = Math.min(batch.options.maxConcurrency || 3, operations.length);
        const chunks = this.chunkArray(operations, concurrency);
        
        for (const chunk of chunks) {
          const chunkPromises = chunk.map(operation => 
            this.processIndividualOperation(operation, batch)
          );
          
          const chunkResults = await Promise.allSettled(chunkPromises);
          results.push(...chunkResults);
          processedCount += chunk.length;
          
          // Update batch progress
          await this.updateBatchProgress(batch.id);
        }
      } else {
        // Sequential processing (default)
        for (const operation of operations) {
          try {
            const result = await this.processIndividualOperation(operation, batch);
            results.push({ status: 'fulfilled', value: result });
            processedCount++;
          } catch (error) {
            results.push({ status: 'rejected', reason: error });
            console.error(`Batch operation ${operation.operationId} failed:`, error.message);
          }
          
          // Update batch progress after each operation
          await this.updateBatchProgress(batch.id);
        }
      }

      // Final batch status update
      await this.updateBatchProgress(batch.id);

      return {
        batchId: batch.batchId,
        status: batch.status,
        processed: processedCount,
        total: operations.length,
        results: results.map((result, index) => ({
          operationId: operations[index].operationId,
          status: result.status,
          result: result.status === 'fulfilled' ? result.value : null,
          error: result.status === 'rejected' ? result.reason.message : null
        }))
      };

    } catch (error) {
      // Mark batch as failed
      batch.status = 'failed';
      batch.errorMessage = error.message;
      batch.completedAt = new Date();
      await batch.save();
      
      throw error;
    }
  }

  /**
   * Process an individual operation within a batch
   * @param {Object} operation - UGC operation
   * @param {Object} batch - Batch operation
   * @returns {Promise<Object>} Operation result
   */
  async processIndividualOperation(operation, batch) {
    try {
      // Get the original request data from batch metadata
      const batchIndex = operation.metadata.batchIndex;
      
      // For now, we'll queue the video generation job
      // In a real implementation, you'd need to store the original request data
      const videoJob = await jobManager.addVideoGenerationJob({
        operationId: operation.operationId,
        batchId: batch.batchId,
        batchIndex,
        creativeBrief: operation.creativeBrief,
        userId: operation.userId,
        userTier: 'basic', // Would need to get from user
        priority: batch.priority
      }, {
        source: 'batch',
        priority: batch.priority,
        scheduledFor: batch.scheduledFor,
        isRetry: false
      });

      // Update operation status
      await operationService.updateOperationStatus(operation.operationId, 'processing', {
        videoJobId: videoJob.id,
        batchProcessingStarted: new Date().toISOString()
      });

      return {
        operationId: operation.operationId,
        jobId: videoJob.id,
        status: 'queued'
      };

    } catch (error) {
      // Update operation as failed
      await operationService.updateOperationStatus(operation.operationId, 'failed', {
        errorMessage: error.message,
        batchProcessingFailed: new Date().toISOString()
      });
      
      throw error;
    }
  }

  /**
   * Update batch progress based on operation statuses
   * @param {string} batchId - Batch ID (UUID)
   * @returns {Promise<Object>} Updated batch
   */
  async updateBatchProgress(batchId) {
    const batch = await BatchOperation.findByPk(batchId);
    if (!batch) {
      throw new Error('Batch not found');
    }

    // Get operation counts
    const operations = await UgcOperation.findAll({
      where: { batchId: batch.id },
      attributes: ['status']
    });

    const statusCounts = operations.reduce((counts, op) => {
      counts[op.status] = (counts[op.status] || 0) + 1;
      return counts;
    }, {});

    // Update batch counters
    batch.completedOperations = (statusCounts.completed || 0);
    batch.failedOperations = (statusCounts.failed || 0);

    // Update batch progress
    await batch.updateProgress();

    return batch;
  }

  /**
   * Get batch status with detailed information
   * @param {string} batchId - Batch ID
   * @returns {Promise<Object>} Batch status
   */
  async getBatchStatus(batchId) {
    const batch = await BatchOperation.findByBatchId(batchId);
    if (!batch) {
      return null;
    }

    // Get operations with their current status
    const operations = await UgcOperation.findAll({
      where: { batchId: batch.id },
      order: [['metadata', 'ASC']],
      attributes: ['operationId', 'status', 'errorMessage', 'metadata', 'created_at', 'updated_at']
    });

    const progress = batch.getProgress();
    const duration = batch.getDuration();
    const estimatedTimeRemaining = batch.getEstimatedTimeRemaining();

    return {
      batchId: batch.batchId,
      name: batch.name,
      description: batch.description,
      status: batch.status,
      priority: batch.priority,
      progress,
      duration: duration ? Math.round(duration / 1000) : null, // seconds
      estimatedTimeRemaining,
      scheduledFor: batch.scheduledFor,
      startedAt: batch.startedAt,
      completedAt: batch.completedAt,
      errorMessage: batch.errorMessage,
      operations: operations.map(op => ({
        operationId: op.operationId,
        status: op.status,
        errorMessage: op.errorMessage,
        batchIndex: op.metadata?.batchIndex,
        createdAt: op.created_at,
        updatedAt: op.updated_at
      })),
      metadata: batch.metadata,
      options: batch.options,
      createdAt: batch.created_at,
      updatedAt: batch.updated_at
    };
  }

  /**
   * Get batch results with download links
   * @param {string} batchId - Batch ID
   * @returns {Promise<Object>} Batch results
   */
  async getBatchResults(batchId) {
    const batch = await BatchOperation.findByBatchId(batchId);
    if (!batch) {
      throw new Error('Batch not found');
    }

    if (!batch.isCompleted()) {
      throw new Error('Batch is not yet completed');
    }

    // Get all operations with their results
    const operations = await UgcOperation.findAll({
      where: { batchId: batch.id },
      order: [['metadata', 'ASC']]
    });

    const results = operations.map(op => ({
      operationId: op.operationId,
      batchIndex: op.metadata?.batchIndex,
      status: op.status,
      creativeBrief: op.creativeBrief,
      scriptContent: op.scriptContent,
      videoUrls: op.videoUrls,
      errorMessage: op.errorMessage,
      completedAt: op.completedAt
    }));

    // Separate successful and failed results
    const successful = results.filter(r => r.status === 'completed');
    const failed = results.filter(r => r.status === 'failed');

    return {
      batchId: batch.batchId,
      name: batch.name,
      status: batch.status,
      progress: batch.getProgress(),
      results: {
        successful,
        failed,
        total: results.length
      },
      downloadUrl: successful.length > 0 ? `/api/v1/batch/${batchId}/download` : null,
      completedAt: batch.completedAt
    };
  }

  /**
   * Cancel a batch operation
   * @param {string} batchId - Batch ID
   * @returns {Promise<Object>} Cancellation result
   */
  async cancelBatch(batchId) {
    const batch = await BatchOperation.findByBatchId(batchId);
    if (!batch) {
      throw new Error('Batch not found');
    }

    if (batch.isCompleted()) {
      throw new Error('Cannot cancel completed batch');
    }

    // Cancel all pending operations
    const operations = await UgcOperation.findAll({
      where: { 
        batchId: batch.id,
        status: ['pending', 'processing']
      }
    });

    let cancelledCount = 0;
    for (const operation of operations) {
      try {
        await operationService.updateOperationStatus(operation.operationId, 'cancelled', {
          cancelledAt: new Date().toISOString(),
          cancelReason: 'Batch cancelled by user'
        });
        cancelledCount++;
      } catch (error) {
        console.error(`Failed to cancel operation ${operation.operationId}:`, error.message);
      }
    }

    // Update batch status
    batch.status = 'cancelled';
    batch.completedAt = new Date();
    batch.errorMessage = `Batch cancelled by user. ${cancelledCount} operations cancelled.`;
    await batch.save();

    return {
      batchId: batch.batchId,
      status: batch.status,
      cancelledOperations: cancelledCount,
      totalOperations: operations.length
    };
  }

  /**
   * Get batch history for user or API key
   * @param {Object} filters - Filter options
   * @returns {Promise<Array>} Batch history
   */
  async getBatchHistory(filters = {}) {
    const { userId, apiKeyId, limit = 50, status, startDate, endDate } = filters;

    const whereClause = {};
    if (userId) whereClause.userId = userId;
    if (apiKeyId) whereClause.apiKeyId = apiKeyId;
    if (status) whereClause.status = status;
    if (startDate) {
      whereClause.created_at = whereClause.created_at || {};
      whereClause.created_at[require('sequelize').Op.gte] = new Date(startDate);
    }
    if (endDate) {
      whereClause.created_at = whereClause.created_at || {};
      whereClause.created_at[require('sequelize').Op.lte] = new Date(endDate);
    }

    const batches = await BatchOperation.findAll({
      where: whereClause,
      order: [['created_at', 'DESC']],
      limit,
      include: [
        {
          model: require('../models').ApiKey,
          as: 'apiKey',
          attributes: ['id', 'name']
        },
        {
          model: require('../models').User,
          as: 'user',
          attributes: ['id', 'name', 'email']
        }
      ]
    });

    return batches.map(batch => ({
      batchId: batch.batchId,
      name: batch.name,
      description: batch.description,
      status: batch.status,
      progress: batch.getProgress(),
      priority: batch.priority,
      scheduledFor: batch.scheduledFor,
      startedAt: batch.startedAt,
      completedAt: batch.completedAt,
      duration: batch.getDuration(),
      createdAt: batch.created_at,
      apiKey: batch.apiKey,
      user: batch.user
    }));
  }

  /**
   * Get batch analytics and statistics
   * @param {Object} filters - Filter options
   * @returns {Promise<Object>} Batch analytics
   */
  async getBatchAnalytics(filters = {}) {
    const stats = await BatchOperation.getBatchStats(filters);
    
    // Calculate totals
    const totals = stats.reduce((acc, stat) => {
      acc.totalBatches += parseInt(stat.dataValues.count);
      acc.totalOperations += parseInt(stat.dataValues.totalOperations || 0);
      acc.completedOperations += parseInt(stat.dataValues.completedOperations || 0);
      acc.failedOperations += parseInt(stat.dataValues.failedOperations || 0);
      return acc;
    }, {
      totalBatches: 0,
      totalOperations: 0,
      completedOperations: 0,
      failedOperations: 0
    });

    // Calculate success rate
    const successRate = totals.totalOperations > 0 
      ? Math.round((totals.completedOperations / totals.totalOperations) * 100)
      : 0;

    return {
      summary: {
        ...totals,
        successRate,
        averageOperationsPerBatch: totals.totalBatches > 0 
          ? Math.round(totals.totalOperations / totals.totalBatches)
          : 0
      },
      statusBreakdown: stats.map(stat => ({
        status: stat.status,
        count: parseInt(stat.dataValues.count),
        totalOperations: parseInt(stat.dataValues.totalOperations || 0),
        completedOperations: parseInt(stat.dataValues.completedOperations || 0),
        failedOperations: parseInt(stat.dataValues.failedOperations || 0),
        avgDurationSeconds: parseFloat(stat.dataValues.avgDurationSeconds || 0)
      }))
    };
  }

  // Helper methods

  /**
   * Validate a batch request
   * @param {Object} request - Request to validate
   * @param {number} index - Request index
   */
  validateBatchRequest(request, index) {
    if (!request.creativeBrief || typeof request.creativeBrief !== 'string') {
      throw new Error(`Request ${index + 1}: Creative brief is required`);
    }

    if (request.creativeBrief.length > 5000) {
      throw new Error(`Request ${index + 1}: Creative brief too long (max 5000 characters)`);
    }

    if (request.images && (!Array.isArray(request.images) || request.images.length === 0)) {
      throw new Error(`Request ${index + 1}: At least one image is required`);
    }

    if (request.images && request.images.length > 10) {
      throw new Error(`Request ${index + 1}: Too many images (max 10)`);
    }
  }

  /**
   * Estimate batch processing duration
   * @param {Array} requests - Batch requests
   * @returns {number} Estimated duration in seconds
   */
  estimateBatchDuration(requests) {
    // Base estimate: 5 minutes per request
    const baseTimePerRequest = 5 * 60; // 5 minutes in seconds
    
    // Adjust based on complexity
    const totalTime = requests.reduce((total, request) => {
      let requestTime = baseTimePerRequest;
      
      // More images = more time
      if (request.images) {
        requestTime += (request.images.length - 1) * 30; // 30 seconds per additional image
      }
      
      // Longer creative brief = slightly more time
      if (request.creativeBrief && request.creativeBrief.length > 1000) {
        requestTime += 30;
      }
      
      return total + requestTime;
    }, 0);

    return totalTime;
  }

  /**
   * Analyze content types in batch requests
   * @param {Array} requests - Batch requests
   * @returns {Object} Content analysis
   */
  analyzeContentTypes(requests) {
    const analysis = {
      totalRequests: requests.length,
      hasCustomScripts: 0,
      averageImageCount: 0,
      averageBriefLength: 0
    };

    let totalImages = 0;
    let totalBriefLength = 0;

    requests.forEach(request => {
      if (request.script) {
        analysis.hasCustomScripts++;
      }
      
      if (request.images) {
        totalImages += request.images.length;
      }
      
      if (request.creativeBrief) {
        totalBriefLength += request.creativeBrief.length;
      }
    });

    analysis.averageImageCount = Math.round(totalImages / requests.length);
    analysis.averageBriefLength = Math.round(totalBriefLength / requests.length);

    return analysis;
  }

  /**
   * Split array into chunks
   * @param {Array} array - Array to chunk
   * @param {number} size - Chunk size
   * @returns {Array} Chunked array
   */
  chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}

module.exports = new BatchService();