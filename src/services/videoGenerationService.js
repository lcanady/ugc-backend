const { GoogleGenAI } = require('@google/genai');
const config = require('../utils/config');
const fs = require('fs').promises;
const path = require('path');

class VideoGenerationService {
  constructor() {
    this.initializeClient();
    this.model = 'veo-3.0-generate-preview';
    this.fastModel = 'veo-3.0-fast-generate-preview';
    this.maxRetries = 3;
    this.retryDelay = 1000;
    this.pollInterval = 10000; // 10 seconds
    this.maxPollTime = 360000; // 6 minutes max wait time
  }

  initializeClient() {
    this.ai = new GoogleGenAI({
      apiKey: config.googleAiApiKey
    });
  }

  /**
   * Generates a video from text prompt and optional image
   * @param {string} prompt - The video generation prompt
   * @param {Object} options - Generation options
   * @param {Buffer} options.imageBuffer - Optional starting image buffer
   * @param {string} options.imageMimeType - MIME type of the image
   * @param {string} options.aspectRatio - Video aspect ratio ('16:9' default)
   * @param {string} options.negativePrompt - What to avoid in the video
   * @param {string} options.personGeneration - Person generation control ('allow_adult', 'allow_all', 'dont_allow')
   * @param {boolean} options.useFastModel - Use Veo 3 Fast for quicker generation
   * @returns {Promise<Object>} Generated video result
   */
  async generateVideo(prompt, options = {}) {
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      throw new Error('Video prompt is required and must be a non-empty string');
    }

    if (prompt.length > 1024) {
      throw new Error('Video prompt must be 1024 characters or less');
    }

    const {
      imageBuffer,
      imageMimeType,
      aspectRatio = '16:9',
      negativePrompt,
      personGeneration = 'allow_adult',
      useFastModel = false
    } = options;

    // Validate image if provided
    if (imageBuffer && !imageMimeType) {
      throw new Error('Image MIME type is required when providing image buffer');
    }

    if (imageBuffer) {
      this.validateImageInput(imageBuffer, imageMimeType);
    }

    const modelToUse = useFastModel ? this.fastModel : this.model;
    const requestConfig = this.buildVideoRequest(prompt, {
      imageBuffer,
      imageMimeType,
      aspectRatio,
      negativePrompt,
      personGeneration
    });

    let lastError;
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const operation = await this.startVideoGeneration(modelToUse, requestConfig);
        const completedOperation = await this.pollForCompletion(operation);
        const videoResult = await this.processVideoResult(completedOperation, prompt);
        
