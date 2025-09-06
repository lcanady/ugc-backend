const crypto = require('crypto');
const { Op } = require('sequelize');
const models = require('../models');

/**
 * Service for managing UGC operation persistence and tracking
 */
class OperationService {
  /**
   * Create a new UGC operation record
   * @param {Object} params - Operation parameters
   * @returns {Promise<Object>} Created operation
   */
  async createOperation({ creativeBrief, apiKeyId, userId, metadata = {} }) {
    try {
      const operationId = `op_${crypto.randomUUID().replace(/-/g, '').substring(0, 16)}`;
      
      const operation = await models.UgcOperation.create({
        operationId,
        apiKeyId,
        userId,
        status: 'pending',
        creativeBrief,
        metadata: {
          ...metadata,
          createdAt: new Date().toISOString(),
          version: '1.0.0'
        }
      });

      return operation;
    } catch (error) {
      console.error('Failed to create operation:', error.message);
      throw new Error(`Operation creation failed: ${error.message}`);
    }
  }

  /**
   * Update operation status
   * @param {string} operationId - Operation ID
   * @param {string} status - New status
   * @param {Object} updates - Additional updates
   * @returns {Promise<Object>} Updated operation
   */
  async updateOperationStatus(operationId, status, updates = {}) {
    try {
      const operation = await models.UgcOperation.findByOperationId(operationId);
      
      if (!operation) {
        throw new Error(`Operation not found: ${operationId}`);
      }

      // Update status and any additional fields
      await operation.updateStatus(status, updates.errorMessage);
      
      // Update other fields if provided
      if (updates.scriptContent) {
        operation.scriptContent = updates.scriptContent;
      }
      
      if (updates.videoUrls) {
        operation.videoUrls = updates.videoUrls;
      }
      
      if (updates.metadata) {
        operation.metadata = { ...operation.metadata, ...updates.metadata };
      }

      await operation.save();
      return operation;
    } catch (error) {
      console.error('Failed to update operation status:', error.message);
      throw new Error(`Operation update failed: ${error.message}`);
    }
  }

  /**
   * Get operation by ID
   * @param {string} operationId - Operation ID
   * @returns {Promise<Object|null>} Operation or null if not found
   */
  async getOperation(operationId) {
    try {
      return await models.UgcOperation.findByOperationId(operationId);
    } catch (error) {
      console.error('Failed to get operation:', error.message);
      throw new Error(`Operation retrieval failed: ${error.message}`);
    }
  }

  /**
   * Get operations for a user
   * @param {string} userId - User ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} User operations
   */
  async getUserOperations(userId, options = {}) {
    try {
      const { limit = 50, status, startDate, endDate } = options;
      
      const whereClause = { userId };
      
      if (status) {
        whereClause.status = status;
      }
      
      if (startDate || endDate) {
        whereClause.created_at = {};
        if (startDate) whereClause.created_at[Op.gte] = startDate;
        if (endDate) whereClause.created_at[Op.lte] = endDate;
      }

      return await models.UgcOperation.findAll({
        where: whereClause,
        order: [['created_at', 'DESC']],
        limit,
        include: [{
          model: models.ApiKey,
          as: 'apiKey',
          attributes: ['id', 'name']
        }]
      });
    } catch (error) {
      console.error('Failed to get user operations:', error.message);
      throw new Error(`User operations retrieval failed: ${error.message}`);
    }
  }

  /**
   * Get operations for an API key
   * @param {string} apiKeyId - API Key ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} API key operations
   */
  async getApiKeyOperations(apiKeyId, options = {}) {
    try {
      const { limit = 50, status, startDate, endDate } = options;
      
      const whereClause = { apiKeyId };
      
      if (status) {
        whereClause.status = status;
      }
      
      if (startDate || endDate) {
        whereClause.created_at = {};
        if (startDate) whereClause.created_at[Op.gte] = startDate;
        if (endDate) whereClause.created_at[Op.lte] = endDate;
      }

      return await models.UgcOperation.findAll({
        where: whereClause,
        order: [['created_at', 'DESC']],
        limit,
        include: [{
          model: models.User,
          as: 'user',
          attributes: ['id', 'name', 'email']
        }]
      });
    } catch (error) {
      console.error('Failed to get API key operations:', error.message);
      throw new Error(`API key operations retrieval failed: ${error.message}`);
    }
  }

  /**
   * Get operation statistics
   * @param {Object} filters - Filter options
   * @returns {Promise<Object>} Operation statistics
   */
  async getOperationStats(filters = {}) {
    try {
      const stats = await models.UgcOperation.getOperationStats(filters);
      
      // Convert to more readable format
      const formattedStats = {
        totalOperations: 0,
        byStatus: {},
        averageDuration: null
      };

      stats.forEach(stat => {
        const count = parseInt(stat.dataValues.count);
        const avgDuration = stat.dataValues.avgDurationSeconds;
        
        formattedStats.totalOperations += count;
        formattedStats.byStatus[stat.status] = {
          count,
          averageDurationSeconds: avgDuration ? parseFloat(avgDuration) : null
        };
      });

      // Calculate overall average duration
      const completedStats = formattedStats.byStatus.completed;
      if (completedStats && completedStats.averageDurationSeconds) {
        formattedStats.averageDuration = completedStats.averageDurationSeconds;
      }

      return formattedStats;
    } catch (error) {
      console.error('Failed to get operation stats:', error.message);
      throw new Error(`Operation stats retrieval failed: ${error.message}`);
    }
  }

