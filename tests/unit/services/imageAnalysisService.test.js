const nock = require('nock');
const imageAnalysisService = require('../../../src/services/imageAnalysisService');
const config = require('../../../src/utils/config');

// Mock the config
jest.mock('../../../src/utils/config');

describe('ImageAnalysisService', () => {
  const mockApiUrl = 'https://generativelanguage.googleapis.com';
  const mockApiKey = 'test-gemini-api-key';
  const mockImageBuffer = Buffer.from('fake-image-data');
  const mockMimeType = 'image/jpeg';

  beforeEach(() => {
    // Mock config values
    config.geminiApiKey = mockApiKey;
    
    // Clear any existing nock interceptors
    nock.cleanAll();
    
    // Clear all mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('analyzeImage', () => {
    const mockSuccessResponse = {
      candidates: [{
        content: {
          parts: [{
            text: `OBJECTS: smartphone, coffee cup, notebook
PEOPLE: young adult woman, casual clothing, focused expression
SETTING: modern office workspace, indoor, natural lighting
ACTIONS: typing, drinking coffee, working
COLORS: white, blue, gray, brown
MOOD: productive, focused, professional`
          }]
        }
      }]
    };

    it('should successfully analyze an image', async () => {
      nock(mockApiUrl)
        .post('/v1beta/models/gemini-2.5-flash-image-preview:generateContent')
        .query({ key: mockApiKey })
        .reply(200, mockSuccessResponse);

      const result = await imageAnalysisService.analyzeImage(mockImageBuffer, mockMimeType);

      expect(result).toBeDefined();
      expect(result.objects).toEqual(['smartphone', 'coffee cup', 'notebook']);
      expect(result.people).toEqual(['young adult woman', 'casual clothing', 'focused expression']);
      expect(result.setting).toBe('modern office workspace, indoor, natural lighting');
      expect(result.actions).toEqual(['typing', 'drinking coffee', 'working']);
      expect(result.colors).toEqual(['white', 'blue', 'gray', 'brown']);
      expect(result.mood).toBe('productive, focused, professional');
      expect(result.model).toBe('gemini-2.5-flash-image-preview');
      expect(result.timestamp).toBeDefined();
    });

    it('should handle custom analysis options', async () => {
      nock(mockApiUrl)
        .post('/v1beta/models/gemini-2.5-flash-image-preview:generateContent')
        .query({ key: mockApiKey })
        .reply(200, mockSuccessResponse);

      const options = {
        focusAreas: ['objects', 'setting'],
        detailLevel: 'detailed',
        ugcContext: false
      };

      const result = await imageAnalysisService.analyzeImage(mockImageBuffer, mockMimeType, options);

      expect(result).toBeDefined();
      expect(result.objects).toBeDefined();
      expect(result.setting).toBeDefined();
    });

    it('should throw error for invalid image buffer', async () => {
      await expect(imageAnalysisService.analyzeImage('not-a-buffer', mockMimeType))
        .rejects.toThrow('Image buffer is required and must be a Buffer');
    });

    it('should throw error for invalid MIME type', async () => {
      await expect(imageAnalysisService.analyzeImage(mockImageBuffer, 'text/plain'))
        .rejects.toThrow('Valid image MIME type is required');
    });

    it('should throw error for missing MIME type', async () => {
      await expect(imageAnalysisService.analyzeImage(mockImageBuffer, null))
        .rejects.toThrow('Valid image MIME type is required');
    });

    it('should handle API error responses', async () => {
      nock(mockApiUrl)
        .post('/v1beta/models/gemini-2.5-flash-image-preview:generateContent')
        .query({ key: mockApiKey })
        .reply(400, {
          error: {
            message: 'Invalid request format'
          }
        });

      await expect(imageAnalysisService.analyzeImage(mockImageBuffer, mockMimeType))
        .rejects.toThrow('Gemini API error (400): Invalid request format');
    });

    it('should handle network errors', async () => {
      nock(mockApiUrl)
        .post('/v1beta/models/gemini-2.5-flash-image-preview:generateContent')
        .query({ key: mockApiKey })
        .replyWithError('Network error');

      await expect(imageAnalysisService.analyzeImage(mockImageBuffer, mockMimeType))
        .rejects.toThrow('Network error: Unable to reach Gemini API');
    });

    it('should handle invalid API response format', async () => {
      nock(mockApiUrl)
        .post('/v1beta/models/gemini-2.5-flash-image-preview:generateContent')
        .query({ key: mockApiKey })
        .reply(200, { invalid: 'response' });

      await expect(imageAnalysisService.analyzeImage(mockImageBuffer, mockMimeType))
        .rejects.toThrow('Invalid response format from Gemini API');
    });

    it('should retry on retryable errors', async () => {
      // First call fails with retryable error
      nock(mockApiUrl)
        .post('/v1beta/models/gemini-2.5-flash-image-preview:generateContent')
        .query({ key: mockApiKey })
        .replyWithError('Network error');

      // Second call succeeds
      nock(mockApiUrl)
        .post('/v1beta/models/gemini-2.5-flash-image-preview:generateContent')
        .query({ key: mockApiKey })
        .reply(200, mockSuccessResponse);

      const result = await imageAnalysisService.analyzeImage(mockImageBuffer, mockMimeType);

      expect(result).toBeDefined();
      expect(result.objects).toEqual(['smartphone', 'coffee cup', 'notebook']);
    });

    it('should fail after max retries', async () => {
      // Mock 3 failed attempts
      for (let i = 0; i < 3; i++) {
        nock(mockApiUrl)
          .post('/v1beta/models/gemini-2.5-flash-image-preview:generateContent')
          .query({ key: mockApiKey })
          .replyWithError('Network error');
      }

      await expect(imageAnalysisService.analyzeImage(mockImageBuffer, mockMimeType))
        .rejects.toThrow('Failed to analyze image after 3 attempts');
    });

    it('should handle malformed analysis response gracefully', async () => {
      const malformedResponse = {
        candidates: [{
          content: {
            parts: [{
              text: 'This is not properly formatted analysis text without sections'
            }]
          }
        }]
      };

      nock(mockApiUrl)
        .post('/v1beta/models/gemini-2.5-flash-image-preview:generateContent')
        .query({ key: mockApiKey })
        .reply(200, malformedResponse);

      const result = await imageAnalysisService.analyzeImage(mockImageBuffer, mockMimeType);

      expect(result).toBeDefined();
      expect(result.objects).toEqual([]);
      expect(result.people).toEqual([]);
      expect(result.setting).toBe('');
      expect(result.rawAnalysis).toBe('This is not properly formatted analysis text without sections');
    });
  });

  describe('analyzeImages', () => {
    const mockImages = [
      {
        buffer: Buffer.from('fake-image-1'),
        mimeType: 'image/jpeg',
        filename: 'test1.jpg'
      },
      {
        buffer: Buffer.from('fake-image-2'),
        mimeType: 'image/png',
        filename: 'test2.png'
      }
    ];

    const mockSuccessResponse = {
      candidates: [{
        content: {
          parts: [{
            text: `OBJECTS: product, table
PEOPLE: person
SETTING: kitchen
ACTIONS: cooking
COLORS: white, blue
MOOD: cheerful`
          }]
        }
      }]
    };

    it('should successfully analyze multiple images', async () => {
      // Mock API calls for both images
      nock(mockApiUrl)
        .post('/v1beta/models/gemini-2.5-flash-image-preview:generateContent')
        .query({ key: mockApiKey })
        .reply(200, mockSuccessResponse)
        .post('/v1beta/models/gemini-2.5-flash-image-preview:generateContent')
        .query({ key: mockApiKey })
        .reply(200, mockSuccessResponse);

      const results = await imageAnalysisService.analyzeImages(mockImages);

      expect(results).toHaveLength(2);
      expect(results[0].imageIndex).toBe(0);
      expect(results[0].filename).toBe('test1.jpg');
      expect(results[1].imageIndex).toBe(1);
      expect(results[1].filename).toBe('test2.png');
      
      // Both should have analysis results
      expect(results[0].objects).toEqual(['product', 'table']);
      expect(results[1].objects).toEqual(['product', 'table']);
    });

    it('should handle images without filenames', async () => {
      const imagesWithoutFilenames = [
        {
          buffer: Buffer.from('fake-image-1'),
          mimeType: 'image/jpeg'
        }
      ];

      nock(mockApiUrl)
        .post('/v1beta/models/gemini-2.5-flash-image-preview:generateContent')
        .query({ key: mockApiKey })
        .reply(200, mockSuccessResponse);

      const results = await imageAnalysisService.analyzeImages(imagesWithoutFilenames);

      expect(results).toHaveLength(1);
      expect(results[0].filename).toBe('image_1');
    });

    it('should throw error for empty images array', async () => {
      await expect(imageAnalysisService.analyzeImages([]))
        .rejects.toThrow('Images array is required and must not be empty');
    });

    it('should throw error for non-array input', async () => {
      await expect(imageAnalysisService.analyzeImages('not-an-array'))
        .rejects.toThrow('Images array is required and must not be empty');
    });

    it('should handle individual image analysis failures', async () => {
      nock(mockApiUrl)
        .post('/v1beta/models/gemini-2.5-flash-image-preview:generateContent')
        .query({ key: mockApiKey })
        .replyWithError('API error');

      await expect(imageAnalysisService.analyzeImages(mockImages))
        .rejects.toThrow('Failed to analyze image');
    });

    it('should pass options to individual image analysis', async () => {
      const options = {
        focusAreas: ['objects'],
        detailLevel: 'detailed'
      };

      nock(mockApiUrl)
        .post('/v1beta/models/gemini-2.5-flash-image-preview:generateContent')
        .query({ key: mockApiKey })
        .reply(200, mockSuccessResponse);

      const results = await imageAnalysisService.analyzeImages([mockImages[0]], options);

      expect(results).toHaveLength(1);
      expect(results[0].objects).toBeDefined();
    });
  });

  describe('buildAnalysisPrompt', () => {
    it('should build default prompt with all focus areas', () => {
      const prompt = imageAnalysisService.buildAnalysisPrompt();

      expect(prompt).toContain('OBJECTS:');
      expect(prompt).toContain('PEOPLE:');
      expect(prompt).toContain('SETTING:');
      expect(prompt).toContain('ACTIONS:');
      expect(prompt).toContain('COLORS:');
      expect(prompt).toContain('MOOD:');
      expect(prompt).toContain('User Generated Content (UGC)');
    });

    it('should build prompt with custom focus areas', () => {
      const options = {
        focusAreas: ['objects', 'setting'],
        ugcContext: false
      };

      const prompt = imageAnalysisService.buildAnalysisPrompt(options);

      expect(prompt).toContain('OBJECTS:');
      expect(prompt).toContain('SETTING:');
      expect(prompt).not.toContain('PEOPLE:');
      expect(prompt).not.toContain('User Generated Content (UGC)');
    });

    it('should build detailed prompt when requested', () => {
      const options = {
        detailLevel: 'detailed'
      };

      const prompt = imageAnalysisService.buildAnalysisPrompt(options);

      expect(prompt).toContain('detailed descriptions');
      expect(prompt).toContain('technical aspects');
    });
  });

  describe('buildAnalysisRequest', () => {
    it('should build proper API request payload', () => {
      const prompt = 'Test prompt';
      const payload = imageAnalysisService.buildAnalysisRequest(prompt, mockImageBuffer, mockMimeType);

      expect(payload.contents).toHaveLength(1);
      expect(payload.contents[0].role).toBe('user');
      expect(payload.contents[0].parts).toHaveLength(2);
      expect(payload.contents[0].parts[0].text).toBe(prompt);
      expect(payload.contents[0].parts[1].inlineData.mimeType).toBe(mockMimeType);
      expect(payload.contents[0].parts[1].inlineData.data).toBe(mockImageBuffer.toString('base64'));
      expect(payload.generationConfig).toBeDefined();
      expect(payload.safetySettings).toBeDefined();
    });
  });

  describe('parseAnalysisResponse', () => {
    it('should parse valid response', () => {
      const responseData = {
        candidates: [{
          content: {
            parts: [{
              text: 'Analysis result text'
            }]
          }
        }]
      };

      const result = imageAnalysisService.parseAnalysisResponse(responseData);
      expect(result).toBe('Analysis result text');
    });

    it('should throw error for invalid response structure', () => {
      const invalidResponse = { invalid: 'structure' };

      expect(() => imageAnalysisService.parseAnalysisResponse(invalidResponse))
        .toThrow('Failed to parse analysis response');
    });
  });

  describe('formatAnalysisResult', () => {
    it('should format structured analysis text', () => {
      const analysisText = `OBJECTS: smartphone, coffee cup
PEOPLE: young woman
SETTING: office workspace
ACTIONS: typing, working
COLORS: white, blue
MOOD: focused`;

      const result = imageAnalysisService.formatAnalysisResult(analysisText);

      expect(result.objects).toEqual(['smartphone', 'coffee cup']);
      expect(result.people).toEqual(['young woman']);
      expect(result.setting).toBe('office workspace');
      expect(result.actions).toEqual(['typing', 'working']);
      expect(result.colors).toEqual(['white', 'blue']);
      expect(result.mood).toBe('focused');
      expect(result.rawAnalysis).toBe(analysisText);
      expect(result.timestamp).toBeDefined();
      expect(result.model).toBe('gemini-2.5-flash-image-preview');
    });

    it('should handle malformed analysis text gracefully', () => {
      const malformedText = 'This is not properly formatted';

      const result = imageAnalysisService.formatAnalysisResult(malformedText);

      expect(result.objects).toEqual([]);
      expect(result.people).toEqual([]);
      expect(result.setting).toBe('');
      expect(result.actions).toEqual([]);
      expect(result.colors).toEqual([]);
      expect(result.mood).toBe('');
      expect(result.rawAnalysis).toBe(malformedText);
      expect(result.parseError).toBeUndefined(); // The method doesn't actually throw errors for malformed text
    });
  });

  describe('extractSection', () => {
    it('should extract comma-separated items', () => {
      const text = 'OBJECTS: smartphone, coffee cup, notebook, pen';
      const result = imageAnalysisService.extractSection(text, 'OBJECTS');

      expect(result).toEqual(['smartphone', 'coffee cup', 'notebook', 'pen']);
    });

    it('should extract bullet-point items', () => {
      const text = 'ACTIONS: • typing • drinking coffee • working';
      const result = imageAnalysisService.extractSection(text, 'ACTIONS');

      expect(result).toEqual(['typing', 'drinking coffee', 'working']);
    });

    it('should handle missing sections', () => {
      const text = 'OBJECTS: smartphone, coffee cup';
      const result = imageAnalysisService.extractSection(text, 'PEOPLE');

      expect(result).toEqual([]);
    });

    it('should limit items to 10 per section', () => {
      const text = 'OBJECTS: item1, item2, item3, item4, item5, item6, item7, item8, item9, item10, item11, item12';
      const result = imageAnalysisService.extractSection(text, 'OBJECTS');

      expect(result).toHaveLength(10);
    });
  });

  describe('extractSingleValue', () => {
    it('should extract single value', () => {
      const text = 'SETTING: modern office workspace, indoor lighting';
      const result = imageAnalysisService.extractSingleValue(text, 'SETTING');

      expect(result).toBe('modern office workspace, indoor lighting');
    });

    it('should handle missing sections', () => {
      const text = 'OBJECTS: smartphone';
      const result = imageAnalysisService.extractSingleValue(text, 'SETTING');

      expect(result).toBe('');
    });

    it('should limit length to 200 characters', () => {
      const longText = 'SETTING: ' + 'a'.repeat(300);
      const result = imageAnalysisService.extractSingleValue(longText, 'SETTING');

      expect(result.length).toBe(200);
    });
  });

  describe('isRetryableError', () => {
    it('should identify retryable errors', () => {
      const retryableErrors = [
        new Error('Network error occurred'),
        new Error('Request timeout'),
        new Error('Rate limit exceeded'),
        new Error('Server error 500'),
        new Error('Service unavailable')
      ];

      retryableErrors.forEach(error => {
        expect(imageAnalysisService.isRetryableError(error)).toBe(true);
      });
    });

    it('should identify non-retryable errors', () => {
      const nonRetryableErrors = [
        new Error('Invalid API key'),
        new Error('Bad request format'),
        new Error('Unauthorized access')
      ];

      nonRetryableErrors.forEach(error => {
        expect(imageAnalysisService.isRetryableError(error)).toBe(false);
      });
    });
  });

  describe('sleep', () => {
    it('should resolve after specified delay', async () => {
      const startTime = Date.now();
      await imageAnalysisService.sleep(100);
      const endTime = Date.now();

      expect(endTime - startTime).toBeGreaterThanOrEqual(100);
    });
  });
});