const videoGenerationService = require('../../../src/services/videoGenerationService');
const { GoogleGenAI } = require('@google/genai');

// Mock the GoogleGenAI module
jest.mock('@google/genai');
jest.mock('../../../src/utils/config', () => ({
  googleAiApiKey: 'test_google_ai_key'
}));

describe('VideoGenerationService', () => {
  let mockAi;
  let mockModels;
  let mockOperations;
  let mockFiles;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create mock objects
    mockModels = {
      generateVideos: jest.fn()
    };

    mockOperations = {
      getVideosOperation: jest.fn()
    };

    mockFiles = {
      download: jest.fn()
    };

    mockAi = {
      models: mockModels,
      operations: mockOperations,
      files: mockFiles
    };

    // Mock GoogleGenAI constructor
    GoogleGenAI.mockImplementation(() => mockAi);
    
    // Override the service's ai property
    videoGenerationService.ai = mockAi;
  });

  describe('generateVideo', () => {
    const validPrompt = 'A cinematic shot of a person walking in a park';
    const mockOperation = {
      name: 'operations/test-operation-123',
      done: false
    };

    const mockCompletedOperation = {
      name: 'operations/test-operation-123',
      done: true,
      response: {
        generatedVideos: [{
          video: {
            name: 'files/test-video-123',
            uri: 'https://example.com/video.mp4'
          }
        }]
      }
    };

    beforeEach(() => {
      mockModels.generateVideos.mockResolvedValue(mockCompletedOperation); // Return completed operation immediately
      mockOperations.getVideosOperation.mockResolvedValue(mockCompletedOperation);
      
      // Mock sleep to avoid delays
      jest.spyOn(videoGenerationService, 'sleep').mockResolvedValue();
    });

    it('should generate video with valid prompt', async () => {
      const result = await videoGenerationService.generateVideo(validPrompt);

      expect(mockModels.generateVideos).toHaveBeenCalledWith({
        model: 'veo-3.0-generate-preview',
        prompt: validPrompt,
        config: {
          aspectRatio: '16:9',
          personGeneration: 'allow_adult'
        }
      });

      expect(result).toEqual({
        videoFile: mockCompletedOperation.response.generatedVideos[0].video,
        prompt: validPrompt,
        model: 'veo-3.0-generate-preview',
        generatedAt: expect.any(String),
        duration: 8,
        resolution: '720p',
        frameRate: '24fps',
        hasAudio: true,
        metadata: {
          operationName: mockCompletedOperation.name,
          generationTime: expect.any(String)
        }
      });
    });

    it('should generate video with image input', async () => {
      const imageBuffer = Buffer.from('fake-image-data');
      const imageMimeType = 'image/jpeg';
      const options = {
        imageBuffer,
        imageMimeType,
        aspectRatio: '16:9'
      };

      await videoGenerationService.generateVideo(validPrompt, options);

      expect(mockModels.generateVideos).toHaveBeenCalledWith({
        model: 'veo-3.0-generate-preview',
        prompt: validPrompt,
        image: {
          imageBytes: imageBuffer,
          mimeType: imageMimeType
        },
        config: {
          aspectRatio: '16:9',
          personGeneration: 'allow_adult'
        }
      });
    });

    it('should use fast model when requested', async () => {
      const options = { useFastModel: true };

      await videoGenerationService.generateVideo(validPrompt, options);

      expect(mockModels.generateVideos).toHaveBeenCalledWith({
        model: 'veo-3.0-fast-generate-preview',
        prompt: validPrompt,
        config: {
          aspectRatio: '16:9',
          personGeneration: 'allow_adult'
        }
      });
    });

    it('should include negative prompt and person generation settings', async () => {
      const options = {
        negativePrompt: 'low quality, blurry',
        personGeneration: 'allow_all',
        aspectRatio: '9:16'
      };

      await videoGenerationService.generateVideo(validPrompt, options);

      expect(mockModels.generateVideos).toHaveBeenCalledWith({
        model: 'veo-3.0-generate-preview',
        prompt: validPrompt,
        config: {
          aspectRatio: '9:16',
          negativePrompt: 'low quality, blurry',
          personGeneration: 'allow_all'
        }
      });
    });

    it('should throw error for empty prompt', async () => {
      await expect(videoGenerationService.generateVideo('')).rejects.toThrow(
        'Video prompt is required and must be a non-empty string'
      );
    });

    it('should throw error for prompt exceeding character limit', async () => {
      const longPrompt = 'a'.repeat(1025);
      
      await expect(videoGenerationService.generateVideo(longPrompt)).rejects.toThrow(
        'Video prompt must be 1024 characters or less'
      );
    });

    it('should throw error for invalid image input', async () => {
      const options = {
        imageBuffer: Buffer.from('fake-image'),
        imageMimeType: 'invalid/type'
      };

      await expect(videoGenerationService.generateVideo(validPrompt, options)).rejects.toThrow(
        'Unsupported image format'
      );
    });

    it('should throw error when image buffer provided without mime type', async () => {
      const options = {
        imageBuffer: Buffer.from('fake-image')
      };

      await expect(videoGenerationService.generateVideo(validPrompt, options)).rejects.toThrow(
        'Image MIME type is required when providing image buffer'
      );
    });

    it('should handle API errors gracefully', async () => {
      mockModels.generateVideos.mockRejectedValue(new Error('API Error'));

      await expect(videoGenerationService.generateVideo(validPrompt)).rejects.toThrow(
        'Failed to generate video after 3 attempts: Failed to start video generation: API Error'
      );
    });

    it('should handle safety filter errors', async () => {
      mockModels.generateVideos.mockRejectedValue(new Error('Content blocked by safety filters'));

      await expect(videoGenerationService.generateVideo(validPrompt)).rejects.toThrow(
        'Video generation blocked by safety filters'
      );
    });

    it('should poll for completion until done', async () => {
      const pendingOperation = { ...mockOperation, done: false };
      const completedOperation = { ...mockCompletedOperation, done: true };

      // First return pending operation, then completed
      mockModels.generateVideos.mockResolvedValue(pendingOperation);
      mockOperations.getVideosOperation
        .mockResolvedValueOnce(pendingOperation)
        .mockResolvedValueOnce(pendingOperation)
        .mockResolvedValueOnce(completedOperation);

      // Mock sleep to avoid actual delays in tests
      jest.spyOn(videoGenerationService, 'sleep').mockResolvedValue();

      await videoGenerationService.generateVideo(validPrompt);

      expect(mockOperations.getVideosOperation).toHaveBeenCalledTimes(3);
    });

    it('should handle operation timeout', async () => {
      const pendingOperation = { ...mockOperation, done: false };
      mockModels.generateVideos.mockResolvedValue(pendingOperation);
      mockOperations.getVideosOperation.mockResolvedValue(pendingOperation);

      // Mock Date.now to simulate timeout
      const originalDateNow = Date.now;
      let callCount = 0;
      Date.now = jest.fn(() => {
        callCount++;
        return callCount > 1 ? originalDateNow() + 400000 : originalDateNow(); // Simulate 400 seconds passed
      });

      jest.spyOn(videoGenerationService, 'sleep').mockResolvedValue();

      await expect(videoGenerationService.generateVideo(validPrompt)).rejects.toThrow(
        'Video generation timed out after 6 minutes'
      );

      Date.now = originalDateNow;
    });

    it('should handle operation errors', async () => {
      const errorOperation = {
        ...mockCompletedOperation,
        done: true,
        error: { message: 'Generation failed' }
      };

      mockModels.generateVideos.mockResolvedValue(errorOperation);
      mockOperations.getVideosOperation.mockResolvedValue(errorOperation);

      await expect(videoGenerationService.generateVideo(validPrompt)).rejects.toThrow(
        'Video generation failed: Generation failed'
      );
    });
  });

  describe('generateVideoSegments', () => {
    const mockSegments = [
      { prompt: 'First segment prompt', options: { aspectRatio: '16:9' } },
      { prompt: 'Second segment prompt', options: { negativePrompt: 'low quality' } }
    ];

    const mockOperation = {
      name: 'operations/test-operation-123',
      done: true,
      response: {
        generatedVideos: [{
          video: { name: 'files/test-video-123' }
        }]
      }
    };

    beforeEach(() => {
      mockModels.generateVideos.mockResolvedValue(mockOperation);
      mockOperations.getVideosOperation.mockResolvedValue(mockOperation);
    });

    it('should generate multiple video segments', async () => {
      const results = await videoGenerationService.generateVideoSegments(mockSegments);

      expect(results).toHaveLength(2);
      expect(results[0]).toMatchObject({
        segmentIndex: 0,
        prompt: 'First segment prompt'
      });
      expect(results[1]).toMatchObject({
        segmentIndex: 1,
        prompt: 'Second segment prompt'
      });
    });

    it('should apply global options to all segments', async () => {
      const globalOptions = { personGeneration: 'allow_all' };
      
      await videoGenerationService.generateVideoSegments(mockSegments, globalOptions);

      expect(mockModels.generateVideos).toHaveBeenCalledTimes(2);
      
      // Check that global options are applied
      const firstCall = mockModels.generateVideos.mock.calls[0][0];
      const secondCall = mockModels.generateVideos.mock.calls[1][0];
      
      expect(firstCall.config.personGeneration).toBe('allow_all');
      expect(secondCall.config.personGeneration).toBe('allow_all');
    });

    it('should throw error for empty segments array', async () => {
      await expect(videoGenerationService.generateVideoSegments([])).rejects.toThrow(
        'Segments array is required and must not be empty'
      );
    });

    it('should throw error for too many segments', async () => {
      const tooManySegments = Array(5).fill({ prompt: 'test prompt' });
      
      await expect(videoGenerationService.generateVideoSegments(tooManySegments)).rejects.toThrow(
        'Maximum of 4 video segments allowed per request'
      );
    });

    it('should handle segment generation failure', async () => {
      mockModels.generateVideos
        .mockResolvedValueOnce(mockOperation)
        .mockRejectedValueOnce(new Error('Segment failed'));

      await expect(videoGenerationService.generateVideoSegments(mockSegments)).rejects.toThrow(
        'Failed to generate segment 2: Failed to generate video after 3 attempts: Failed to start video generation: Segment failed'
      );
    });
  });

  describe('validateImageInput', () => {
    it('should validate correct image input', () => {
      const imageBuffer = Buffer.from('fake-image-data');
      const imageMimeType = 'image/jpeg';

      expect(() => {
        videoGenerationService.validateImageInput(imageBuffer, imageMimeType);
      }).not.toThrow();
    });

    it('should throw error for non-buffer input', () => {
      expect(() => {
        videoGenerationService.validateImageInput('not-a-buffer', 'image/jpeg');
      }).toThrow('Image must be provided as a Buffer');
    });

    it('should throw error for unsupported format', () => {
      const imageBuffer = Buffer.from('fake-image-data');
      
      expect(() => {
        videoGenerationService.validateImageInput(imageBuffer, 'image/gif');
      }).toThrow('Unsupported image format');
    });

    it('should throw error for oversized image', () => {
      const largeBuffer = Buffer.alloc(25 * 1024 * 1024); // 25MB
      
      expect(() => {
        videoGenerationService.validateImageInput(largeBuffer, 'image/jpeg');
      }).toThrow('Image size exceeds maximum of 20MB');
    });

    it('should throw error for empty buffer', () => {
      const emptyBuffer = Buffer.alloc(0);
      
      expect(() => {
        videoGenerationService.validateImageInput(emptyBuffer, 'image/jpeg');
      }).toThrow('Image buffer is empty');
    });
  });

  describe('createUGCPrompts', () => {
    const creativeBrief = 'Create an engaging ad for a fitness app';
    const imageAnalysis = [
      {
        objects: ['smartphone', 'gym equipment'],
        people: ['young woman', 'fitness trainer'],
        setting: 'modern gym',
        actions: ['exercising', 'using phone'],
        colors: ['blue', 'white'],
        mood: 'energetic'
      }
    ];
    const scriptSegments = {
      segment1: {
        action: 'woman opens fitness app',
        dialogue: 'Ready to transform your workout?',
        soundEffects: 'app notification sound'
      },
      segment2: {
        action: 'trainer demonstrates exercise',
        dialogue: 'Follow along with expert guidance',
        ambientSound: 'gym background noise'
      }
    };

    it('should create UGC prompts from creative brief and analysis', () => {
      const prompts = videoGenerationService.createUGCPrompts(
        creativeBrief,
        imageAnalysis,
        scriptSegments
      );

      expect(prompts).toHaveLength(2);
      
      expect(prompts[0]).toMatchObject({
        segmentKey: 'segment1',
        prompt: expect.stringContaining('woman opens fitness app'),
        options: {
          aspectRatio: '16:9',
          personGeneration: 'allow_adult',
          negativePrompt: expect.stringContaining('low quality')
        }
      });

      expect(prompts[1]).toMatchObject({
        segmentKey: 'segment2',
        prompt: expect.stringContaining('trainer demonstrates exercise'),
        options: {
          aspectRatio: '16:9',
          personGeneration: 'allow_adult',
          negativePrompt: expect.stringContaining('low quality')
        }
      });
    });

    it('should include dialogue in prompts', () => {
      const prompts = videoGenerationService.createUGCPrompts(
        creativeBrief,
        imageAnalysis,
        scriptSegments
      );

      expect(prompts[0].prompt).toContain('"Ready to transform your workout?"');
      expect(prompts[1].prompt).toContain('"Follow along with expert guidance"');
    });

    it('should include visual elements from analysis', () => {
      const prompts = videoGenerationService.createUGCPrompts(
        creativeBrief,
        imageAnalysis,
        scriptSegments
      );

      expect(prompts[0].prompt).toContain('young woman');
      expect(prompts[0].prompt).toContain('modern gym');
      expect(prompts[0].prompt).toContain('smartphone');
    });

    it('should include audio cues', () => {
      const prompts = videoGenerationService.createUGCPrompts(
        creativeBrief,
        imageAnalysis,
        scriptSegments
      );

      expect(prompts[0].prompt).toContain('Sound effects: app notification sound');
      expect(prompts[1].prompt).toContain('Ambient sound: gym background noise');
    });

    it('should throw error for missing required parameters', () => {
      expect(() => {
        videoGenerationService.createUGCPrompts(null, imageAnalysis, scriptSegments);
      }).toThrow('Creative brief and script segments are required');

      expect(() => {
        videoGenerationService.createUGCPrompts(creativeBrief, imageAnalysis, null);
      }).toThrow('Creative brief and script segments are required');
    });

    it('should handle empty image analysis', () => {
      const prompts = videoGenerationService.createUGCPrompts(
        creativeBrief,
        [],
        scriptSegments
      );

      expect(prompts).toHaveLength(2);
      expect(prompts[0].prompt).toContain('woman opens fitness app');
    });

    it('should limit prompt length', () => {
      const longScriptSegments = {
        segment1: {
          action: 'a'.repeat(500),
          dialogue: 'b'.repeat(500),
          soundEffects: 'c'.repeat(500)
        }
      };

      const prompts = videoGenerationService.createUGCPrompts(
        creativeBrief,
        imageAnalysis,
        longScriptSegments
      );

      expect(prompts[0].prompt.length).toBeLessThanOrEqual(1000);
    });
  });

  describe('downloadVideo', () => {
    const mockVideoFile = {
      name: 'files/test-video-123',
      uri: 'https://example.com/video.mp4'
    };
    const downloadPath = '/tmp/test-video.mp4';

    beforeEach(() => {
      mockFiles.download.mockResolvedValue();
      
      // Mock fs.mkdir and fs.stat
      const fs = require('fs').promises;
      jest.spyOn(fs, 'mkdir').mockResolvedValue();
      jest.spyOn(fs, 'stat').mockResolvedValue({ size: 1024 });
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should download video successfully', async () => {
      const result = await videoGenerationService.downloadVideo(mockVideoFile, downloadPath);

      expect(mockFiles.download).toHaveBeenCalledWith({
        file: mockVideoFile,
        downloadPath: downloadPath
      });

      expect(result).toBe(downloadPath);
    });

    it('should throw error for missing video file', async () => {
      await expect(videoGenerationService.downloadVideo(null, downloadPath)).rejects.toThrow(
        'Video file object is required'
      );
    });

    it('should throw error for missing download path', async () => {
      await expect(videoGenerationService.downloadVideo(mockVideoFile, null)).rejects.toThrow(
        'Download path is required'
      );
    });

    it('should handle download errors', async () => {
      mockFiles.download.mockRejectedValue(new Error('Download failed'));

      await expect(videoGenerationService.downloadVideo(mockVideoFile, downloadPath)).rejects.toThrow(
        'Failed to download video: Download failed'
      );
    });

    it('should throw error for empty downloaded file', async () => {
      const fs = require('fs').promises;
      jest.spyOn(fs, 'stat').mockResolvedValue({ size: 0 });

      await expect(videoGenerationService.downloadVideo(mockVideoFile, downloadPath)).rejects.toThrow(
        'Downloaded video file is empty'
      );
    });
  });

  describe('extractVisualElements', () => {
    it('should extract and deduplicate visual elements', () => {
      const imageAnalysis = [
        {
          objects: ['phone', 'laptop'],
          people: ['woman', 'man'],
          setting: 'office',
          actions: ['typing', 'talking'],
          colors: ['blue', 'white'],
          mood: 'professional'
        },
        {
          objects: ['phone', 'coffee'], // phone is duplicate
          people: ['woman'], // woman is duplicate
          setting: 'cafe',
          actions: ['drinking'],
          colors: ['brown'],
          mood: 'relaxed'
        }
      ];

      const elements = videoGenerationService.extractVisualElements(imageAnalysis);

      expect(elements.objects).toEqual(['phone', 'laptop', 'coffee']);
      expect(elements.people).toEqual(['woman', 'man']);
      expect(elements.settings).toEqual(['office', 'cafe']);
      expect(elements.actions).toEqual(['typing', 'talking', 'drinking']);
      expect(elements.colors).toEqual(['blue', 'white', 'brown']);
      expect(elements.mood).toEqual(['professional', 'relaxed']);
    });

    it('should handle empty or invalid analysis', () => {
      expect(videoGenerationService.extractVisualElements(null)).toEqual({
        objects: [],
        people: [],
        settings: [],
        actions: [],
        colors: [],
        mood: []
      });

      expect(videoGenerationService.extractVisualElements([])).toEqual({
        objects: [],
        people: [],
        settings: [],
        actions: [],
        colors: [],
        mood: []
      });
    });

    it('should limit elements to 5 per category', () => {
      const imageAnalysis = [{
        objects: ['obj1', 'obj2', 'obj3', 'obj4', 'obj5', 'obj6', 'obj7']
      }];

      const elements = videoGenerationService.extractVisualElements(imageAnalysis);
      expect(elements.objects).toHaveLength(5);
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
        expect(videoGenerationService.isRetryableError(error)).toBe(true);
      });
    });

    it('should identify non-retryable errors', () => {
      const nonRetryableErrors = [
        new Error('Invalid API key'),
        new Error('Content blocked by safety filters'),
        new Error('Invalid prompt format')
      ];

      nonRetryableErrors.forEach(error => {
        expect(videoGenerationService.isRetryableError(error)).toBe(false);
      });
    });
  });
});