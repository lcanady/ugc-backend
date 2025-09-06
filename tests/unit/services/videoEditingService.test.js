const videoEditingService = require('../../../src/services/videoEditingService');
const fs = require('fs').promises;
const path = require('path');

// Mock FFmpeg
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

describe('VideoEditingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('trimVideo', () => {
    it('should trim video successfully', async () => {
      const ffmpeg = require('fluent-ffmpeg');
      const mockCommand = ffmpeg();
      
      // Mock successful execution
      mockCommand.on.mockImplementation((event, callback) => {
        if (event === 'end') {
          setTimeout(() => callback(), 0);
        }
        return mockCommand;
      });

      const result = await videoEditingService.trimVideo('/input/video.mp4', 10, 30);
      
      expect(mockCommand.seekInput).toHaveBeenCalledWith(10);
      expect(mockCommand.duration).toHaveBeenCalledWith(30);
      expect(mockCommand.videoCodec).toHaveBeenCalledWith('libx264');
      expect(mockCommand.audioCodec).toHaveBeenCalledWith('aac');
      expect(result).toMatch(/trimmed_.*\.mp4$/);
    });

    it('should throw error for invalid input', async () => {
      await expect(videoEditingService.trimVideo()).rejects.toThrow('Input video path is required');
      await expect(videoEditingService.trimVideo('/input/video.mp4', 0, 0)).rejects.toThrow('Duration must be greater than 0');
    });

    it('should handle FFmpeg errors', async () => {
      const ffmpeg = require('fluent-ffmpeg');
      const mockCommand = ffmpeg();
      
      mockCommand.on.mockImplementation((event, callback) => {
        if (event === 'error') {
          setTimeout(() => callback(new Error('FFmpeg error')), 0);
        }
        return mockCommand;
      });

      await expect(videoEditingService.trimVideo('/input/video.mp4', 0, 30))
        .rejects.toThrow('Failed to trim video: FFmpeg error');
    });
  });

  describe('mergeVideos', () => {
    beforeEach(() => {
      fs.writeFile.mockResolvedValue();
      fs.unlink.mockResolvedValue();
    });

    it('should merge multiple videos successfully', async () => {
      const ffmpeg = require('fluent-ffmpeg');
      const mockCommand = ffmpeg();
      
      mockCommand.on.mockImplementation((event, callback) => {
        if (event === 'end') {
          setTimeout(() => callback(), 0);
        }
        return mockCommand;
      });

      const videoPaths = ['/video1.mp4', '/video2.mp4', '/video3.mp4'];
      const result = await videoEditingService.mergeVideos(videoPaths);
      
      expect(fs.writeFile).toHaveBeenCalled();
      expect(mockCommand.inputOptions).toHaveBeenCalledWith(['-f', 'concat', '-safe', '0']);
      expect(mockCommand.videoCodec).toHaveBeenCalledWith('libx264');
      expect(mockCommand.audioCodec).toHaveBeenCalledWith('aac');
      expect(result).toMatch(/merged_.*\.mp4$/);
    });

    it('should return single video without merging', async () => {
      const videoPaths = ['/single-video.mp4'];
      const result = await videoEditingService.mergeVideos(videoPaths);
      
      expect(result).toBe('/single-video.mp4');
    });

    it('should throw error for invalid input', async () => {
      await expect(videoEditingService.mergeVideos()).rejects.toThrow('Video paths array is required and must not be empty');
      await expect(videoEditingService.mergeVideos([])).rejects.toThrow('Video paths array is required and must not be empty');
    });
  });

  describe('convertVideo', () => {
    it('should convert video to different format', async () => {
      const ffmpeg = require('fluent-ffmpeg');
      const mockCommand = ffmpeg();
      
      mockCommand.on.mockImplementation((event, callback) => {
        if (event === 'end') {
          setTimeout(() => callback(), 0);
        }
        return mockCommand;
      });

      const result = await videoEditingService.convertVideo('/input/video.mp4', 'webm', { quality: 'high' });
      
      expect(mockCommand.videoCodec).toHaveBeenCalledWith('libvpx-vp9');
      expect(mockCommand.audioCodec).toHaveBeenCalledWith('libvorbis');
      expect(mockCommand.videoBitrate).toHaveBeenCalledWith('2000k');
      expect(mockCommand.audioBitrate).toHaveBeenCalledWith('192k');
      expect(result).toMatch(/converted_.*\.webm$/);
    });

    it('should apply resolution settings', async () => {
      const ffmpeg = require('fluent-ffmpeg');
      const mockCommand = ffmpeg();
      
      mockCommand.on.mockImplementation((event, callback) => {
        if (event === 'end') {
          setTimeout(() => callback(), 0);
        }
        return mockCommand;
      });

      await videoEditingService.convertVideo('/input/video.mp4', 'mp4', { resolution: '720p' });
      
      expect(mockCommand.size).toHaveBeenCalledWith('1280x720');
    });

    it('should throw error for missing input', async () => {
      await expect(videoEditingService.convertVideo()).rejects.toThrow('Input video path is required');
    });
  });

  describe('optimizeVideo', () => {
    it('should optimize video for web delivery', async () => {
      const ffmpeg = require('fluent-ffmpeg');
      const mockCommand = ffmpeg();
      
      mockCommand.on.mockImplementation((event, callback) => {
        if (event === 'end') {
          setTimeout(() => callback(), 0);
        }
        return mockCommand;
      });

      const result = await videoEditingService.optimizeVideo('/input/video.mp4', { preset: 'fast' });
      
      expect(mockCommand.preset).toHaveBeenCalledWith('fast');
      expect(mockCommand.addOption).toHaveBeenCalledWith('-movflags', '+faststart');
      expect(mockCommand.addOption).toHaveBeenCalledWith('-pix_fmt', 'yuv420p');
      expect(result).toMatch(/optimized_.*\.mp4$/);
    });

    it('should throw error for missing input', async () => {
      await expect(videoEditingService.optimizeVideo()).rejects.toThrow('Input video path is required');
    });
  });

  describe('addWatermark', () => {
    it('should add watermark to video', async () => {
      const ffmpeg = require('fluent-ffmpeg');
      const mockCommand = ffmpeg();
      
      mockCommand.on.mockImplementation((event, callback) => {
        if (event === 'end') {
          setTimeout(() => callback(), 0);
        }
        return mockCommand;
      });

      const result = await videoEditingService.addWatermark(
        '/input/video.mp4',
        '/watermark.png',
        { position: 'top-left', opacity: 0.5, scale: 0.2 }
      );
      
      expect(mockCommand.input).toHaveBeenCalledWith('/watermark.png');
      expect(mockCommand.complexFilter).toHaveBeenCalled();
      expect(result).toMatch(/watermarked_.*\.mp4$/);
    });

    it('should throw error for missing inputs', async () => {
      await expect(videoEditingService.addWatermark()).rejects.toThrow('Input video path and watermark path are required');
      await expect(videoEditingService.addWatermark('/video.mp4')).rejects.toThrow('Input video path and watermark path are required');
    });
  });

  describe('addBranding', () => {
    it('should add logo branding to video', async () => {
      const ffmpeg = require('fluent-ffmpeg');
      const mockCommand = ffmpeg();
      
      mockCommand.on.mockImplementation((event, callback) => {
        if (event === 'end') {
          setTimeout(() => callback(), 0);
        }
        return mockCommand;
      });

      const result = await videoEditingService.addBranding('/input/video.mp4', {
        logoPath: '/logo.png'
      });
      
      expect(mockCommand.input).toHaveBeenCalledWith('/logo.png');
      expect(mockCommand.complexFilter).toHaveBeenCalled();
      expect(result).toMatch(/branded_.*\.mp4$/);
    });

    it('should add text branding to video', async () => {
      const ffmpeg = require('fluent-ffmpeg');
      const mockCommand = ffmpeg();
      
      mockCommand.on.mockImplementation((event, callback) => {
        if (event === 'end') {
          setTimeout(() => callback(), 0);
        }
        return mockCommand;
      });

      const result = await videoEditingService.addBranding('/input/video.mp4', {
        brandText: 'My Brand',
        brandColor: '#FF0000'
      });
      
      expect(mockCommand.complexFilter).toHaveBeenCalled();
      expect(result).toMatch(/branded_.*\.mp4$/);
    });

    it('should throw error for missing input', async () => {
      await expect(videoEditingService.addBranding()).rejects.toThrow('Input video path is required');
    });
  });

  describe('getVideoInfo', () => {
    it('should return video metadata', async () => {
      const ffmpeg = require('fluent-ffmpeg');
      const mockMetadata = {
        format: {
          duration: '30.5',
          size: '1024000',
          bit_rate: '1000000',
          format_name: 'mp4'
        },
        streams: [
          {
            codec_type: 'video',
            codec_name: 'h264',
            width: 1920,
            height: 1080,
            r_frame_rate: '30/1',
            bit_rate: '800000'
          },
          {
            codec_type: 'audio',
            codec_name: 'aac',
            sample_rate: '44100',
            channels: 2,
            bit_rate: '128000'
          }
        ]
      };

      ffmpeg.ffprobe.mockImplementation((path, callback) => {
        callback(null, mockMetadata);
      });

      const result = await videoEditingService.getVideoInfo('/video.mp4');
      
      expect(result).toEqual({
        duration: 30.5,
        size: 1024000,
        bitrate: 1000000,
        format: 'mp4',
        video: {
          codec: 'h264',
          width: 1920,
          height: 1080,
          fps: 30,
          bitrate: 800000
        },
        audio: {
          codec: 'aac',
          sampleRate: 44100,
          channels: 2,
          bitrate: 128000
        }
      });
    });

    it('should handle ffprobe errors', async () => {
      const ffmpeg = require('fluent-ffmpeg');
      
      ffmpeg.ffprobe.mockImplementation((path, callback) => {
        callback(new Error('FFprobe error'));
      });

      await expect(videoEditingService.getVideoInfo('/video.mp4'))
        .rejects.toThrow('Failed to get video info: FFprobe error');
    });

    it('should throw error for missing input', async () => {
      await expect(videoEditingService.getVideoInfo()).rejects.toThrow('Input video path is required');
    });
  });

  describe('processUGCVideo', () => {
    beforeEach(() => {
      fs.copyFile.mockResolvedValue();
    });

    it('should process UGC video with all options', async () => {
      const ffmpeg = require('fluent-ffmpeg');
      const mockCommand = ffmpeg();
      
      mockCommand.on.mockImplementation((event, callback) => {
        if (event === 'end') {
          setTimeout(() => callback(), 0);
        }
        return mockCommand;
      });

      // Mock getVideoInfo
      const mockMetadata = {
        format: { duration: '30', size: '1000000', bit_rate: '1000000', format_name: 'mp4' },
        streams: [{ codec_type: 'video', codec_name: 'h264', width: 1280, height: 720 }]
      };
      ffmpeg.ffprobe.mockImplementation((path, callback) => {
        callback(null, mockMetadata);
      });

      const result = await videoEditingService.processUGCVideo('/input/video.mp4', {
        branding: { brandText: 'My Brand' },
        optimize: true,
        format: 'mp4'
      });
      
      expect(result).toHaveProperty('outputPath');
      expect(result).toHaveProperty('videoInfo');
      expect(result).toHaveProperty('processing');
      expect(result.processing.branding).toBe(true);
      expect(result.processing.optimized).toBe(true);
    });

    it('should throw error for missing input', async () => {
      await expect(videoEditingService.processUGCVideo()).rejects.toThrow('Input video path is required');
    });
  });

  describe('applyVideoFilters', () => {
    it('should apply color correction filters', async () => {
      const ffmpeg = require('fluent-ffmpeg');
      const mockCommand = ffmpeg();
      
      mockCommand.on.mockImplementation((event, callback) => {
        if (event === 'end') {
          setTimeout(() => callback(), 0);
        }
        return mockCommand;
      });

      const result = await videoEditingService.applyVideoFilters('/input/video.mp4', {
        brightness: 0.1,
        contrast: 1.2,
        saturation: 1.1,
        hue: 10,
        colorBalance: 'warm'
      });
      
      expect(mockCommand.videoFilters).toHaveBeenCalled();
      expect(result).toMatch(/filtered_.*\.mp4$/);
    });

    it('should throw error for missing input', async () => {
      await expect(videoEditingService.applyVideoFilters()).rejects.toThrow('Input video path is required');
    });
  });

  describe('addTextOverlay', () => {
    it('should add text overlay to video', async () => {
      const ffmpeg = require('fluent-ffmpeg');
      const mockCommand = ffmpeg();
      
      mockCommand.on.mockImplementation((event, callback) => {
        if (event === 'end') {
          setTimeout(() => callback(), 0);
        }
        return mockCommand;
      });

      const result = await videoEditingService.addTextOverlay('/input/video.mp4', {
        text: 'Hello World',
        fontSize: 32,
        fontColor: '#FF0000',
        position: 'center',
        startTime: 5,
        duration: 10
      });
      
      expect(mockCommand.videoFilters).toHaveBeenCalled();
      expect(result).toMatch(/text_overlay_.*\.mp4$/);
    });

    it('should throw error for missing input', async () => {
      await expect(videoEditingService.addTextOverlay()).rejects.toThrow('Input video path is required');
    });
  });

  describe('addSubtitles', () => {
    it('should add subtitles from SRT file', async () => {
      const ffmpeg = require('fluent-ffmpeg');
      const mockCommand = ffmpeg();
      
      mockCommand.on.mockImplementation((event, callback) => {
        if (event === 'end') {
          setTimeout(() => callback(), 0);
        }
        return mockCommand;
      });

      const result = await videoEditingService.addSubtitles('/input/video.mp4', '/subtitles.srt', {
        fontColor: '#FFFFFF',
        fontSize: 24
      });
      
      expect(mockCommand.videoFilters).toHaveBeenCalled();
      expect(result).toMatch(/subtitled_.*\.mp4$/);
    });

    it('should throw error for missing inputs', async () => {
      await expect(videoEditingService.addSubtitles()).rejects.toThrow('Input video path and subtitle path are required');
      await expect(videoEditingService.addSubtitles('/video.mp4')).rejects.toThrow('Input video path and subtitle path are required');
    });
  });

  describe('addTransitions', () => {
    it('should add transitions between video segments', async () => {
      const ffmpeg = require('fluent-ffmpeg');
      const mockCommand = ffmpeg();
      
      mockCommand.on.mockImplementation((event, callback) => {
        if (event === 'end') {
          setTimeout(() => callback(), 0);
        }
        return mockCommand;
      });

      const videoPaths = ['/video1.mp4', '/video2.mp4', '/video3.mp4'];
      const result = await videoEditingService.addTransitions(videoPaths, {
        type: 'fade',
        duration: 2
      });
      
      expect(mockCommand.input).toHaveBeenCalledTimes(3);
      expect(mockCommand.complexFilter).toHaveBeenCalled();
      expect(result).toMatch(/transitions_.*\.mp4$/);
    });

    it('should throw error for insufficient videos', async () => {
      await expect(videoEditingService.addTransitions([])).rejects.toThrow('At least 2 video paths are required for transitions');
      await expect(videoEditingService.addTransitions(['/video1.mp4'])).rejects.toThrow('At least 2 video paths are required for transitions');
    });
  });

  describe('addBackgroundMusic', () => {
    it('should add background music with audio mixing', async () => {
      const ffmpeg = require('fluent-ffmpeg');
      const mockCommand = ffmpeg();
      
      mockCommand.on.mockImplementation((event, callback) => {
        if (event === 'end') {
          setTimeout(() => callback(), 0);
        }
        return mockCommand;
      });

      const result = await videoEditingService.addBackgroundMusic('/input/video.mp4', '/music.mp3', {
        musicVolume: 0.4,
        originalVolume: 0.8,
        fadeIn: true,
        fadeOut: true
      });
      
      expect(mockCommand.input).toHaveBeenCalledWith('/music.mp3');
      expect(mockCommand.complexFilter).toHaveBeenCalled();
      expect(result).toMatch(/music_.*\.mp4$/);
    });

    it('should throw error for missing inputs', async () => {
      await expect(videoEditingService.addBackgroundMusic()).rejects.toThrow('Input video path and music path are required');
      await expect(videoEditingService.addBackgroundMusic('/video.mp4')).rejects.toThrow('Input video path and music path are required');
    });
  });

  describe('applyAdvancedEffects', () => {
    it('should apply multiple video effects', async () => {
      const ffmpeg = require('fluent-ffmpeg');
      const mockCommand = ffmpeg();
      
      mockCommand.on.mockImplementation((event, callback) => {
        if (event === 'end') {
          setTimeout(() => callback(), 0);
        }
        return mockCommand;
      });

      const result = await videoEditingService.applyAdvancedEffects('/input/video.mp4', {
        blur: true,
        sharpen: false,
        vintage: true,
        blackWhite: false,
        sepia: true,
        speed: 1.5
      });
      
      expect(mockCommand.videoFilters).toHaveBeenCalled();
      expect(mockCommand.audioFilters).toHaveBeenCalled();
      expect(result).toMatch(/effects_.*\.mp4$/);
    });

    it('should handle no effects applied', async () => {
      const ffmpeg = require('fluent-ffmpeg');
      const mockCommand = ffmpeg();
      
      mockCommand.on.mockImplementation((event, callback) => {
        if (event === 'end') {
          setTimeout(() => callback(), 0);
        }
        return mockCommand;
      });

      const result = await videoEditingService.applyAdvancedEffects('/input/video.mp4', {});
      
      expect(result).toMatch(/effects_.*\.mp4$/);
    });

    it('should throw error for missing input', async () => {
      await expect(videoEditingService.applyAdvancedEffects()).rejects.toThrow('Input video path is required');
    });
  });

  describe('buildTransitionFilter', () => {
    it('should build fade transition filter', () => {
      const filters = videoEditingService.buildTransitionFilter(3, 'fade', 1.5);
      
      expect(filters).toHaveLength(2);
      expect(filters[0]).toContain('xfade=transition=fade:duration=1.5');
      expect(filters[1]).toContain('xfade=transition=fade:duration=1.5');
    });

    it('should build different transition types', () => {
      const dissolveFilters = videoEditingService.buildTransitionFilter(2, 'dissolve', 1);
      const slideFilters = videoEditingService.buildTransitionFilter(2, 'slide', 1);
      const wipeFilters = videoEditingService.buildTransitionFilter(2, 'wipe', 1);
      
      expect(dissolveFilters[0]).toContain('transition=dissolve');
      expect(slideFilters[0]).toContain('transition=slideleft');
      expect(wipeFilters[0]).toContain('transition=wiperight');
    });
  });

  describe('cleanupFiles', () => {
    it('should clean up temporary files', async () => {
      fs.unlink.mockResolvedValue();
      
      await videoEditingService.cleanupFiles(['/temp1.mp4', '/temp2.mp4']);
      
      expect(fs.unlink).toHaveBeenCalledTimes(2);
      expect(fs.unlink).toHaveBeenCalledWith('/temp1.mp4');
      expect(fs.unlink).toHaveBeenCalledWith('/temp2.mp4');
    });

    it('should handle cleanup errors gracefully', async () => {
      fs.unlink.mockRejectedValue(new Error('File not found'));
      
      // Should not throw error
      await expect(videoEditingService.cleanupFiles(['/temp.mp4'])).resolves.toBeUndefined();
    });

    it('should handle non-array input', async () => {
      await expect(videoEditingService.cleanupFiles(null)).resolves.toBeUndefined();
      await expect(videoEditingService.cleanupFiles('not-array')).resolves.toBeUndefined();
    });
  });
});