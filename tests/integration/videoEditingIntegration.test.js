const request = require('supertest');
const path = require('path');
const fs = require('fs').promises;
const videoEditingService = require('../../src/services/videoEditingService');

// Mock FFmpeg for integration tests
jest.mock('fluent-ffmpeg', () => {
  const mockCommand = {
    seekInput: jest.fn().mockReturnThis(),
    duration: jest.fn().mockReturnThis(),
    output: jest.fn().mockReturnThis(),
    videoCodec: jest.fn().mockReturnThis(),
    audioCodec: jest.fn().mockReturnThis(),
    on: jest.fn().mockReturnThis(),
    run: jest.fn(),
    input: jest.fn().mockReturnThis(),
    inputOptions: jest.fn().mockReturnThis(),
    videoBitrate: jest.fn().mockReturnThis(),
    audioBitrate: jest.fn().mockReturnThis(),
    size: jest.fn().mockReturnThis(),
    preset: jest.fn().mockReturnThis(),
    fps: jest.fn().mockReturnThis(),
    addOption: jest.fn().mockReturnThis(),
    complexFilter: jest.fn().mockReturnThis(),
    map: jest.fn().mockReturnThis(),
    videoFilters: jest.fn().mockReturnThis(),
    audioFilters: jest.fn().mockReturnThis()
  };

  const mockFfmpeg = jest.fn(() => mockCommand);
  mockFfmpeg.setFfmpegPath = jest.fn();
  mockFfmpeg.ffprobe = jest.fn();
  
  return mockFfmpeg;
});

jest.mock('@ffmpeg-installer/ffmpeg', () => ({
  path: '/mock/ffmpeg/path'
}));

jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn(),
    writeFile: jest.fn(),
    unlink: jest.fn(),
    copyFile: jest.fn(),
    stat: jest.fn()
  }
}));