        return videoResult;
      } catch (error) {
        lastError = error;

        if (attempt < this.maxRetries && this.isRetryableError(error)) {
          const delay = this.retryDelay * Math.pow(2, attempt - 1);
          await this.sleep(delay);
          continue;
        }
        
        break;
      }
    }

    throw new Error(`Failed to generate video after ${this.maxRetries} attempts: ${lastError.message}`);
  }

  /**
   * Generates multiple video segments for UGC ad creation
   * @param {Array} segments - Array of segment objects with prompt and options
   * @param {Object} globalOptions - Options applied to all segments
   * @returns {Promise<Array>} Array of generated video segments
   */
  async generateVideoSegments(segments, globalOptions = {}) {
    if (!Array.isArray(segments) || segments.length === 0) {
      throw new Error('Segments array is required and must not be empty');
    }

    if (segments.length > 4) {
      throw new Error('Maximum of 4 video segments allowed per request');
    }

    const results = [];
    
    // Generate segments sequentially to avoid rate limits
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const segmentOptions = {
        ...globalOptions,
        ...segment.options
      };

      try {
        const videoResult = await this.generateVideo(segment.prompt, segmentOptions);
        results.push({
          segmentIndex: i,
          prompt: segment.prompt,
          ...videoResult
        });
      } catch (error) {
        throw new Error(`Failed to generate segment ${i + 1}: ${error.message}`);
      }
    }

    return results;
  }

  /**
   * Validates image input for video generation
   * @param {Buffer} imageBuffer - Image buffer
   * @param {string} imageMimeType - Image MIME type
   */
  validateImageInput(imageBuffer, imageMimeType) {
    if (!Buffer.isBuffer(imageBuffer)) {
      throw new Error('Image must be provided as a Buffer');
    }

    const supportedFormats = ['image/jpeg', 'image/jpg', 'image/png'];
    if (!supportedFormats.includes(imageMimeType.toLowerCase())) {
      throw new Error(`Unsupported image format. Supported formats: ${supportedFormats.join(', ')}`);
    }

    const maxSize = 20 * 1024 * 1024; // 20MB
    if (imageBuffer.length > maxSize) {
      throw new Error(`Image size exceeds maximum of ${maxSize / (1024 * 1024)}MB`);
    }

    if (imageBuffer.length === 0) {
      throw new Error('Image buffer is empty');
    }
  }

  /**
   * Builds the video generation request configuration
   * @param {string} prompt - Video prompt
   * @param {Object} options - Generation options
   * @returns {Object} Request configuration
   */
  buildVideoRequest(prompt, options) {
    const {
      imageBuffer,
      imageMimeType,
      aspectRatio,
      negativePrompt,
      personGeneration
    } = options;

    const config = {
      prompt: prompt
    };

    // Add image if provided
    if (imageBuffer && imageMimeType) {
      config.image = {
        imageBytes: imageBuffer,
        mimeType: imageMimeType
      };
    }

    // Add configuration options
    if (aspectRatio || negativePrompt || personGeneration) {
      config.config = {};
      
      if (aspectRatio) {
        config.config.aspectRatio = aspectRatio;
      }
      
      if (negativePrompt) {
        config.config.negativePrompt = negativePrompt;
      }
      
      if (personGeneration) {
        config.config.personGeneration = personGeneration;
      }
    }

    return config;
  }

  /**
   * Starts video generation and returns operation
   * @param {string} model - Model to use
   * @param {Object} requestConfig - Request configuration
   * @returns {Promise<Object>} Operation object
   */
  async startVideoGeneration(model, requestConfig) {
    try {
      const operation = await this.ai.models.generateVideos({
        model: model,
        ...requestConfig
      });

      if (!operation || !operation.name) {
        throw new Error('Invalid operation returned from video generation API');
      }

      return operation;
    } catch (error) {
      if (error.message && error.message.includes('safety filters')) {
        throw new Error('Video generation blocked by safety filters. Please modify your prompt and try again.');
      }
      
      throw new Error(`Failed to start video generation: ${error.message}`);
    }
  }

  /**
   * Polls for operation completion
   * @param {Object} operation - Initial operation object
   * @returns {Promise<Object>} Completed operation
   */
  async pollForCompletion(operation) {
    const startTime = Date.now();
    let currentOperation = operation;

    while (!currentOperation.done) {
      // Check if we've exceeded max poll time
      if (Date.now() - startTime > this.maxPollTime) {
        throw new Error('Video generation timed out after 6 minutes');
      }

      console.log('Waiting for video generation to complete...');
      await this.sleep(this.pollInterval);

      try {
        currentOperation = await this.ai.operations.getVideosOperation({
          operation: currentOperation
        });
      } catch (error) {
        throw new Error(`Failed to check operation status: ${error.message}`);
      }
    }

    // Check if operation completed successfully
    if (currentOperation.error) {
      throw new Error(`Video generation failed: ${currentOperation.error.message || 'Unknown error'}`);
    }

    if (!currentOperation.response || !currentOperation.response.generatedVideos) {
      throw new Error('No video generated in completed operation');
    }

    return currentOperation;
  }

  /**
   * Processes the completed video generation result
   * @param {Object} operation - Completed operation
   * @param {string} originalPrompt - Original prompt used
   * @returns {Promise<Object>} Processed video result
   */
  async processVideoResult(operation, originalPrompt) {
    try {
      const generatedVideo = operation.response.generatedVideos[0];
      
      if (!generatedVideo || !generatedVideo.video) {
        throw new Error('No video file in generation result');
      }

      return {
        videoFile: generatedVideo.video,
        prompt: originalPrompt,
        model: this.model,
        generatedAt: new Date().toISOString(),
        duration: 8, // Veo 3 generates 8-second videos
        resolution: '720p',
        frameRate: '24fps',
        hasAudio: true,
        metadata: {
          operationName: operation.name,
          generationTime: operation.metadata?.createTime || new Date().toISOString()
        }
      };
    } catch (error) {
      throw new Error(`Failed to process video result: ${error.message}`);
    }
  }

  /**
   * Downloads generated video to local file
   * @param {Object} videoFile - Video file object from API
   * @param {string} downloadPath - Local path to save video
   * @returns {Promise<string>} Path to downloaded file
   */
  async downloadVideo(videoFile, downloadPath) {
    if (!videoFile) {
      throw new Error('Video file object is required');
    }

    if (!downloadPath) {
      throw new Error('Download path is required');
    }

    try {
      // Ensure directory exists
      const dir = path.dirname(downloadPath);
      await fs.mkdir(dir, { recursive: true });

      // Download the video
      await this.ai.files.download({
        file: videoFile,
        downloadPath: downloadPath
      });

      // Verify file was created
      const stats = await fs.stat(downloadPath);
      if (stats.size === 0) {
        throw new Error('Downloaded video file is empty');
      }

      return downloadPath;
    } catch (error) {
      throw new Error(`Failed to download video: ${error.message}`);
    }
  }

  /**
   * Creates optimized prompts for UGC ad segments
   * @param {string} creativeBrief - Original creative brief
   * @param {Array} imageAnalysis - Analysis results from images
   * @param {Object} scriptSegments - Generated script segments
   * @returns {Array} Optimized prompts for video generation
   */
  createUGCPrompts(creativeBrief, imageAnalysis, scriptSegments) {
    if (!creativeBrief || !scriptSegments) {
      throw new Error('Creative brief and script segments are required');
    }

    const prompts = [];
    
    // Extract key elements from image analysis
    const visualElements = this.extractVisualElements(imageAnalysis);
    
    // Create prompts for each script segment
    Object.keys(scriptSegments).forEach((segmentKey, index) => {
      const segment = scriptSegments[segmentKey];
      const prompt = this.buildUGCPrompt(segment, visualElements, creativeBrief, index);
      
      prompts.push({
        segmentKey,
        prompt,
        options: {
          aspectRatio: '16:9',
          personGeneration: 'allow_adult',
          negativePrompt: 'low quality, blurry, distorted, watermark, logo, text overlay'
        }
      });
    });

    return prompts;
  }

  /**
   * Extracts visual elements from image analysis
   * @param {Array} imageAnalysis - Image analysis results
   * @returns {Object} Extracted visual elements
   */
  extractVisualElements(imageAnalysis) {
    if (!imageAnalysis || !Array.isArray(imageAnalysis)) {
      return {
        objects: [],
        people: [],
        settings: [],
        actions: [],
        colors: [],
        mood: []
      };
    }

    const elements = {
      objects: [],
      people: [],
      settings: [],
      actions: [],
      colors: [],
      mood: []
    };

    imageAnalysis.forEach(analysis => {
      if (analysis.objects) elements.objects.push(...analysis.objects);
      if (analysis.people) elements.people.push(...analysis.people);
      if (analysis.setting) elements.settings.push(analysis.setting);
      if (analysis.actions) elements.actions.push(...analysis.actions);
      if (analysis.colors) elements.colors.push(...analysis.colors);
      if (analysis.mood) elements.mood.push(analysis.mood);
    });

    // Remove duplicates and limit items
    Object.keys(elements).forEach(key => {
      elements[key] = [...new Set(elements[key])].slice(0, 5);
    });

    return elements;
  }

  /**
   * Builds UGC-optimized prompt for video generation
   * @param {Object} segment - Script segment
   * @param {Object} visualElements - Extracted visual elements
   * @param {string} creativeBrief - Original creative brief
   * @param {number} index - Segment index
   * @returns {string} Optimized video prompt
   */
  buildUGCPrompt(segment, visualElements, creativeBrief, index) {
    let prompt = '';

    // Add camera and composition style
    const cameraStyles = [
      'Close-up handheld shot',
      'Medium shot with natural movement',
      'Wide shot with authentic framing',
      'POV style shot'
    ];
    
    const selectedCamera = cameraStyles[index % cameraStyles.length];
    prompt += `${selectedCamera} of `;

    // Add main action from script
    if (segment.action) {
      prompt += `${segment.action}. `;
    }

    // Add dialogue if present
    if (segment.dialogue) {
      prompt += `"${segment.dialogue}" `;
    }

    // Add visual context from image analysis
    if (visualElements.people && visualElements.people.length > 0) {
      prompt += `Featuring ${visualElements.people.slice(0, 2).join(' and ')}. `;
    }

    if (visualElements.settings && visualElements.settings.length > 0) {
      prompt += `Set in ${visualElements.settings[0]}. `;
    }

    if (visualElements.objects && visualElements.objects.length > 0) {
      prompt += `Including ${visualElements.objects.slice(0, 3).join(', ')}. `;
    }

    // Add UGC style elements
    prompt += 'Authentic user-generated content style, natural lighting, ';
    prompt += 'realistic movements, engaging and relatable. ';

    // Add mood and atmosphere
    if (visualElements.mood && visualElements.mood.length > 0) {
      prompt += `${visualElements.mood[0]} atmosphere. `;
    }

    // Add audio cues for Veo 3
    if (segment.soundEffects) {
      prompt += `Sound effects: ${segment.soundEffects}. `;
    }

    if (segment.ambientSound) {
      prompt += `Ambient sound: ${segment.ambientSound}. `;
    }

    // Ensure prompt is within limits
    if (prompt.length > 1000) {
      prompt = prompt.substring(0, 997) + '...';
    }

    return prompt.trim();
  }

  /**
   * Checks if an error is retryable
   * @param {Error} error - Error to check
   * @returns {boolean} Whether error is retryable
   */
  isRetryableError(error) {
    const retryableMessages = [
      'network error',
      'timeout',
      'rate limit',
      'server error',
      'service unavailable'
    ];

    const message = error.message.toLowerCase();
    return retryableMessages.some(retryable => message.includes(retryable));
  }

  /**
   * Sleep utility for delays
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise} Promise that resolves after delay
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new VideoGenerationService();