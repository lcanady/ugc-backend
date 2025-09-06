const imageAnalysisService = require('../services/imageAnalysisService');
const scriptGenerationService = require('../services/scriptGenerationService');
const videoGenerationService = require('../services/videoGenerationService');
const operationService = require('../services/operationService');
const jobManager = require('../jobs/jobManager');
const config = require('../utils/config');

/**
 * Controller for UGC Ad Creator API endpoints
 */
class UGCController {
  /**
   * Generates UGC advertisement from creative brief and images
   * POST /api/v1/ugc/generate
   */
  async generateUGCAd(req, res) {
    let operation = null;
    
    try {
      const { creativeBrief, script, options = {} } = req.body;
      const uploadedImages = req.files || [];

      // Get user and API key info from middleware
      const userId = req.user?.id || null;
      const apiKeyId = req.apiKey?.id || null;

      // Validate required inputs
      if (!creativeBrief || typeof creativeBrief !== 'string' || creativeBrief.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Creative brief is required and must be a non-empty string',
          code: 'INVALID_CREATIVE_BRIEF'
        });
      }

      if (!uploadedImages || uploadedImages.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'At least one image is required',
          code: 'NO_IMAGES_PROVIDED'
        });
      }

      if (uploadedImages.length > config.maxImages) {
        return res.status(400).json({
          success: false,
          error: `Maximum ${config.maxImages} images allowed`,
          code: 'TOO_MANY_IMAGES'
        });
      }

      // Check user quotas if user is identified
      if (userId) {
        const quotaStatus = await operationService.checkUserQuotas(userId);
        
        if (quotaStatus.daily.exceeded) {
          return res.status(429).json({
            success: false,
            error: 'Daily quota exceeded',
            code: 'DAILY_QUOTA_EXCEEDED',
            quotaStatus
          });
        }
        
        if (quotaStatus.concurrent.exceeded) {
          return res.status(429).json({
            success: false,
            error: 'Too many concurrent operations',
            code: 'CONCURRENT_LIMIT_EXCEEDED',
            quotaStatus
          });
        }
      }

      // Create operation record
      operation = await operationService.createOperation({
        creativeBrief,
        apiKeyId,
        userId,
        metadata: {
          imageCount: uploadedImages.length,
          hasProvidedScript: !!script,
          options,
          userAgent: req.get('User-Agent'),
          ipAddress: req.ip
        }
      });

      // Process the UGC ad generation workflow
      const result = await this.processUGCWorkflow({
        operationId: operation.operationId,
        creativeBrief,
        script,
        uploadedImages,
        options
      });

      // Update operation as processing (video generation is queued)
      await operationService.updateOperationStatus(operation.operationId, 'processing', {
        scriptContent: result.script,
        videoJobId: result.videoGeneration?.jobId,
        metadata: {
          queuedAt: new Date().toISOString(),
          processingTime: result.metadata?.processingTime,
          scriptSegmentCount: Object.keys(result.script?.segments || {}).length,
          videoGenerationStatus: 'queued'
        }
      });

      res.status(202).json({
        success: true,
        data: {
          ...result,
          operationId: operation.operationId
        },
        message: 'UGC advertisement processing started. Video generation is queued in background.',
        statusEndpoint: `/api/v1/ugc/status/${operation.operationId}`
      });

    } catch (error) {
      console.error('UGC generation error:', error);
      
      // Update operation as failed if it was created
      if (operation) {
        try {
          await operationService.updateOperationStatus(operation.operationId, 'failed', {
            errorMessage: error.message,
            metadata: {
              failedAt: new Date().toISOString(),
              errorStack: error.stack
            }
          });
        } catch (updateError) {
          console.error('Failed to update operation status:', updateError.message);
        }
      }
      
      res.status(500).json({
        success: false,
        error: error.message || 'Internal server error during UGC generation',
        code: 'UGC_GENERATION_ERROR',
        operationId: operation?.operationId
      });
    }
  }

  /**
   * Processes the complete UGC workflow
   * @param {Object} params - Workflow parameters
   * @returns {Promise<Object>} Complete UGC result
   */
  async processUGCWorkflow({ operationId, creativeBrief, script, uploadedImages, options }) {
    const workflow = {
      startTime: new Date().toISOString(),
      steps: []
    };

    try {
      // Update operation status to processing
      if (operationId) {
        await operationService.updateOperationStatus(operationId, 'processing');
      }

      // Step 1: Analyze uploaded images
      workflow.steps.push({ step: 'image_analysis', status: 'started', timestamp: new Date().toISOString() });
      
      if (operationId) {
        await operationService.addWorkflowStep(operationId, { 
          step: 'image_analysis', 
          status: 'started' 
        });
      }
      
      const imageAnalysis = await this.analyzeImages(uploadedImages);
      
      workflow.steps.push({ 
        step: 'image_analysis', 
        status: 'completed', 
        timestamp: new Date().toISOString(),
        result: { analyzedImages: imageAnalysis.length }
      });

      if (operationId) {
        await operationService.addWorkflowStep(operationId, { 
          step: 'image_analysis', 
          status: 'completed',
          result: { analyzedImages: imageAnalysis.length }
        });
      }

      // Step 2: Generate or refine script
      workflow.steps.push({ step: 'script_generation', status: 'started', timestamp: new Date().toISOString() });
      
      if (operationId) {
        await operationService.addWorkflowStep(operationId, { 
          step: 'script_generation', 
          status: 'started' 
        });
      }
      
      const scriptResult = await this.generateOrRefineScript({
        creativeBrief,
        providedScript: script,
        imageAnalysis,
        options
      });
      
      workflow.steps.push({ 
        step: 'script_generation', 
        status: 'completed', 
        timestamp: new Date().toISOString(),
        result: { segments: Object.keys(scriptResult.segments).length }
      });

      if (operationId) {
        await operationService.addWorkflowStep(operationId, { 
          step: 'script_generation', 
          status: 'completed',
          result: { segments: Object.keys(scriptResult.segments).length }
        });
      }

      // Step 3: Prepare images for video generation (using uploaded images)
      const generatedImages = []; // No additional image generation for now

      // Step 4: Queue video generation as background job
      workflow.steps.push({ step: 'video_generation', status: 'queued', timestamp: new Date().toISOString() });
      
      if (operationId) {
        await operationService.addWorkflowStep(operationId, { 
          step: 'video_generation', 
          status: 'queued' 
        });
      }
      
      // Queue video generation job instead of processing synchronously
      const videoJob = await jobManager.addVideoGenerationJob({
        operationId,
        script: scriptResult.segments,
        images: uploadedImages.map(img => ({
          buffer: img.buffer,
          mimeType: img.mimetype,
          originalName: img.originalname
        })),
        userId: userId,
        userTier: req.user?.tier || 'basic', // Get user tier for priority calculation
        creativeBrief,
        imageAnalysis,
        options
      }, {
        source: 'api',           // API request gets higher priority
        urgent: options.urgent,  // Allow urgent flag
        scheduledFor: options.scheduledFor, // Allow scheduling
        isRetry: false
      });
      
      workflow.steps.push({ 
        step: 'video_generation', 
        status: 'queued', 
        timestamp: new Date().toISOString(),
        result: { jobId: videoJob.id, queuePosition: videoJob.opts?.delay || 0 }
      });

      if (operationId) {
        await operationService.addWorkflowStep(operationId, { 
          step: 'video_generation', 
          status: 'queued',
          result: { jobId: videoJob.id }
        });
      }

      // Step 5: Compile final result (without video segments since they're being generated in background)
      const finalResult = {
        id: this.generateResultId(),
        creativeBrief,
        imageAnalysis: imageAnalysis,
        script: scriptResult,
        videoGeneration: {
          status: 'queued',
          jobId: videoJob.id,
          estimatedCompletionTime: new Date(Date.now() + 5 * 60 * 1000).toISOString() // Estimate 5 minutes
        },
        workflow,
        queuedAt: new Date().toISOString(),
        metadata: {
          processingTime: Date.now() - new Date(workflow.startTime).getTime(),
          model: 'veo-3.0-generate-preview',
          version: '1.0.0'
        }
      };

      return finalResult;

    } catch (error) {
      workflow.steps.push({ 
        step: 'error', 
        status: 'failed', 
        timestamp: new Date().toISOString(),
        error: error.message 
      });
      
      throw error;
    }
  }

  /**
   * Analyzes uploaded images using AI vision
   * @param {Array} uploadedImages - Array of uploaded image files
   * @returns {Promise<Array>} Image analysis results
   */
  async analyzeImages(uploadedImages) {
    try {
      // Convert uploaded files to format expected by imageAnalysisService
      const images = uploadedImages.map((imageFile, index) => ({
        buffer: imageFile.buffer,
        mimeType: imageFile.mimetype,
        filename: imageFile.originalname || `image_${index + 1}`
      }));

      // Use the actual imageAnalysisService
      const analysisResults = await imageAnalysisService.analyzeImages(images, {
        focusAreas: ['objects', 'people', 'setting', 'actions', 'colors', 'mood'],
        detailLevel: 'standard',
        ugcContext: true
      });

      return analysisResults;
    } catch (error) {
      throw new Error(`Image analysis failed: ${error.message}`);
    }
  }

  /**
   * Generates or refines script based on creative brief and image analysis
   * @param {Object} params - Script generation parameters
   * @returns {Promise<Object>} Script generation result
   */
  async generateOrRefineScript({ creativeBrief, providedScript, imageAnalysis, options }) {
    try {
      // Use the actual scriptGenerationService with correct method signature
      const scriptResult = await scriptGenerationService.generateScript(
        creativeBrief,
        imageAnalysis,
        providedScript // This will be null if not provided, triggering generation vs refinement
      );

      // Return in expected format for the workflow
      return {
        segments: {
          'segment-1': scriptResult['segment-1'],
          'segment-2': scriptResult['segment-2']
        },
        timestamp: scriptResult.timestamp,
        model: scriptResult.model,
        usage: scriptResult.usage,
        wasRefined: !!providedScript
      };
    } catch (error) {
      throw new Error(`Script generation failed: ${error.message}`);
    }
  }



  /**
   * Generates video segments using Veo 3
   * @param {Object} params - Video generation parameters
   * @returns {Promise<Array>} Generated video segments
   */
  async generateVideoSegments({ creativeBrief, imageAnalysis, scriptResult, generatedImages, options }) {
    try {
      // Create UGC-optimized prompts using the video service
      const videoPrompts = videoGenerationService.createUGCPrompts(
        creativeBrief,
        imageAnalysis,
        scriptResult.segments
      );

      // Set up global video options
      const globalOptions = {
        aspectRatio: options.aspectRatio || '16:9',
        personGeneration: options.personGeneration || 'allow_adult',
        useFastModel: options.useFastModel || false
      };

      // Add image input if available (use uploaded images if no generated images)
      const imagesToUse = generatedImages && generatedImages.length > 0 ? generatedImages : [];
      if (imagesToUse.length > 0 && videoPrompts[0]) {
        const firstImage = imagesToUse[0];
        videoPrompts[0].options.imageBuffer = firstImage.buffer;
        videoPrompts[0].options.imageMimeType = firstImage.mimeType;
      }

      // Generate video segments using the actual service method
      const videoSegments = await videoGenerationService.generateVideoSegments(
        videoPrompts,
        globalOptions
      );

      // Enhance results with additional metadata
      return videoSegments.map((segment, index) => ({
        ...segment,
        segmentNumber: index + 1,
        segmentKey: segment.segmentKey || `segment-${index + 1}`,
        scriptSegment: scriptResult.segments[segment.segmentKey || `segment-${index + 1}`],
        generatedAt: new Date().toISOString()
      }));

    } catch (error) {
      throw new Error(`Video generation failed: ${error.message}`);
    }
  }

  /**
   * Get generation status by operation ID
   * GET /api/v1/ugc/status/:operationId
   */
  async getGenerationStatus(req, res) {
    try {
      const { operationId } = req.params;

      if (!operationId) {
        return res.status(400).json({
          success: false,
          error: 'Operation ID is required',
          code: 'MISSING_OPERATION_ID'
        });
      }

      const operation = await operationService.getOperation(operationId);

      if (!operation) {
        return res.status(404).json({
          success: false,
          error: 'Operation not found',
          code: 'OPERATION_NOT_FOUND'
        });
      }

      // Check if user has access to this operation
      const userId = req.user?.id;
      const apiKeyId = req.apiKey?.id;
      
      if (userId && operation.userId !== userId) {
        return res.status(403).json({
          success: false,
          error: 'Access denied to this operation',
          code: 'ACCESS_DENIED'
        });
      }

      if (apiKeyId && operation.apiKeyId !== apiKeyId) {
        return res.status(403).json({
          success: false,
          error: 'Access denied to this operation',
          code: 'ACCESS_DENIED'
        });
      }

      // Use job status service for enhanced status information
      const jobStatusService = require('../services/jobStatusService');
      const enhancedStatus = await jobStatusService.getJobStatus(operationId);

      res.status(200).json({
        success: true,
        data: enhancedStatus || {
          operationId: operation.operationId,
          status: operation.status,
          creativeBrief: operation.creativeBrief,
          scriptContent: operation.scriptContent,
          videoUrls: operation.videoUrls,
          errorMessage: operation.errorMessage,
          metadata: operation.metadata,
          createdAt: operation.created_at,
          updatedAt: operation.updated_at,
          completedAt: operation.completedAt,
          isCompleted: operation.isCompleted(),
          duration: operation.getDuration()
        }
      });

    } catch (error) {
      console.error('Get operation status error:', error);
      
      res.status(500).json({
        success: false,
        error: error.message || 'Internal server error',
        code: 'STATUS_RETRIEVAL_ERROR'
      });
    }
  }

  /**
   * Downloads generated videos
   * POST /api/v1/ugc/download
   */
  async downloadVideos(req, res) {
    try {
      const { videoSegments, format = 'mp4' } = req.body;

      if (!videoSegments || !Array.isArray(videoSegments) || videoSegments.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Video segments are required',
          code: 'NO_VIDEO_SEGMENTS'
        });
      }

      const downloadResults = [];

      for (let i = 0; i < videoSegments.length; i++) {
        const segment = videoSegments[i];
        
        if (!segment.videoFile) {
          throw new Error(`Video file missing for segment ${i + 1}`);
        }

        const downloadPath = `./downloads/segment_${i + 1}_${Date.now()}.${format}`;
        
        try {
          // Use the actual videoGenerationService downloadVideo method
          const filePath = await videoGenerationService.downloadVideo(
            segment.videoFile,
            downloadPath
          );

          downloadResults.push({
            segmentIndex: i,
            segmentKey: segment.segmentKey || `segment-${i + 1}`,
            downloadPath: filePath,
            filename: `segment_${i + 1}.${format}`,
            downloadedAt: new Date().toISOString()
          });

        } catch (error) {
          throw new Error(`Failed to download segment ${i + 1}: ${error.message}`);
        }
      }

      res.status(200).json({
        success: true,
        data: {
          downloads: downloadResults,
          totalSegments: downloadResults.length
        },
        message: 'Videos downloaded successfully'
      });

    } catch (error) {
      console.error('Video download error:', error);
      
      res.status(500).json({
        success: false,
        error: error.message || 'Internal server error during video download',
        code: 'VIDEO_DOWNLOAD_ERROR'
      });
    }
  }

  /**
   * Get user operation history
   * GET /api/v1/ugc/history
   */
  async getOperationHistory(req, res) {
    try {
      const userId = req.user?.id;
      const apiKeyId = req.apiKey?.id;

      if (!userId && !apiKeyId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'AUTHENTICATION_REQUIRED'
        });
      }

      const { limit = 50, status, startDate, endDate } = req.query;

      const filters = {
        limit: parseInt(limit),
        status,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined
      };

      let operations;
      if (userId) {
        operations = await operationService.getUserOperations(userId, filters);
      } else {
        operations = await operationService.getApiKeyOperations(apiKeyId, filters);
      }

      res.status(200).json({
        success: true,
        data: {
          operations: operations.map(op => ({
            operationId: op.operationId,
            status: op.status,
            creativeBrief: op.creativeBrief?.substring(0, 200) + (op.creativeBrief?.length > 200 ? '...' : ''),
            createdAt: op.created_at,
            completedAt: op.completedAt,
            duration: op.getDuration(),
            hasScript: !!op.scriptContent,
            videoCount: op.videoUrls?.length || 0
          })),
          total: operations.length,
          filters
        }
      });

    } catch (error) {
      console.error('Get operation history error:', error);
      
      res.status(500).json({
        success: false,
        error: error.message || 'Internal server error',
        code: 'HISTORY_RETRIEVAL_ERROR'
      });
    }
  }

  /**
   * Get user quota status
   * GET /api/v1/ugc/quota
   */
  async getQuotaStatus(req, res) {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'User authentication required for quota check',
          code: 'USER_AUTHENTICATION_REQUIRED'
        });
      }

      const quotaStatus = await operationService.checkUserQuotas(userId);

      res.status(200).json({
        success: true,
        data: quotaStatus
      });

    } catch (error) {
      console.error('Get quota status error:', error);
      
      res.status(500).json({
        success: false,
        error: error.message || 'Internal server error',
        code: 'QUOTA_CHECK_ERROR'
      });
    }
  }

  /**
   * Get operation statistics (admin only)
   * GET /api/v1/ugc/stats
   */
  async getOperationStats(req, res) {
    try {
      // Check if user has admin permissions
      const user = req.user;
      if (!user || !user.hasPermission('*')) {
        return res.status(403).json({
          success: false,
          error: 'Admin permissions required',
          code: 'ADMIN_REQUIRED'
        });
      }

      const { userId, apiKeyId, startDate, endDate } = req.query;

      const filters = {
        userId,
        apiKeyId,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined
      };

      const stats = await operationService.getOperationStats(filters);

      res.status(200).json({
        success: true,
        data: stats
      });

    } catch (error) {
      console.error('Get operation stats error:', error);
      
      res.status(500).json({
        success: false,
        error: error.message || 'Internal server error',
        code: 'STATS_RETRIEVAL_ERROR'
      });
    }
  }

  /**
   * Maps job status to user-friendly status
   * @param {Object} jobStatus - Job status from queue
   * @returns {string} User-friendly status
   */
  mapJobStatusToUserFriendly(jobStatus) {
    if (!jobStatus) return 'unknown';
    
    if (jobStatus.finishedOn && jobStatus.returnvalue) {
      return 'completed';
    } else if (jobStatus.failedReason) {
      return 'failed';
    } else if (jobStatus.processedOn) {
      return 'processing';
    } else {
      return 'queued';
    }
  }

  /**
   * Estimates remaining time for job completion
   * @param {Object} jobStatus - Job status from queue
   * @returns {number|null} Estimated seconds remaining
   */
  estimateTimeRemaining(jobStatus) {
    if (!jobStatus || !jobStatus.processedOn || jobStatus.finishedOn) {
      return null;
    }

    const progress = jobStatus.progress || 0;
    if (progress <= 0) {
      return 300; // Default estimate of 5 minutes
    }

    const elapsedTime = Date.now() - jobStatus.processedOn;
    const estimatedTotalTime = elapsedTime / (progress / 100);
    const remainingTime = Math.max(0, estimatedTotalTime - elapsedTime);
    
    return Math.round(remainingTime / 1000); // Return seconds
  }

  /**
   * Validates video generation options
   * @param {Object} options - Options to validate
   * @returns {Object} Validated options
   */
  validateOptions(options) {
    const validated = { ...options };

    // Validate aspect ratio
    const validAspectRatios = ['16:9', '9:16', '1:1'];
    if (validated.aspectRatio && !validAspectRatios.includes(validated.aspectRatio)) {
      throw new Error(`Invalid aspect ratio. Must be one of: ${validAspectRatios.join(', ')}`);
    }

    // Validate person generation
    const validPersonGeneration = ['allow_all', 'allow_adult', 'dont_allow'];
    if (validated.personGeneration && !validPersonGeneration.includes(validated.personGeneration)) {
      throw new Error(`Invalid person generation setting. Must be one of: ${validPersonGeneration.join(', ')}`);
    }

    // Validate segment count
    if (validated.segmentCount && (validated.segmentCount < 1 || validated.segmentCount > 4)) {
      throw new Error('Segment count must be between 1 and 4');
    }

    // Validate segment duration
    if (validated.segmentDuration && (validated.segmentDuration < 5 || validated.segmentDuration > 8)) {
      throw new Error('Segment duration must be between 5 and 8 seconds');
    }

    return validated;
  }

  /**
   * Generates a unique result ID
   * @returns {string} Unique ID
   */
  generateResultId() {
    return `ugc_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }
}

module.exports = new UGCController();