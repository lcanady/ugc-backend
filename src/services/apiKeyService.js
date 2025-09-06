const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const cacheService = require('./cacheService');

/**
 * API Key Service for managing API key generation, validation, and usage tracking
 */
class ApiKeyService {
  constructor() {
    // In-memory storage for demo purposes
    // In production, this should be replaced with a database
    this.apiKeys = new Map();
    this.usageStats = new Map();
    this.rateLimits = new Map();
    
    // Default rate limits
    this.defaultRateLimit = {
      windowMs: 15 * 60 * 1000, // 15 minutes
      maxRequests: 100, // 100 requests per window
      maxDailyRequests: 1000 // 1000 requests per day
    };
    
    this.initializeDefaultKeys();
  }

  /**
   * Initialize some default API keys for testing
   */
  initializeDefaultKeys() {
    // Create a default API key for testing
    const defaultKey = this.generateApiKey({
      name: 'Default Test Key',
      description: 'Default API key for testing purposes',
      permissions: ['ugc:generate', 'cache:read'],
      rateLimit: this.defaultRateLimit
    });
    
    console.log(`🔑 Default API key created: ${defaultKey.key}`);
    console.log('   Use this key for testing by adding header: X-API-Key: ' + defaultKey.key);
  }

  /**
   * Generate a new API key
   * @param {Object} options - API key options
   * @param {string} options.name - Human readable name for the key
   * @param {string} options.description - Description of the key's purpose
   * @param {Array} options.permissions - Array of permissions
   * @param {Object} options.rateLimit - Custom rate limit settings
   * @returns {Object} Generated API key information
   */
  generateApiKey(options = {}) {
    const keyId = crypto.randomUUID();
    const keySecret = crypto.randomBytes(32).toString('hex');
    const apiKey = `ugc_${keyId.replace(/-/g, '')}_${keySecret}`;
    
    // Hash the key for storage (security best practice)
    const hashedKey = bcrypt.hashSync(apiKey, 10);
    
    const keyData = {
      id: keyId,
      key: apiKey, // Return unhashed key only once
      hashedKey: hashedKey,
      name: options.name || 'Unnamed Key',
      description: options.description || '',
      permissions: options.permissions || ['ugc:generate'],
      rateLimit: options.rateLimit || this.defaultRateLimit,
      createdAt: new Date(),
      lastUsed: null,
      isActive: true,
      metadata: options.metadata || {}
    };
    
    // Store with hashed key
    this.apiKeys.set(keyId, {
      ...keyData,
      key: undefined // Don't store the actual key
    });
    
    // Initialize usage stats
    this.usageStats.set(keyId, {
      totalRequests: 0,
      dailyRequests: 0,
      lastResetDate: new Date().toDateString(),
      requestHistory: [],
      errors: 0,
      lastError: null
    });
    
    // Initialize rate limit tracking
    this.rateLimits.set(keyId, {
      windowStart: Date.now(),
      requestCount: 0,
      dailyCount: 0,
      dailyResetTime: this.getNextMidnight()
    });
    
    return keyData;
  }

  /**
   * Validate an API key
   * @param {string} apiKey - The API key to validate
   * @returns {Object|null} Key data if valid, null if invalid
   */
  async validateApiKey(apiKey) {
    if (!apiKey || !apiKey.startsWith('ugc_')) {
      return null;
    }
    
    // Extract key ID from the API key format
    const keyParts = apiKey.split('_');
    if (keyParts.length !== 3) {
      return null;
    }
    
    // Try to find the key by comparing hashes
    for (const [keyId, keyData] of this.apiKeys.entries()) {
      if (!keyData.isActive) continue;
      
      try {
        if (bcrypt.compareSync(apiKey, keyData.hashedKey)) {
          // Update last used timestamp
          keyData.lastUsed = new Date();
          this.apiKeys.set(keyId, keyData);
          
          return {
            id: keyId,
            ...keyData
          };
        }
      } catch (error) {
        console.error('Error comparing API key hash:', error);
        continue;
      }
    }
    
    return null;
  }

