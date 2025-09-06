const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { getConfig } = require('./src/utils/config');
const { errorHandler, notFoundHandler } = require('./src/middleware/errorHandler');
const cacheService = require('./src/services/cacheService');
const { specs, swaggerUi, swaggerOptions } = require('./src/config/swagger');

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

// Swagger JSON endpoint (must be before the UI middleware)
app.get('/api-docs/swagger.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(specs);
});

// Swagger API Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs, swaggerOptions));

// Redirect /docs to /api-docs for convenience
app.get('/docs', (req, res) => {
  res.redirect('/api-docs');
});

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check endpoint
 *     description: Returns the health status of the API and its dependencies
 *     tags: [System]
 *     responses:
 *       200:
 *         description: Service is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [OK, DEGRADED]
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 environment:
 *                   type: string
 *                 version:
 *                   type: string
 *                 uptime:
 *                   type: number
 *                 memory:
 *                   type: object
 *                 services:
 *                   type: object
 *                   properties:
 *                     database:
 *                       type: object
 *                     cache:
 *                       type: object
 *       503:
 *         description: Service is unhealthy
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const dbHealth = await databaseService.checkHealth();
    const cacheHealth = await cacheService.healthCheck();
    
    const overallStatus = dbHealth.status === 'healthy' && cacheHealth.status === 'healthy' ? 'OK' : 'DEGRADED';
    
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
const jobController = require('./src/controllers/jobController');
const batchController = require('./src/controllers/batchController');
const videoEditingController = require('./src/controllers/videoEditingController');

// Import middleware
const AuthMiddleware = require('./src/middleware/authMiddleware');
const OAuthMiddleware = require('./src/middleware/oauthMiddleware');

/**
 * @swagger
 * /api:
 *   get:
 *     summary: API information and endpoints
 *     description: Returns information about the API and available endpoints
 *     tags: [System]
 *     responses:
 *       200:
 *         description: API information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 version:
 *                   type: string
 *                 endpoints:
 *                   type: object
 */
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
      },
      jobs: {
        dashboard: 'GET /api/v1/jobs/dashboard',
        health: 'GET /api/v1/jobs/health',
        queues: 'GET /api/v1/jobs/queues/stats',
        recent: 'GET /api/v1/jobs/recent',
        metrics: 'GET /api/v1/jobs/metrics'
      },
      batch: {
        create: 'POST /api/v1/batch/generate',
        createOptimized: 'POST /api/v1/batch/generate-optimized',
        createWithFiles: 'POST /api/v1/batch/generate-with-files',
        status: 'GET /api/v1/batch/:batchId/status',
        results: 'GET /api/v1/batch/:batchId/results',
        download: 'GET /api/v1/batch/:batchId/download',
        cancel: 'POST /api/v1/batch/:batchId/cancel',
        history: 'GET /api/v1/batch/history',
        analytics: 'GET /api/v1/batch/analytics',
        detailedAnalytics: 'GET /api/v1/batch/:batchId/analytics',
        analyzeOptimization: 'POST /api/v1/batch/analyze-optimization',
        optimizeScheduling: 'POST /api/v1/batch/optimize-scheduling'
      },
      videoEditing: {
        process: 'POST /api/v1/video/process',
        processUGC: 'POST /api/v1/video/process-ugc',
        info: 'POST /api/v1/video/info',
        filters: 'POST /api/v1/video/filters',
        textOverlay: 'POST /api/v1/video/text-overlay'
      }
    }
  });
});

/**
 * @swagger
 * /api/v1/auth/keys:
 *   post:
 *     summary: Generate API key
 *     description: Generate a new API key for authentication
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 description: Name for the API key
 *                 example: "My App Key"
 *               permissions:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [ugc:generate, cache:read, cache:write, analytics:read, "*"]
 *                 description: Permissions for the API key
 *                 example: ["ugc:generate", "analytics:read"]
 *               expiresIn:
 *                 type: string
 *                 description: Expiration time (e.g., "30d", "1y", "never")
 *                 default: "never"
 *                 example: "30d"
 *     responses:
 *       201:
 *         description: API key generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 keyId:
 *                   type: string
 *                 apiKey:
 *                   type: string
 *                   description: The full API key (only shown once)
 *                 name:
 *                   type: string
 *                 permissions:
 *                   type: array
 *                   items:
 *                     type: string
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *                 expiresAt:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Invalid request parameters
 *   get:
 *     summary: List API keys
 *     description: List all API keys for the authenticated user
 *     tags: [Authentication]
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: API keys retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 keys:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       keyId:
 *                         type: string
 *                       name:
 *                         type: string
 *                       permissions:
 *                         type: array
 *                         items:
 *                           type: string
 *                       isActive:
 *                         type: boolean
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       lastUsed:
 *                         type: string
 *                         format: date-time
 *       401:
 *         description: Authentication required
 */
