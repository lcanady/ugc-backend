const apiKeyService = require('../services/apiKeyService');

/**
 * Controller for API key management endpoints
 */
class ApiKeyController {
  /**
   * Generate a new API key
   * POST /api/v1/auth/keys
   */
  async generateApiKey(req, res) {
    try {
      const { name, description, permissions, rateLimit, metadata } = req.body;
      
      // Validate required fields
      if (!name) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_NAME',
            message: 'API key name is required.'
          }
        });
      }
      
      // Validate permissions if provided
      const validPermissions = ['ugc:generate', 'cache:read', 'cache:write', 'analytics:read', '*'];
      if (permissions && !Array.isArray(permissions)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_PERMISSIONS',
            message: 'Permissions must be an array.'
          }
        });
      }
      
      if (permissions) {
        const invalidPermissions = permissions.filter(p => !validPermissions.includes(p));
        if (invalidPermissions.length > 0) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'INVALID_PERMISSIONS',
              message: `Invalid permissions: ${invalidPermissions.join(', ')}. Valid permissions are: ${validPermissions.join(', ')}`
            }
          });
        }
      }
      
      // Generate the API key
      const keyData = apiKeyService.generateApiKey({
        name,
        description: description || '',
        permissions: permissions || ['ugc:generate'],
        rateLimit: rateLimit || undefined,
        metadata: metadata || {}
      });
      
      res.status(201).json({
        success: true,
        data: {
          id: keyData.id,
          key: keyData.key, // Only returned once during creation
          name: keyData.name,
          description: keyData.description,
          permissions: keyData.permissions,
          rateLimit: keyData.rateLimit,
          createdAt: keyData.createdAt,
          isActive: keyData.isActive
        },
        message: 'API key generated successfully. Please store it securely as it will not be shown again.'
      });
    } catch (error) {
      console.error('Error generating API key:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'KEY_GENERATION_ERROR',
          message: 'Failed to generate API key.'
        }
      });
    }
  }
  
  /**
   * List all API keys
   * GET /api/v1/auth/keys
   */
  async listApiKeys(req, res) {
    try {
      const keys = apiKeyService.listApiKeys();
      
      res.json({
        success: true,
        data: {
          keys,
          total: keys.length,
          active: keys.filter(k => k.isActive).length
        }
      });
    } catch (error) {
      console.error('Error listing API keys:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'LIST_ERROR',
          message: 'Failed to list API keys.'
        }
      });
    }
  }
  
  /**
   * Get API key details and usage statistics
   * GET /api/v1/auth/keys/:keyId
   */
  async getApiKeyDetails(req, res) {
    try {
      const { keyId } = req.params;
      
      const stats = apiKeyService.getUsageStats(keyId);
      if (!stats) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'KEY_NOT_FOUND',
            message: 'API key not found.'
          }
        });
      }
      
      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Error getting API key details:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'DETAILS_ERROR',
          message: 'Failed to get API key details.'
        }
      });
    }
  }
  
  /**
   * Deactivate an API key
   * POST /api/v1/auth/keys/:keyId/deactivate
   */
  async deactivateApiKey(req, res) {
    try {
      const { keyId } = req.params;
      
      const success = apiKeyService.deactivateApiKey(keyId);
      if (!success) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'KEY_NOT_FOUND',
            message: 'API key not found.'
          }
        });
      }
      
      res.json({
        success: true,
        message: 'API key deactivated successfully.'
      });
    } catch (error) {
      console.error('Error deactivating API key:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'DEACTIVATION_ERROR',
          message: 'Failed to deactivate API key.'
        }
      });
    }
  }
  
  /**
   * Reactivate an API key
   * POST /api/v1/auth/keys/:keyId/reactivate
   */
  async reactivateApiKey(req, res) {
    try {
      const { keyId } = req.params;
      
      const success = apiKeyService.reactivateApiKey(keyId);
      if (!success) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'KEY_NOT_FOUND',
            message: 'API key not found.'
          }
        });
      }
      
      res.json({
        success: true,
        message: 'API key reactivated successfully.'
      });
    } catch (error) {
      console.error('Error reactivating API key:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'REACTIVATION_ERROR',
          message: 'Failed to reactivate API key.'
        }
      });
    }
  }
  
  /**
   * Get analytics for all API keys
   * GET /api/v1/auth/analytics
   */
  async getAnalytics(req, res) {
    try {
      const analytics = apiKeyService.getAnalytics();
      
      res.json({
        success: true,
        data: analytics
      });
    } catch (error) {
      console.error('Error getting analytics:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'ANALYTICS_ERROR',
          message: 'Failed to get analytics data.'
        }
      });
    }
  }
  
  /**
   * Get current API key info (for the authenticated key)
   * GET /api/v1/auth/me
   */
  async getCurrentKeyInfo(req, res) {
    try {
      if (!req.apiKey) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'NOT_AUTHENTICATED',
            message: 'No API key provided.'
          }
        });
      }
      
      const stats = apiKeyService.getUsageStats(req.apiKey.id);
      if (!stats) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'KEY_NOT_FOUND',
            message: 'API key not found.'
          }
        });
      }
      
      res.json({
        success: true,
        data: {
          ...stats,
          currentRequest: {
            timestamp: new Date(),
            endpoint: req.path,
            method: req.method,
            userAgent: req.headers['user-agent']
          }
        }
      });
    } catch (error) {
      console.error('Error getting current key info:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INFO_ERROR',
          message: 'Failed to get current key information.'
        }
      });
    }
  }
}

module.exports = new ApiKeyController();