const operationService = require('./operationService');
const databaseService = require('./databaseService');

/**
 * Service for managing database cleanup jobs
 */
class CleanupService {
  constructor() {
    this.isRunning = false;
    this.intervalId = null;
    this.config = {
      // Run cleanup every 24 hours
      intervalMs: 24 * 60 * 60 * 1000,
      // Default retention periods
      operationRetentionDays: 30,
      usageRetentionDays: 90,
      // Batch processing
      batchSize: 1000
    };
  }

  /**
   * Start the cleanup service
   * @param {Object} options - Configuration options
   */
  start(options = {}) {
    if (this.isRunning) {
      console.log('Cleanup service is already running');
      return;
    }

    // Update configuration
    this.config = { ...this.config, ...options };

    console.log('Starting cleanup service...');
    console.log(`- Operation retention: ${this.config.operationRetentionDays} days`);
    console.log(`- Usage retention: ${this.config.usageRetentionDays} days`);
    console.log(`- Cleanup interval: ${this.config.intervalMs / 1000 / 60 / 60} hours`);

    // Run initial cleanup
    this.runCleanup();

    // Schedule periodic cleanup
    this.intervalId = setInterval(() => {
      this.runCleanup();
    }, this.config.intervalMs);

    this.isRunning = true;
  }

  /**
   * Stop the cleanup service
   */
  stop() {
    if (!this.isRunning) {
      console.log('Cleanup service is not running');
      return;
    }

    console.log('Stopping cleanup service...');
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.isRunning = false;
  }

  /**
   * Run cleanup operations
   */
  async runCleanup() {
    try {
      console.log('Starting database cleanup...');
      const startTime = Date.now();

      const results = await Promise.all([
        this.cleanupOldOperations(),
        this.cleanupOldUsageLogs(),
        this.cleanupExpiredTokens()
      ]);

      const duration = Date.now() - startTime;
      
      console.log('Database cleanup completed:', {
        duration: `${duration}ms`,
        operationsDeleted: results[0].deletedCount,
        usageLogsDeleted: results[1].deletedCount,
        tokensDeleted: results[2].deletedCount
      });

    } catch (error) {
      console.error('Cleanup failed:', error.message);
    }
  }

  /**
   * Clean up old UGC operations
   * @returns {Promise<Object>} Cleanup results
   */
  async cleanupOldOperations() {
    try {
      const result = await operationService.cleanupOldOperations({
        retentionDays: this.config.operationRetentionDays,
        batchSize: this.config.batchSize
      });

      return {
        deletedCount: result.deletedCount,
        type: 'operations'
      };
    } catch (error) {
      console.error('Failed to cleanup old operations:', error.message);
      return { deletedCount: 0, type: 'operations', error: error.message };
    }
  }

  /**
   * Clean up old usage logs
   * @returns {Promise<Object>} Cleanup results
   */
  async cleanupOldUsageLogs() {
    try {
      const result = await databaseService.cleanup({
        usageRetentionDays: this.config.usageRetentionDays
      });

      return {
        deletedCount: result.oldUsageLogsRemoved || 0,
        type: 'usage_logs'
      };
    } catch (error) {
      console.error('Failed to cleanup old usage logs:', error.message);
      return { deletedCount: 0, type: 'usage_logs', error: error.message };
    }
  }

  /**
   * Clean up expired refresh tokens
   * @returns {Promise<Object>} Cleanup results
   */
  async cleanupExpiredTokens() {
    try {
      const result = await databaseService.cleanup({});

      return {
        deletedCount: result.expiredTokensRemoved || 0,
        type: 'expired_tokens'
      };
    } catch (error) {
      console.error('Failed to cleanup expired tokens:', error.message);
      return { deletedCount: 0, type: 'expired_tokens', error: error.message };
    }
  }

  /**
   * Run cleanup manually
   * @param {Object} options - Cleanup options
   * @returns {Promise<Object>} Cleanup results
   */
  async runManualCleanup(options = {}) {
    try {
      console.log('Running manual cleanup...');
      
      const config = { ...this.config, ...options };
      const startTime = Date.now();

      const results = {
        operations: await operationService.cleanupOldOperations({
          retentionDays: config.operationRetentionDays,
          batchSize: config.batchSize
        }),
        database: await databaseService.cleanup({
          operationRetentionDays: config.operationRetentionDays,
          usageRetentionDays: config.usageRetentionDays
        })
      };

      const duration = Date.now() - startTime;

      return {
        success: true,
        duration,
        results: {
          operationsDeleted: results.operations.deletedCount,
          usageLogsDeleted: results.database.oldUsageLogsRemoved || 0,
          tokensDeleted: results.database.expiredTokensRemoved || 0
        },
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('Manual cleanup failed:', error.message);
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Get cleanup service status
   * @returns {Object} Service status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      config: this.config,
      nextCleanup: this.intervalId ? 
        new Date(Date.now() + this.config.intervalMs).toISOString() : 
        null
    };
  }

  /**
   * Update cleanup configuration
   * @param {Object} newConfig - New configuration
   */
  updateConfig(newConfig) {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...newConfig };

    console.log('Cleanup configuration updated:', {
      old: oldConfig,
      new: this.config
    });

    // Restart if running and interval changed
    if (this.isRunning && newConfig.intervalMs && newConfig.intervalMs !== oldConfig.intervalMs) {
      console.log('Restarting cleanup service with new interval...');
      this.stop();
      this.start();
    }
  }
}

// Export singleton instance
module.exports = new CleanupService();