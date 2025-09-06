const cacheService = require('../services/cacheService');

/**
 * Controller for cache management and monitoring endpoints
 */
class CacheController {
  /**
   * Get cache metrics and statistics
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async getMetrics(req, res) {
    try {
      const metrics = await cacheService.getMetrics();

      res.json({
        success: true,
        data: {
          metrics,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Error getting cache metrics:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'CACHE_METRICS_ERROR',
          message: 'Failed to retrieve cache metrics',
          details: error.message
        }
      });
    }
  }

  /**
   * Get cache health status
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async getHealth(req, res) {
    try {
      const health = await cacheService.healthCheck();

      const statusCode = health.status === 'healthy' ? 200 :
        health.status === 'degraded' ? 200 : 503;

      res.status(statusCode).json({
        success: health.status !== 'unhealthy',
        data: health
      });
    } catch (error) {
      console.error('Error checking cache health:', error);
      res.status(503).json({
        success: false,
        error: {
          code: 'CACHE_HEALTH_ERROR',
          message: 'Failed to check cache health',
          details: error.message
        }
      });
    }
  }

  /**
   * Invalidate cache by pattern
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async invalidateCache(req, res) {
    try {
      const { pattern, type } = req.body;

      let deletedCount = 0;

      if (type === 'image-analysis') {
        deletedCount = await cacheService.invalidateImageAnalysisCache();
      } else if (type === 'script-generation') {
        deletedCount = await cacheService.invalidateScriptCache();
      } else if (pattern) {
        deletedCount = await cacheService.invalidateByPattern(pattern);
      } else {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_INVALIDATION_REQUEST',
            message: 'Must specify either type (image-analysis, script-generation) or pattern'
          }
        });
      }

      res.json({
        success: true,
        data: {
          deletedCount,
          type: type || 'pattern',
          pattern: pattern || (type === 'image-analysis' ? 'image-analysis:*' : 'script:*'),
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Error invalidating cache:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'CACHE_INVALIDATION_ERROR',
          message: 'Failed to invalidate cache',
          details: error.message
        }
      });
    }
  }

  /**
   * Reset cache metrics
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async resetMetrics(req, res) {
    try {
      cacheService.resetMetrics();

      res.json({
        success: true,
        data: {
          message: 'Cache metrics reset successfully',
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Error resetting cache metrics:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'CACHE_RESET_ERROR',
          message: 'Failed to reset cache metrics',
          details: error.message
        }
      });
    }
  }

  /**
   * Warm cache with provided data
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async warmCache(req, res) {
    try {
      const { images = [] } = req.body;

      if (!Array.isArray(images)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_WARM_REQUEST',
            message: 'Images must be an array'
          }
        });
      }

      const warmedCount = await cacheService.warmImageAnalysisCache(images);

      res.json({
        success: true,
        data: {
          warmedCount,
          totalProvided: images.length,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Error warming cache:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'CACHE_WARM_ERROR',
          message: 'Failed to warm cache',
          details: error.message
        }
      });
    }
  }
}

module.exports = new CacheController();