  /**
   * Check rate limits for an API key
   * @param {string} keyId - The API key ID
   * @returns {Object} Rate limit status
   */
  checkRateLimit(keyId) {
    const keyData = this.apiKeys.get(keyId);
    if (!keyData) {
      return { allowed: false, reason: 'Invalid API key' };
    }
    
    const rateLimitData = this.rateLimits.get(keyId);
    const now = Date.now();
    
    // Reset daily counter if needed
    if (now >= rateLimitData.dailyResetTime) {
      rateLimitData.dailyCount = 0;
      rateLimitData.dailyResetTime = this.getNextMidnight();
    }
    
    // Reset window counter if needed
    if (now - rateLimitData.windowStart >= keyData.rateLimit.windowMs) {
      rateLimitData.windowStart = now;
      rateLimitData.requestCount = 0;
    }
    
    // Check daily limit
    if (rateLimitData.dailyCount >= keyData.rateLimit.maxDailyRequests) {
      return {
        allowed: false,
        reason: 'Daily rate limit exceeded',
        resetTime: rateLimitData.dailyResetTime,
        limit: keyData.rateLimit.maxDailyRequests,
        remaining: 0
      };
    }
    
    // Check window limit
    if (rateLimitData.requestCount >= keyData.rateLimit.maxRequests) {
      return {
        allowed: false,
        reason: 'Rate limit exceeded',
        resetTime: rateLimitData.windowStart + keyData.rateLimit.windowMs,
        limit: keyData.rateLimit.maxRequests,
        remaining: 0
      };
    }
    
    return {
      allowed: true,
      limit: keyData.rateLimit.maxRequests,
      remaining: keyData.rateLimit.maxRequests - rateLimitData.requestCount,
      dailyLimit: keyData.rateLimit.maxDailyRequests,
      dailyRemaining: keyData.rateLimit.maxDailyRequests - rateLimitData.dailyCount,
      resetTime: rateLimitData.windowStart + keyData.rateLimit.windowMs
    };
  }

  /**
   * Record API usage for tracking and analytics
   * @param {string} keyId - The API key ID
   * @param {Object} requestInfo - Information about the request
   */
  recordUsage(keyId, requestInfo = {}) {
    const usageData = this.usageStats.get(keyId);
    const rateLimitData = this.rateLimits.get(keyId);
    
    if (!usageData || !rateLimitData) {
      return;
    }
    
    // Update counters
    usageData.totalRequests++;
    rateLimitData.requestCount++;
    rateLimitData.dailyCount++;
    
    // Reset daily counter if needed
    const today = new Date().toDateString();
    if (usageData.lastResetDate !== today) {
      usageData.dailyRequests = 1;
      usageData.lastResetDate = today;
    } else {
      usageData.dailyRequests++;
    }
    
    // Add to request history (keep last 100 requests)
    usageData.requestHistory.push({
      timestamp: new Date(),
      endpoint: requestInfo.endpoint || 'unknown',
      method: requestInfo.method || 'unknown',
      statusCode: requestInfo.statusCode || 200,
      responseTime: requestInfo.responseTime || 0,
      userAgent: requestInfo.userAgent || 'unknown'
    });
    
    // Keep only last 100 requests
    if (usageData.requestHistory.length > 100) {
      usageData.requestHistory = usageData.requestHistory.slice(-100);
    }
    
    // Update storage
    this.usageStats.set(keyId, usageData);
    this.rateLimits.set(keyId, rateLimitData);
  }

  /**
   * Record an error for an API key
   * @param {string} keyId - The API key ID
   * @param {Object} errorInfo - Information about the error
   */
  recordError(keyId, errorInfo = {}) {
    const usageData = this.usageStats.get(keyId);
    if (!usageData) return;
    
    usageData.errors++;
    usageData.lastError = {
      timestamp: new Date(),
      message: errorInfo.message || 'Unknown error',
      endpoint: errorInfo.endpoint || 'unknown',
      statusCode: errorInfo.statusCode || 500
    };
    
    this.usageStats.set(keyId, usageData);
  }

