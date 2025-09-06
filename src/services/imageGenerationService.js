const axios = require('axios');
const config = require('../utils/config');

class ImageGenerationService {
  constructor() {
    this.apiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent';
    this.model = 'gemini-2.5-flash-image-preview';
    this.maxRetries = 3;
    this.retryDelay = 1000; // 1 second base delay
    this.maxImages = 4; // Maximum images to generate per request
  }

  /**
   * Generates images based on creative brief and optional reference images
   * @param {string} creativeBrief - The creative brief describing the desired content
   * @param {Array} referenceImages - Optional array of reference image objects with buffer and mimetype
   * @param {Object} options - Generation options
   * @param {number} options.imageCount - Number of images to generate (1-4)
   * @param {string} options.aspectRatio - Aspect ratio (e.g., '16:9', '1:1', '9:16')
   * @returns {Promise<Array>} Array of generated image results
   */
  async generateImages(creativeBrief, referenceImages = [], options = {}) {
    if (!creativeBrief || typeof creativeBrief !== 'string' || creativeBrief.trim().length === 0) {
      throw new Error('Creative brief is required and must be a non-empty string');
    }

    const imageCount = Math.min(options.imageCount || 2, this.maxImages);
    const aspectRatio = options.aspectRatio || '16:9';

    // Validate reference images if provided
    if (referenceImages && referenceImages.length > 0) {
      this.validateReferenceImages(referenceImages);
    }

    const prompt = this.buildGenerationPrompt(creativeBrief, referenceImages, { imageCount, aspectRatio });
    const requestPayload = this.buildGenerationRequest(prompt, referenceImages);

    let lastError;
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.makeApiCall(requestPayload);
        const generatedImages = this.parseGenerationResponse(response.data);
        return this.formatImageResults(generatedImages, creativeBrief);
      } catch (error) {
        lastError = error;

        if (attempt < this.maxRetries) {
          const delay = this.retryDelay * Math.pow(2, attempt - 1); // Exponential backoff
          await this.sleep(delay);
          continue;
        }
      }
    }

    throw new Error(`Failed to generate images after ${this.maxRetries} attempts: ${lastError.message}`);
  }

  /**
   * Validates reference images for format and size
   * @param {Array} referenceImages - Array of reference image objects
   * @throws {Error} If validation fails
   */
  validateReferenceImages(referenceImages) {
    const supportedFormats = ['image/jpeg', 'image/jpg', 'image/png'];
    const maxFileSize = 10 * 1024 * 1024; // 10MB

    for (let i = 0; i < referenceImages.length; i++) {
      const imageFile = referenceImages[i];

      if (!imageFile.buffer || !Buffer.isBuffer(imageFile.buffer)) {
        throw new Error(`Invalid image buffer for reference image ${i + 1}`);
      }

      if (!imageFile.mimetype || !supportedFormats.includes(imageFile.mimetype.toLowerCase())) {
        throw new Error(`Unsupported image format for reference image ${i + 1}. Supported formats: ${supportedFormats.join(', ')}`);
      }

      if (imageFile.buffer.length > maxFileSize) {
        throw new Error(`Reference image ${i + 1} exceeds maximum file size of ${maxFileSize / (1024 * 1024)}MB`);
      }

      if (imageFile.buffer.length === 0) {
        throw new Error(`Reference image ${i + 1} is empty`);
      }
    }
  }

  /**
   * Builds the generation prompt based on creative brief and options
   * @param {string} creativeBrief - The creative brief
   * @param {Array} referenceImages - Reference images
   * @param {Object} options - Generation options
   * @returns {string} Constructed prompt for image generation
   */
  buildGenerationPrompt(creativeBrief, referenceImages, options) {
    const { imageCount, aspectRatio } = options;
    
    let prompt = `Create ${imageCount} high-quality, photorealistic images for a UGC (User Generated Content) advertisement based on the following creative brief:

CREATIVE BRIEF:
${creativeBrief}

REQUIREMENTS:
- Generate ${imageCount} distinct but cohesive images that work together for video content
- Each image should be suitable for ${aspectRatio} aspect ratio
- Focus on authentic, user-generated content style
- Images should be suitable for advertising and marketing purposes
- Ensure high visual quality and professional composition
- Include elements that would work well for video transitions

STYLE GUIDELINES:
- Photorealistic and authentic UGC aesthetic
- Natural lighting and realistic settings
- Engaging compositions suitable for social media
- Professional quality but maintaining authentic feel
- Colors and tones that work well for video content`;

    if (referenceImages && referenceImages.length > 0) {
      prompt += `\n\nREFERENCE CONTEXT:
Use the provided reference images as inspiration for style, composition, or elements to include in the generated images. Maintain the authentic UGC feel while incorporating relevant visual elements from the references.`;
    }

    return prompt;
  }

  /**
   * Builds the request payload for Gemini API
   * @param {string} prompt - The constructed prompt
   * @param {Array} referenceImages - Reference images
   * @returns {Object} API request payload
   */
  buildGenerationRequest(prompt, referenceImages) {
    const contents = [];

    // Add text prompt
    const textContent = {
      role: 'user',
      parts: [
        {
          text: prompt
        }
      ]
    };

    // Add reference images if provided
    if (referenceImages && referenceImages.length > 0) {
      referenceImages.forEach((imageFile, index) => {
        const base64Image = this.convertImageToBase64(imageFile.buffer, imageFile.mimetype);
        textContent.parts.push({
          inlineData: {
            mimeType: imageFile.mimetype,
            data: base64Image.split(',')[1] // Remove data URL prefix
          }
        });
      });
    }

    contents.push(textContent);

    return {
      contents,
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 8192
      },
      safetySettings: [
        {
          category: 'HARM_CATEGORY_HARASSMENT',
          threshold: 'BLOCK_MEDIUM_AND_ABOVE'
        },
        {
          category: 'HARM_CATEGORY_HATE_SPEECH',
          threshold: 'BLOCK_MEDIUM_AND_ABOVE'
        },
        {
          category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
          threshold: 'BLOCK_MEDIUM_AND_ABOVE'
        },
        {
          category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
          threshold: 'BLOCK_MEDIUM_AND_ABOVE'
        }
      ]
    };
  }

  /**
   * Converts image buffer to base64 format
   * @param {Buffer} imageBuffer - Image file buffer
   * @param {string} mimeType - Image MIME type
   * @returns {string} Base64 encoded image
   */
  convertImageToBase64(imageBuffer, mimeType) {
    if (!Buffer.isBuffer(imageBuffer)) {
      throw new Error('Invalid image buffer provided');
    }

    if (!mimeType || !mimeType.startsWith('image/')) {
      throw new Error('Invalid image MIME type provided');
    }

    const base64Data = imageBuffer.toString('base64');
    return `data:${mimeType};base64,${base64Data}`;
  }

  /**
   * Makes HTTP call to Gemini API with proper headers
   * @param {Object} payload - Request payload
   * @returns {Promise<Object>} API response
   */
  async makeApiCall(payload) {
    const headers = {
      'Content-Type': 'application/json'
    };

    const url = `${this.apiUrl}?key=${config.geminiApiKey}`;

    try {
      const response = await axios.post(url, payload, {
        headers,
        timeout: 60000 // 60 second timeout for image generation
      });

      if (!response.data || !response.data.candidates || !response.data.candidates[0]) {
        throw new Error('Invalid response format from Gemini API');
      }

      return response;
    } catch (error) {
      if (error.response) {
        // API returned an error response
        const status = error.response.status;
        const message = error.response.data?.error?.message || error.response.statusText;
        throw new Error(`Gemini API error (${status}): ${message}`);
      } else if (error.request) {
        // Network error
        throw new Error('Network error: Unable to reach Gemini API');
      } else {
        // Other error
        throw new Error(`Request error: ${error.message}`);
      }
    }
  }

  /**
   * Parses the API response and extracts generated images
   * @param {Object} responseData - API response data
   * @returns {Array} Array of generated image data
   */
  parseGenerationResponse(responseData) {
    try {
      const candidate = responseData.candidates[0];
      const generatedImages = [];

      if (candidate.content && candidate.content.parts) {
        candidate.content.parts.forEach((part, index) => {
          if (part.inlineData && part.inlineData.data) {
            generatedImages.push({
              imageIndex: index,
              imageData: part.inlineData.data,
              mimeType: part.inlineData.mimeType || 'image/png',
              timestamp: new Date().toISOString()
            });
          }
        });
      }

      if (generatedImages.length === 0) {
        throw new Error('No images were generated in the response');
      }

      return generatedImages;
    } catch (error) {
      throw new Error(`Failed to parse generation response: ${error.message}`);
    }
  }

  /**
   * Formats the generated images into a structured result
   * @param {Array} generatedImages - Array of generated image data
   * @param {string} creativeBrief - Original creative brief
   * @returns {Array} Formatted image results
   */
  formatImageResults(generatedImages, creativeBrief) {
    return generatedImages.map((imageData, index) => ({
      imageIndex: index,
      imageData: imageData.imageData,
      mimeType: imageData.mimeType,
      buffer: Buffer.from(imageData.imageData, 'base64'),
      description: `Generated image ${index + 1} based on creative brief: ${creativeBrief.substring(0, 100)}...`,
      timestamp: imageData.timestamp,
      metadata: {
        generatedFromBrief: creativeBrief,
        model: this.model,
        generationMethod: 'gemini-native-image-generation'
      }
    }));
  }

  /**
   * Generates a single combined image that represents the creative brief
   * @param {string} creativeBrief - The creative brief
   * @param {Array} referenceImages - Optional reference images
   * @param {Object} options - Generation options
   * @returns {Promise<Object>} Single generated image result
   */
  async generateCombinedImage(creativeBrief, referenceImages = [], options = {}) {
    const combinedOptions = {
      ...options,
      imageCount: 1
    };

    const results = await this.generateImages(creativeBrief, referenceImages, combinedOptions);
    return results[0];
  }

  /**
   * Sleep utility for retry delays
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise} Promise that resolves after delay
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new ImageGenerationService();