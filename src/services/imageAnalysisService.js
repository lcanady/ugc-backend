const axios = require('axios');
const config = require('../utils/config');
const cacheService = require('./cacheService');

/**
 * Service for analyzing images using AI vision models
 */
class ImageAnalysisService {
  constructor() {
    this.apiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent';
    this.model = 'gemini-2.5-flash-image-preview';
    this.maxRetries = 3;
    this.retryDelay = 1000;
  }

  /**
   * Analyzes an image to extract objects, people, settings, and actions
   * @param {Buffer} imageBuffer - Image file buffer
   * @param {string} mimeType - Image MIME type
   * @param {Object} options - Analysis options
   * @returns {Promise<Object>} Analysis result
   */
  async analyzeImage(imageBuffer, mimeType, options = {}) {
    if (!Buffer.isBuffer(imageBuffer)) {
      throw new Error('Image buffer is required and must be a Buffer');
    }

    if (!mimeType || !mimeType.startsWith('image/')) {
      throw new Error('Valid image MIME type is required');
    }

    // Check cache first
    const cachedResult = await cacheService.getCachedImageAnalysis(imageBuffer, options);
    if (cachedResult) {
      console.log('Returning cached image analysis result');
      return cachedResult;
    }

    const prompt = this.buildAnalysisPrompt(options);
    const requestPayload = this.buildAnalysisRequest(prompt, imageBuffer, mimeType);

    let lastError;
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.makeApiCall(requestPayload);
        const analysis = this.parseAnalysisResponse(response.data);
        const result = this.formatAnalysisResult(analysis, options);
        
        // Cache the result
        await cacheService.setCachedImageAnalysis(imageBuffer, options, result);
        
        return result;
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

    throw new Error(`Failed to analyze image after ${this.maxRetries} attempts: ${lastError.message}`);
  }

  /**
   * Analyzes multiple images in batch
   * @param {Array} images - Array of image objects with buffer and mimeType
   * @param {Object} options - Analysis options
   * @returns {Promise<Array>} Array of analysis results
   */
  async analyzeImages(images, options = {}) {
    if (!Array.isArray(images) || images.length === 0) {
      throw new Error('Images array is required and must not be empty');
    }

    const analysisPromises = images.map(async (image, index) => {
      try {
        const result = await this.analyzeImage(image.buffer, image.mimeType, options);
        return {
          imageIndex: index,
          filename: image.filename || `image_${index + 1}`,
          ...result
        };
      } catch (error) {
        throw new Error(`Failed to analyze image ${index + 1}: ${error.message}`);
      }
    });

    return Promise.all(analysisPromises);
  }

  /**
   * Builds the analysis prompt based on options
   * @param {Object} options - Analysis options
   * @returns {string} Analysis prompt
   */
  buildAnalysisPrompt(options = {}) {
    const {
      focusAreas = ['objects', 'people', 'setting', 'actions', 'colors', 'mood'],
      detailLevel = 'standard',
      ugcContext = true
    } = options;

    let prompt = 'Analyze this image in detail and provide structured information about:\n\n';

    if (focusAreas.includes('objects')) {
      prompt += '- OBJECTS: List all significant objects, items, products, or things visible in the image\n';
    }

    if (focusAreas.includes('people')) {
      prompt += '- PEOPLE: Describe any people present (age group, gender, appearance, clothing, expressions)\n';
    }

    if (focusAreas.includes('setting')) {
      prompt += '- SETTING: Describe the location, environment, or background (indoor/outdoor, specific place type)\n';
    }

    if (focusAreas.includes('actions')) {
      prompt += '- ACTIONS: Describe what is happening, any activities or movements visible\n';
    }

    if (focusAreas.includes('colors')) {
      prompt += '- COLORS: Identify the dominant colors and color scheme\n';
    }

    if (focusAreas.includes('mood')) {
      prompt += '- MOOD: Describe the overall mood, atmosphere, or emotional tone\n';
    }

    prompt += '\nAdditional requirements:\n';
    
    if (ugcContext) {
      prompt += '- Focus on elements that would be relevant for User Generated Content (UGC) advertising\n';
      prompt += '- Identify authentic, relatable elements that work well for social media content\n';
    }

    if (detailLevel === 'detailed') {
      prompt += '- Provide detailed descriptions with specific details\n';
      prompt += '- Include technical aspects like lighting, composition, and visual style\n';
    } else {
      prompt += '- Provide concise but comprehensive descriptions\n';
      prompt += '- Focus on the most important and relevant elements\n';
    }

    prompt += '\nFormat your response as a structured analysis with clear categories.';

    return prompt;
  }