// Authentication routes (no auth required for key management)
app.post('/api/v1/auth/keys', apiKeyController.generateApiKey.bind(apiKeyController));
app.get('/api/v1/auth/keys', AuthMiddleware.requirePermissions(['analytics:read']), apiKeyController.listApiKeys.bind(apiKeyController));
app.get('/api/v1/auth/keys/:keyId', AuthMiddleware.requirePermissions(['analytics:read']), apiKeyController.getApiKeyDetails.bind(apiKeyController));
app.post('/api/v1/auth/keys/:keyId/deactivate', AuthMiddleware.requirePermissions(['analytics:read']), apiKeyController.deactivateApiKey.bind(apiKeyController));
app.post('/api/v1/auth/keys/:keyId/reactivate', AuthMiddleware.requirePermissions(['analytics:read']), apiKeyController.reactivateApiKey.bind(apiKeyController));
app.get('/api/v1/auth/analytics', AuthMiddleware.requirePermissions(['analytics:read']), apiKeyController.getAnalytics.bind(apiKeyController));
/**
 * @swagger
 * /api/v1/auth/me:
 *   get:
 *     summary: Get current API key information
 *     description: Retrieve information about the currently authenticated API key
 *     tags: [Authentication]
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: API key information retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 keyId:
 *                   type: string
 *                 name:
 *                   type: string
 *                 permissions:
 *                   type: array
 *                   items:
 *                     type: string
 *                 isActive:
 *                   type: boolean
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *                 lastUsed:
 *                   type: string
 *                   format: date-time
 *                 usage:
 *                   type: object
 *                   properties:
 *                     daily:
 *                       type: integer
 *                     monthly:
 *                       type: integer
 *                     total:
 *                       type: integer
 *       401:
 *         description: Authentication required
 */
app.get('/api/v1/auth/me', AuthMiddleware.validateApiKey(), apiKeyController.getCurrentKeyInfo.bind(apiKeyController));

/**
 * @swagger
 * /api/v1/oauth/register:
 *   post:
 *     summary: Register a new user
 *     description: Create a new user account with email and password
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "newuser@example.com"
 *               password:
 *                 type: string
 *                 format: password
 *                 minLength: 6
 *                 example: "securepassword123"
 *               name:
 *                 type: string
 *                 example: "John Doe"
 *                 description: "Display name (optional, defaults to email prefix)"
 *     responses:
 *       201:
 *         description: User registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "User registered successfully."
 *                 data:
 *                   type: object
 *                   properties:
 *                     accessToken:
 *                       type: string
 *                       description: JWT access token
 *                     refreshToken:
 *                       type: string
 *                       description: JWT refresh token
 *                     tokenType:
 *                       type: string
 *                       example: "Bearer"
 *                     expiresIn:
 *                       type: integer
 *                       description: Token expiration time in seconds
 *                     user:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         email:
 *                           type: string
 *                         name:
 *                           type: string
 *                         role:
 *                           type: string
 *                         permissions:
 *                           type: array
 *                           items:
 *                             type: string
 *       400:
 *         description: Invalid request parameters
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       enum: [MISSING_EMAIL, MISSING_PASSWORD, WEAK_PASSWORD]
 *                     message:
 *                       type: string
 *       409:
 *         description: User already exists
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       example: "USER_EXISTS"
 *                     message:
 *                       type: string
 *                       example: "User with this email already exists."
 *
 * /api/v1/oauth/login:
 *   post:
 *     summary: OAuth2 login
 *     description: Authenticate user and receive JWT tokens
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "user@example.com"
 *               password:
 *                 type: string
 *                 format: password
 *                 example: "securepassword123"
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accessToken:
 *                   type: string
 *                   description: JWT access token
 *                 refreshToken:
 *                   type: string
 *                   description: JWT refresh token
 *                 expiresIn:
 *                   type: integer
 *                   description: Token expiration time in seconds
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     email:
 *                       type: string
 *                     role:
 *                       type: string
 *       401:
 *         description: Invalid credentials
 *       400:
 *         description: Invalid request parameters
 */
// OAuth2 routes
app.post('/api/v1/oauth/register', oauthController.register.bind(oauthController));
app.post('/api/v1/oauth/login', oauthController.login.bind(oauthController));
/**
 * @swagger
 * /api/v1/oauth/refresh:
 *   post:
 *     summary: Refresh JWT token
 *     description: Refresh an expired JWT access token using a refresh token
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 description: Valid refresh token
 *     responses:
 *       200:
 *         description: Token refreshed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accessToken:
 *                   type: string
 *                 refreshToken:
 *                   type: string
 *                 expiresIn:
 *                   type: integer
 *       401:
 *         description: Invalid or expired refresh token
 */
app.post('/api/v1/oauth/refresh', oauthController.refresh.bind(oauthController));
app.post('/api/v1/oauth/revoke', oauthController.revoke.bind(oauthController));
app.get('/api/v1/oauth/profile', OAuthMiddleware.validateJWT(), oauthController.getProfile.bind(oauthController));
app.get('/api/v1/oauth/users', OAuthMiddleware.requirePermissions(['*']), oauthController.listUsers.bind(oauthController));
app.put('/api/v1/oauth/users/:userId/role', OAuthMiddleware.requirePermissions(['*']), oauthController.updateUserRole.bind(oauthController));
app.post('/api/v1/oauth/users/:userId/deactivate', OAuthMiddleware.requirePermissions(['*']), oauthController.deactivateUser.bind(oauthController));
app.get('/api/v1/oauth/stats', OAuthMiddleware.requirePermissions(['*']), oauthController.getAuthStats.bind(oauthController));
app.get('/api/v1/oauth/google/callback', oauthController.googleCallback.bind(oauthController));

