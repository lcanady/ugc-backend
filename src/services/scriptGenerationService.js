const axios = require('axios');
const config = require('../utils/config');
const cacheService = require('./cacheService');

class ScriptGenerationService {
  constructor() {
    this.apiUrl = 'https://api.openai.com/v1/chat/completions';
    this.model = 'gpt-5';
    this.maxRetries = 2;
    this.retryDelay = 1000; // 1 second delay
    this.maxTokens = 800;
    this.temperature = 0.7;
  }

  /**
   * Generates or refines a video script based on creative brief and generated images
   * @param {string} creativeBrief - The creative brief describing campaign goals
   * @param {Array} generatedImages - Array of generated image results
   * @param {string} optionalScript - Optional user-provided script for refinement
   * @returns {Promise<Object>} Generated script with segment-1 and segment-2
   */
  async generateScript(creativeBrief, generatedImages, optionalScript = null) {
    if (!creativeBrief || typeof creativeBrief !== 'string' || creativeBrief.trim().length === 0) {
      throw new Error('Creative brief is required and must be a non-empty string');
    }

    if (!generatedImages || !Array.isArray(generatedImages) || generatedImages.length === 0) {
      throw new Error('Image analysis is required and must be a non-empty array');
    }

    // Check cache first
    const cachedResult = await cacheService.getCachedScript(creativeBrief, generatedImages, optionalScript);
    if (cachedResult) {
      console.log('Returning cached script generation result');
      return cachedResult;
    }

    const prompt = this.buildPrompt(creativeBrief, generatedImages, optionalScript);
    const requestPayload = this.buildScriptRequest(prompt);

    let lastError;
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.makeApiCall(requestPayload);
        const scriptResult = this.parseScriptResponse(response.data);
        this.validateScriptOutput(scriptResult);
        
        // Cache the result
        await cacheService.setCachedScript(creativeBrief, generatedImages, optionalScript, scriptResult);
        
        return scriptResult;
      } catch (error) {
        lastError = error;

        if (attempt < this.maxRetries) {
          await this.sleep(this.retryDelay);
          continue;
        }
      }
    }

    throw new Error(`Failed to generate script after ${this.maxRetries} attempts: ${lastError.message}`);
  }

  /**
   * Builds the prompt for script generation or refinement
   * @param {string} creativeBrief - The creative brief
   * @param {Array} generatedImages - Generated image results
   * @param {string} optionalScript - Optional user script
   * @returns {string} Constructed prompt for OpenAI
   */
  buildPrompt(creativeBrief, generatedImages, optionalScript) {
    const imageContext = this.formatImageAnalysisForPrompt(generatedImages);

    if (optionalScript) {
      return this.buildRefinementPrompt(creativeBrief, imageContext, optionalScript);
    } else {
      return this.buildGenerationPrompt(creativeBrief, imageContext);
    }
  }

  /**
   * Builds prompt for script generation from scratch
   * @param {string} creativeBrief - The creative brief
   * @param {string} imageContext - Formatted image analysis context
   * @returns {string} Generation prompt
   */
  buildGenerationPrompt(creativeBrief, imageContext) {
    return `You are an expert video script writer specializing in User Generated Content (UGC) advertisements. 

CREATIVE BRIEF:
${creativeBrief}

AVAILABLE VISUAL ELEMENTS (from uploaded images):
${imageContext}

TASK: Create a 2-segment video script for a UGC advertisement. Each segment should be 7-8 seconds of realistic, actionable content.

CRITICAL REQUIREMENTS:
1. ONLY reference objects, people, settings, and actions that are visible in the uploaded images
2. Each segment must be exactly 7-8 seconds of realistic action
3. Scripts must feel authentic and natural for UGC content
4. Focus on showing, not telling - describe visual actions
5. Ensure segments flow together as a cohesive story

OUTPUT FORMAT (JSON):
{
  "segment-1": "Detailed description of first 7-8 second video segment",
  "segment-2": "Detailed description of second 7-8 second video segment"
}

Generate the script now:`;
  }

  /**
   * Builds prompt for script refinement using AI agent-powered optimization
   * @param {string} creativeBrief - The creative brief
   * @param {string} imageContext - Formatted image analysis context
   * @param {string} userScript - User-provided script
   * @returns {string} Refinement prompt
   */
  buildRefinementPrompt(creativeBrief, imageContext, userScript) {
    const scriptAnalysis = this.analyzeUserScript(userScript, imageContext);
    const optimizationStrategy = this.determineOptimizationStrategy(scriptAnalysis, creativeBrief);

    return `You are an expert AI agent specializing in UGC video script optimization. You have advanced capabilities in script analysis, creative enhancement, and visual-content alignment.

CREATIVE BRIEF:
${creativeBrief}

AVAILABLE VISUAL ELEMENTS (from uploaded images):
${imageContext}

USER-PROVIDED SCRIPT:
${userScript}

AI AGENT ANALYSIS:
${scriptAnalysis}

OPTIMIZATION STRATEGY:
${optimizationStrategy}

TASK: Using your AI agent capabilities, intelligently refine and optimize the user script with the following advanced considerations:

INTELLIGENT REFINEMENT REQUIREMENTS:
1. VISUAL ALIGNMENT: Ensure every script element references only visible elements from uploaded images
2. TEMPORAL OPTIMIZATION: Each segment must be exactly 7-8 seconds of realistic, measurable action
3. NARRATIVE FLOW: Create seamless transitions between segments that build engagement
4. UGC AUTHENTICITY: Maintain natural, unscripted feel while improving professional quality
5. CREATIVE INTENT PRESERVATION: Honor user's original vision while enhancing execution
6. ACTIONABILITY: Every description must be specific enough for video production
7. EMOTIONAL RESONANCE: Optimize for viewer engagement and brand connection

AI AGENT OPTIMIZATION TECHNIQUES:
- Analyze user intent vs. available visuals and bridge gaps intelligently
- Enhance weak transitions with natural connecting elements
- Optimize pacing and rhythm for maximum impact
- Strengthen calls-to-action through visual storytelling
- Balance authenticity with professional polish

OUTPUT FORMAT (JSON):
{
  "segment-1": "AI-optimized description of first 7-8 second video segment",
  "segment-2": "AI-optimized description of second 7-8 second video segment"
}

Apply your AI agent optimization now:`;
  }

  /**
   * Formats image analysis results for prompt context
   * @param {Array} imageAnalysis - Array of image analysis results
   * @returns {string} Formatted context string
   */
  formatImageAnalysisForPrompt(imageAnalysis) {
    if (!imageAnalysis || imageAnalysis.length === 0) {
      return 'No visual elements available';
    }

    let context = `Total Images: ${imageAnalysis.length}\n\n`;

    imageAnalysis.forEach((analysis, index) => {
      context += `IMAGE ${index + 1}:\n`;
      context += `Description: ${analysis.description}\n`;

      if (analysis.objects && analysis.objects.length > 0) {
        context += `Objects: ${analysis.objects.join(', ')}\n`;
      }

      if (analysis.people && analysis.people.length > 0) {
        context += `People: ${analysis.people.join(', ')}\n`;
      }

      if (analysis.setting && analysis.setting !== 'unspecified setting') {
        context += `Setting: ${analysis.setting}\n`;
      }

      if (analysis.actions && analysis.actions.length > 0 && !analysis.actions.includes('static scene')) {
        context += `Actions: ${analysis.actions.join(', ')}\n`;
      }

      context += '\n';
    });

    // Add combined context if available
    if (imageAnalysis[0] && imageAnalysis[0].combinedContext) {
      const combined = imageAnalysis[0].combinedContext;
      context += 'COMBINED ELEMENTS ACROSS ALL IMAGES:\n';
      context += `All Objects: ${combined.combinedObjects.join(', ')}\n`;
      context += `All People: ${combined.combinedPeople.join(', ')}\n`;
      context += `All Settings: ${combined.combinedSettings.join(', ')}\n`;
      context += `All Actions: ${combined.combinedActions.join(', ')}\n`;
    }

    return context;
  }

  /**
   * Builds the request payload for OpenAI API
   * @param {string} prompt - The constructed prompt
   * @returns {Object} API request payload
   */
  buildScriptRequest(prompt) {
    return {
      model: this.model,
      messages: [
        {
          role: 'system',
          content: 'You are an expert UGC video script writer. Always respond with valid JSON in the exact format requested. Be specific and actionable in your script descriptions.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: this.maxTokens,
      temperature: this.temperature,
      response_format: { type: 'json_object' }
    };
  }

  /**
   * Makes HTTP call to OpenAI API with proper headers
   * @param {Object} payload - Request payload
   * @returns {Promise<Object>} API response
   */
  async makeApiCall(payload) {
    const headers = {
      'Authorization': `Bearer ${config.openaiApiKey}`,
      'Content-Type': 'application/json'
    };

    try {
      const response = await axios.post(this.apiUrl, payload, {
        headers,
        timeout: 60000 // 60 second timeout for script generation
      });

      if (!response.data || !response.data.choices || !response.data.choices[0]) {
        throw new Error('Invalid response format from OpenAI API');
      }

      return response;
    } catch (error) {
      if (error.response) {
        // API returned an error response
        const status = error.response.status;
        const message = error.response.data?.error?.message || error.response.statusText;
        throw new Error(`OpenAI API error (${status}): ${message}`);
      } else if (error.request) {
        // Network error
        throw new Error('Network error: Unable to reach OpenAI API');
      } else {
        // Other error
        throw new Error(`Request error: ${error.message}`);
      }
    }
  }

  /**
   * Parses the API response and extracts script data
   * @param {Object} responseData - API response data
   * @returns {Object} Parsed script result
   */
  parseScriptResponse(responseData) {
    try {
      const content = responseData.choices[0].message.content;
      const scriptData = JSON.parse(content);

      return {
        'segment-1': scriptData['segment-1'] || scriptData.segment1 || scriptData['segment_1'],
        'segment-2': scriptData['segment-2'] || scriptData.segment2 || scriptData['segment_2'],
        timestamp: new Date().toISOString(),
        model: responseData.model,
        usage: responseData.usage
      };
    } catch (error) {
      throw new Error(`Failed to parse script response: ${error.message}`);
    }
  }

  /**
   * Validates the script output format and content
   * @param {Object} scriptResult - The parsed script result
   * @throws {Error} If validation fails
   */
  validateScriptOutput(scriptResult) {
    if (!scriptResult || typeof scriptResult !== 'object') {
      throw new Error('Script result must be an object');
    }

    if (!scriptResult['segment-1'] || typeof scriptResult['segment-1'] !== 'string') {
      throw new Error('segment-1 is required and must be a string');
    }

    if (!scriptResult['segment-2'] || typeof scriptResult['segment-2'] !== 'string') {
      throw new Error('segment-2 is required and must be a string');
    }

    // Validate segment length (should be reasonable for 7-8 seconds)
    const segment1Length = scriptResult['segment-1'].trim().length;
    const segment2Length = scriptResult['segment-2'].trim().length;

    if (segment1Length < 20 || segment1Length > 500) {
      throw new Error('segment-1 length is unrealistic for 7-8 second video content');
    }

    if (segment2Length < 20 || segment2Length > 500) {
      throw new Error('segment-2 length is unrealistic for 7-8 second video content');
    }

    // Validate that segments are not identical
    if (scriptResult['segment-1'].trim() === scriptResult['segment-2'].trim()) {
      throw new Error('Script segments must be different from each other');
    }
  }

  /**
   * Analyzes user-provided script to identify strengths, weaknesses, and optimization opportunities
   * @param {string} userScript - User-provided script
   * @param {string} imageContext - Available visual elements
   * @returns {string} Analysis summary for AI agent optimization
   */
  analyzeUserScript(userScript, imageContext) {
    const analysis = [];

    // Analyze script length and structure
    const scriptLength = userScript.trim().length;
    if (scriptLength < 50) {
      analysis.push('BREVITY ISSUE: Script is very brief and may need expansion for 2 segments');
    } else if (scriptLength > 500) {
      analysis.push('LENGTH ISSUE: Script is lengthy and may need condensing for video format');
    }

    // Check for segment structure
    const hasSegmentStructure = userScript.includes('segment') ||
      userScript.includes('part') ||
      userScript.includes('first') ||
      userScript.includes('second');
    if (!hasSegmentStructure) {
      analysis.push('STRUCTURE OPPORTUNITY: Script lacks clear segment division - needs intelligent segmentation');
    }

    // Analyze visual alignment
    const visualElements = this.extractVisualReferences(userScript);
    const availableElements = this.extractAvailableElements(imageContext);
    const misalignedElements = visualElements.filter(element =>
      !availableElements.some(available =>
        available.toLowerCase().includes(element.toLowerCase()) ||
        element.toLowerCase().includes(available.toLowerCase())
      )
    );

    if (misalignedElements.length > 0) {
      analysis.push(`VISUAL MISALIGNMENT: Script references unavailable elements: ${misalignedElements.join(', ')}`);
    }

    // Check for actionability
    const actionWords = ['show', 'hold', 'use', 'demonstrate', 'display', 'open', 'close', 'move', 'touch'];
    const hasActions = actionWords.some(action => userScript.toLowerCase().includes(action));
    if (!hasActions) {
      analysis.push('ACTIONABILITY ISSUE: Script lacks specific actionable verbs for video production');
    }

    // Analyze emotional engagement
    const emotionalWords = ['amazing', 'incredible', 'love', 'excited', 'perfect', 'awesome', 'fantastic'];
    const hasEmotionalContent = emotionalWords.some(word => userScript.toLowerCase().includes(word));
    if (!hasEmotionalContent) {
      analysis.push('ENGAGEMENT OPPORTUNITY: Script could benefit from more emotional language');
    }

    return analysis.length > 0 ? analysis.join('\n') : 'SCRIPT QUALITY: User script shows good foundation for optimization';
  }

  /**
   * Determines the optimal strategy for script refinement based on analysis
   * @param {string} scriptAnalysis - Analysis of user script
   * @param {string} creativeBrief - Creative brief context
   * @returns {string} Optimization strategy for AI agent
   */
  determineOptimizationStrategy(scriptAnalysis, creativeBrief) {
    const strategies = [];

    // Determine primary optimization focus
    if (scriptAnalysis.includes('BREVITY ISSUE')) {
      strategies.push('EXPANSION STRATEGY: Intelligently expand brief script into detailed 2-segment narrative');
    } else if (scriptAnalysis.includes('LENGTH ISSUE')) {
      strategies.push('CONDENSATION STRATEGY: Distill lengthy script into focused, impactful segments');
    }

    if (scriptAnalysis.includes('STRUCTURE OPPORTUNITY')) {
      strategies.push('SEGMENTATION STRATEGY: Apply intelligent narrative arc with setup/payoff structure');
    }

    if (scriptAnalysis.includes('VISUAL MISALIGNMENT')) {
      strategies.push('ALIGNMENT STRATEGY: Redirect script elements to match available visual assets');
    }

    if (scriptAnalysis.includes('ACTIONABILITY ISSUE')) {
      strategies.push('ACTION ENHANCEMENT: Transform passive descriptions into specific, filmable actions');
    }

    if (scriptAnalysis.includes('ENGAGEMENT OPPORTUNITY')) {
      strategies.push('EMOTIONAL OPTIMIZATION: Enhance script with authentic emotional beats and engagement hooks');
    }

    // Add creative brief alignment strategy
    const briefKeywords = this.extractKeywords(creativeBrief);
    strategies.push(`BRAND ALIGNMENT: Ensure script reflects key brand messages: ${briefKeywords.join(', ')}`);

    // Add UGC-specific optimization
    strategies.push('UGC AUTHENTICITY: Maintain natural, user-generated feel while improving professional quality');

    return strategies.join('\n');
  }

  /**
   * Extracts visual references from user script
   * @param {string} script - User script
   * @returns {Array<string>} Array of visual elements mentioned
   */
  extractVisualReferences(script) {
    const commonObjects = [
      'phone', 'smartphone', 'laptop', 'computer', 'tablet', 'camera', 'car', 'bottle', 'cup', 'book',
      'table', 'chair', 'bed', 'door', 'window', 'bag', 'watch', 'glasses', 'headphones', 'keyboard'
    ];

    const found = commonObjects.filter(object =>
      script.toLowerCase().includes(object)
    );

    return found;
  }

  /**
   * Extracts available visual elements from image context
   * @param {string} imageContext - Formatted image analysis
   * @returns {Array<string>} Array of available visual elements
   */
  extractAvailableElements(imageContext) {
    const elements = [];

    // Extract from Objects lines
    const objectMatches = imageContext.match(/Objects: ([^\n]+)/g);
    if (objectMatches) {
      objectMatches.forEach(match => {
        const objects = match.replace('Objects: ', '').split(', ');
        elements.push(...objects);
      });
    }

    // Extract from All Objects line
    const allObjectsMatch = imageContext.match(/All Objects: ([^\n]+)/);
    if (allObjectsMatch) {
      const objects = allObjectsMatch[1].split(', ');
      elements.push(...objects);
    }

    return [...new Set(elements)]; // Remove duplicates
  }

  /**
   * Extracts key keywords from creative brief
   * @param {string} creativeBrief - Creative brief text
   * @returns {Array<string>} Array of key brand/product keywords
   */
  extractKeywords(creativeBrief) {
    // Simple keyword extraction - could be enhanced with NLP
    const words = creativeBrief.toLowerCase().split(/\s+/);
    const stopWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'that', 'this', 'these', 'those'];

    const keywords = words
      .filter(word => word.length > 3 && !stopWords.includes(word))
      .filter((word, index, arr) => arr.indexOf(word) === index) // Remove duplicates
      .slice(0, 5); // Take top 5 keywords

    return keywords;
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

module.exports = new ScriptGenerationService();