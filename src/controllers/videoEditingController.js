const videoEditingService = require('../services/videoEditingService');
const path = require('path');

// UUID v4 generator function
function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Controller for video editing operations
 */
class VideoEditingController {
  /**
   * Process video with advanced editing features
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async processVideo(req, res) {
    try {
      const { inputPath, operations = [], outputFormat = 'mp4', quality = 'medium' } = req.body;

      if (!inputPath) {
        return res.status(400).json({
          error: 'Input video path is required',
          timestamp: new Date().toISOString()
        });
      }

      const operationId = uuidv4();
      const results = [];

      // Process each operation sequentially
      let currentVideoPath = inputPath;
      
      for (let i = 0; i < operations.length; i++) {
        const operation = operations[i];
        const { type, parameters = {} } = operation;

        try {
          let result;
          
          switch (type) {
            case 'trim':
              result = await videoEditingService.trimVideo(
                currentVideoPath,
                parameters.startTime || 0,
                parameters.duration,
                parameters.outputPath
              );
              break;

            case 'merge':
              if (!parameters.videoPaths || !Array.isArray(parameters.videoPaths)) {
                throw new Error('videoPaths array is required for merge operation');
              }
              result = await videoEditingService.mergeVideos(
                parameters.videoPaths,
                parameters.outputPath
              );
              break;

            case 'convert':
              result = await videoEditingService.convertVideo(
                currentVideoPath,
                parameters.format || outputFormat,
                {
                  quality: parameters.quality || quality,
                  resolution: parameters.resolution,
                  bitrate: parameters.bitrate
                },
                parameters.outputPath
              );
              break;

            case 'optimize':
              result = await videoEditingService.optimizeVideo(
                currentVideoPath,
                {
                  preset: parameters.preset || 'medium',
                  twoPass: parameters.twoPass || false
                },
                parameters.outputPath
              );
              break;

            case 'watermark':
              if (!parameters.watermarkPath) {
                throw new Error('watermarkPath is required for watermark operation');
              }
              result = await videoEditingService.addWatermark(
                currentVideoPath,
                parameters.watermarkPath,
                {
                  position: parameters.position || 'bottom-right',
                  opacity: parameters.opacity || 0.7,
                  scale: parameters.scale || 0.1
                },
                parameters.outputPath
              );
              break;

            case 'branding':
              result = await videoEditingService.addBranding(
                currentVideoPath,
                {
                  logoPath: parameters.logoPath,
                  brandText: parameters.brandText,
                  brandColor: parameters.brandColor || '#FFFFFF'
                },
                parameters.outputPath
              );
              break;

            case 'filters':
              result = await videoEditingService.applyVideoFilters(
                currentVideoPath,
                {
                  brightness: parameters.brightness || 0,
                  contrast: parameters.contrast || 1,
                  saturation: parameters.saturation || 1,
                  hue: parameters.hue || 0,
                  colorBalance: parameters.colorBalance || 'neutral'
                },
                parameters.outputPath
              );
              break;

            case 'textOverlay':
              result = await videoEditingService.addTextOverlay(
                currentVideoPath,
                {
                  text: parameters.text || 'Sample Text',
                  fontFile: parameters.fontFile,
                  fontSize: parameters.fontSize || 24,
                  fontColor: parameters.fontColor || '#FFFFFF',
                  position: parameters.position || 'bottom',
                  x: parameters.x,
                  y: parameters.y,
                  startTime: parameters.startTime || 0,
                  duration: parameters.duration
                },
                parameters.outputPath
              );
              break;

            case 'transitions':
              if (!parameters.videoPaths || !Array.isArray(parameters.videoPaths)) {
                throw new Error('videoPaths array is required for transitions operation');
              }
              result = await videoEditingService.addTransitions(
                parameters.videoPaths,
                {
                  type: parameters.transitionType || 'fade',
                  duration: parameters.duration || 1
                },
                parameters.outputPath
              );
              break;

            case 'backgroundMusic':
              if (!parameters.musicPath) {
                throw new Error('musicPath is required for backgroundMusic operation');
              }
              result = await videoEditingService.addBackgroundMusic(
                currentVideoPath,
                parameters.musicPath,
                {
                  musicVolume: parameters.musicVolume || 0.3,
                  originalVolume: parameters.originalVolume || 1.0,
                  fadeIn: parameters.fadeIn || false,
                  fadeOut: parameters.fadeOut || false,
                  startTime: parameters.startTime || 0
                },
                parameters.outputPath
              );
              break;

            case 'effects':
              result = await videoEditingService.applyAdvancedEffects(
                currentVideoPath,
                {
                  blur: parameters.blur || false,
                  sharpen: parameters.sharpen || false,
                  vintage: parameters.vintage || false,
                  blackWhite: parameters.blackWhite || false,
                  sepia: parameters.sepia || false,
                  speed: parameters.speed || 1
                },
                parameters.outputPath
              );
              break;

            default:
              throw new Error(`Unknown operation type: ${type}`);
          }

          results.push({
            operation: type,
            parameters,
            outputPath: result,
            success: true
          });

          // Use the result as input for the next operation
          currentVideoPath = result;

        } catch (operationError) {
          results.push({
            operation: type,
            parameters,
            error: operationError.message,
            success: false
          });
          
          // Stop processing on error
          break;
        }
      }

      // Get final video information
      let videoInfo = null;
      if (results.length > 0 && results[results.length - 1].success) {
        try {
          videoInfo = await videoEditingService.getVideoInfo(currentVideoPath);
        } catch (error) {
          console.warn('Failed to get video info:', error.message);
        }
      }

      res.json({
        operationId,
        status: results.every(r => r.success) ? 'completed' : 'failed',
        finalOutputPath: currentVideoPath,
        videoInfo,
        operations: results,
        processedAt: new Date().toISOString()
      });

    } catch (error) {
      console.error('Video processing error:', error);
      res.status(500).json({
        error: 'Video processing failed',
        details: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Process UGC video with standard optimizations
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async processUGCVideo(req, res) {
    try {
      const { inputPath, branding, optimize = true, format = 'mp4' } = req.body;

      if (!inputPath) {
        return res.status(400).json({
          error: 'Input video path is required',
          timestamp: new Date().toISOString()
        });
      }

      const result = await videoEditingService.processUGCVideo(inputPath, {
        branding,
        optimize,
        format
      });

      res.json({
        operationId: uuidv4(),
        status: 'completed',
        outputPath: result.outputPath,
        videoInfo: result.videoInfo,
        processing: result.processing,
        processedAt: new Date().toISOString()
      });

    } catch (error) {
      console.error('UGC video processing error:', error);
      res.status(500).json({
        error: 'UGC video processing failed',
        details: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Get video information
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async getVideoInfo(req, res) {
    try {
      const { videoPath } = req.body;

      if (!videoPath) {
        return res.status(400).json({
          error: 'Video path is required',
          timestamp: new Date().toISOString()
        });
      }

      const videoInfo = await videoEditingService.getVideoInfo(videoPath);

      res.json({
        videoPath,
        videoInfo,
        retrievedAt: new Date().toISOString()
      });

    } catch (error) {
      console.error('Video info retrieval error:', error);
      res.status(500).json({
        error: 'Failed to retrieve video information',
        details: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Apply video filters
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async applyFilters(req, res) {
    try {
      const { inputPath, filters = {} } = req.body;

      if (!inputPath) {
        return res.status(400).json({
          error: 'Input video path is required',
          timestamp: new Date().toISOString()
        });
      }

      const result = await videoEditingService.applyVideoFilters(inputPath, filters);

      res.json({
        operationId: uuidv4(),
        status: 'completed',
        inputPath,
        outputPath: result,
        filters,
        processedAt: new Date().toISOString()
      });

    } catch (error) {
      console.error('Video filter application error:', error);
      res.status(500).json({
        error: 'Failed to apply video filters',
        details: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Add text overlay to video
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async addTextOverlay(req, res) {
    try {
      const { inputPath, textOptions = {} } = req.body;

      if (!inputPath) {
        return res.status(400).json({
          error: 'Input video path is required',
          timestamp: new Date().toISOString()
        });
      }

      const result = await videoEditingService.addTextOverlay(inputPath, textOptions);

      res.json({
        operationId: uuidv4(),
        status: 'completed',
        inputPath,
        outputPath: result,
        textOptions,
        processedAt: new Date().toISOString()
      });

    } catch (error) {
      console.error('Text overlay error:', error);
      res.status(500).json({
        error: 'Failed to add text overlay',
        details: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
}

module.exports = new VideoEditingController();