/**
 * @swagger
 * /api/v1/ugc/generate:
 *   post:
 *     summary: Generate UGC advertisement video
 *     description: Creates a User Generated Content advertisement video from a creative brief and optional images
 *     tags: [UGC Generation]
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - creativeBrief
 *             properties:
 *               creativeBrief:
 *                 type: string
 *                 description: Creative brief describing the advertisement concept
 *                 example: "Create an engaging ad for a new fitness app targeting young professionals"
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: Images to analyze and incorporate (max 4 images, 10MB each)
 *                 maxItems: 4
 *               options:
 *                 type: string
 *                 description: JSON string with additional options (aspectRatio, duration, style, etc.)
 *     responses:
 *       200:
 *         description: Video generation started successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UGCResponse'
 *       400:
 *         description: Invalid request parameters
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       429:
 *         description: Rate limit exceeded
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// UGC API routes (require authentication - support both API keys and JWT)
app.post('/api/v1/ugc/generate', 
  OAuthMiddleware.validateAny({ requiredPermissions: ['ugc:generate'] }),
  upload.array('images', serverConfig.maxImages), 
  ugcController.generateUGCAd.bind(ugcController)
);
/**
 * @swagger
 * /api/v1/ugc/download:
 *   post:
 *     summary: Download generated videos
 *     description: Download one or more generated videos by operation IDs
 *     tags: [UGC Generation]
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - operationIds
 *             properties:
 *               operationIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of operation IDs to download
 *                 example: ["op_123", "op_456"]
 *               format:
 *                 type: string
 *                 enum: [zip, individual]
 *                 default: zip
 *                 description: Download format (zip archive or individual files)
 *     responses:
 *       200:
 *         description: Videos downloaded successfully
 *         content:
 *           application/zip:
 *             schema:
 *               type: string
 *               format: binary
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 downloadUrls:
 *                   type: array
 *                   items:
 *                     type: string
 *       404:
 *         description: One or more operations not found
 *       401:
 *         description: Authentication required
 */
app.post('/api/v1/ugc/download', 
  OAuthMiddleware.validateAny({ requiredPermissions: ['ugc:generate'] }),
  ugcController.downloadVideos.bind(ugcController)
);
/**
 * @swagger
 * /api/v1/ugc/status/{operationId}:
 *   get:
 *     summary: Get video generation status
 *     description: Retrieves the current status of a video generation operation
 *     tags: [UGC Generation]
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: operationId
 *         required: true
 *         schema:
 *           type: string
 *         description: The operation ID returned from the generate endpoint
 *     responses:
 *       200:
 *         description: Operation status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UGCResponse'
 *       404:
 *         description: Operation not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
app.get('/api/v1/ugc/status/:operationId', 
  OAuthMiddleware.validateAny({ requiredPermissions: ['ugc:generate'] }),
  ugcController.getGenerationStatus.bind(ugcController)
);
/**
 * @swagger
 * /api/v1/ugc/history:
 *   get:
 *     summary: Get operation history
 *     description: Retrieve the history of UGC generation operations for the authenticated user
 *     tags: [UGC Generation]
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Maximum number of operations to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *           default: 0
 *         description: Number of operations to skip
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [processing, completed, failed]
 *         description: Filter by operation status
 *     responses:
 *       200:
 *         description: Operation history retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 operations:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/UGCResponse'
 *                 total:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *                 offset:
 *                   type: integer
 *       401:
 *         description: Authentication required
 */
app.get('/api/v1/ugc/history', 
  OAuthMiddleware.validateAny({ requiredPermissions: ['ugc:generate'] }),
  ugcController.getOperationHistory.bind(ugcController)
);
/**
 * @swagger
 * /api/v1/ugc/quota:
 *   get:
 *     summary: Get quota status
 *     description: Retrieve current usage quota and limits for the authenticated user
 *     tags: [UGC Generation]
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Quota status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 daily:
 *                   type: object
 *                   properties:
 *                     used:
 *                       type: integer
 *                       description: Number of requests used today
 *                     limit:
 *                       type: integer
 *                       description: Daily request limit
 *                     remaining:
 *                       type: integer
 *                       description: Remaining requests for today
 *                     resetTime:
 *                       type: string
 *                       format: date-time
 *                       description: When the daily quota resets
 *                 monthly:
 *                   type: object
 *                   properties:
 *                     used:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     remaining:
 *                       type: integer
 *                     resetTime:
 *                       type: string
 *                       format: date-time
 *       401:
 *         description: Authentication required
 */
