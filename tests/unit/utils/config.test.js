const Config = require('../../../src/utils/config');

describe('Configuration Service', () => {
  let originalEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('Required Variables Validation', () => {
    test('should throw error when required variables are missing', () => {
      // Clear required environment variables
      delete process.env.OPENAI_API_KEY;
      delete process.env.KIE_AI_API_KEY;
      delete process.env.PORT;
      delete process.env.NODE_ENV;

      expect(() => {
        new Config();
      }).toThrow('Missing required environment variables');
    });

    test('should not throw error when all required variables are present', () => {
      // Set required environment variables
      process.env.OPENAI_API_KEY = 'test-openai-key';
      process.env.KIE_AI_API_KEY = 'test-kie-key';
      process.env.PORT = '3000';
      process.env.NODE_ENV = 'test';

      expect(() => {
        new Config();
      }).not.toThrow();
    });
  });

  describe('Value Validation', () => {
    beforeEach(() => {
      // Set required variables for validation tests
      process.env.OPENAI_API_KEY = 'test-openai-key';
      process.env.GEMINI_API_KEY = 'test-gemini-key';
      process.env.KIE_AI_API_KEY = 'test-kie-key';
      process.env.NODE_ENV = 'test';
    });

    test('should throw error for invalid PORT', () => {
      process.env.PORT = 'invalid';

      expect(() => {
        new Config();
      }).toThrow('PORT must be a valid port number');
    });

    test('should throw error for invalid NODE_ENV', () => {
      process.env.PORT = '3000';
      process.env.NODE_ENV = 'invalid';

      expect(() => {
        new Config();
      }).toThrow('NODE_ENV must be one of');
    });

    test('should accept valid configuration', () => {
      process.env.PORT = '3000';
      process.env.NODE_ENV = 'development';

      expect(() => {
        new Config();
      }).not.toThrow();
    });
  });

  describe('Configuration Access', () => {
    let config;

    beforeEach(() => {
      // Set up valid configuration
      process.env.OPENAI_API_KEY = 'test-openai-key';
      process.env.GEMINI_API_KEY = 'test-gemini-key';
      process.env.KIE_AI_API_KEY = 'test-kie-key';
      process.env.PORT = '3000';
      process.env.NODE_ENV = 'test';

      config = new Config();
    });

    test('should return environment variable value', () => {
      expect(config.get('OPENAI_API_KEY')).toBe('test-openai-key');
    });

    test('should return default value for optional variables', () => {
      expect(config.get('MAX_IMAGES')).toBe('4');
    });

    test('should return integer values correctly', () => {
      expect(config.getInt('PORT')).toBe(3000);
      expect(config.getInt('MAX_IMAGES')).toBe(4);
    });

    test('should return API configuration object', () => {
      const apiConfig = config.getApiConfig();

      expect(apiConfig).toHaveProperty('openai');
      expect(apiConfig).toHaveProperty('gemini');
      expect(apiConfig).toHaveProperty('kieAi');
      expect(apiConfig.openai.apiKey).toBe('test-openai-key');
      expect(apiConfig.openai.model).toBe('gpt-5');
    });

    test('should return server configuration object', () => {
      const serverConfig = config.getServerConfig();

      expect(serverConfig).toHaveProperty('port');
      expect(serverConfig).toHaveProperty('nodeEnv');
      expect(serverConfig).toHaveProperty('maxImages');
      expect(serverConfig.port).toBe(3000);
      expect(serverConfig.nodeEnv).toBe('test');
    });
  });
});