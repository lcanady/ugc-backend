const apiKeyService = require('../services/apiKeyService');

/**
 * Authentication middleware for API key validation
 */
class AuthMiddleware {
  /**
   * Middleware to validate API key
   * @param {Object} options - Middleware options
   * @param {Array} options.requiredPermissions - Required permissions for the endpoint
   * @param {boolean} options.optional - Whether authentication is optional
   * @returns {Function} Express middleware function
   */
  static validateApiKey(options = {}) {
    const { requiredPermissions = [], optional = false } = options;
    
    return async (req, res, next) => {
      const startTime = Date.now();
      
      try {
        // Extract API key from headers
        const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
        
        if (!apiKey) {
          if (optional) {
            return next();
          }
          return res.status(401).json({
            success: false,
            error: {
              code: 'MISSING_API_KEY',
              message: 'API key is required. Please provide it in the X-API-Key header or Authorization header as Bearer token.'
            }
          });
        }
        
        // Validate the API key
        const keyData = await apiKeyService.validateApiKey(apiKey);
        if (!keyData) {
          return res.status(401).json({
            success: false,
            error: {
              code: 'INVALID_API_KEY',
              message: 'Invalid API key provided.'
            }
          });
        }
        
        // Check if key is active
        if (!keyData.isActive) {
          return res.status(401).json({
            success: false,
            error: {
              code: 'INACTIVE_API_KEY',
              message: 'API key has been deactivated.'
            }
          });
        }
        
        // Check rate limits
        const rateLimitStatus = apiKeyService.checkRateLimit(keyData.id);
        if (!rateLimitStatus.allowed) {
          // Set rate limit headers
          res.set({
            'X-RateLimit-Limit': rateLimitStatus.limit || 0,
            'X-RateLimit-Remaining': rateLimitStatus.remaining || 0,
            'X-RateLimit-Reset': rateLimitStatus.resetTime || 0
          });
          
          return res.status(429).json({
            success: false,
            error: {
              code: 'RATE_LIMIT_EXCEEDED',
              message: rateLimitStatus.reason,
              details: {
                limit: rateLimitStatus.limit,
                remaining: rateLimitStatus.remaining,
                resetTime: rateLimitStatus.resetTime
              }
            }
          });
        }
        
        // Check permissions
        if (requiredPermissions.length > 0) {
          const hasAllPermissions = requiredPermissions.every(permission => 
            apiKeyService.hasPermission(keyData.id, permission)
          );
          
          if (!hasAllPermissions) {
            return res.status(403).json({
              success: false,
              error: {
                code: 'INSUFFICIENT_PERMISSIONS',
                message: `This API key does not have the required permissions: ${requiredPermissions.join(', ')}`,
                details: {
                  required: requiredPermissions,
                  available: keyData.permissions
                }
              }
            });
          }
        }
        
        // Set rate limit headers for successful requests
        res.set({
          'X-RateLimit-Limit': rateLimitStatus.limit,
          'X-RateLimit-Remaining': rateLimitStatus.remaining,
          'X-RateLimit-Reset': rateLimitStatus.resetTime,
          'X-RateLimit-Daily-Limit': rateLimitStatus.dailyLimit,
          'X-RateLimit-Daily-Remaining': rateLimitStatus.dailyRemaining
        });
        
        // Attach key data to request for use in controllers
        req.apiKey = {
          id: keyData.id,
          name: keyData.name,
          permissions: keyData.permissions,
          metadata: keyData.metadata
        };
        
        // Record usage (will be called after response)
        const originalSend = res.send;
        res.send = function(data) {
          const responseTime = Date.now() - startTime;
          
          // Record usage
          apiKeyService.recordUsage(keyData.id, {
            endpoint: req.path,
            method: req.method,
            statusCode: res.statusCode,
            responseTime,
            userAgent: req.headers['user-agent']
          });
          
          // Record error if status code indicates error
          if (res.statusCode >= 400) {
            apiKeyService.recordError(keyData.id, {
              message: `HTTP ${res.statusCode}`,
              endpoint: req.path,
              statusCode: res.statusCode
            });
          }
          
          return originalSend.call(this, data);
        };
        
        next();
      } catch (error) {
        console.error('Auth middleware error:', error);
        return res.status(500).json({
          success: false,
          error: {
            code: 'AUTH_ERROR',
            message: 'Authentication error occurred.'
          }
        });
      }
    };
  }
  
  /**
   * Middleware to require specific permissions
   * @param {Array} permissions - Required permissions
   * @returns {Function} Express middleware function
   */
  static requirePermissions(permissions) {
    return AuthMiddleware.validateApiKey({ requiredPermissions: permissions });
  }
  
  /**
   * Middleware for optional authentication
   * @returns {Function} Express middleware function
   */
  static optionalAuth() {
    return AuthMiddleware.validateApiKey({ optional: true });
  }
  
  /**
   * Middleware to extract user info from authenticated request
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   */
  static extractUserInfo(req, res, next) {
    if (req.apiKey) {
      req.user = {
        id: req.apiKey.id,
        name: req.apiKey.name,
        type: 'api_key',
        permissions: req.apiKey.permissions
      };
    }
    next();
  }
}

module.exports = AuthMiddleware;