app.get('/api/v1/ugc/quota', 
  OAuthMiddleware.validateAny({ requiredPermissions: ['ugc:generate'] }),
  ugcController.getQuotaStatus.bind(ugcController)
);
/**
 * @swagger
 * /api/v1/ugc/stats:
 *   get:
 *     summary: Get operation statistics
 *     description: Retrieve system-wide UGC generation statistics (admin only)
 *     tags: [UGC Generation]
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Operation statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total:
 *                   type: object
 *                   properties:
 *                     operations:
 *                       type: integer
 *                     successful:
 *                       type: integer
 *                     failed:
 *                       type: integer
 *                 daily:
 *                   type: object
 *                   properties:
 *                     operations:
 *                       type: integer
 *                     successful:
 *                       type: integer
 *                     failed:
 *                       type: integer
 *                 averageProcessingTime:
 *                   type: number
 *                   description: Average processing time in seconds
 *                 topUsers:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       userId:
 *                         type: string
 *                       operationCount:
 *                         type: integer
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Admin permissions required
 */
app.get('/api/v1/ugc/stats', 
  OAuthMiddleware.validateAny({ requiredPermissions: ['*'] }),
  ugcController.getOperationStats.bind(ugcController)
);

/**
 * @swagger
 * /api/v1/cache/metrics:
 *   get:
 *     summary: Get cache metrics
 *     description: Retrieve detailed cache performance metrics and statistics
 *     tags: [System]
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Cache metrics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 hits:
 *                   type: integer
 *                   description: Total cache hits
 *                 misses:
 *                   type: integer
 *                   description: Total cache misses
 *                 hitRate:
 *                   type: number
 *                   description: Cache hit rate percentage
 *                 totalKeys:
 *                   type: integer
 *                   description: Total number of cached keys
 *                 memoryUsage:
 *                   type: object
 *                   properties:
 *                     used:
 *                       type: string
 *                     peak:
 *                       type: string
 *                     limit:
 *                       type: string
 *                 keysByType:
 *                   type: object
 *                   additionalProperties:
 *                     type: integer
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Cache read permissions required
 */
// Cache management routes (require cache permissions - support both API keys and JWT)
app.get('/api/v1/cache/metrics', 
  OAuthMiddleware.validateAny({ requiredPermissions: ['cache:read'] }),
  cacheController.getMetrics.bind(cacheController)
);
/**
 * @swagger
 * /api/v1/cache/health:
 *   get:
 *     summary: Get cache health status
 *     description: Check the health and connectivity status of the cache system
 *     tags: [System]
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Cache health status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [connected, disconnected, error]
 *                 redis:
 *                   type: object
 *                   properties:
 *                     connected:
 *                       type: boolean
 *                     version:
 *                       type: string
 *                     uptime:
 *                       type: integer
 *                     memory:
 *                       type: object
 *                 responseTime:
 *                   type: number
 *                   description: Response time in milliseconds
 *                 lastCheck:
 *                   type: string
 *                   format: date-time
 *       503:
 *         description: Cache system is unhealthy
 *       401:
 *         description: Authentication required
 */
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

/**
 * @swagger
 * /api/v1/jobs/dashboard:
 *   get:
 *     summary: Get job dashboard overview
 *     description: Retrieve comprehensive job queue dashboard with statistics and recent activity
 *     tags: [Job Management]
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 overview:
 *                   type: object
 *                   properties:
 *                     totalJobs:
 *                       type: integer
 *                     activeJobs:
 *                       type: integer
 *                     completedJobs:
 *                       type: integer
 *                     failedJobs:
 *                       type: integer
 *                 queues:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       name:
 *                         type: string
 *                       waiting:
 *                         type: integer
 *                       active:
 *                         type: integer
 *                       completed:
 *                         type: integer
 *                       failed:
 *                         type: integer
 *                 recentJobs:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/JobStatus'
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Admin permissions required
 */
// Job management routes (require admin permissions)
app.get('/api/v1/jobs/dashboard', 
  OAuthMiddleware.validateAny({ requiredPermissions: ['*'] }),
  jobController.getDashboard.bind(jobController)
);
app.get('/api/v1/jobs/queues/stats', 
  OAuthMiddleware.validateAny({ requiredPermissions: ['*'] }),
  jobController.getAllQueueStats.bind(jobController)
);
app.get('/api/v1/jobs/queues/:queueName/stats', 
  OAuthMiddleware.validateAny({ requiredPermissions: ['*'] }),
  jobController.getQueueStats.bind(jobController)
);
app.get('/api/v1/jobs/queues/:queueName/jobs/:jobId', 
  OAuthMiddleware.validateAny({ requiredPermissions: ['*'] }),
  jobController.getJobStatus.bind(jobController)
);
app.get('/api/v1/jobs/queues/:queueName/jobs/:jobId/details', 
  OAuthMiddleware.validateAny({ requiredPermissions: ['*'] }),
  jobController.getJobDetails.bind(jobController)
);
app.get('/api/v1/jobs/recent', 
  OAuthMiddleware.validateAny({ requiredPermissions: ['*'] }),
  jobController.getRecentJobs.bind(jobController)
);
app.get('/api/v1/jobs/queues/:queueName/trends', 
  OAuthMiddleware.validateAny({ requiredPermissions: ['*'] }),
  jobController.getQueueTrends.bind(jobController)
);
app.get('/api/v1/jobs/metrics', 
  OAuthMiddleware.validateAny({ requiredPermissions: ['*'] }),
  jobController.getPerformanceMetrics.bind(jobController)
);
app.get('/api/v1/jobs/export', 
  OAuthMiddleware.validateAny({ requiredPermissions: ['*'] }),
  jobController.exportQueueData.bind(jobController)
);
/**
 * @swagger
 * /api/v1/jobs/health:
 *   get:
 *     summary: Job system health check
 *     description: Check the health status of the job processing system
 *     tags: [Job Management]
 *     responses:
 *       200:
 *         description: Job system is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [healthy, degraded, unhealthy]
 *                 queues:
 *                   type: object
 *                   additionalProperties:
 *                     type: object
 *                     properties:
 *                       status:
 *                         type: string
 *                       workers:
 *                         type: integer
 *                       lastProcessed:
 *                         type: string
 *                         format: date-time
 *                 redis:
 *                   type: object
 *                   properties:
 *                     connected:
 *                       type: boolean
 *                     memory:
 *                       type: string
 *       503:
 *         description: Job system is unhealthy
 */
