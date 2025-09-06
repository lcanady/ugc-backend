const redis = require('redis');
const crypto = require('crypto');
const config = require('../utils/config');

/**
 * Redis-based caching service for UGC API
 * Provides caching for image analysis and script generation results
 */
class CacheService {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.metrics = {
      hits: 0,
      misses: 0,
      sets: 0,
      errors: 0,
      totalRequests: 0
    };
    
    // Cache configuration
    this.config = {
      imageAnalysisTTL: 24 * 60 * 60, // 24 hours in seconds
      scriptGenerationTTL: 4 * 60 * 60, // 4 hours in seconds
      defaultTTL: 60 * 60, // 1 hour in seconds
      keyPrefix: 'ugc-api:',
      maxRetries: 3,
      retryDelay: 1000
    };
  }

  /**
   * Initialize Redis connection
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
      
      this.client = redis.createClient({
        url: redisUrl,
        retry_strategy: (options) => {
          if (options.error && options.error.code === 'ECONNREFUSED') {
            console.warn('Redis connection refused, retrying...');
          }
          if (options.total_retry_time > 1000 * 60 * 60) {
            return new Error('Redis retry time exhausted');
          }
          if (options.attempt > this.config.maxRetries) {
            return new Error('Redis max retry attempts reached');
          }
          return Math.min(options.attempt * this.config.retryDelay, 3000);
        }
      });

      this.client.on('error', (err) => {
        console.error('Redis Client Error:', err);
        this.metrics.errors++;
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        console.log('Redis Client Connected');
        this.isConnected = true;
      });

      this.client.on('ready', () => {
        console.log('Redis Client Ready');
        this.isConnected = true;
      });

      this.client.on('end', () => {
        console.log('Redis Client Disconnected');
        this.isConnected = false;
      });

      await this.client.connect();
      console.log('Redis cache service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Redis cache service:', error.message);
      // Don't throw error - allow app to continue without caching
      this.isConnected = false;
    }
  }

  /**
   * Generate cache key for image analysis
   * @param {Buffer} imageBuffer - Image buffer
   * @param {Object} options - Analysis options
   * @returns {string} Cache key
   */
  generateImageAnalysisKey(imageBuffer, options = {}) {
    const imageHash = crypto.createHash('sha256').update(imageBuffer).digest('hex');
    const optionsHash = crypto.createHash('md5').update(JSON.stringify(options)).digest('hex');
    return `${this.config.keyPrefix}image-analysis:${imageHash}:${optionsHash}`;
  }

  /**
   * Generate cache key for script generation
   * @param {string} creativeBrief - Creative brief
   * @param {Array} imageAnalysis - Image analysis results
   * @param {string} optionalScript - Optional user script
   * @returns {string} Cache key
   */
  generateScriptKey(creativeBrief, imageAnalysis, optionalScript = null) {
    const briefHash = crypto.createHash('md5').update(creativeBrief).digest('hex');
    const analysisHash = crypto.createHash('md5').update(JSON.stringify(imageAnalysis)).digest('hex');
    const scriptHash = optionalScript ? 
      crypto.createHash('md5').update(optionalScript).digest('hex') : 'none';
    
    return `${this.config.keyPrefix}script:${briefHash}:${analysisHash}:${scriptHash}`;
  }

  /**
   * Get cached image analysis result
   * @param {Buffer} imageBuffer - Image buffer
   * @param {Object} options - Analysis options
   * @returns {Promise<Object|null>} Cached result or null
   */
  async getCachedImageAnalysis(imageBuffer, options = {}) {
    if (!this.isConnected) {
      return null;
    }

    try {
      this.metrics.totalRequests++;
      const key = this.generateImageAnalysisKey(imageBuffer, options);
      const cached = await this.client.get(key);
      
      if (cached) {
        this.metrics.hits++;
        const result = JSON.parse(cached);
        console.log(`Cache HIT for image analysis: ${key.substring(0, 50)}...`);
        return result;
      } else {
        this.metrics.misses++;
        console.log(`Cache MISS for image analysis: ${key.substring(0, 50)}...`);
        return null;
      }
    } catch (error) {
      console.error('Error getting cached image analysis:', error.message);
      this.metrics.errors++;
      return null;
    }
  }

  /**
   * Cache image analysis result
   * @param {Buffer} imageBuffer - Image buffer
   * @param {Object} options - Analysis options
   * @param {Object} result - Analysis result to cache
   * @returns {Promise<boolean>} Success status
   */
  async setCachedImageAnalysis(imageBuffer, options = {}, result) {
    if (!this.isConnected || !result) {
      return false;
    }

    try {
      const key = this.generateImageAnalysisKey(imageBuffer, options);
      const serialized = JSON.stringify({
        ...result,
        cachedAt: new Date().toISOString(),
        cacheKey: key
      });
      
      await this.client.setEx(key, this.config.imageAnalysisTTL, serialized);
      this.metrics.sets++;
      console.log(`Cached image analysis: ${key.substring(0, 50)}... (TTL: ${this.config.imageAnalysisTTL}s)`);
      return true;
    } catch (error) {
      console.error('Error caching image analysis:', error.message);
      this.metrics.errors++;
      return false;
    }
  }

  /**
   * Get cached script generation result
   * @param {string} creativeBrief - Creative brief
   * @param {Array} imageAnalysis - Image analysis results
   * @param {string} optionalScript - Optional user script
   * @returns {Promise<Object|null>} Cached result or null
   */
  async getCachedScript(creativeBrief, imageAnalysis, optionalScript = null) {
    if (!this.isConnected) {
      return null;
    }

    try {
      this.metrics.totalRequests++;
      const key = this.generateScriptKey(creativeBrief, imageAnalysis, optionalScript);
      const cached = await this.client.get(key);
      
      if (cached) {
        this.metrics.hits++;
        const result = JSON.parse(cached);
        console.log(`Cache HIT for script generation: ${key.substring(0, 50)}...`);
        return result;
      } else {
        this.metrics.misses++;
        console.log(`Cache MISS for script generation: ${key.substring(0, 50)}...`);
        return null;
      }
    } catch (error) {
      console.error('Error getting cached script:', error.message);
      this.metrics.errors++;
      return null;
    }
  }

  /**
   * Cache script generation result
   * @param {string} creativeBrief - Creative brief
   * @param {Array} imageAnalysis - Image analysis results
   * @param {string} optionalScript - Optional user script
   * @param {Object} result - Script result to cache
   * @returns {Promise<boolean>} Success status
   */
  async setCachedScript(creativeBrief, imageAnalysis, optionalScript = null, result) {
    if (!this.isConnected || !result) {
      return false;
    }

    try {
      const key = this.generateScriptKey(creativeBrief, imageAnalysis, optionalScript);
      const serialized = JSON.stringify({
        ...result,
        cachedAt: new Date().toISOString(),
        cacheKey: key
      });
      
      await this.client.setEx(key, this.config.scriptGenerationTTL, serialized);
      this.metrics.sets++;
      console.log(`Cached script generation: ${key.substring(0, 50)}... (TTL: ${this.config.scriptGenerationTTL}s)`);
      return true;
    } catch (error) {
      console.error('Error caching script:', error.message);
      this.metrics.errors++;
      return false;
    }
  }

  /**
   * Invalidate cache entries by pattern
   * @param {string} pattern - Redis key pattern
   * @returns {Promise<number>} Number of keys deleted
   */
  async invalidateByPattern(pattern) {
    if (!this.isConnected) {
      return 0;
    }

    try {
      const keys = await this.client.keys(`${this.config.keyPrefix}${pattern}`);
      if (keys.length === 0) {
        return 0;
      }

      const deleted = await this.client.del(keys);
      console.log(`Invalidated ${deleted} cache entries matching pattern: ${pattern}`);
      return deleted;
    } catch (error) {
      console.error('Error invalidating cache by pattern:', error.message);
      this.metrics.errors++;
      return 0;
    }
  }

  /**
   * Invalidate all image analysis cache
   * @returns {Promise<number>} Number of keys deleted
   */
  async invalidateImageAnalysisCache() {
    return this.invalidateByPattern('image-analysis:*');
  }

  /**
   * Invalidate all script generation cache
   * @returns {Promise<number>} Number of keys deleted
   */
  async invalidateScriptCache() {
    return this.invalidateByPattern('script:*');
  }

  /**
   * Warm cache with common analysis results
   * @param {Array} commonImages - Array of common image buffers with metadata
   * @returns {Promise<number>} Number of entries warmed
   */
  async warmImageAnalysisCache(commonImages = []) {
    if (!this.isConnected || commonImages.length === 0) {
      return 0;
    }

    let warmed = 0;
    for (const imageData of commonImages) {
      try {
        const { buffer, mimeType, analysisResult, options = {} } = imageData;
        
        if (buffer && analysisResult) {
          const success = await this.setCachedImageAnalysis(buffer, options, analysisResult);
          if (success) {
            warmed++;
          }
        }
      } catch (error) {
        console.error('Error warming cache for image:', error.message);
      }
    }

    console.log(`Warmed ${warmed} image analysis cache entries`);
    return warmed;
  }

  /**
   * Get cache statistics and metrics
   * @returns {Promise<Object>} Cache metrics and Redis info
   */
  async getMetrics() {
    const metrics = {
      ...this.metrics,
      hitRate: this.metrics.totalRequests > 0 ? 
        (this.metrics.hits / this.metrics.totalRequests * 100).toFixed(2) + '%' : '0%',
      isConnected: this.isConnected,
      config: this.config
    };

    if (this.isConnected) {
      try {
        const info = await this.client.info('memory');
        const keyCount = await this.client.dbSize();
        
        metrics.redis = {
          keyCount,
          memoryInfo: this.parseRedisInfo(info)
        };
      } catch (error) {
        console.error('Error getting Redis metrics:', error.message);
        metrics.redis = { error: error.message };
      }
    }

    return metrics;
  }

  /**
   * Parse Redis INFO command output
   * @param {string} info - Redis INFO output
   * @returns {Object} Parsed memory information
   */
  parseRedisInfo(info) {
    const lines = info.split('\r\n');
    const memoryInfo = {};
    
    lines.forEach(line => {
      if (line.includes(':')) {
        const [key, value] = line.split(':');
        if (key.includes('memory') || key.includes('used') || key.includes('peak')) {
          memoryInfo[key] = value;
        }
      }
    });

    return memoryInfo;
  }

  /**
   * Reset cache metrics
   */
  resetMetrics() {
    this.metrics = {
      hits: 0,
      misses: 0,
      sets: 0,
      errors: 0,
      totalRequests: 0
    };
    console.log('Cache metrics reset');
  }

  /**
   * Health check for cache service
   * @returns {Promise<Object>} Health status
   */
  async healthCheck() {
    const health = {
      status: 'unhealthy',
      connected: this.isConnected,
      timestamp: new Date().toISOString()
    };

    if (this.isConnected) {
      try {
        const testKey = `${this.config.keyPrefix}health-check`;
        const testValue = 'ok';
        
        await this.client.setEx(testKey, 10, testValue);
        const retrieved = await this.client.get(testKey);
        await this.client.del(testKey);
        
        if (retrieved === testValue) {
          health.status = 'healthy';
          health.latency = 'low';
        }
      } catch (error) {
        health.error = error.message;
        health.status = 'degraded';
      }
    }

    return health;
  }

  /**
   * Gracefully close Redis connection
   * @returns {Promise<void>}
   */
  async close() {
    if (this.client && this.isConnected) {
      try {
        await this.client.quit();
        console.log('Redis connection closed gracefully');
      } catch (error) {
        console.error('Error closing Redis connection:', error.message);
      }
    }
  }
}

module.exports = new CacheService();