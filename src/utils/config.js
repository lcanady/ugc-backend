const dotenv = require('dotenv');

// Load environment variables from .env file
dotenv.config();

/**
 * Configuration service that loads and validates environment variables
 */
class Config {
  constructor() {
    this.requiredVars = [
      'OPENAI_API_KEY',
      'GEMINI_API_KEY',
      'GOOGLE_AI_API_KEY',
      'KIE_AI_API_KEY',
      'PORT',
      'NODE_ENV'
    ];

    this.optionalVars = {
      'OPENAI_API_URL': 'https://api.openai.com/v1/chat/completions',
      'GEMINI_API_URL': 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent',
      'KIE_AI_GENERATE_URL': 'https://api.kie.ai/api/v1/veo/generate',
      'KIE_AI_STATUS_URL': 'https://api.kie.ai/api/v1/veo/record-info',
      'MAX_IMAGES': '4',
      'MAX_FILE_SIZE': '10485760', // 10MB in bytes
      'VIDEO_POLL_INTERVAL': '60000', // 60 seconds
      'VIDEO_TIMEOUT': '1800000', // 30 minutes
      'OPENAI_MODEL': 'gpt-5',
      'GEMINI_MODEL': 'gemini-2.5-flash-image-preview',
      'REDIS_URL': 'redis://localhost:6379',
      'CACHE_ENABLED': 'true',
      'IMAGE_ANALYSIS_CACHE_TTL': '86400', // 24 hours
      'SCRIPT_CACHE_TTL': '14400', // 4 hours
      'AUTH_ENABLED': 'true',
      'DEFAULT_RATE_LIMIT_WINDOW': '900000', // 15 minutes in ms
      'DEFAULT_RATE_LIMIT_MAX': '100', // 100 requests per window
      'DEFAULT_DAILY_RATE_LIMIT': '1000', // 1000 requests per day
      'JWT_SECRET': '', // Will be auto-generated if not provided
      'JWT_EXPIRES_IN': '1h',
      'REFRESH_TOKEN_EXPIRES_IN': '7d',
      'OAUTH_ENABLED': 'true',
      'GOOGLE_CLIENT_ID': '',
      'GOOGLE_CLIENT_SECRET': '',
      'OAUTH_CALLBACK_URL': 'http://localhost:3000/api/v1/oauth/google/callback',
      'DATABASE_URL': '',
      'DB_HOST': 'localhost',
      'DB_PORT': '5432',
      'DB_NAME': 'ugc_db',
      'DB_USER': 'ugc_user',
      'DB_PASSWORD': 'ugc_password',
      'DB_SSL': 'false',
      'DB_POOL_MAX': '20',
      'DB_POOL_MIN': '0',
      'DB_POOL_ACQUIRE': '30000',
      'DB_POOL_IDLE': '10000'
    };

    this.validateConfiguration();
  }

  /**
   * Validates that all required environment variables are present
   * @throws {Error} If any required variables are missing
   */
  validateConfiguration() {
    const missingVars = [];

    // Check required variables
    for (const varName of this.requiredVars) {
      if (!process.env[varName]) {
        missingVars.push(varName);
      }
    }

    if (missingVars.length > 0) {
      throw new Error(
        `Missing required environment variables: ${missingVars.join(', ')}\n` +
        'Please check your .env file and ensure all required variables are set.'
      );
    }

    // Validate specific values
    this.validateSpecificValues();
  }

  /**
   * Validates specific configuration values
   * @throws {Error} If any values are invalid
   */
  validateSpecificValues() {
    const port = parseInt(this.get('PORT'));
    if (isNaN(port) || port < 1 || port > 65535) {
      throw new Error('PORT must be a valid port number between 1 and 65535');
    }

    const maxImages = parseInt(this.get('MAX_IMAGES'));
    if (isNaN(maxImages) || maxImages < 1) {
      throw new Error('MAX_IMAGES must be a positive integer');
    }

    const maxFileSize = parseInt(this.get('MAX_FILE_SIZE'));
    if (isNaN(maxFileSize) || maxFileSize < 1) {
      throw new Error('MAX_FILE_SIZE must be a positive integer (bytes)');
    }

    const validEnvironments = ['development', 'production', 'test'];
    const nodeEnv = this.get('NODE_ENV');
    if (!validEnvironments.includes(nodeEnv)) {
      throw new Error(`NODE_ENV must be one of: ${validEnvironments.join(', ')}`);
    }
  }

  /**
   * Gets a configuration value, with fallback to default if available
   * @param {string} key - The configuration key
   * @returns {string} The configuration value
   */
  get(key) {
    return process.env[key] || this.optionalVars[key];
  }

  /**
   * Gets a configuration value as an integer
   * @param {string} key - The configuration key
   * @returns {number} The configuration value as integer
   */
  getInt(key) {
    return parseInt(this.get(key));
  }

  /**
   * Gets a configuration value as a boolean
   * @param {string} key - The configuration key
   * @returns {boolean} The configuration value as boolean
   */
  getBool(key) {
    const value = this.get(key);
    return value === 'true' || value === '1';
  }