app.get('/api/v1/jobs/health', 
  jobController.healthCheck.bind(jobController)
);
app.post('/api/v1/jobs/queues/:queueName/jobs/:jobId/retry', 
  OAuthMiddleware.validateAny({ requiredPermissions: ['*'] }),
  jobController.retryJob.bind(jobController)
);
app.delete('/api/v1/jobs/queues/:queueName/jobs/:jobId', 
  OAuthMiddleware.validateAny({ requiredPermissions: ['*'] }),
  jobController.cancelJob.bind(jobController)
);

// Job status polling and webhook endpoints
app.get('/api/v1/jobs/operations/:operationId/status', 
  OAuthMiddleware.validateAny({ requiredPermissions: ['ugc:generate'] }),
  jobController.getOperationJobStatus.bind(jobController)
);
app.post('/api/v1/jobs/operations/:operationId/webhook', 
  OAuthMiddleware.validateAny({ requiredPermissions: ['ugc:generate'] }),
  jobController.registerWebhook.bind(jobController)
);
app.delete('/api/v1/jobs/operations/:operationId/webhook', 
  OAuthMiddleware.validateAny({ requiredPermissions: ['ugc:generate'] }),
  jobController.unregisterWebhook.bind(jobController)
);

/**
 * @swagger
 * /api/v1/batch/generate:
 *   post:
 *     summary: Create batch video generation
 *     description: Creates multiple UGC advertisement videos in a single batch operation
 *     tags: [Batch Processing]
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/BatchRequest'
 *     responses:
 *       200:
 *         description: Batch operation created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 batchId:
 *                   type: string
 *                   description: Unique batch identifier
 *                 status:
 *                   type: string
 *                   enum: [pending, processing, completed, failed]
 *                 totalRequests:
 *                   type: integer
 *                   description: Total number of requests in the batch
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Invalid batch request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// Batch processing routes (require authentication)
app.post('/api/v1/batch/generate', 
  OAuthMiddleware.validateAny({ requiredPermissions: ['ugc:generate'] }),
  batchController.createBatch.bind(batchController)
);
/**
 * @swagger
 * /api/v1/batch/generate-with-files:
 *   post:
 *     summary: Create batch with file uploads
 *     description: Create a batch video generation operation with multiple file uploads for different requests
 *     tags: [Batch Processing]
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - batchData
 *             properties:
 *               batchData:
 *                 type: string
 *                 description: JSON string containing batch request data
 *               files:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: Image files for the batch requests (organized by request index)
 *           encoding:
 *             files:
 *               style: form
 *               explode: true
 *     responses:
 *       200:
 *         description: Batch with files created successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/BatchStatus'
 *                 - type: object
 *                   properties:
 *                     fileMapping:
 *                       type: object
 *                       description: Mapping of uploaded files to batch requests
 *                     uploadedFiles:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           filename:
 *                             type: string
 *                           size:
 *                             type: integer
 *                           requestIndex:
 *                             type: integer
 *       400:
 *         description: Invalid batch data or file uploads
 *       401:
 *         description: Authentication required
 */
app.post('/api/v1/batch/generate-with-files', 
  OAuthMiddleware.validateAny({ requiredPermissions: ['ugc:generate'] }),
  upload.any(), // Allow multiple files with different field names
  batchController.createBatchWithFiles.bind(batchController)
);
/**
 * @swagger
 * /api/v1/batch/{batchId}/status:
 *   get:
 *     summary: Get batch processing status
 *     description: Retrieve the current status of a batch processing operation
 *     tags: [Batch Processing]
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: batchId
 *         required: true
 *         schema:
 *           type: string
 *         description: The batch ID returned from batch creation
 *     responses:
 *       200:
 *         description: Batch status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 batchId:
 *                   type: string
 *                 status:
 *                   type: string
 *                   enum: [pending, processing, completed, failed, cancelled]
 *                 totalRequests:
 *                   type: integer
 *                 completedRequests:
 *                   type: integer
 *                 failedRequests:
 *                   type: integer
 *                 progress:
 *                   type: number
 *                   minimum: 0
 *                   maximum: 100
 *                   description: Progress percentage
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *                 startedAt:
 *                   type: string
 *                   format: date-time
 *                 completedAt:
 *                   type: string
 *                   format: date-time
 *                 estimatedCompletion:
 *                   type: string
 *                   format: date-time
 *       404:
 *         description: Batch not found
 *       401:
 *         description: Authentication required
 */
