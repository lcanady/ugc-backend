const oauthService = require('../services/oauthService');

/**
 * OAuth2 middleware for JWT token validation
 */
class OAuthMiddleware {
  /**
   * Middleware to validate JWT tokens
   * @param {Object} options - Middleware options
   * @param {Array} options.requiredPermissions - Required permissions for the endpoint
   * @param {boolean} options.optional - Whether authentication is optional
   * @returns {Function} Express middleware function
   */
  static validateJWT(options = {}) {
    const { requiredPermissions = [], optional = false } = options;
    
    return async (req, res, next) => {
      const startTime = Date.now();
      
      try {
        // Extract JWT token from Authorization header
        const authHeader = req.headers.authorization;
        let token = null;
        
        if (authHeader && authHeader.startsWith('Bearer ')) {
          token = authHeader.substring(7);
        }
        
        if (!token) {
          if (optional) {
            return next();
          }
          return res.status(401).json({
            success: false,
            error: {
              code: 'MISSING_TOKEN',
              message: 'JWT token is required. Please provide it in the Authorization header as Bearer token.'
            }
          });
        }
        
        // Verify the JWT token
        const decoded = oauthService.verifyAccessToken(token);
        if (!decoded) {
          return res.status(401).json({
            success: false,
            error: {
              code: 'INVALID_TOKEN',
              message: 'Invalid or expired JWT token.'
            }
          });
        }
        
        // Get full user information
        const user = oauthService.findUserById(decoded.sub);
        if (!user || !user.isActive) {
          return res.status(401).json({
            success: false,
            error: {
              code: 'USER_INACTIVE',
              message: 'User account is inactive.'
            }
          });
        }
        
        // Check permissions
        if (requiredPermissions.length > 0) {
          const hasAllPermissions = requiredPermissions.every(permission => 
            oauthService.hasPermission(decoded, permission)
          );
          
          if (!hasAllPermissions) {
            return res.status(403).json({
              success: false,
              error: {
                code: 'INSUFFICIENT_PERMISSIONS',
                message: `This user does not have the required permissions: ${requiredPermissions.join(', ')}`,
                details: {
                  required: requiredPermissions,
                  available: decoded.permissions
                }
              }
            });
          }
        }
        
        // Attach user data to request
        req.user = {
          id: decoded.sub,
          email: decoded.email,
          name: decoded.name,
          role: decoded.role,
          permissions: decoded.permissions,
          type: 'oauth2'
        };
        
        // Record usage (simplified for OAuth2)
        const responseTime = Date.now() - startTime;
        
        next();
      } catch (error) {
        console.error('OAuth middleware error:', error);
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
    return OAuthMiddleware.validateJWT({ requiredPermissions: permissions });
  }
  
  /**
   * Middleware for optional OAuth2 authentication
   * @returns {Function} Express middleware function
   */
  static optionalAuth() {
    return OAuthMiddleware.validateJWT({ optional: true });
  }
  
  /**
   * Combined middleware that accepts both API keys and JWT tokens
   * @param {Object} options - Middleware options
   * @param {Array} options.requiredPermissions - Required permissions for the endpoint
   * @param {boolean} options.optional - Whether authentication is optional
   * @returns {Function} Express middleware function
   */
  static validateAny(options = {}) {
    const { requiredPermissions = [], optional = false } = options;
    
    return async (req, res, next) => {
      // Check for API key first
      const apiKey = req.headers['x-api-key'];
      const authHeader = req.headers.authorization;
      
      if (apiKey) {
        // Use API key authentication
        const AuthMiddleware = require('./authMiddleware');
        return AuthMiddleware.validateApiKey(options)(req, res, next);
      } else if (authHeader && authHeader.startsWith('Bearer ')) {
        // Check if it's a JWT token (not an API key)
        const token = authHeader.substring(7);
        if (!token.startsWith('ugc_')) {
          // It's a JWT token, use OAuth2 authentication
          return OAuthMiddleware.validateJWT(options)(req, res, next);
        } else {
          // It's an API key in Bearer format
          const AuthMiddleware = require('./authMiddleware');
          return AuthMiddleware.validateApiKey(options)(req, res, next);
        }
      } else {
        if (optional) {
          return next();
        }
        return res.status(401).json({
          success: false,
          error: {
            code: 'MISSING_AUTHENTICATION',
            message: 'Authentication is required. Please provide either an API key (X-API-Key header) or JWT token (Authorization: Bearer header).'
          }
        });
      }
    };
  }
  
  /**
   * Middleware to extract user info from authenticated request
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   */
  static extractUserInfo(req, res, next) {
    // User info is already set by validateJWT or validateAny
    next();
  }
}

module.exports = OAuthMiddleware;