  /**
   * Gets all API configuration
   * @returns {object} API configuration object
   */
  getApiConfig() {
    return {
      openai: {
        apiKey: this.get('OPENAI_API_KEY'),
        apiUrl: this.get('OPENAI_API_URL'),
        model: this.get('OPENAI_MODEL')
      },
      gemini: {
        apiKey: this.get('GEMINI_API_KEY'),
        apiUrl: this.get('GEMINI_API_URL'),
        model: this.get('GEMINI_MODEL')
      },
      googleAi: {
        apiKey: this.get('GOOGLE_AI_API_KEY')
      },
      kieAi: {
        apiKey: this.get('KIE_AI_API_KEY'),
        generateUrl: this.get('KIE_AI_GENERATE_URL'),
        statusUrl: this.get('KIE_AI_STATUS_URL')
      }
    };
  }

  /**
   * Gets server configuration
   * @returns {object} Server configuration object
   */
  getServerConfig() {
    return {
      port: this.getInt('PORT'),
      nodeEnv: this.get('NODE_ENV'),
      maxImages: this.getInt('MAX_IMAGES'),
      maxFileSize: this.getInt('MAX_FILE_SIZE'),
      videoPollInterval: this.getInt('VIDEO_POLL_INTERVAL'),
      videoTimeout: this.getInt('VIDEO_TIMEOUT')
    };
  }

  /**
   * Gets cache configuration
   * @returns {object} Cache configuration object
   */
  getCacheConfig() {
    return {
      redisUrl: this.get('REDIS_URL'),
      enabled: this.getBool('CACHE_ENABLED'),
      imageAnalysisTTL: this.getInt('IMAGE_ANALYSIS_CACHE_TTL'),
      scriptTTL: this.getInt('SCRIPT_CACHE_TTL')
    };
  }

  /**
   * Gets authentication configuration
   * @returns {object} Authentication configuration object
   */
  getAuthConfig() {
    return {
      enabled: this.getBool('AUTH_ENABLED'),
      defaultRateLimit: {
        windowMs: this.getInt('DEFAULT_RATE_LIMIT_WINDOW'),
        maxRequests: this.getInt('DEFAULT_RATE_LIMIT_MAX'),
        maxDailyRequests: this.getInt('DEFAULT_DAILY_RATE_LIMIT')
      }
    };
  }

  /**
   * Gets OAuth2 configuration
   * @returns {object} OAuth2 configuration object
   */
  getOAuthConfig() {
    return {
      enabled: this.getBool('OAUTH_ENABLED'),
      jwtSecret: this.get('JWT_SECRET'),
      jwtExpiresIn: this.get('JWT_EXPIRES_IN'),
      refreshTokenExpiresIn: this.get('REFRESH_TOKEN_EXPIRES_IN'),
      google: {
        clientId: this.get('GOOGLE_CLIENT_ID'),
        clientSecret: this.get('GOOGLE_CLIENT_SECRET'),
        callbackUrl: this.get('OAUTH_CALLBACK_URL')
      }
    };
  }

  /**
   * Gets database configuration
   * @returns {object} Database configuration object
   */
  getDatabaseConfig() {
    return {
      url: this.get('DATABASE_URL'),
      host: this.get('DB_HOST'),
      port: this.getInt('DB_PORT'),
      name: this.get('DB_NAME'),
      user: this.get('DB_USER'),
      password: this.get('DB_PASSWORD'),
      ssl: this.getBool('DB_SSL'),
      pool: {
        max: this.getInt('DB_POOL_MAX'),
        min: this.getInt('DB_POOL_MIN'),
        acquire: this.getInt('DB_POOL_ACQUIRE'),
        idle: this.getInt('DB_POOL_IDLE')
      }
    };
  }
}

// Export the Config class and a factory function
module.exports = Config;

// Export a factory function for creating instances
module.exports.createConfig = () => new Config();

// Export a singleton instance getter
let configInstance = null;
module.exports.getConfig = () => {
  if (!configInstance) {
    configInstance = new Config();
  }
  return configInstance;
};

// Export individual config values for convenience
const config = module.exports.getConfig();
module.exports.openaiApiKey = config.get('OPENAI_API_KEY');
module.exports.geminiApiKey = config.get('GEMINI_API_KEY');
module.exports.googleAiApiKey = config.get('GOOGLE_AI_API_KEY');
module.exports.kieAiApiKey = config.get('KIE_AI_API_KEY');
module.exports.port = config.getInt('PORT');
module.exports.nodeEnv = config.get('NODE_ENV');
module.exports.maxImages = config.getInt('MAX_IMAGES');
module.exports.maxFileSize = config.getInt('MAX_FILE_SIZE');
module.exports.appUrl = config.get('APP_URL');

// Database configuration exports
module.exports.DATABASE_URL = config.get('DATABASE_URL');
module.exports.DB_HOST = config.get('DB_HOST');
module.exports.DB_PORT = config.get('DB_PORT');
module.exports.DB_NAME = config.get('DB_NAME');
module.exports.DB_USER = config.get('DB_USER');
module.exports.DB_PASSWORD = config.get('DB_PASSWORD');
module.exports.DB_SSL = config.get('DB_SSL');
module.exports.DB_POOL_MAX = config.get('DB_POOL_MAX');
module.exports.DB_POOL_MIN = config.get('DB_POOL_MIN');
module.exports.DB_POOL_ACQUIRE = config.get('DB_POOL_ACQUIRE');
module.exports.DB_POOL_IDLE = config.get('DB_POOL_IDLE');