app.get('/api/v1/batch/:batchId/status', 
  OAuthMiddleware.validateAny({ requiredPermissions: ['ugc:generate'] }),
  batchController.getBatchStatus.bind(batchController)
);
/**
 * @swagger
 * /api/v1/batch/{batchId}/results:
 *   get:
 *     summary: Get batch processing results
 *     description: Retrieve the results of a completed batch processing operation
 *     tags: [Batch Processing]
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: batchId
 *         required: true
 *         schema:
 *           type: string
 *         description: The batch ID
 *       - in: query
 *         name: includeFailures
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Include failed operations in results
 *     responses:
 *       200:
 *         description: Batch results retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 batchId:
 *                   type: string
 *                 status:
 *                   type: string
 *                 results:
 *                   type: array
 *                   items:
 *                     allOf:
 *                       - $ref: '#/components/schemas/UGCResponse'
 *                       - type: object
 *                         properties:
 *                           requestIndex:
 *                             type: integer
 *                           success:
 *                             type: boolean
 *                 summary:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     successful:
 *                       type: integer
 *                     failed:
 *                       type: integer
 *                     totalDuration:
 *                       type: number
 *                     averageDuration:
 *                       type: number
 *       404:
 *         description: Batch not found
 *       401:
 *         description: Authentication required
 */
app.get('/api/v1/batch/:batchId/results', 
  OAuthMiddleware.validateAny({ requiredPermissions: ['ugc:generate'] }),
  batchController.getBatchResults.bind(batchController)
);
app.get('/api/v1/batch/:batchId/download', 
  OAuthMiddleware.validateAny({ requiredPermissions: ['ugc:generate'] }),
  batchController.downloadBatchResults.bind(batchController)
);
app.post('/api/v1/batch/:batchId/cancel', 
  OAuthMiddleware.validateAny({ requiredPermissions: ['ugc:generate'] }),
  batchController.cancelBatch.bind(batchController)
);
/**
 * @swagger
 * /api/v1/batch/history:
 *   get:
 *     summary: Get batch processing history
 *     description: Retrieve the history of batch processing operations for the authenticated user
 *     tags: [Batch Processing]
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Maximum number of batches to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *           default: 0
 *         description: Number of batches to skip
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, processing, completed, failed, cancelled]
 *         description: Filter by batch status
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter batches created after this date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter batches created before this date
 *     responses:
 *       200:
 *         description: Batch history retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 batches:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/BatchStatus'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     offset:
 *                       type: integer
 *                     hasMore:
 *                       type: boolean
 *       401:
 *         description: Authentication required
 */
app.get('/api/v1/batch/history', 
  OAuthMiddleware.validateAny({ requiredPermissions: ['ugc:generate'] }),
  batchController.getBatchHistory.bind(batchController)
);
/**
 * @swagger
 * /api/v1/batch/analytics:
 *   get:
 *     summary: Get batch processing analytics
 *     description: Retrieve comprehensive analytics and statistics for batch processing operations
 *     tags: [Batch Processing]
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: timeRange
 *         schema:
 *           type: string
 *           enum: [1d, 7d, 30d, 90d, 1y]
 *           default: 30d
 *         description: Time range for analytics
 *       - in: query
 *         name: groupBy
 *         schema:
 *           type: string
 *           enum: [day, week, month]
 *           default: day
 *         description: Group analytics by time period
 *     responses:
 *       200:
 *         description: Batch analytics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 summary:
 *                   type: object
 *                   properties:
 *                     totalBatches:
 *                       type: integer
 *                     successfulBatches:
 *                       type: integer
 *                     failedBatches:
 *                       type: integer
 *                     averageProcessingTime:
 *                       type: number
 *                     totalRequestsProcessed:
 *                       type: integer
 *                 trends:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       date:
 *                         type: string
 *                         format: date
 *                       batchCount:
 *                         type: integer
 *                       successRate:
 *                         type: number
 *                       averageDuration:
 *                         type: number
 *                 performance:
 *                   type: object
 *                   properties:
 *                     peakHours:
 *                       type: array
 *                       items:
 *                         type: integer
 *                     resourceUtilization:
 *                       type: object
 *                     bottlenecks:
 *                       type: array
 *                       items:
 *                         type: string
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Analytics read permissions required
 */
