/**
 * Mock API responses for integration tests
 */

const mockResponses = {
  // OpenRouter AI (Image Analysis) responses
  imageAnalysis: {
    success: {
      choices: [{
        message: {
          content: JSON.stringify([
            {
              imageIndex: 0,
              description: "A modern smartphone displaying a social media app interface with vibrant colors",
              objects: ["smartphone", "screen", "app interface", "icons", "buttons"],
              people: ["hands holding device"],
              setting: "indoor tech environment with soft lighting",
              actions: ["displaying", "showing interface", "user interaction"],
              colors: ["black", "white", "blue", "green"],
              mood: "modern, clean, and user-friendly"
            }
          ])
        }
      }],
      usage: {
        prompt_tokens: 150,
        completion_tokens: 75,
        total_tokens: 225
      }
    },
    multipleImages: {
      choices: [{
        message: {
          content: JSON.stringify([
            {
              imageIndex: 0,
              description: "A smartphone showing the app's main dashboard",
              objects: ["smartphone", "dashboard", "navigation menu"],
              people: [],
              setting: "clean white background",
              actions: ["displaying dashboard"],
              colors: ["white", "blue", "gray"],
              mood: "professional and clean"
            },
            {
              imageIndex: 1,
              description: "Close-up of app features being demonstrated",
              objects: ["screen", "feature buttons", "interface elements"],
              people: ["finger touching screen"],
              setting: "focused product shot",
              actions: ["touching", "demonstrating features"],
              colors: ["blue", "white", "orange"],
              mood: "engaging and interactive"
            }
          ])
        }
      }]
    },
    error: {
      error: {
        message: "Image analysis service temporarily unavailable",
        type: "service_unavailable",
        code: "image_analysis_error"
      }
    }
  },

  // OpenAI (Script Generation) responses
  scriptGeneration: {
    success: {
      choices: [{
        message: {
          content: JSON.stringify({
            "segment-1": "Close-up shot of hands holding the smartphone, fingers swiping through the app interface with smooth, natural movements, highlighting the intuitive navigation",
            "segment-2": "Wide shot showing the person using the app in a bright, modern room, with natural lighting highlighting the screen and demonstrating real-world usage"
          })
        }
      }],
      usage: {
        prompt_tokens: 200,
        completion_tokens: 100,
        total_tokens: 300
      }
    },
    refinement: {
      choices: [{
        message: {
          content: JSON.stringify({
            "segment-1": "Enhanced version: Close-up shot of hands confidently navigating the smartphone app, with smooth finger gestures showcasing the responsive interface design",
            "segment-2": "Refined scene: Person comfortably using the app in a contemporary workspace, natural lighting emphasizing the screen clarity and user satisfaction"
          })
        }
      }]
    },
    error: {
      error: {
        message: "Script generation quota exceeded",
        type: "quota_exceeded",
        code: "script_generation_error"
      }
    }
  },

  // Kie AI (Video Generation) responses
  videoGeneration: {
    initiate: {
      id: "veo-task-12345",
      status: "pending",
      created_at: "2024-01-15T10:30:00Z"
    },
    status: {
      pending: {
        id: "veo-task-12345",
        status: "pending",
        progress: 25,
        created_at: "2024-01-15T10:30:00Z",
        updated_at: "2024-01-15T10:31:00Z"
      },
      processing: {
        id: "veo-task-12345",
        status: "processing",
        progress: 75,
        created_at: "2024-01-15T10:30:00Z",
        updated_at: "2024-01-15T10:32:00Z"
      },
      completed: {
        id: "veo-task-12345",
        status: "completed",
        progress: 100,
        result: {
          video_file: "https://storage.kie.ai/videos/veo-task-12345.mp4",
          duration: 7.5,
          resolution: "1920x1080",
          format: "mp4"
        },
        created_at: "2024-01-15T10:30:00Z",
        updated_at: "2024-01-15T10:33:00Z",
        completed_at: "2024-01-15T10:33:00Z"
      },
      failed: {
        id: "veo-task-12345",
        status: "failed",
        progress: 0,
        error: {
          message: "Video generation failed due to content policy violation",
          code: "content_policy_violation"
        },
        created_at: "2024-01-15T10:30:00Z",
        updated_at: "2024-01-15T10:32:00Z"
      }
    },
    error: {
      error: {
        message: "Video generation service unavailable",
        type: "service_unavailable",
        code: "video_generation_error"
      }
    }
  },

  // Video download mock data
  videoDownload: {
    segment1: Buffer.from('fake-video-data-segment-1-mp4-content'),
    segment2: Buffer.from('fake-video-data-segment-2-mp4-content'),
    error: Buffer.from('404 Not Found')
  }
};

/**
 * Helper function to create nock interceptors for a complete UGC workflow
 * @param {Object} options - Configuration options for the mock setup
 */
function setupCompleteWorkflowMocks(options = {}) {
  const {
    imageCount = 1,
    shouldFail = false,
    failureStep = null,
    videoTaskIds = ['veo-task-12345', 'veo-task-67890']
  } = options;

  const nock = require('nock');

  if (shouldFail && failureStep === 'image_analysis') {
    nock('https://openrouter.ai')
      .post('/api/v1/chat/completions')
      .reply(400, mockResponses.imageAnalysis.error);
    return;
  }

  // Mock image analysis - OpenRouter AI
  const imageResponse = imageCount > 1 
    ? mockResponses.imageAnalysis.multipleImages 
    : mockResponses.imageAnalysis.success;
  
  nock('https://openrouter.ai')
    .post('/api/v1/chat/completions')
    .reply(200, imageResponse);

  if (shouldFail && failureStep === 'script_generation') {
    nock('https://api.openai.com')
      .post('/v1/chat/completions')
      .reply(429, mockResponses.scriptGeneration.error);
    return;
  }

  // Mock script generation - OpenAI
  nock('https://api.openai.com')
    .post('/v1/chat/completions')
    .reply(200, mockResponses.scriptGeneration.success);

  if (shouldFail && failureStep === 'video_generation') {
    nock('https://api.kie.ai')
      .post('/api/v1/veo/generate')
      .reply(503, mockResponses.videoGeneration.error);
    return;
  }

  // Mock video generation initiation (for each segment) - Kie AI
  videoTaskIds.forEach((taskId) => {
    nock('https://api.kie.ai')
      .post('/api/v1/veo/generate')
      .reply(200, { ...mockResponses.videoGeneration.initiate, id: taskId });

    // Mock video status polling - Kie AI
    nock('https://api.kie.ai')
      .get('/api/v1/veo/record-info')
      .query({ id: taskId })
      .reply(200, { 
        ...mockResponses.videoGeneration.status.completed, 
        id: taskId,
        result: {
          ...mockResponses.videoGeneration.status.completed.result,
          video_file: `https://storage.kie.ai/videos/${taskId}.mp4`
        }
      });
  });
}

/**
 * Helper function to setup video download mocks
 * @param {Array} videoUrls - Array of video URLs to mock
 */
function setupVideoDownloadMocks(videoUrls = []) {
  const nock = require('nock');
  
  videoUrls.forEach((url, index) => {
    const urlObj = new URL(url);
    nock(`${urlObj.protocol}//${urlObj.host}`)
      .get(urlObj.pathname)
      .reply(200, mockResponses.videoDownload[`segment${index + 1}`] || mockResponses.videoDownload.segment1);
  });
}

module.exports = {
  mockResponses,
  setupCompleteWorkflowMocks,
  setupVideoDownloadMocks
};