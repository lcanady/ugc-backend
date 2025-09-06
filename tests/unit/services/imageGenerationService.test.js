const nock = require('nock');
const imageGenerationService = require('../../../src/services/imageGenerationService');

// Mock config
jest.mock('../../../src/utils/config', () => ({
  geminiApiKey: 'test-gemini-key'
}));

describe('ImageGenerationService', () => {
  beforeEach(() => {
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('generateImages', () => {
    const mockCreativeBrief = 'Create engaging images for a smartphone advertisement showcasing camera quality and sleek design';
    
    const mockGeminiResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                inlineData: {
                  mimeType: 'image/png',
                  data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
                }
              },
              {
                inlineData: {
                  mimeType: 'image/png',
                  data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
                }
              }
            ]
          }
        }
      ]
    };

    it('should generate images successfully with valid creative brief', async () => {
      nock('https://generativelanguage.googleapis.com')
        .post('/v1beta/models/gemini-2.5-flash-image-preview:generateContent')
        .query({ key: 'test-gemini-key' })
        .reply(200, mockGeminiResponse);

      const result = await imageGenerationService.generateImages(mockCreativeBrief);

      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('imageIndex', 0);
      expect(result[0]).toHaveProperty('imageData');
      expect(result[0]).toHaveProperty('mimeType', 'image/png');
      expect(result[0]).toHaveProperty('buffer');
      expect(result[0]).toHaveProperty('description');
      expect(result[0]).toHaveProperty('timestamp');
      expect(result[0]).toHaveProperty('metadata');
      expect(result[0].metadata).toHaveProperty('model', 'gemini-2.5-flash-image-preview');
    });

    it('should handle custom options for image generation', async () => {
      nock('https://generativelanguage.googleapis.com')
        .post('/v1beta/models/gemini-2.5-flash-image-preview:generateContent')
        .query({ key: 'test-gemini-key' })
        .reply(200, {
          candidates: [
            {
              content: {
                parts: [
                  {
                    inlineData: {
                      mimeType: 'image/png',
                      data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
                    }
                  }
                ]
              }
            }
          ]
        });

      const options = {
        imageCount: 1,
        aspectRatio: '1:1'
      };

      const result = await imageGenerationService.generateImages(mockCreativeBrief, [], options);

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('imageIndex', 0);
    });

    it('should handle reference images', async () => {
      nock('https://generativelanguage.googleapis.com')
        .post('/v1beta/models/gemini-2.5-flash-image-preview:generateContent')
        .query({ key: 'test-gemini-key' })
        .reply(200, mockGeminiResponse);

      const referenceImages = [
        {
          buffer: Buffer.from('test image data'),
          mimetype: 'image/jpeg'
        }
      ];

      const result = await imageGenerationService.generateImages(mockCreativeBrief, referenceImages);

      expect(result).toHaveLength(2);
    });

    it('should throw error for missing creative brief', async () => {
      await expect(
        imageGenerationService.generateImages('')
      ).rejects.toThrow('Creative brief is required and must be a non-empty string');

      await expect(
        imageGenerationService.generateImages(null)
      ).rejects.toThrow('Creative brief is required and must be a non-empty string');
    });

    it('should handle Gemini API errors', async () => {
      nock('https://generativelanguage.googleapis.com')
        .post('/v1beta/models/gemini-2.5-flash-image-preview:generateContent')
        .query({ key: 'test-gemini-key' })
        .reply(400, { error: { message: 'Invalid request' } });

      await expect(
        imageGenerationService.generateImages(mockCreativeBrief)
      ).rejects.toThrow('Failed to generate images after 3 attempts');
    });

    it('should handle network errors', async () => {
      nock('https://generativelanguage.googleapis.com')
        .post('/v1beta/models/gemini-2.5-flash-image-preview:generateContent')
        .query({ key: 'test-gemini-key' })
        .replyWithError('Network error');

      await expect(
        imageGenerationService.generateImages(mockCreativeBrief)
      ).rejects.toThrow('Failed to generate images after 3 attempts');
    });

    it('should retry on failure and succeed on second attempt', async () => {
      nock('https://generativelanguage.googleapis.com')
        .post('/v1beta/models/gemini-2.5-flash-image-preview:generateContent')
        .query({ key: 'test-gemini-key' })
        .reply(500, { error: { message: 'Server error' } })
        .post('/v1beta/models/gemini-2.5-flash-image-preview:generateContent')
        .query({ key: 'test-gemini-key' })
        .reply(200, mockGeminiResponse);

      const result = await imageGenerationService.generateImages(mockCreativeBrief);

      expect(result).toHaveLength(2);
    });
  });

  describe('generateCombinedImage', () => {
    const mockCreativeBrief = 'Create a single combined image for smartphone advertisement';
    
    const mockSingleImageResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                inlineData: {
                  mimeType: 'image/png',
                  data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
                }
              }
            ]
          }
        }
      ]
    };

    it('should generate a single combined image', async () => {
      nock('https://generativelanguage.googleapis.com')
        .post('/v1beta/models/gemini-2.5-flash-image-preview:generateContent')
        .query({ key: 'test-gemini-key' })
        .reply(200, mockSingleImageResponse);

      const result = await imageGenerationService.generateCombinedImage(mockCreativeBrief);

      expect(result).toHaveProperty('imageIndex', 0);
      expect(result).toHaveProperty('imageData');
      expect(result).toHaveProperty('mimeType', 'image/png');
      expect(result).toHaveProperty('buffer');
      expect(result).toHaveProperty('description');
      expect(result).toHaveProperty('metadata');
    });
  });

  describe('validateReferenceImages', () => {
    it('should validate reference images successfully', () => {
      const referenceImages = [
        { buffer: Buffer.from('image1'), mimetype: 'image/jpeg' },
        { buffer: Buffer.from('image2'), mimetype: 'image/png' }
      ];
      
      expect(() => {
        imageGenerationService.validateReferenceImages(referenceImages);
      }).not.toThrow();
    });

    it('should throw error for invalid buffer', () => {
      const referenceImages = [
        { buffer: 'not a buffer', mimetype: 'image/jpeg' }
      ];
      
      expect(() => {
        imageGenerationService.validateReferenceImages(referenceImages);
      }).toThrow('Invalid image buffer for reference image 1');
    });

    it('should throw error for unsupported format', () => {
      const referenceImages = [
        { buffer: Buffer.from('image1'), mimetype: 'image/gif' }
      ];
      
      expect(() => {
        imageGenerationService.validateReferenceImages(referenceImages);
      }).toThrow('Unsupported image format for reference image 1');
    });

    it('should throw error for empty image', () => {
      const referenceImages = [
        { buffer: Buffer.alloc(0), mimetype: 'image/jpeg' }
      ];
      
      expect(() => {
        imageGenerationService.validateReferenceImages(referenceImages);
      }).toThrow('Reference image 1 is empty');
    });

    it('should throw error for oversized image', () => {
      const largeBuffer = Buffer.alloc(11 * 1024 * 1024); // 11MB
      const referenceImages = [
        { buffer: largeBuffer, mimetype: 'image/jpeg' }
      ];
      
      expect(() => {
        imageGenerationService.validateReferenceImages(referenceImages);
      }).toThrow('Reference image 1 exceeds maximum file size of 10MB');
    });
  });

  describe('buildGenerationPrompt', () => {
    it('should build generation prompt without reference images', () => {
      const creativeBrief = 'Test creative brief';
      const options = { imageCount: 2, aspectRatio: '16:9' };
      
      const prompt = imageGenerationService.buildGenerationPrompt(creativeBrief, [], options);
      
      expect(prompt).toContain('CREATIVE BRIEF:');
      expect(prompt).toContain(creativeBrief);
      expect(prompt).toContain('Generate 2 distinct but cohesive images');
      expect(prompt).toContain('16:9 aspect ratio');
      expect(prompt).not.toContain('REFERENCE CONTEXT:');
    });

    it('should build generation prompt with reference images', () => {
      const creativeBrief = 'Test creative brief';
      const referenceImages = [{ buffer: Buffer.from('test'), mimetype: 'image/jpeg' }];
      const options = { imageCount: 1, aspectRatio: '1:1' };
      
      const prompt = imageGenerationService.buildGenerationPrompt(creativeBrief, referenceImages, options);
      
      expect(prompt).toContain('CREATIVE BRIEF:');
      expect(prompt).toContain('REFERENCE CONTEXT:');
      expect(prompt).toContain('Generate 1 distinct but cohesive images');
      expect(prompt).toContain('1:1 aspect ratio');
    });
  });

  describe('buildGenerationRequest', () => {
    it('should build request without reference images', () => {
      const prompt = 'Test prompt';
      const referenceImages = [];
      
      const request = imageGenerationService.buildGenerationRequest(prompt, referenceImages);
      
      expect(request).toHaveProperty('contents');
      expect(request).toHaveProperty('generationConfig');
      expect(request).toHaveProperty('safetySettings');
      expect(request.contents).toHaveLength(1);
      expect(request.contents[0].parts).toHaveLength(1);
      expect(request.contents[0].parts[0]).toHaveProperty('text', prompt);
    });

    it('should build request with reference images', () => {
      const prompt = 'Test prompt';
      const referenceImages = [
        { buffer: Buffer.from('test image'), mimetype: 'image/jpeg' }
      ];
      
      const request = imageGenerationService.buildGenerationRequest(prompt, referenceImages);
      
      expect(request.contents[0].parts).toHaveLength(2);
      expect(request.contents[0].parts[0]).toHaveProperty('text', prompt);
      expect(request.contents[0].parts[1]).toHaveProperty('inlineData');
      expect(request.contents[0].parts[1].inlineData).toHaveProperty('mimeType', 'image/jpeg');
      expect(request.contents[0].parts[1].inlineData).toHaveProperty('data');
    });
  });

  describe('convertImageToBase64', () => {
    it('should convert image buffer to base64 with proper data URL format', () => {
      const imageBuffer = Buffer.from('test image data');
      const mimeType = 'image/jpeg';
      
      const result = imageGenerationService.convertImageToBase64(imageBuffer, mimeType);
      
      expect(result).toBe('data:image/jpeg;base64,dGVzdCBpbWFnZSBkYXRh');
    });

    it('should throw error for invalid buffer', () => {
      expect(() => {
        imageGenerationService.convertImageToBase64('not a buffer', 'image/jpeg');
      }).toThrow('Invalid image buffer provided');
    });

    it('should throw error for invalid MIME type', () => {
      const imageBuffer = Buffer.from('test');
      
      expect(() => {
        imageGenerationService.convertImageToBase64(imageBuffer, 'text/plain');
      }).toThrow('Invalid image MIME type provided');
    });
  });

  describe('parseGenerationResponse', () => {
    it('should parse valid Gemini response with multiple images', () => {
      const mockResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: {
                    mimeType: 'image/png',
                    data: 'dGVzdDE='
                  }
                },
                {
                  inlineData: {
                    mimeType: 'image/jpeg',
                    data: 'dGVzdDI='
                  }
                }
              ]
            }
          }
        ]
      };

      const result = imageGenerationService.parseGenerationResponse(mockResponse);

      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('imageIndex', 0);
      expect(result[0]).toHaveProperty('imageData', 'dGVzdDE=');
      expect(result[0]).toHaveProperty('mimeType', 'image/png');
      expect(result[1]).toHaveProperty('imageIndex', 1);
      expect(result[1]).toHaveProperty('imageData', 'dGVzdDI=');
      expect(result[1]).toHaveProperty('mimeType', 'image/jpeg');
    });

    it('should throw error when no images generated', () => {
      const mockResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: 'No images generated'
                }
              ]
            }
          }
        ]
      };

      expect(() => {
        imageGenerationService.parseGenerationResponse(mockResponse);
      }).toThrow('No images were generated in the response');
    });

    it('should throw error for invalid response format', () => {
      const mockResponse = {};

      expect(() => {
        imageGenerationService.parseGenerationResponse(mockResponse);
      }).toThrow('Failed to parse generation response');
    });
  });

  describe('formatImageResults', () => {
    it('should format generated images correctly', () => {
      const generatedImages = [
        {
          imageIndex: 0,
          imageData: 'dGVzdDE=',
          mimeType: 'image/png',
          timestamp: '2023-01-01T00:00:00.000Z'
        }
      ];
      const creativeBrief = 'Test creative brief for formatting';

      const result = imageGenerationService.formatImageResults(generatedImages, creativeBrief);

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('imageIndex', 0);
      expect(result[0]).toHaveProperty('imageData', 'dGVzdDE=');
      expect(result[0]).toHaveProperty('mimeType', 'image/png');
      expect(result[0]).toHaveProperty('buffer');
      expect(Buffer.isBuffer(result[0].buffer)).toBe(true);
      expect(result[0]).toHaveProperty('description');
      expect(result[0].description).toContain('Generated image 1 based on creative brief');
      expect(result[0]).toHaveProperty('metadata');
      expect(result[0].metadata).toHaveProperty('generatedFromBrief', creativeBrief);
      expect(result[0].metadata).toHaveProperty('model', 'gemini-2.5-flash-image-preview');
    });
  });

  describe('makeApiCall', () => {
    it('should make successful API call with proper URL and headers', async () => {
      const mockResponse = {
        data: {
          candidates: [{
            content: {
              parts: [{
                inlineData: {
                  mimeType: 'image/png',
                  data: 'dGVzdA=='
                }
              }]
            }
          }]
        }
      };
      
      nock('https://generativelanguage.googleapis.com')
        .post('/v1beta/models/gemini-2.5-flash-image-preview:generateContent')
        .query({ key: 'test-gemini-key' })
        .reply(200, mockResponse.data);
      
      const payload = { test: 'payload' };
      const result = await imageGenerationService.makeApiCall(payload);
      
      expect(result.data).toEqual(mockResponse.data);
    });

    it('should handle API error responses', async () => {
      nock('https://generativelanguage.googleapis.com')
        .post('/v1beta/models/gemini-2.5-flash-image-preview:generateContent')
        .query({ key: 'test-gemini-key' })
        .reply(400, { error: { message: 'Bad request' } });

      await expect(imageGenerationService.makeApiCall({}))
        .rejects.toThrow('Gemini API error (400): Bad request');
    });

    it('should handle network errors', async () => {
      nock('https://generativelanguage.googleapis.com')
        .post('/v1beta/models/gemini-2.5-flash-image-preview:generateContent')
        .query({ key: 'test-gemini-key' })
        .replyWithError('Network Error');

      await expect(imageGenerationService.makeApiCall({}))
        .rejects.toThrow('Network error: Unable to reach Gemini API');
    });

    it('should handle invalid response format', async () => {
      nock('https://generativelanguage.googleapis.com')
        .post('/v1beta/models/gemini-2.5-flash-image-preview:generateContent')
        .query({ key: 'test-gemini-key' })
        .reply(200, {});

      await expect(imageGenerationService.makeApiCall({}))
        .rejects.toThrow('Invalid response format from Gemini API');
    });
  });

  describe('sleep', () => {
    it('should resolve after specified delay', async () => {
      const start = Date.now();
      await imageGenerationService.sleep(100);
      const end = Date.now();
      
      expect(end - start).toBeGreaterThanOrEqual(90); // Allow some variance
    });
  });
});