  /**
   * Get usage statistics for an API key
   * @param {string} keyId - The API key ID
   * @returns {Object} Usage statistics
   */
  getUsageStats(keyId) {
    const keyData = this.apiKeys.get(keyId);
    const usageData = this.usageStats.get(keyId);
    const rateLimitData = this.rateLimits.get(keyId);
    
    if (!keyData || !usageData) {
      return null;
    }
    
    return {
      keyInfo: {
        id: keyId,
        name: keyData.name,
        description: keyData.description,
        createdAt: keyData.createdAt,
        lastUsed: keyData.lastUsed,
        isActive: keyData.isActive
      },
      usage: {
        totalRequests: usageData.totalRequests,
        dailyRequests: usageData.dailyRequests,
        errors: usageData.errors,
        lastError: usageData.lastError,
        recentRequests: usageData.requestHistory.slice(-10) // Last 10 requests
      },
      rateLimit: {
        limit: keyData.rateLimit.maxRequests,
        remaining: keyData.rateLimit.maxRequests - (rateLimitData?.requestCount || 0),
        dailyLimit: keyData.rateLimit.maxDailyRequests,
        dailyRemaining: keyData.rateLimit.maxDailyRequests - (rateLimitData?.dailyCount || 0)
      }
    };
  }

  /**
   * List all API keys (without sensitive data)
   * @returns {Array} Array of API key information
   */
  listApiKeys() {
    const keys = [];
    for (const [keyId, keyData] of this.apiKeys.entries()) {
      const usageData = this.usageStats.get(keyId);
      keys.push({
        id: keyId,
        name: keyData.name,
        description: keyData.description,
        permissions: keyData.permissions,
        createdAt: keyData.createdAt,
        lastUsed: keyData.lastUsed,
        isActive: keyData.isActive,
        totalRequests: usageData?.totalRequests || 0,
        dailyRequests: usageData?.dailyRequests || 0
      });
    }
    return keys;
  }

  /**
   * Deactivate an API key
   * @param {string} keyId - The API key ID
   * @returns {boolean} Success status
   */
  deactivateApiKey(keyId) {
    const keyData = this.apiKeys.get(keyId);
    if (!keyData) return false;
    
    keyData.isActive = false;
    this.apiKeys.set(keyId, keyData);
    return true;
  }

  /**
   * Reactivate an API key
   * @param {string} keyId - The API key ID
   * @returns {boolean} Success status
   */
  reactivateApiKey(keyId) {
    const keyData = this.apiKeys.get(keyId);
    if (!keyData) return false;
    
    keyData.isActive = true;
    this.apiKeys.set(keyId, keyData);
    return true;
  }

  /**
   * Check if API key has specific permission
   * @param {string} keyId - The API key ID
   * @param {string} permission - The permission to check
   * @returns {boolean} Whether the key has the permission
   */
  hasPermission(keyId, permission) {
    const keyData = this.apiKeys.get(keyId);
    if (!keyData || !keyData.isActive) return false;
    
    return keyData.permissions.includes(permission) || keyData.permissions.includes('*');
  }

  /**
   * Get next midnight timestamp for daily reset
   * @returns {number} Timestamp of next midnight
   */
  getNextMidnight() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    return tomorrow.getTime();
  }

  /**
   * Get analytics data for all API keys
   * @returns {Object} Analytics summary
   */
  getAnalytics() {
    const analytics = {
      totalKeys: this.apiKeys.size,
      activeKeys: 0,
      totalRequests: 0,
      dailyRequests: 0,
      totalErrors: 0,
      topKeys: [],
      recentActivity: []
    };
    
    const keyStats = [];
    
    for (const [keyId, keyData] of this.apiKeys.entries()) {
      if (keyData.isActive) analytics.activeKeys++;
      
      const usageData = this.usageStats.get(keyId);
      if (usageData) {
        analytics.totalRequests += usageData.totalRequests;
        analytics.dailyRequests += usageData.dailyRequests;
        analytics.totalErrors += usageData.errors;
        
        keyStats.push({
          id: keyId,
          name: keyData.name,
          totalRequests: usageData.totalRequests,
          dailyRequests: usageData.dailyRequests,
          lastUsed: keyData.lastUsed
        });
        
        // Add recent requests to activity
        usageData.requestHistory.slice(-5).forEach(req => {
          analytics.recentActivity.push({
            keyId,
            keyName: keyData.name,
            ...req
          });
        });
      }
    }
    
    // Sort and get top 10 keys by usage
    analytics.topKeys = keyStats
      .sort((a, b) => b.totalRequests - a.totalRequests)
      .slice(0, 10);
    
    // Sort recent activity by timestamp
    analytics.recentActivity = analytics.recentActivity
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 20);
    
    return analytics;
  }
}

// Export singleton instance
const apiKeyService = new ApiKeyService();
module.exports = apiKeyService;