  /**
   * Check user quotas
   * @param {string} userId - User ID
   * @param {Object} quotaLimits - Quota limits
   * @returns {Promise<Object>} Quota status
   */
  async checkUserQuotas(userId, quotaLimits = {}) {
    try {
      const {
        dailyLimit = 100,
        monthlyLimit = 1000,
        concurrentLimit = 5
      } = quotaLimits;

      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      // Check daily usage
      const dailyCount = await models.UgcOperation.count({
        where: {
          userId,
          created_at: { [Op.gte]: today }
        }
      });

      // Check monthly usage
      const monthlyCount = await models.UgcOperation.count({
        where: {
          userId,
          created_at: { [Op.gte]: thisMonth }
        }
      });

      // Check concurrent operations
      const concurrentCount = await models.UgcOperation.count({
        where: {
          userId,
          status: { [Op.in]: ['pending', 'processing'] }
        }
      });

      return {
        daily: {
          used: dailyCount,
          limit: dailyLimit,
          remaining: Math.max(0, dailyLimit - dailyCount),
          exceeded: dailyCount >= dailyLimit
        },
        monthly: {
          used: monthlyCount,
          limit: monthlyLimit,
          remaining: Math.max(0, monthlyLimit - monthlyCount),
          exceeded: monthlyCount >= monthlyLimit
        },
        concurrent: {
          used: concurrentCount,
          limit: concurrentLimit,
          remaining: Math.max(0, concurrentLimit - concurrentCount),
          exceeded: concurrentCount >= concurrentLimit
        }
      };
    } catch (error) {
      console.error('Failed to check user quotas:', error.message);
      throw new Error(`Quota check failed: ${error.message}`);
    }
  }

  /**
   * Clean up old operations
   * @param {Object} options - Cleanup options
   * @returns {Promise<Object>} Cleanup results
   */
  async cleanupOldOperations(options = {}) {
    try {
      const {
        retentionDays = 30,
        batchSize = 1000,
        dryRun = false
      } = options;

      const results = await models.UgcOperation.cleanupOldOperations(retentionDays);
      
      return {
        deletedCount: results,
        retentionDays,
        dryRun,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Failed to cleanup old operations:', error.message);
      throw new Error(`Operation cleanup failed: ${error.message}`);
    }
  }

  /**
   * Add workflow step to operation metadata
   * @param {string} operationId - Operation ID
   * @param {Object} step - Workflow step
   * @returns {Promise<void>}
   */
  async addWorkflowStep(operationId, step) {
    try {
      const operation = await models.UgcOperation.findByOperationId(operationId);
      
      if (!operation) {
        throw new Error(`Operation not found: ${operationId}`);
      }

      const metadata = operation.metadata || {};
      const workflow = metadata.workflow || { steps: [] };
      
      workflow.steps.push({
        ...step,
        timestamp: new Date().toISOString()
      });

      metadata.workflow = workflow;
      operation.metadata = metadata;
      operation.changed('metadata', true);
      
      await operation.save();
    } catch (error) {
      console.error('Failed to add workflow step:', error.message);
      throw new Error(`Workflow step addition failed: ${error.message}`);
    }
  }

  /**
   * Get operation history for analytics
   * @param {Object} filters - Filter options
   * @returns {Promise<Array>} Operation history
   */
  async getOperationHistory(filters = {}) {
    try {
      const {
        userId,
        apiKeyId,
        startDate,
        endDate,
        status,
        limit = 100
      } = filters;

      const whereClause = {};
      
      if (userId) whereClause.userId = userId;
      if (apiKeyId) whereClause.apiKeyId = apiKeyId;
      if (status) whereClause.status = status;
      
      if (startDate || endDate) {
        whereClause.created_at = {};
        if (startDate) whereClause.created_at[Op.gte] = startDate;
        if (endDate) whereClause.created_at[Op.lte] = endDate;
      }

      return await models.UgcOperation.findAll({
        where: whereClause,
        order: [['created_at', 'DESC']],
        limit,
        include: [
          {
            model: models.User,
            as: 'user',
            attributes: ['id', 'name', 'email']
          },
          {
            model: models.ApiKey,
            as: 'apiKey',
            attributes: ['id', 'name']
          }
        ]
      });
    } catch (error) {
      console.error('Failed to get operation history:', error.message);
      throw new Error(`Operation history retrieval failed: ${error.message}`);
    }
  }
}

// Export singleton instance
module.exports = new OperationService();