describe('Video Editing Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default successful FFmpeg execution
    const ffmpeg = require('fluent-ffmpeg');
    const mockCommand = ffmpeg();
    
    mockCommand.on.mockImplementation((event, callback) => {
      if (event === 'end') {
        setTimeout(() => callback(), 0);
      }
      return mockCommand;
    });

    // Mock successful file operations
    fs.mkdir.mockResolvedValue();
    fs.writeFile.mockResolvedValue();
    fs.unlink.mockResolvedValue();
    fs.copyFile.mockResolvedValue();
    fs.stat.mockResolvedValue({ size: 1024000 });
  });

  describe('Complete Video Processing Workflow', () => {
    it('should process UGC video with all advanced features', async () => {
      const ffmpeg = require('fluent-ffmpeg');
      
      // Mock video info
      ffmpeg.ffprobe.mockImplementation((path, callback) => {
        callback(null, {
          format: {
            duration: '30.5',
            size: '2048000',
            bit_rate: '1500000',
            format_name: 'mp4'
          },
          streams: [
            {
              codec_type: 'video',
              codec_name: 'h264',
              width: 1920,
              height: 1080,
              r_frame_rate: '30/1',
              bit_rate: '1200000'
            },
            {
              codec_type: 'audio',
              codec_name: 'aac',
              sample_rate: '44100',
              channels: 2,
              bit_rate: '128000'
            }
          ]
        });
      });

      const inputVideo = '/test/input.mp4';
      const processingOptions = {
        branding: {
          logoPath: '/test/logo.png',
          brandText: 'My Brand',
          brandColor: '#FF0000'
        },
        optimize: true,
        format: 'mp4'
      };

      const result = await videoEditingService.processUGCVideo(inputVideo, processingOptions);

      expect(result).toHaveProperty('outputPath');
      expect(result).toHaveProperty('videoInfo');
      expect(result).toHaveProperty('processing');
      expect(result.processing.branding).toBe(true);
      expect(result.processing.optimized).toBe(true);
      expect(result.processing.format).toBe('mp4');
      expect(result.videoInfo.duration).toBe(30.5);
      expect(result.videoInfo.video.width).toBe(1920);
      expect(result.videoInfo.video.height).toBe(1080);
    });

    it('should apply multiple video effects in sequence', async () => {
      const inputVideo = '/test/input.mp4';

      // Step 1: Apply color correction
      const filteredVideo = await videoEditingService.applyVideoFilters(inputVideo, {
        brightness: 0.1,
        contrast: 1.2,
        saturation: 1.1,
        colorBalance: 'warm'
      });

      // Step 2: Add text overlay
      const textVideo = await videoEditingService.addTextOverlay(filteredVideo, {
        text: 'Amazing Product!',
        fontSize: 32,
        fontColor: '#FFFFFF',
        position: 'bottom',
        startTime: 2,
        duration: 5
      });

      // Step 3: Apply advanced effects
      const effectsVideo = await videoEditingService.applyAdvancedEffects(textVideo, {
        vintage: true,
        sharpen: true,
        speed: 1.2
      });

      expect(filteredVideo).toMatch(/filtered_.*\.mp4$/);
      expect(textVideo).toMatch(/text_overlay_.*\.mp4$/);
      expect(effectsVideo).toMatch(/effects_.*\.mp4$/);
    });

    it('should create video with transitions and background music', async () => {
      const videoPaths = ['/video1.mp4', '/video2.mp4', '/video3.mp4'];

      // Step 1: Add transitions between segments
      const transitionVideo = await videoEditingService.addTransitions(videoPaths, {
        type: 'fade',
        duration: 1.5
      });

      // Step 2: Add background music
      const finalVideo = await videoEditingService.addBackgroundMusic(
        transitionVideo,
        '/background-music.mp3',
        {
          musicVolume: 0.3,
          originalVolume: 0.8,
          fadeIn: true,
          fadeOut: true
        }
      );

      expect(transitionVideo).toMatch(/transitions_.*\.mp4$/);
      expect(finalVideo).toMatch(/music_.*\.mp4$/);
    });

    it('should handle video trimming and merging workflow', async () => {
      const longVideo = '/test/long-video.mp4';

      // Step 1: Trim video into segments
      const segment1 = await videoEditingService.trimVideo(longVideo, 0, 10);
      const segment2 = await videoEditingService.trimVideo(longVideo, 15, 8);
      const segment3 = await videoEditingService.trimVideo(longVideo, 30, 12);

      // Step 2: Merge segments back together
      const mergedVideo = await videoEditingService.mergeVideos([segment1, segment2, segment3]);

      expect(segment1).toMatch(/trimmed_.*\.mp4$/);
      expect(segment2).toMatch(/trimmed_.*\.mp4$/);
      expect(segment3).toMatch(/trimmed_.*\.mp4$/);
      expect(mergedVideo).toMatch(/merged_.*\.mp4$/);
    });

    it('should apply watermark and branding to video', async () => {
      const inputVideo = '/test/input.mp4';

      // Step 1: Add watermark
      const watermarkedVideo = await videoEditingService.addWatermark(
        inputVideo,
        '/watermark.png',
        {
          position: 'bottom-right',
          opacity: 0.7,
          scale: 0.15
        }
      );

      // Step 2: Add additional branding
      const brandedVideo = await videoEditingService.addBranding(watermarkedVideo, {
        logoPath: '/brand-logo.png',
        brandText: 'Premium Brand',
        brandColor: '#FFD700'
      });

      expect(watermarkedVideo).toMatch(/watermarked_.*\.mp4$/);
      expect(brandedVideo).toMatch(/branded_.*\.mp4$/);
    });

    it('should convert and optimize video for different platforms', async () => {
      const inputVideo = '/test/input.mp4';

      // Convert to WebM for web
      const webmVideo = await videoEditingService.convertVideo(inputVideo, 'webm', {
        quality: 'medium',
        resolution: '720p'
      });

      // Optimize for mobile
      const mobileVideo = await videoEditingService.optimizeVideo(inputVideo, {
        preset: 'fast',
        twoPass: false
      });

      expect(webmVideo).toMatch(/converted_.*\.webm$/);
      expect(mobileVideo).toMatch(/optimized_.*\.mp4$/);
    });
  });

  describe('Error Handling in Video Processing', () => {
    it('should handle FFmpeg errors gracefully', async () => {
      const ffmpeg = require('fluent-ffmpeg');
      const mockCommand = ffmpeg();
      
      mockCommand.on.mockImplementation((event, callback) => {
        if (event === 'error') {
          setTimeout(() => callback(new Error('FFmpeg processing failed')), 0);
        }
        return mockCommand;
      });

      await expect(videoEditingService.trimVideo('/invalid/video.mp4', 0, 10))
        .rejects.toThrow('Failed to trim video: FFmpeg processing failed');
    });

    it('should validate input parameters', async () => {
      // Test missing required parameters
      await expect(videoEditingService.applyVideoFilters())
        .rejects.toThrow('Input video path is required');

      await expect(videoEditingService.addTextOverlay())
        .rejects.toThrow('Input video path is required');

      await expect(videoEditingService.addTransitions([]))
        .rejects.toThrow('At least 2 video paths are required for transitions');

      await expect(videoEditingService.addBackgroundMusic('/video.mp4'))
        .rejects.toThrow('Input video path and music path are required');
    });

    it('should handle file system errors', async () => {
      fs.copyFile.mockRejectedValue(new Error('File system error'));

      await expect(videoEditingService.processUGCVideo('/test/input.mp4'))
        .rejects.toThrow('Failed to process UGC video');
    });
  });

  describe('Video Information and Metadata', () => {
    it('should extract comprehensive video information', async () => {
      const ffmpeg = require('fluent-ffmpeg');
      
      ffmpeg.ffprobe.mockImplementation((path, callback) => {
        callback(null, {
          format: {
            duration: '45.2',
            size: '5242880',
            bit_rate: '2000000',
            format_name: 'mp4,m4a,3gp,3g2,mj2'
          },
          streams: [
            {
              codec_type: 'video',
              codec_name: 'h264',
              width: 3840,
              height: 2160,
              r_frame_rate: '60/1',
              bit_rate: '1800000'
            },
            {
              codec_type: 'audio',
              codec_name: 'aac',
              sample_rate: '48000',
              channels: 2,
              bit_rate: '192000'
            }
          ]
        });
      });

      const videoInfo = await videoEditingService.getVideoInfo('/test/4k-video.mp4');

      expect(videoInfo).toEqual({
        duration: 45.2,
        size: 5242880,
        bitrate: 2000000,
        format: 'mp4,m4a,3gp,3g2,mj2',
        video: {
          codec: 'h264',
          width: 3840,
          height: 2160,
          fps: 60,
          bitrate: 1800000
        },
        audio: {
          codec: 'aac',
          sampleRate: 48000,
          channels: 2,
          bitrate: 192000
        }
      });
    });

    it('should handle videos without audio stream', async () => {
      const ffmpeg = require('fluent-ffmpeg');
      
      ffmpeg.ffprobe.mockImplementation((path, callback) => {
        callback(null, {
          format: {
            duration: '20.0',
            size: '1048576',
            bit_rate: '500000',
            format_name: 'mp4'
          },
          streams: [
            {
              codec_type: 'video',
              codec_name: 'h264',
              width: 1280,
              height: 720,
              r_frame_rate: '24/1',
              bit_rate: '500000'
            }
          ]
        });
      });

      const videoInfo = await videoEditingService.getVideoInfo('/test/silent-video.mp4');

      expect(videoInfo.video).toBeDefined();
      expect(videoInfo.audio).toBeNull();
      expect(videoInfo.duration).toBe(20.0);
    });
  });

  describe('Cleanup and Resource Management', () => {
    it('should clean up temporary files after processing', async () => {
      const tempFiles = ['/temp/file1.mp4', '/temp/file2.mp4', '/temp/file3.mp4'];

      await videoEditingService.cleanupFiles(tempFiles);

      expect(fs.unlink).toHaveBeenCalledTimes(3);
      tempFiles.forEach(file => {
        expect(fs.unlink).toHaveBeenCalledWith(file);
      });
    });

    it('should handle cleanup errors without throwing', async () => {
      fs.unlink.mockRejectedValue(new Error('File not found'));

      // Should not throw error
      await expect(videoEditingService.cleanupFiles(['/nonexistent.mp4']))
        .resolves.toBeUndefined();
    });
  });
});