app.get('/api/v1/batch/analytics', 
  OAuthMiddleware.validateAny({ requiredPermissions: ['analytics:read'] }),
  batchController.getBatchAnalytics.bind(batchController)
);
app.post('/api/v1/batch/process-pending', 
  OAuthMiddleware.validateAny({ requiredPermissions: ['*'] }),
  batchController.processPendingBatches.bind(batchController)
);
app.get('/api/v1/batch/queue-status', 
  OAuthMiddleware.validateAny({ requiredPermissions: ['*'] }),
  batchController.getQueueStatus.bind(batchController)
);

/**
 * @swagger
 * /api/v1/batch/generate-optimized:
 *   post:
 *     summary: Create optimized batch video generation
 *     description: Create a batch operation with intelligent optimization for better performance and resource utilization
 *     tags: [Batch Processing]
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             allOf:
 *               - $ref: '#/components/schemas/BatchRequest'
 *               - type: object
 *                 properties:
 *                   optimizationOptions:
 *                     type: object
 *                     properties:
 *                       prioritizeSpeed:
 *                         type: boolean
 *                         default: false
 *                         description: Prioritize processing speed over quality
 *                       resourceLimit:
 *                         type: string
 *                         enum: [low, medium, high]
 *                         default: medium
 *                         description: Resource usage limit
 *                       parallelProcessing:
 *                         type: boolean
 *                         default: true
 *                         description: Enable parallel processing
 *     responses:
 *       200:
 *         description: Optimized batch operation created successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/BatchStatus'
 *                 - type: object
 *                   properties:
 *                     optimizations:
 *                       type: object
 *                       properties:
 *                         estimatedSavings:
 *                           type: number
 *                           description: Estimated time savings percentage
 *                         resourceAllocation:
 *                           type: object
 *                         processingStrategy:
 *                           type: string
 *       400:
 *         description: Invalid optimization parameters
 *       401:
 *         description: Authentication required
 */
// Batch optimization routes
app.post('/api/v1/batch/generate-optimized', 
  OAuthMiddleware.validateAny({ requiredPermissions: ['ugc:generate'] }),
  batchController.createOptimizedBatch.bind(batchController)
);
/**
 * @swagger
 * /api/v1/batch/analyze-optimization:
 *   post:
 *     summary: Analyze batch optimization potential
 *     description: Analyze a batch request to determine potential optimizations and performance improvements
 *     tags: [Batch Processing]
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/BatchRequest'
 *     responses:
 *       200:
 *         description: Optimization analysis completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 analysis:
 *                   type: object
 *                   properties:
 *                     estimatedDuration:
 *                       type: number
 *                       description: Estimated processing duration in seconds
 *                     resourceRequirements:
 *                       type: object
 *                       properties:
 *                         cpu:
 *                           type: string
 *                         memory:
 *                           type: string
 *                         storage:
 *                           type: string
 *                     optimizationOpportunities:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           type:
 *                             type: string
 *                           description:
 *                             type: string
 *                           potentialSavings:
 *                             type: number
 *                 recommendations:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       action:
 *                         type: string
 *                       impact:
 *                         type: string
 *                         enum: [low, medium, high]
 *                       description:
 *                         type: string
 *       400:
 *         description: Invalid batch request for analysis
 *       401:
 *         description: Authentication required
 */
app.post('/api/v1/batch/analyze-optimization', 
  OAuthMiddleware.validateAny({ requiredPermissions: ['ugc:generate'] }),
  batchController.analyzeBatchOptimization.bind(batchController)
);
app.post('/api/v1/batch/optimize-scheduling', 
  OAuthMiddleware.validateAny({ requiredPermissions: ['ugc:generate'] }),
  batchController.optimizeScheduling.bind(batchController)
);
app.get('/api/v1/batch/:batchId/analytics', 
  OAuthMiddleware.validateAny({ requiredPermissions: ['analytics:read'] }),
  batchController.getBatchDetailedAnalytics.bind(batchController)
);

/**
 * @swagger
 * /api/v1/video/process:
 *   post:
 *     summary: Process video with advanced editing operations
 *     description: Apply multiple video editing operations in sequence (trim, merge, filters, effects, etc.)
 *     tags: [Video Editing]
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/VideoEditingRequest'
 *     responses:
 *       200:
 *         description: Video processing completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 operationId:
 *                   type: string
 *                 status:
 *                   type: string
 *                   enum: [completed, failed]
 *                 finalOutputPath:
 *                   type: string
 *                 videoInfo:
 *                   type: object
 *                 operations:
 *                   type: array
 *                   items:
 *                     type: object
 *       400:
 *         description: Invalid request parameters
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Video processing failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// Video editing routes (require authentication)
app.post('/api/v1/video/process', 
  OAuthMiddleware.validateAny({ requiredPermissions: ['ugc:generate'] }),
  videoEditingController.processVideo.bind(videoEditingController)
);

/**
 * @swagger
 * /api/v1/video/process-ugc:
 *   post:
 *     summary: Process UGC video with standard optimizations
 *     description: Apply standard UGC video processing including branding and optimization
 *     tags: [Video Editing]
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - inputPath
 *             properties:
 *               inputPath:
 *                 type: string
 *                 description: Path to input video file
 *               branding:
 *                 type: object
 *                 properties:
 *                   logoPath:
 *                     type: string
 *                   brandText:
 *                     type: string
 *                   brandColor:
 *                     type: string
 *               optimize:
 *                 type: boolean
 *                 default: true
 *               format:
 *                 type: string
 *                 enum: [mp4, webm, avi]
 *                 default: mp4
 *     responses:
 *       200:
 *         description: UGC video processing completed successfully
 *       400:
 *         description: Invalid request parameters
 *       500:
 *         description: Video processing failed
 */