  /**
   * Builds the API request payload
   * @param {string} prompt - Analysis prompt
   * @param {Buffer} imageBuffer - Image buffer
   * @param {string} mimeType - Image MIME type
   * @returns {Object} Request payload
   */
  buildAnalysisRequest(prompt, imageBuffer, mimeType) {
    const base64Image = imageBuffer.toString('base64');

    return {
      contents: [{
        role: 'user',
        parts: [
          {
            text: prompt
          },
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Image
            }
          }
        ]
      }],
      generationConfig: {
        temperature: 0.3,
        topK: 32,
        topP: 0.8,
        maxOutputTokens: 2048
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
   * Makes API call to Gemini
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
        timeout: 30000
      });

      if (!response.data || !response.data.candidates || !response.data.candidates[0]) {
        throw new Error('Invalid response format from Gemini API');
      }

      return response;
    } catch (error) {
      if (error.response) {
        const status = error.response.status;
        const message = error.response.data?.error?.message || error.response.statusText;
        throw new Error(`Gemini API error (${status}): ${message}`);
      } else if (error.request) {
        throw new Error('Network error: Unable to reach Gemini API');
      } else {
        throw new Error(`Request error: ${error.message}`);
      }
    }
  }

  /**
   * Parses the API response
   * @param {Object} responseData - API response data
   * @returns {string} Analysis text
   */
  parseAnalysisResponse(responseData) {
    try {
      const candidate = responseData.candidates[0];
      
      if (!candidate.content || !candidate.content.parts || !candidate.content.parts[0]) {
        throw new Error('No analysis content in response');
      }

      return candidate.content.parts[0].text;
    } catch (error) {
      throw new Error(`Failed to parse analysis response: ${error.message}`);
    }
  }

  /**
   * Formats the analysis result into structured data
   * @param {string} analysisText - Raw analysis text
   * @param {Object} options - Analysis options
   * @returns {Object} Structured analysis result
   */
  formatAnalysisResult(analysisText, options = {}) {
    try {
      // Extract structured information from the analysis text
      const result = {
        objects: this.extractSection(analysisText, 'OBJECTS'),
        people: this.extractSection(analysisText, 'PEOPLE'),
        setting: this.extractSingleValue(analysisText, 'SETTING'),
        actions: this.extractSection(analysisText, 'ACTIONS'),
        colors: this.extractSection(analysisText, 'COLORS'),
        mood: this.extractSingleValue(analysisText, 'MOOD'),
        rawAnalysis: analysisText,
        timestamp: new Date().toISOString(),
        model: this.model
      };

      // Clean up empty arrays and null values
      Object.keys(result).forEach(key => {
        if (Array.isArray(result[key]) && result[key].length === 0) {
          result[key] = [];
        }
        if (result[key] === null || result[key] === undefined) {
          result[key] = '';
        }
      });

      return result;
    } catch (error) {
      // Fallback to basic parsing if structured extraction fails
      return {
        objects: [],
        people: [],
        setting: '',
        actions: [],
        colors: [],
        mood: '',
        rawAnalysis: analysisText,
        timestamp: new Date().toISOString(),
        model: this.model,
        parseError: error.message
      };
    }
  }

  /**
   * Extracts a section as an array of items
   * @param {string} text - Analysis text
   * @param {string} sectionName - Section name to extract
   * @returns {Array} Extracted items
   */
  extractSection(text, sectionName) {
    try {
      const regex = new RegExp(`${sectionName}:([^\\n]*(?:\\n(?!\\w+:)[^\\n]*)*)`, 'i');
      const match = text.match(regex);
      
      if (!match || !match[1]) {
        return [];
      }

      const content = match[1].trim();
      
      // Split by common delimiters and clean up
      const items = content
        .split(/[,;•\-\n]/)
        .map(item => item.trim())
        .filter(item => item.length > 0 && !item.match(/^[\-•\s]*$/))
        .slice(0, 10); // Limit to 10 items per section

      return items;
    } catch (error) {
      return [];
    }
  }

  /**
   * Extracts a section as a single value
   * @param {string} text - Analysis text
   * @param {string} sectionName - Section name to extract
   * @returns {string} Extracted value
   */
  extractSingleValue(text, sectionName) {
    try {
      const regex = new RegExp(`${sectionName}:([^\\n]*(?:\\n(?!\\w+:)[^\\n]*)*)`, 'i');
      const match = text.match(regex);
      
      if (!match || !match[1]) {
        return '';
      }

      return match[1].trim().substring(0, 200); // Limit length
    } catch (error) {
      return '';
    }
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
   * Sleep utility for retry delays
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise} Promise that resolves after delay
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new ImageAnalysisService();