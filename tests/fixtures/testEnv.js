/**
 * Test environment configuration
 * Sets up environment variables for testing
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.PORT = '3001';
process.env.OPENAI_API_KEY = 'test-openai-key';
process.env.GEMINI_API_KEY = 'test-gemini-key';
process.env.GOOGLE_AI_API_KEY = 'test-google-ai-key';
process.env.KIE_AI_API_KEY = 'test-kie-ai-key';
process.env.MAX_IMAGES = '4';
process.env.MAX_FILE_SIZE = '5242880'; // 5MB for testing
process.env.VIDEO_POLL_INTERVAL = '1000'; // 1 second for faster tests
process.env.VIDEO_TIMEOUT = '30000'; // 30 seconds for tests

// OpenRouter configuration for image analysis
process.env.OPENROUTER_API_KEY = 'test-openrouter-key';

module.exports = {
  maxImages: 4,
  maxFileSize: 5242880,
  testPort: 3001
};