const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { getConfig } = require('./src/utils/config');
const { errorHandler, notFoundHandler } = require('./src/middleware/errorHandler');
const cacheService = require('./src/services/cacheService');

// Initialize and validate configuration on startup
let config;
try {
  config = getConfig();
  console.log('✅ Configuration validated successfully');
} catch (error) {
  console.error('❌ Configuration validation failed:', error.message);
  process.exit(1);
}

const app = express();
const serverConfig = config.getServerConfig();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: serverConfig.maxFileSize,
    files: serverConfig.maxImages
  },
  fileFilter: (req, file, cb) => {
    // Accept only image files
    const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type. Only ${allowedMimeTypes.join(', ')} are allowed.`), false);
    }
  }
});

// CORS configuration
const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
  exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset', 'X-RateLimit-Daily-Limit', 'X-RateLimit-Daily-Remaining'],
  maxAge: 86400 // 24 hours
};

// Middleware setup
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const dbHealth = await databaseService.checkHealth();
    const cacheHealth = await cacheService.getHealth();
    
    const overallStatus = dbHealth.status === 'healthy' && cacheHealth.status === 'connected' ? 'OK' : 'DEGRADED';
    
    res.json({ 
      status: overallStatus, 
      timestamp: new Date().toISOString(),
      environment: serverConfig.nodeEnv,
      version: '1.0.0',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      services: {
        database: dbHealth,
        cache: cacheHealth
      }
    });
  } catch (error) {
    res.status(503).json({
      status: 'ERROR',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// Import controllers
const ugcController = require('./src/controllers/ugcController');
const cacheController = require('./src/controllers/cacheController');
const apiKeyController = require('./src/controllers/apiKeyController');
const oauthController = require('./src/controllers/oauthController');

// Import middleware
const AuthMiddleware = require('./src/middleware/authMiddleware');
const OAuthMiddleware = require('./src/middleware/oauthMiddleware');

// API routes
app.get('/api', (req, res) => {
  res.json({
    success: true,
    message: 'UGC Ad Creator API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      generate: 'POST /api/v1/ugc/generate',
      download: 'POST /api/v1/ugc/download',
      status: 'GET /api/v1/ugc/status/:operationId',
      auth: {
        keys: 'GET/POST /api/v1/auth/keys',
        keyDetails: 'GET /api/v1/auth/keys/:keyId',
        analytics: 'GET /api/v1/auth/analytics',
        me: 'GET /api/v1/auth/me'
      },
      oauth: {
        login: 'POST /api/v1/oauth/login',
        refresh: 'POST /api/v1/oauth/refresh',
        revoke: 'POST /api/v1/oauth/revoke',
        profile: 'GET /api/v1/oauth/profile',
        users: 'GET /api/v1/oauth/users',
        stats: 'GET /api/v1/oauth/stats'
      }
    }
  });
});

// Authentication routes (no auth required for key management)
app.post('/api/v1/auth/keys', apiKeyController.generateApiKey.bind(apiKeyController));
app.get('/api/v1/auth/keys', AuthMiddleware.requirePermissions(['analytics:read']), apiKeyController.listApiKeys.bind(apiKeyController));
app.get('/api/v1/auth/keys/:keyId', AuthMiddleware.requirePermissions(['analytics:read']), apiKeyController.getApiKeyDetails.bind(apiKeyController));
app.post('/api/v1/auth/keys/:keyId/deactivate', AuthMiddleware.requirePermissions(['analytics:read']), apiKeyController.deactivateApiKey.bind(apiKeyController));
app.post('/api/v1/auth/keys/:keyId/reactivate', AuthMiddleware.requirePermissions(['analytics:read']), apiKeyController.reactivateApiKey.bind(apiKeyController));
app.get('/api/v1/auth/analytics', AuthMiddleware.requirePermissions(['analytics:read']), apiKeyController.getAnalytics.bind(apiKeyController));
app.get('/api/v1/auth/me', AuthMiddleware.validateApiKey(), apiKeyController.getCurrentKeyInfo.bind(apiKeyController));

// OAuth2 routes
app.post('/api/v1/oauth/login', oauthController.login.bind(oauthController));
app.post('/api/v1/oauth/refresh', oauthController.refresh.bind(oauthController));
app.post('/api/v1/oauth/revoke', oauthController.revoke.bind(oauthController));
app.get('/api/v1/oauth/profile', OAuthMiddleware.validateJWT(), oauthController.getProfile.bind(oauthController));
app.get('/api/v1/oauth/users', OAuthMiddleware.requirePermissions(['*']), oauthController.listUsers.bind(oauthController));
app.put('/api/v1/oauth/users/:userId/role', OAuthMiddleware.requirePermissions(['*']), oauthController.updateUserRole.bind(oauthController));
app.post('/api/v1/oauth/users/:userId/deactivate', OAuthMiddleware.requirePermissions(['*']), oauthController.deactivateUser.bind(oauthController));
app.get('/api/v1/oauth/stats', OAuthMiddleware.requirePermissions(['*']), oauthController.getAuthStats.bind(oauthController));
app.get('/api/v1/oauth/google/callback', oauthController.googleCallback.bind(oauthController));

// UGC API routes (require authentication - support both API keys and JWT)
app.post('/api/v1/ugc/generate', 
  OAuthMiddleware.validateAny({ requiredPermissions: ['ugc:generate'] }),
  upload.array('images', serverConfig.maxImages), 
  ugcController.generateUGCAd.bind(ugcController)
);
app.post('/api/v1/ugc/download', 
  OAuthMiddleware.validateAny({ requiredPermissions: ['ugc:generate'] }),
  ugcController.downloadVideos.bind(ugcController)
);
app.get('/api/v1/ugc/status/:operationId', 
  OAuthMiddleware.validateAny({ requiredPermissions: ['ugc:generate'] }),
  ugcController.getGenerationStatus.bind(ugcController)
);
app.get('/api/v1/ugc/history', 
  OAuthMiddleware.validateAny({ requiredPermissions: ['ugc:generate'] }),
  ugcController.getOperationHistory.bind(ugcController)
);
app.get('/api/v1/ugc/quota', 
  OAuthMiddleware.validateAny({ requiredPermissions: ['ugc:generate'] }),
  ugcController.getQuotaStatus.bind(ugcController)
);
app.get('/api/v1/ugc/stats', 
  OAuthMiddleware.validateAny({ requiredPermissions: ['*'] }),
  ugcController.getOperationStats.bind(ugcController)
);

// Cache management routes (require cache permissions - support both API keys and JWT)
app.get('/api/v1/cache/metrics', 
  OAuthMiddleware.validateAny({ requiredPermissions: ['cache:read'] }),
  cacheController.getMetrics.bind(cacheController)
);
app.get('/api/v1/cache/health', 
  OAuthMiddleware.validateAny({ requiredPermissions: ['cache:read'] }),
  cacheController.getHealth.bind(cacheController)
);
app.post('/api/v1/cache/invalidate', 
  OAuthMiddleware.validateAny({ requiredPermissions: ['cache:write'] }),
  cacheController.invalidateCache.bind(cacheController)
);
app.post('/api/v1/cache/reset-metrics', 
  OAuthMiddleware.validateAny({ requiredPermissions: ['cache:write'] }),
  cacheController.resetMetrics.bind(cacheController)
);
app.post('/api/v1/cache/warm', 
  OAuthMiddleware.validateAny({ requiredPermissions: ['cache:write'] }),
  cacheController.warmCache.bind(cacheController)
);

// 404 handler for unmatched routes
app.use(notFoundHandler);

// Global error handling middleware (must be last)
app.use(errorHandler);

// Initialize services
const databaseService = require('./src/services/databaseService');
const cleanupService = require('./src/services/cleanupService');

async function initializeServices() {
  try {
    // Initialize database
    await databaseService.initialize();
    console.log('✅ Database service initialized');
  } catch (error) {
    console.error('❌ Database service initialization failed:', error.message);
    console.error('❌ Application cannot continue without database');
    process.exit(1);
  }

  try {
    await cacheService.initialize();
    console.log('✅ Cache service initialized');
  } catch (error) {
    console.warn('⚠️  Cache service initialization failed:', error.message);
    console.warn('⚠️  Application will continue without caching');
  }

  try {
    // Start cleanup service
    cleanupService.start({
      operationRetentionDays: 30,
      usageRetentionDays: 90,
      intervalMs: 24 * 60 * 60 * 1000 // 24 hours
    });
    console.log('✅ Cleanup service started');
  } catch (error) {
    console.warn('⚠️  Cleanup service initialization failed:', error.message);
    console.warn('⚠️  Application will continue without automatic cleanup');
  }
}

// Start server
const server = app.listen(serverConfig.port, async () => {
  console.log(`🚀 UGC Ad Creator API server running on port ${serverConfig.port}`);
  console.log(`📝 Environment: ${serverConfig.nodeEnv}`);
  console.log(`📁 Max images: ${serverConfig.maxImages}`);
  console.log(`📏 Max file size: ${Math.round(serverConfig.maxFileSize / 1024 / 1024)}MB`);
  console.log(`🌐 CORS origins: ${corsOptions.origin}`);
  
  // Initialize services after server starts
  await initializeServices();
});

// Graceful shutdown handling
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  cleanupService.stop();
  await cacheService.close();
  await databaseService.close();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully');
  cleanupService.stop();
  await cacheService.close();
  await databaseService.close();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

module.exports = app;