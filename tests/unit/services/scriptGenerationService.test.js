const nock = require('nock');
const scriptGenerationService = require('../../../src/services/scriptGenerationService');

// Mock config
jest.mock('../../../src/utils/config', () => ({
  openaiApiKey: 'test-openai-key'
}));

describe('ScriptGenerationService', () => {
  beforeEach(() => {
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('generateScript', () => {
    const mockCreativeBrief = 'Create an engaging ad for a new smartphone that highlights its camera quality and sleek design.';
    const mockImageAnalysis = [
      {
        imageIndex: 0,
        description: 'A person holding a modern smartphone, taking a photo outdoors',
        objects: ['smartphone', 'camera'],
        people: ['person'],
        setting: 'outdoor',
        actions: ['holding', 'taking photo'],
        combinedContext: {
          combinedObjects: ['smartphone', 'camera'],
          combinedPeople: ['person'],
          combinedSettings: ['outdoor'],
          combinedActions: ['holding', 'taking photo']
        }
      }
    ];

    const mockOpenAIResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              'segment-1': 'Person holds the sleek smartphone, admiring its modern design and premium build quality in natural outdoor lighting',
              'segment-2': 'Person opens camera app and takes a stunning photo, showcasing the advanced camera capabilities and image quality'
            })
          }
        }
      ],
      model: 'gpt-5',
      usage: { total_tokens: 150 }
    };

    it('should generate script successfully with valid inputs', async () => {
      nock('https://api.openai.com')
        .post('/v1/chat/completions')
        .reply(200, mockOpenAIResponse);

      const result = await scriptGenerationService.generateScript(
        mockCreativeBrief,
        mockImageAnalysis
      );

      expect(result).toHaveProperty('segment-1');
      expect(result).toHaveProperty('segment-2');
      expect(result['segment-1']).toContain('smartphone');
      expect(result['segment-2']).toContain('camera');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('model', 'gpt-5');
    });

    it('should handle script refinement when optional script is provided', async () => {
      const optionalScript = 'Show the phone, then take a picture';
      
      nock('https://api.openai.com')
        .post('/v1/chat/completions')
        .reply(200, mockOpenAIResponse);

      const result = await scriptGenerationService.generateScript(
        mockCreativeBrief,
        mockImageAnalysis,
        optionalScript
      );

      expect(result).toHaveProperty('segment-1');
      expect(result).toHaveProperty('segment-2');
    });

    it('should throw error for missing creative brief', async () => {
      await expect(
        scriptGenerationService.generateScript('', mockImageAnalysis)
      ).rejects.toThrow('Creative brief is required and must be a non-empty string');

      await expect(
        scriptGenerationService.generateScript(null, mockImageAnalysis)
      ).rejects.toThrow('Creative brief is required and must be a non-empty string');
    });

    it('should throw error for missing image analysis', async () => {
      await expect(
        scriptGenerationService.generateScript(mockCreativeBrief, [])
      ).rejects.toThrow('Image analysis is required and must be a non-empty array');

      await expect(
        scriptGenerationService.generateScript(mockCreativeBrief, null)
      ).rejects.toThrow('Image analysis is required and must be a non-empty array');
    });

    it('should handle OpenAI API errors', async () => {
      nock('https://api.openai.com')
        .post('/v1/chat/completions')
        .reply(500, { error: { message: 'Internal server error' } });

      await expect(
        scriptGenerationService.generateScript(mockCreativeBrief, mockImageAnalysis)
      ).rejects.toThrow('Failed to generate script after 2 attempts');
    });

    it('should handle network errors', async () => {
      nock('https://api.openai.com')
        .post('/v1/chat/completions')
        .replyWithError('Network error');

      await expect(
        scriptGenerationService.generateScript(mockCreativeBrief, mockImageAnalysis)
      ).rejects.toThrow('Failed to generate script after 2 attempts');
    });

    it('should retry on failure and succeed on second attempt', async () => {
      nock('https://api.openai.com')
        .post('/v1/chat/completions')
        .reply(500, { error: { message: 'Server error' } })
        .post('/v1/chat/completions')
        .reply(200, mockOpenAIResponse);

      const result = await scriptGenerationService.generateScript(
        mockCreativeBrief,
        mockImageAnalysis
      );

      expect(result).toHaveProperty('segment-1');
      expect(result).toHaveProperty('segment-2');
    });
  });

  describe('buildPrompt', () => {
    const mockCreativeBrief = 'Test creative brief';
    const mockImageAnalysis = [
      {
        imageIndex: 0,
        description: 'Test image description',
        objects: ['phone'],
        people: ['person'],
        setting: 'indoor',
        actions: ['holding']
      }
    ];

    it('should build generation prompt when no optional script provided', () => {
      const prompt = scriptGenerationService.buildPrompt(
        mockCreativeBrief,
        mockImageAnalysis
      );

      expect(prompt).toContain('CREATIVE BRIEF:');
      expect(prompt).toContain(mockCreativeBrief);
      expect(prompt).toContain('AVAILABLE VISUAL ELEMENTS');
      expect(prompt).toContain('Test image description');
      expect(prompt).toContain('Generate the script now:');
    });

    it('should build refinement prompt when optional script provided', () => {
      const optionalScript = 'Test user script';
      const prompt = scriptGenerationService.buildPrompt(
        mockCreativeBrief,
        mockImageAnalysis,
        optionalScript
      );

      expect(prompt).toContain('CREATIVE BRIEF:');
      expect(prompt).toContain('USER-PROVIDED SCRIPT:');
      expect(prompt).toContain(optionalScript);
      expect(prompt).toContain('Apply your AI agent optimization now:');
    });
  });

  describe('formatImageAnalysisForPrompt', () => {
    it('should format single image analysis correctly', () => {
      const imageAnalysis = [
        {
          imageIndex: 0,
          description: 'A smartphone on a table',
          objects: ['smartphone', 'table'],
          people: [],
          setting: 'indoor',
          actions: ['static scene']
        }
      ];

      const formatted = scriptGenerationService.formatImageAnalysisForPrompt(imageAnalysis);

      expect(formatted).toContain('Total Images: 1');
      expect(formatted).toContain('IMAGE 1:');
      expect(formatted).toContain('A smartphone on a table');
      expect(formatted).toContain('Objects: smartphone, table');
      expect(formatted).toContain('Setting: indoor');
    });

    it('should format multiple image analysis correctly', () => {
      const imageAnalysis = [
        {
          imageIndex: 0,
          description: 'First image',
          objects: ['phone'],
          people: ['person'],
          setting: 'outdoor',
          actions: ['holding']
        },
        {
          imageIndex: 1,
          description: 'Second image',
          objects: ['camera'],
          people: [],
          setting: 'indoor',
          actions: ['static scene']
        }
      ];

      const formatted = scriptGenerationService.formatImageAnalysisForPrompt(imageAnalysis);

      expect(formatted).toContain('Total Images: 2');
      expect(formatted).toContain('IMAGE 1:');
      expect(formatted).toContain('IMAGE 2:');
      expect(formatted).toContain('First image');
      expect(formatted).toContain('Second image');
    });

    it('should handle empty image analysis', () => {
      const formatted = scriptGenerationService.formatImageAnalysisForPrompt([]);
      expect(formatted).toBe('No visual elements available');
    });
  });

  describe('validateScriptOutput', () => {
    it('should validate correct script format', () => {
      const validScript = {
        'segment-1': 'This is a valid first segment description that is long enough',
        'segment-2': 'This is a valid second segment description that is also long enough'
      };

      expect(() => {
        scriptGenerationService.validateScriptOutput(validScript);
      }).not.toThrow();
    });

    it('should throw error for missing segments', () => {
      const invalidScript = {
        'segment-1': 'Only first segment'
      };

      expect(() => {
        scriptGenerationService.validateScriptOutput(invalidScript);
      }).toThrow('segment-2 is required and must be a string');
    });

    it('should throw error for segments that are too short', () => {
      const invalidScript = {
        'segment-1': 'Too short',
        'segment-2': 'Also short'
      };

      expect(() => {
        scriptGenerationService.validateScriptOutput(invalidScript);
      }).toThrow('segment-1 length is unrealistic for 7-8 second video content');
    });

    it('should throw error for identical segments', () => {
      const invalidScript = {
        'segment-1': 'This is the exact same content for both segments',
        'segment-2': 'This is the exact same content for both segments'
      };

      expect(() => {
        scriptGenerationService.validateScriptOutput(invalidScript);
      }).toThrow('Script segments must be different from each other');
    });

    it('should throw error for non-object input', () => {
      expect(() => {
        scriptGenerationService.validateScriptOutput('not an object');
      }).toThrow('Script result must be an object');

      expect(() => {
        scriptGenerationService.validateScriptOutput(null);
      }).toThrow('Script result must be an object');
    });
  });

  describe('parseScriptResponse', () => {
    it('should parse valid OpenAI response', () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                'segment-1': 'First segment content',
                'segment-2': 'Second segment content'
              })
            }
          }
        ],
        model: 'gpt-5',
        usage: { total_tokens: 100 }
      };

      const result = scriptGenerationService.parseScriptResponse(mockResponse);

      expect(result).toHaveProperty('segment-1', 'First segment content');
      expect(result).toHaveProperty('segment-2', 'Second segment content');
      expect(result).toHaveProperty('model', 'gpt-5');
      expect(result).toHaveProperty('usage');
      expect(result).toHaveProperty('timestamp');
    });

    it('should handle alternative segment naming formats', () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                segment1: 'First segment content',
                segment2: 'Second segment content'
              })
            }
          }
        ],
        model: 'gpt-5',
        usage: { total_tokens: 100 }
      };

      const result = scriptGenerationService.parseScriptResponse(mockResponse);

      expect(result).toHaveProperty('segment-1', 'First segment content');
      expect(result).toHaveProperty('segment-2', 'Second segment content');
    });

    it('should throw error for invalid JSON', () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: 'Invalid JSON content'
            }
          }
        ]
      };

      expect(() => {
        scriptGenerationService.parseScriptResponse(mockResponse);
      }).toThrow('Failed to parse script response');
    });
  });

  describe('AI Agent Optimization Features', () => {
    describe('analyzeUserScript', () => {
      it('should identify brevity issues', () => {
        const shortScript = 'Show phone';
        const imageContext = 'Objects: phone, table';
        
        const analysis = scriptGenerationService.analyzeUserScript(shortScript, imageContext);
        
        expect(analysis).toContain('BREVITY ISSUE');
      });

      it('should identify length issues', () => {
        const longScript = 'This is a very long script that goes on and on with lots of details about every single aspect of the product and how it should be shown in the video with extensive descriptions that are probably too much for a short video format and need to be condensed significantly to work well in the UGC format that we are targeting for this particular advertisement campaign. It continues with even more details about camera features, design elements, user interface, performance metrics, battery life, storage capacity, color options, pricing information, availability dates, marketing campaigns, target demographics, competitive advantages, technical specifications, warranty information, customer support options, and much more content that makes this script extremely lengthy and verbose for a simple UGC video advertisement that should be concise and engaging rather than overwhelming viewers with too much information at once.';
        const imageContext = 'Objects: phone';
        
        const analysis = scriptGenerationService.analyzeUserScript(longScript, imageContext);
        
        expect(analysis).toContain('LENGTH ISSUE');
      });

      it('should identify structure opportunities', () => {
        const unstructuredScript = 'Show the product and talk about features';
        const imageContext = 'Objects: phone';
        
        const analysis = scriptGenerationService.analyzeUserScript(unstructuredScript, imageContext);
        
        expect(analysis).toContain('STRUCTURE OPPORTUNITY');
      });

      it('should identify visual misalignment', () => {
        const misalignedScript = 'Show the laptop and car';
        const imageContext = 'Objects: phone, table';
        
        const analysis = scriptGenerationService.analyzeUserScript(misalignedScript, imageContext);
        
        expect(analysis).toContain('VISUAL MISALIGNMENT');
        expect(analysis).toContain('laptop');
        expect(analysis).toContain('car');
      });

      it('should identify actionability issues', () => {
        const passiveScript = 'The phone is nice and has good features';
        const imageContext = 'Objects: phone';
        
        const analysis = scriptGenerationService.analyzeUserScript(passiveScript, imageContext);
        
        expect(analysis).toContain('ACTIONABILITY ISSUE');
      });

      it('should identify engagement opportunities', () => {
        const dryScript = 'Hold the phone and show the screen';
        const imageContext = 'Objects: phone';
        
        const analysis = scriptGenerationService.analyzeUserScript(dryScript, imageContext);
        
        expect(analysis).toContain('ENGAGEMENT OPPORTUNITY');
      });

      it('should recognize good scripts', () => {
        const goodScript = 'First segment: Hold the amazing phone and show its sleek design. Second segment: Open the camera app and demonstrate the incredible photo quality';
        const imageContext = 'Objects: phone, camera';
        
        const analysis = scriptGenerationService.analyzeUserScript(goodScript, imageContext);
        
        expect(analysis).toContain('SCRIPT QUALITY');
      });
    });

    describe('determineOptimizationStrategy', () => {
      it('should create expansion strategy for brief scripts', () => {
        const analysis = 'BREVITY ISSUE: Script is very brief';
        const creativeBrief = 'Promote smartphone camera quality';
        
        const strategy = scriptGenerationService.determineOptimizationStrategy(analysis, creativeBrief);
        
        expect(strategy).toContain('EXPANSION STRATEGY');
        expect(strategy).toContain('BRAND ALIGNMENT');
        expect(strategy).toContain('UGC AUTHENTICITY');
      });

      it('should create condensation strategy for long scripts', () => {
        const analysis = 'LENGTH ISSUE: Script is lengthy';
        const creativeBrief = 'Show product features';
        
        const strategy = scriptGenerationService.determineOptimizationStrategy(analysis, creativeBrief);
        
        expect(strategy).toContain('CONDENSATION STRATEGY');
      });

      it('should create alignment strategy for misaligned scripts', () => {
        const analysis = 'VISUAL MISALIGNMENT: Script references unavailable elements';
        const creativeBrief = 'Product demo';
        
        const strategy = scriptGenerationService.determineOptimizationStrategy(analysis, creativeBrief);
        
        expect(strategy).toContain('ALIGNMENT STRATEGY');
      });
    });

    describe('extractVisualReferences', () => {
      it('should extract common objects from script', () => {
        const script = 'Show the smartphone and laptop on the table';
        
        const references = scriptGenerationService.extractVisualReferences(script);
        
        expect(references).toContain('smartphone');
        expect(references).toContain('laptop');
        expect(references).toContain('table');
      });

      it('should handle scripts with no visual references', () => {
        const script = 'Talk about the benefits and advantages';
        
        const references = scriptGenerationService.extractVisualReferences(script);
        
        expect(references).toEqual([]);
      });
    });

    describe('extractAvailableElements', () => {
      it('should extract objects from image context', () => {
        const imageContext = `Objects: smartphone, table, camera
All Objects: smartphone, table, camera, book`;
        
        const elements = scriptGenerationService.extractAvailableElements(imageContext);
        
        expect(elements).toContain('smartphone');
        expect(elements).toContain('table');
        expect(elements).toContain('camera');
        expect(elements).toContain('book');
      });

      it('should handle empty image context', () => {
        const imageContext = 'No objects found';
        
        const elements = scriptGenerationService.extractAvailableElements(imageContext);
        
        expect(elements).toEqual([]);
      });
    });

    describe('extractKeywords', () => {
      it('should extract meaningful keywords from creative brief', () => {
        const creativeBrief = 'Create an engaging advertisement for the new smartphone camera quality and design features';
        
        const keywords = scriptGenerationService.extractKeywords(creativeBrief);
        
        expect(keywords).toContain('create');
        expect(keywords).toContain('engaging');
        expect(keywords).toContain('advertisement');
        expect(keywords).toContain('smartphone');
        expect(keywords).toContain('camera');
        expect(keywords.length).toBeLessThanOrEqual(5);
      });

      it('should filter out stop words', () => {
        const creativeBrief = 'The product is very good and has many features that are amazing';
        
        const keywords = scriptGenerationService.extractKeywords(creativeBrief);
        
        expect(keywords).not.toContain('the');
        expect(keywords).not.toContain('is');
        expect(keywords).not.toContain('and');
        expect(keywords).not.toContain('has');
      });
    });
  });
});