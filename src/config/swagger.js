const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'UGC Ad Creator API',
      version: '1.0.0',
      description: 'A comprehensive Node.js RESTful API for generating User Generated Content advertisements from creative briefs and images using Google Veo 3 for video generation, OpenAI for script generation, Gemini for image analysis, and advanced FFmpeg-powered video editing capabilities.',
      contact: {
        name: 'UGC Ad Creator API Support',
        email: 'support@ugc-api.com'
      },
      license: {
        name: 'ISC',
        url: 'https://opensource.org/licenses/ISC'
      }
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server'
      },
      {
        url: 'https://api.ugc-creator.com',
        description: 'Production server'
      }
    ],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'API key for authentication'
        },
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token for authenticated users'
        }
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'string',
              description: 'Error message'
            },
            details: {
              type: 'string',
              description: 'Additional error details'
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              description: 'Error timestamp'
            }
          }
        },
        UGCRequest: {
          type: 'object',
          required: ['creativeBrief'],
          properties: {
            creativeBrief: {
              type: 'string',
              description: 'Creative brief describing the advertisement concept',
              example: 'Create an engaging ad for a new fitness app targeting young professionals'
            },
            images: {
              type: 'array',
              items: {
                type: 'string',
                format: 'binary'
              },
              description: 'Images to analyze and incorporate into the video (max 4 images, 10MB each)',
              maxItems: 4
            },
            options: {
              type: 'object',
              properties: {
                aspectRatio: {
                  type: 'string',
                  enum: ['16:9', '9:16', '1:1'],
                  default: '16:9',
                  description: 'Video aspect ratio'
                },
                duration: {
                  type: 'integer',
                  minimum: 5,
                  maximum: 30,
                  default: 15,
                  description: 'Target video duration in seconds'
                },
                style: {
                  type: 'string',
                  enum: ['professional', 'casual', 'energetic', 'minimal'],
                  default: 'professional',
                  description: 'Video style preference'
                },
                includeMusic: {
                  type: 'boolean',
                  default: false,
                  description: 'Whether to include background music'
                },
                branding: {
                  type: 'object',
                  properties: {
                    logoPath: {
                      type: 'string',
                      description: 'Path to brand logo image'
                    },
                    brandText: {
                      type: 'string',
                      description: 'Brand text to overlay'
                    },
                    brandColor: {
                      type: 'string',
                      pattern: '^#[0-9A-Fa-f]{6}$',
                      description: 'Brand color in hex format'
                    }
                  }
                }
              }
            }
          }
        },
        UGCResponse: {
          type: 'object',
          properties: {
            operationId: {
              type: 'string',
              description: 'Unique operation identifier'
            },
            status: {
              type: 'string',
              enum: ['processing', 'completed', 'failed'],
              description: 'Operation status'
            },
            videoUrl: {
              type: 'string',
              description: 'URL to download the generated video (available when completed)'
            },
            thumbnailUrl: {
              type: 'string',
              description: 'URL to video thumbnail'
            },
            metadata: {
              type: 'object',
              properties: {
                duration: {
                  type: 'number',
                  description: 'Video duration in seconds'
                },
                resolution: {
                  type: 'string',
                  description: 'Video resolution'
                },
                fileSize: {
                  type: 'integer',
                  description: 'File size in bytes'
                },
                format: {
                  type: 'string',
                  description: 'Video format'
                }
              }
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'Operation creation timestamp'
            },
            completedAt: {
              type: 'string',
              format: 'date-time',
              description: 'Operation completion timestamp'
            }
          }
        },
        BatchRequest: {
          type: 'object',
          required: ['requests'],
          properties: {
            requests: {
              type: 'array',
              items: {
                $ref: '#/components/schemas/UGCRequest'
              },
              minItems: 1,
              maxItems: 10,
              description: 'Array of UGC generation requests'
            },
            batchOptions: {
              type: 'object',
              properties: {
                priority: {
                  type: 'string',
                  enum: ['low', 'normal', 'high'],
                  default: 'normal',
                  description: 'Batch processing priority'
                },
                notificationUrl: {
                  type: 'string',
                  format: 'uri',
                  description: 'Webhook URL for batch completion notification'
                }
              }
            }
          }
        },
        JobStatus: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Job identifier'
            },
            type: {
              type: 'string',
              enum: ['video-generation', 'video-processing', 'cleanup'],
              description: 'Job type'
            },
            status: {
              type: 'string',
              enum: ['waiting', 'active', 'completed', 'failed', 'delayed'],
              description: 'Job status'
            },
            progress: {
              type: 'integer',
              minimum: 0,
              maximum: 100,
              description: 'Job progress percentage'
            },
            data: {
              type: 'object',
              description: 'Job data and parameters'
            },
            result: {
              type: 'object',
              description: 'Job result (available when completed)'
            },
            error: {
              type: 'string',
              description: 'Error message (available when failed)'
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'Job creation timestamp'
            },
            processedAt: {
              type: 'string',
              format: 'date-time',
              description: 'Job processing timestamp'
            },
            completedAt: {
              type: 'string',
              format: 'date-time',
              description: 'Job completion timestamp'
            }
          }
        },
        VideoEditingRequest: {
          type: 'object',
          required: ['inputPath'],
          properties: {
            inputPath: {
              type: 'string',
              description: 'Path to input video file'
            },
            operations: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  type: {
                    type: 'string',
                    enum: ['trim', 'merge', 'convert', 'optimize', 'watermark', 'branding', 'filters', 'textOverlay', 'transitions', 'backgroundMusic', 'effects'],
                    description: 'Video editing operation type'
                  },
                  parameters: {
                    type: 'object',
                    description: 'Operation-specific parameters'
                  }
                }
              },
              description: 'Array of video editing operations to perform'
            },
            outputFormat: {
              type: 'string',
              enum: ['mp4', 'webm', 'avi'],
              default: 'mp4',
              description: 'Output video format'
            },
            quality: {
              type: 'string',
              enum: ['low', 'medium', 'high'],
              default: 'medium',
              description: 'Output video quality'
            }
          }
        },
        ApiKey: {
          type: 'object',
          properties: {
            keyId: {
              type: 'string',
              description: 'Unique API key identifier'
            },
            name: {
              type: 'string',
              description: 'Human-readable name for the API key'
            },
            permissions: {
              type: 'array',
              items: {
                type: 'string'
              },
              description: 'Array of permissions granted to this key'
            },
            isActive: {
              type: 'boolean',
              description: 'Whether the API key is currently active'
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'When the API key was created'
            },
            lastUsed: {
              type: 'string',
              format: 'date-time',
              description: 'When the API key was last used'
            },
            expiresAt: {
              type: 'string',
              format: 'date-time',
              description: 'When the API key expires (null for never)'
            }
          }
        },
        CacheMetrics: {
          type: 'object',
          properties: {
            hits: {
              type: 'integer',
              description: 'Total cache hits'
            },
            misses: {
              type: 'integer',
              description: 'Total cache misses'
            },
            hitRate: {
              type: 'number',
              description: 'Cache hit rate as percentage'
            },
            totalKeys: {
              type: 'integer',
              description: 'Total number of keys in cache'
            },
            memoryUsage: {
              type: 'object',
              properties: {
                used: {
                  type: 'string',
                  description: 'Memory currently used'
                },
                peak: {
                  type: 'string',
                  description: 'Peak memory usage'
                },
                limit: {
                  type: 'string',
                  description: 'Memory limit'
                }
              }
            }
          }
        },
        BatchStatus: {
          type: 'object',
          properties: {
            batchId: {
              type: 'string',
              description: 'Unique batch identifier'
            },
            status: {
              type: 'string',
              enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'],
              description: 'Current batch status'
            },
            totalRequests: {
              type: 'integer',
              description: 'Total number of requests in batch'
            },
            completedRequests: {
              type: 'integer',
              description: 'Number of completed requests'
            },
            failedRequests: {
              type: 'integer',
              description: 'Number of failed requests'
            },
            progress: {
              type: 'number',
              minimum: 0,
              maximum: 100,
              description: 'Progress percentage'
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'When the batch was created'
            },
            completedAt: {
              type: 'string',
              format: 'date-time',
              description: 'When the batch was completed'
            }
          }
        }
      }
    },
    tags: [
      {
        name: 'UGC Generation',
        description: 'User Generated Content video generation endpoints'
      },
      {
        name: 'Video Editing',
        description: 'Advanced video editing and post-processing endpoints'
      },
      {
        name: 'Batch Processing',
        description: 'Batch operations for multiple video generations'
      },
      {
        name: 'Job Management',
        description: 'Job status monitoring and management'
      },
      {
        name: 'Authentication',
        description: 'API authentication and user management'
      },
      {
        name: 'System',
        description: 'System health and monitoring endpoints'
      }
    ]
  },
  apis: [
    './src/controllers/*.js',
    './src/routes/*.js',
    './server.js'
  ]
};

const specs = swaggerJsdoc(options);

module.exports = {
  specs,
  swaggerUi,
  swaggerOptions: {
    explorer: true,
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      filter: true,
      showExtensions: true,
      showCommonExtensions: true,
      docExpansion: 'none'
    }
  }
};