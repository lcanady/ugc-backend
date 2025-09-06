const { sequelize } = require('../config/database');
const models = require('../models');

/**
 * Database service for managing database operations and health
 */
class DatabaseService {
  constructor() {
    this.sequelize = sequelize;
    this.models = models;
  }

  /**
   * Initialize database connection and sync models
   * @param {boolean} force - Whether to force sync (drops tables)
   * @returns {Promise<boolean>} Success status
   */
  async initialize(force = false) {
    try {
      // Test connection
      await this.sequelize.authenticate();
      console.log('Database connection established successfully.');

      // Sync models
      await this.sequelize.sync({ force });
      console.log('Database models synchronized successfully.');

      return true;
    } catch (error) {
      console.error('Database initialization failed:', error.message);
      throw error;
    }
  }

  /**
   * Check database health
   * @returns {Promise<object>} Health status
   */
  async checkHealth() {
    try {
      await this.sequelize.authenticate();
      
      // Get connection pool info
      const pool = this.sequelize.connectionManager.pool;
      
      return {
        status: 'healthy',
        connection: 'active',
        pool: {
          size: pool ? pool.size : 0,
          available: pool ? pool.available : 0,
          using: pool ? pool.using : 0,
          waiting: pool ? pool.waiting : 0
        },
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        connection: 'failed',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Execute a raw SQL query
   * @param {string} query - SQL query
   * @param {object} options - Query options
   * @returns {Promise<any>} Query result
   */
  async query(query, options = {}) {
    try {
      return await this.sequelize.query(query, {
        type: this.sequelize.QueryTypes.SELECT,
        ...options
      });
    } catch (error) {
      console.error('Database query failed:', error.message);
      throw error;
    }
  }

  /**
   * Start a database transaction
   * @returns {Promise<Transaction>} Transaction instance
   */
  async startTransaction() {
    return await this.sequelize.transaction();
  }

  /**
   * Get database statistics
   * @returns {Promise<object>} Database statistics
   */
  async getStatistics() {
    try {
      const stats = {};

      // Get table counts
      for (const [modelName, model] of Object.entries(this.models)) {
        if (modelName !== 'sequelize') {
          stats[modelName.toLowerCase() + 'Count'] = await model.count();
        }
      }

      // Get recent activity (last 24 hours)
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const { Op } = require('sequelize');
      
      stats.recentOperations = await this.models.UgcOperation.count({
        where: {
          created_at: { [Op.gte]: yesterday }
        }
      });

      stats.recentApiUsage = await this.models.ApiUsage.count({
        where: {
          created_at: { [Op.gte]: yesterday }
        }
      });

      return stats;
    } catch (error) {
      console.error('Failed to get database statistics:', error.message);
      throw error;
    }
  }

  /**
   * Clean up old data
   * @param {object} options - Cleanup options
   * @returns {Promise<object>} Cleanup results
   */
  async cleanup(options = {}) {
    const results = {};

    try {
      // Clean up expired refresh tokens
      const expiredTokens = await this.models.RefreshToken.cleanupExpired();
      results.expiredTokensRemoved = expiredTokens[0];

      // Clean up old UGC operations (default: 30 days)
      const daysOld = options.operationRetentionDays || 30;
      const oldOperations = await this.models.UgcOperation.cleanupOldOperations(daysOld);
      results.oldOperationsRemoved = oldOperations;

      // Clean up old API usage logs (default: 90 days)
      const usageRetentionDays = options.usageRetentionDays || 90;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - usageRetentionDays);
      
      const { Op } = require('sequelize');
      
      const oldUsage = await this.models.ApiUsage.destroy({
        where: {
          created_at: { [Op.lt]: cutoffDate }
        }
      });
      results.oldUsageLogsRemoved = oldUsage;

      console.log('Database cleanup completed:', results);
      return results;
    } catch (error) {
      console.error('Database cleanup failed:', error.message);
      throw error;
    }
  }

  /**
   * Close database connection
   * @returns {Promise<void>}
   */
  async close() {
    try {
      await this.sequelize.close();
      console.log('Database connection closed.');
    } catch (error) {
      console.error('Error closing database connection:', error.message);
      throw error;
    }
  }

  /**
   * Get all models
   * @returns {object} Models object
   */
  getModels() {
    return this.models;
  }

  /**
   * Get specific model
   * @param {string} modelName - Name of the model
   * @returns {Model} Sequelize model
   */
  getModel(modelName) {
    return this.models[modelName];
  }
}

// Export singleton instance
module.exports = new DatabaseService();