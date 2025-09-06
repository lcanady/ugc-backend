const request = require('supertest');
const express = require('express');
const multer = require('multer');
const ugcController = require('../../../src/controllers/ugcController');
const imageAnalysisService = require('../../../src/services/imageAnalysisService');
const scriptGenerationService = require('../../../src/services/scriptGenerationService');
const videoGenerationService = require('../../../src/services/videoGenerationService');
const config = require('../../../src/utils/config');

// Mock the services
jest.mock('../../../src/services/imageAnalysisService');
jest.mock('../../../src/services/scriptGenerationService');
jest.mock('../../../src/services/videoGenerationService');
jest.mock('../../../src/utils/config');

describe('UGCController', () => {
  let app;
  let upload;

  beforeEach(() => {
    // Create Express app for testing
    app = express();
    app.use(express.json());
    
    // Configure multer for file uploads
    upload = multer({ storage: multer.memoryStorage() });
    
    // Set up routes
    app.post('/api/v1/ugc/generate', upload.array('images'), ugcController.generateUGCAd.bind(ugcController));
    app.post('/api/v1/ugc/download', ugcController.downloadVideos.bind(ugcController));
    app.get('/api/v1/ugc/status/:operationId', ugcController.getGenerationStatus.bind(ugcController));

    // Mock config
    config.maxImages = 5;

    // Clear all mocks
    jest.clearAllMocks();
  });

  describe('generateUGCAd', () => {
    const mockImageAnalysis = [
      {
        imageIndex: 0,
        filename: 'test1.jpg',
        objects: ['product', 'table'],
        people: ['young adult'],
        setting: 'indoor kitchen',
        actions: ['cooking'],
        colors: ['white', 'blue'],
        mood: 'cheerful'
      }
    ];

    const mockScriptResult = {
      'segment-1': 'First segment description',
      'segment-2': 'Second segment description',
      timestamp: '2024-01-01T00:00:00.000Z',
      model: 'gpt-4',
      usage: { tokens: 100 }
    };

    const mockVideoSegments = [
      {
        segmentKey: 'segment-1',
        videoFile: 'https://example.com/video1.mp4',
        status: 'completed'
      },
      {
        segmentKey: 'segment-2', 
        videoFile: 'https://example.com/video2.mp4',
        status: 'completed'
      }
    ];

    beforeEach(() => {
      imageAnalysisService.analyzeImages.mockResolvedValue(mockImageAnalysis);
      scriptGenerationService.generateScript.mockResolvedValue(mockScriptResult);
      videoGenerationService.createUGCPrompts.mockReturnValue([
        { segmentKey: 'segment-1', prompt: 'Prompt 1', options: {} },
        { segmentKey: 'segment-2', prompt: 'Prompt 2', options: {} }
      ]);
      videoGenerationService.generateVideoSegments.mockResolvedValue(mockVideoSegments);
    });

    it('should successfully generate UGC ad with valid inputs', async () => {
      const response = await request(app)
        .post('/api/v1/ugc/generate')
        .field('creativeBrief', 'Test creative brief for product advertisement')
        .attach('images', Buffer.from('fake-image-data'), 'test1.jpg')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.creativeBrief).toBe('Test creative brief for product advertisement');
      expect(response.body.data.imageAnalysis).toEqual(mockImageAnalysis);
      expect(response.body.data.script.segments).toEqual({
        'segment-1': mockScriptResult['segment-1'],
        'segment-2': mockScriptResult['segment-2']
      });
      expect(response.body.data.videoSegments).toHaveLength(2);
      expect(response.body.message).toBe('UGC advertisement generated successfully');
    });

    it('should handle optional script refinement', async () => {
      const response = await request(app)
        .post('/api/v1/ugc/generate')
        .field('creativeBrief', 'Test creative brief')
        .field('script', 'User provided script to refine')
        .attach('images', Buffer.from('fake-image-data'), 'test1.jpg')
        .expect(200);

      expect(scriptGenerationService.generateScript).toHaveBeenCalledWith(
        'Test creative brief',
        mockImageAnalysis,
        'User provided script to refine'
      );
      expect(response.body.success).toBe(true);
    });

    it('should return 400 when creative brief is missing', async () => {
      const response = await request(app)
        .post('/api/v1/ugc/generate')
        .attach('images', Buffer.from('fake-image-data'), 'test1.jpg')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Creative brief is required and must be a non-empty string');
      expect(response.body.code).toBe('INVALID_CREATIVE_BRIEF');
    });

    it('should return 400 when creative brief is empty string', async () => {
      const response = await request(app)
        .post('/api/v1/ugc/generate')
        .field('creativeBrief', '   ')
        .attach('images', Buffer.from('fake-image-data'), 'test1.jpg')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Creative brief is required and must be a non-empty string');
      expect(response.body.code).toBe('INVALID_CREATIVE_BRIEF');
    });

    it('should return 400 when no images are provided', async () => {
      const response = await request(app)
        .post('/api/v1/ugc/generate')
        .field('creativeBrief', 'Test creative brief')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('At least one image is required');
      expect(response.body.code).toBe('NO_IMAGES_PROVIDED');
    });

    it('should return 400 when too many images are provided', async () => {
      const response = await request(app)
        .post('/api/v1/ugc/generate')
        .field('creativeBrief', 'Test creative brief')
        .attach('images', Buffer.from('fake-image-data'), 'test1.jpg')
        .attach('images', Buffer.from('fake-image-data'), 'test2.jpg')
        .attach('images', Buffer.from('fake-image-data'), 'test3.jpg')
        .attach('images', Buffer.from('fake-image-data'), 'test4.jpg')
        .attach('images', Buffer.from('fake-image-data'), 'test5.jpg')
        .attach('images', Buffer.from('fake-image-data'), 'test6.jpg')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Maximum 5 images allowed');
      expect(response.body.code).toBe('TOO_MANY_IMAGES');
    });

    it('should handle image analysis service errors', async () => {
      imageAnalysisService.analyzeImages.mockRejectedValue(new Error('Image analysis failed'));

      const response = await request(app)
        .post('/api/v1/ugc/generate')
        .field('creativeBrief', 'Test creative brief')
        .attach('images', Buffer.from('fake-image-data'), 'test1.jpg')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Image analysis failed');
      expect(response.body.code).toBe('UGC_GENERATION_ERROR');
    });

    it('should handle script generation service errors', async () => {
      scriptGenerationService.generateScript.mockRejectedValue(new Error('Script generation failed'));

      const response = await request(app)
        .post('/api/v1/ugc/generate')
        .field('creativeBrief', 'Test creative brief')
        .attach('images', Buffer.from('fake-image-data'), 'test1.jpg')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Script generation failed');
      expect(response.body.code).toBe('UGC_GENERATION_ERROR');
    });

    it('should handle video generation service errors', async () => {
      videoGenerationService.generateVideoSegments.mockRejectedValue(new Error('Video generation failed'));

      const response = await request(app)
        .post('/api/v1/ugc/generate')
        .field('creativeBrief', 'Test creative brief')
        .attach('images', Buffer.from('fake-image-data'), 'test1.jpg')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Video generation failed');
      expect(response.body.code).toBe('UGC_GENERATION_ERROR');
    });
  });

  describe('downloadVideos', () => {
    const mockVideoSegments = [
      {
        segmentKey: 'segment-1',
        videoFile: 'https://example.com/video1.mp4'
      },
      {
        segmentKey: 'segment-2',
        videoFile: 'https://example.com/video2.mp4'
      }
    ];

    beforeEach(() => {
      videoGenerationService.downloadVideo.mockResolvedValue('/path/to/downloaded/video.mp4');
    });

    it('should successfully download videos', async () => {
      const response = await request(app)
        .post('/api/v1/ugc/download')
        .send({
          videoSegments: mockVideoSegments,
          format: 'mp4'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.downloads).toHaveLength(2);
      expect(response.body.data.totalSegments).toBe(2);
      expect(response.body.message).toBe('Videos downloaded successfully');

      // Verify download service was called for each segment
      expect(videoGenerationService.downloadVideo).toHaveBeenCalledTimes(2);
    });

    it('should use default mp4 format when format not specified', async () => {
      const response = await request(app)
        .post('/api/v1/ugc/download')
        .send({
          videoSegments: mockVideoSegments
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.downloads[0].filename).toBe('segment_1.mp4');
    });

    it('should return 400 when video segments are missing', async () => {
      const response = await request(app)
        .post('/api/v1/ugc/download')
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Video segments are required');
      expect(response.body.code).toBe('NO_VIDEO_SEGMENTS');
    });

    it('should return 400 when video segments is empty array', async () => {
      const response = await request(app)
        .post('/api/v1/ugc/download')
        .send({
          videoSegments: []
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Video segments are required');
      expect(response.body.code).toBe('NO_VIDEO_SEGMENTS');
    });

    it('should handle missing video file in segment', async () => {
      const invalidSegments = [
        {
          segmentKey: 'segment-1'
          // Missing videoFile
        }
      ];

      const response = await request(app)
        .post('/api/v1/ugc/download')
        .send({
          videoSegments: invalidSegments
        })
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Video file missing for segment 1');
      expect(response.body.code).toBe('VIDEO_DOWNLOAD_ERROR');
    });

    it('should handle video download service errors', async () => {
      videoGenerationService.downloadVideo.mockRejectedValue(new Error('Download failed'));

      const response = await request(app)
        .post('/api/v1/ugc/download')
        .send({
          videoSegments: mockVideoSegments
        })
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Failed to download segment 1: Download failed');
      expect(response.body.code).toBe('VIDEO_DOWNLOAD_ERROR');
    });
  });

  describe('getGenerationStatus', () => {
    it('should return status for valid operation ID', async () => {
      const operationId = 'test-operation-123';

      const response = await request(app)
        .get(`/api/v1/ugc/status/${operationId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.operationId).toBe(operationId);
      expect(response.body.data.status).toBe('completed');
      expect(response.body.data.progress).toBe(100);
      expect(response.body.data.steps).toHaveLength(3);
    });

    it('should return 400 when operation ID is missing', async () => {
      const response = await request(app)
        .get('/api/v1/ugc/status/')
        .expect(404); // Express returns 404 for missing route params
    });
  });

  describe('validateOptions', () => {
    it('should validate aspect ratio options', () => {
      const validOptions = { aspectRatio: '16:9' };
      const result = ugcController.validateOptions(validOptions);
      expect(result.aspectRatio).toBe('16:9');
    });

    it('should throw error for invalid aspect ratio', () => {
      const invalidOptions = { aspectRatio: '4:3' };
      expect(() => ugcController.validateOptions(invalidOptions))
        .toThrow('Invalid aspect ratio. Must be one of: 16:9, 9:16, 1:1');
    });

    it('should validate person generation options', () => {
      const validOptions = { personGeneration: 'allow_adult' };
      const result = ugcController.validateOptions(validOptions);
      expect(result.personGeneration).toBe('allow_adult');
    });

    it('should throw error for invalid person generation', () => {
      const invalidOptions = { personGeneration: 'invalid_option' };
      expect(() => ugcController.validateOptions(invalidOptions))
        .toThrow('Invalid person generation setting. Must be one of: allow_all, allow_adult, dont_allow');
    });

    it('should validate segment count', () => {
      const validOptions = { segmentCount: 2 };
      const result = ugcController.validateOptions(validOptions);
      expect(result.segmentCount).toBe(2);
    });

    it('should throw error for invalid segment count', () => {
      const invalidOptions = { segmentCount: 5 };
      expect(() => ugcController.validateOptions(invalidOptions))
        .toThrow('Segment count must be between 1 and 4');
    });

    it('should validate segment duration', () => {
      const validOptions = { segmentDuration: 7 };
      const result = ugcController.validateOptions(validOptions);
      expect(result.segmentDuration).toBe(7);
    });

    it('should throw error for invalid segment duration', () => {
      const invalidOptions = { segmentDuration: 10 };
      expect(() => ugcController.validateOptions(invalidOptions))
        .toThrow('Segment duration must be between 5 and 8 seconds');
    });
  });

  describe('generateResultId', () => {
    it('should generate unique result IDs', () => {
      const id1 = ugcController.generateResultId();
      const id2 = ugcController.generateResultId();
      
      expect(id1).toMatch(/^ugc_\d+_[a-z0-9]+$/);
      expect(id2).toMatch(/^ugc_\d+_[a-z0-9]+$/);
      expect(id1).not.toBe(id2);
    });
  });
});