app.post('/api/v1/video/process-ugc', 
  OAuthMiddleware.validateAny({ requiredPermissions: ['ugc:generate'] }),
  videoEditingController.processUGCVideo.bind(videoEditingController)
);

/**
 * @swagger
 * /api/v1/video/info:
 *   post:
 *     summary: Get video information and metadata
 *     description: Retrieve detailed information about a video file including duration, resolution, format, etc.
 *     tags: [Video Editing]
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - videoPath
 *             properties:
 *               videoPath:
 *                 type: string
 *                 description: Path to video file
 *     responses:
 *       200:
 *         description: Video information retrieved successfully
 *       400:
 *         description: Invalid request parameters
 *       500:
 *         description: Failed to retrieve video information
 */
app.post('/api/v1/video/info', 
  OAuthMiddleware.validateAny({ requiredPermissions: ['ugc:generate'] }),
  videoEditingController.getVideoInfo.bind(videoEditingController)
);

/**
 * @swagger
 * /api/v1/video/filters:
 *   post:
 *     summary: Apply video filters and color correction
 *     description: Apply color correction filters including brightness, contrast, saturation, and color balance
 *     tags: [Video Editing]
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - inputPath
 *             properties:
 *               inputPath:
 *                 type: string
 *                 description: Path to input video file
 *               filters:
 *                 type: object
 *                 properties:
 *                   brightness:
 *                     type: number
 *                     minimum: -1
 *                     maximum: 1
 *                     default: 0
 *                   contrast:
 *                     type: number
 *                     minimum: 0
 *                     maximum: 2
 *                     default: 1
 *                   saturation:
 *                     type: number
 *                     minimum: 0
 *                     maximum: 3
 *                     default: 1
 *                   hue:
 *                     type: number
 *                     minimum: -180
 *                     maximum: 180
 *                     default: 0
 *                   colorBalance:
 *                     type: string
 *                     enum: [neutral, warm, cool]
 *                     default: neutral
 *     responses:
 *       200:
 *         description: Video filters applied successfully
 *       400:
 *         description: Invalid request parameters
 *       500:
 *         description: Failed to apply video filters
 */
app.post('/api/v1/video/filters', 
  OAuthMiddleware.validateAny({ requiredPermissions: ['ugc:generate'] }),
  videoEditingController.applyFilters.bind(videoEditingController)
);

/**
 * @swagger
 * /api/v1/video/text-overlay:
 *   post:
 *     summary: Add text overlay to video
 *     description: Add custom text overlay with positioning, timing, and styling options
 *     tags: [Video Editing]
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - inputPath
 *             properties:
 *               inputPath:
 *                 type: string
 *                 description: Path to input video file
 *               textOptions:
 *                 type: object
 *                 properties:
 *                   text:
 *                     type: string
 *                     default: "Sample Text"
 *                   fontSize:
 *                     type: integer
 *                     default: 24
 *                   fontColor:
 *                     type: string
 *                     default: "#FFFFFF"
 *                   position:
 *                     type: string
 *                     enum: [top, center, bottom, custom]
 *                     default: bottom
 *                   x:
 *                     type: integer
 *                     description: Custom X position (when position is custom)
 *                   y:
 *                     type: integer
 *                     description: Custom Y position (when position is custom)
 *                   startTime:
 *                     type: number
 *                     default: 0
 *                     description: Start time in seconds
 *                   duration:
 *                     type: number
 *                     description: Duration in seconds (optional)
 *     responses:
 *       200:
 *         description: Text overlay added successfully
 *       400:
 *         description: Invalid request parameters
 *       500:
 *         description: Failed to add text overlay
 */
app.post('/api/v1/video/text-overlay', 
  OAuthMiddleware.validateAny({ requiredPermissions: ['ugc:generate'] }),
  videoEditingController.addTextOverlay.bind(videoEditingController)
);

// 404 handler for unmatched routes
app.use(notFoundHandler);

// Global error handling middleware (must be last)
app.use(errorHandler);

// Initialize services
const databaseService = require('./src/services/databaseService');
const cleanupService = require('./src/services/cleanupService');
const jobManager = require('./src/jobs/jobManager');

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

  try {
    // Start job manager
    await jobManager.start();
    console.log('✅ Job manager started');
  } catch (error) {
    console.warn('⚠️  Job manager initialization failed:', error.message);
    console.warn('⚠️  Application will continue without background job processing');
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
  await jobManager.stop();
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
  await jobManager.stop();
  await cacheService.close();
  await databaseService.close();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

module.exports = app;