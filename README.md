# UGC Ad Creator API

A Node.js RESTful API server that generates User Generated Content advertisements from creative briefs and images. The system leverages AI services (OpenAI for script generation, Gemini for image analysis, and Google Veo 3 for video generation) to create a complete workflow from concept to final video output.

## Features

- **AI-Powered Video Generation**: Uses Google's Veo 3 model for high-quality 8-second 720p videos with native audio
- **Multi-Image Upload**: Process up to 4 images (PNG, JPG, JPEG) per request
- **Script Generation**: Create or refine video scripts using OpenAI
- **Image Analysis**: Analyze uploaded images using Gemini to identify objects, people, settings, and actions
- **Redis Caching**: High-performance caching layer for image analysis and script generation results
- **UGC Optimization**: Specialized prompts for authentic user-generated content style
- **RESTful Design**: Clean HTTP API with structured JSON responses
- **Comprehensive Error Handling**: Detailed error responses with proper HTTP status codes
- **Cache Management**: Built-in cache monitoring, metrics, and invalidation endpoints
- **Configurable**: Environment-based configuration for different deployment scenarios

## Quick Start with Docker (Recommended)

The easiest way to get started is using Docker, which automatically sets up Redis, PostgreSQL, and all dependencies:

1. **Start the development environment:**
   ```bash
   make up
   # or
   npm run docker:dev
   ```

2. **Configure your API keys** in `.env.docker`:
   - `OPENAI_API_KEY` - Required for script generation
   - `GEMINI_API_KEY` - Required for image analysis  
   - `GOOGLE_AI_API_KEY` - Required for Veo 3 video generation
   - ~~`KIE_AI_API_KEY`~~ - No longer required (replaced by Google Veo 3)

3. **Access the services:**
   - **API**: http://localhost:3000
   - **Swagger API Docs**: http://localhost:3000/api-docs 📚
   - **Redis Commander**: http://localhost:8081
   - **pgAdmin**: http://localhost:8080 (admin@example.com / admin123)

4. **Stop the environment:**
   ```bash
   make down
   # or
   npm run docker:down
   ```

### Docker Commands

```bash
make up          # Start development environment
make down        # Stop development environment  
make logs        # View application logs
make shell       # Open shell in app container
make test        # Run tests in Docker
make reset       # Reset environment (removes all data)
```

## Manual Setup (Without Docker)

If you prefer to run without Docker:

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Setup Redis:**
   ```bash
   # macOS with Homebrew
   brew install redis
   brew services start redis
   
   # Ubuntu/Debian
   sudo apt install redis-server
   sudo systemctl start redis-server
   ```

3. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your API keys
   ```

4. **Start development server:**
   ```bash
   npm run dev
   ```

## Available Scripts

### Development
- `npm start` - Start production server
- `npm run dev` - Start development server with nodemon

### Docker (Recommended for Development)
- `npm run docker:dev` - Start Docker development environment
- `npm run docker:down` - Stop Docker environment
- `npm run docker:logs` - View application logs
- `npm run docker:shell` - Open shell in app container
- `npm run docker:test` - Run tests in Docker
- `npm run docker:reset` - Reset environment (removes all data)

### Testing
- `npm test` - Run all tests
- `npm run test:unit` - Run unit tests only
- `npm run test:integration` - Run integration tests only
- `npm run test:coverage` - Run tests with coverage report

### Utilities
- `npm run generate-samples` - Generate sample images for testing
- `npm run docs:serve` - Serve OpenAPI documentation
- `npm run test:api` - Test API endpoints
- `npm test` - Run test suite
- `npm run test:watch` - Run tests in watch mode
- `npm run test:unit` - Run unit tests only
- `npm run test:integration` - Run integration tests only
- `npm run test:coverage` - Run tests with coverage report

## Redis Caching

The API includes a comprehensive Redis caching layer that significantly improves performance and reduces API costs by caching:

### Cached Data
- **Image Analysis Results**: Cached for 24 hours (configurable)
- **Script Generation Results**: Cached for 4 hours (configurable)

### Performance Benefits
- **50-90% faster response times** for cached requests
- **Reduced API costs** by avoiding duplicate external API calls
- **Better user experience** with instant responses for repeated requests
- **Scalable caching** with automatic TTL and memory management

### Cache Configuration
```bash
# Redis Configuration
REDIS_URL=redis://localhost:6379
CACHE_ENABLED=true
IMAGE_ANALYSIS_CACHE_TTL=86400  # 24 hours
SCRIPT_CACHE_TTL=14400          # 4 hours
```

### Cache Management Endpoints
- `GET /api/v1/cache/metrics` - Get cache performance metrics
- `GET /api/v1/cache/health` - Check cache service health
- `POST /api/v1/cache/invalidate` - Invalidate cache by type or pattern
- `POST /api/v1/cache/reset-metrics` - Reset cache metrics
- `POST /api/v1/cache/warm` - Pre-populate cache with data

### Cache Demo
Run the interactive cache demonstration:
```bash
node examples/cache-demo.js
```

## API Endpoints

### Core Endpoints
- `GET /health` - Health check endpoint
- `POST /api/v1/ugc/generate` - Generate UGC advertisement
- `POST /api/v1/ugc/download` - Download generated videos
- `GET /api/v1/ugc/status/:operationId` - Check generation status

### Generate UGC Ad
```bash
POST /api/v1/ugc/generate
Content-Type: multipart/form-data

# Form fields:
creativeBrief: "Create an engaging fitness app advertisement"
script: "Optional existing script to refine"
options: {
  "aspectRatio": "16:9",
  "segmentCount": 2,
  "useFastModel": false,
  "personGeneration": "allow_adult"
}

# Files:
images: [image1.jpg, image2.png, ...]
```

### Response Format
```json
{
  "success": true,
  "data": {
    "id": "ugc_1234567890_abc123def",
    "creativeBrief": "Create an engaging fitness app advertisement",
    "imageAnalysis": {
      "uploadedImages": [...],
      "generatedImages": [...]
    },
    "script": {
      "segments": {
        "segment1": {
          "action": "Person opens fitness app",
          "dialogue": "Ready to transform your workout?",
          "duration": 8
        }
      }
    },
    "videoSegments": [
      {
        "segmentIndex": 0,
        "videoFile": {...},
        "duration": 8,
        "resolution": "720p",
        "hasAudio": true
      }
    ],
    "metadata": {
      "totalProcessingTime": 45000,
      "model": "veo-3.0-generate-preview"
    }
  }
}
```

## Veo 3 Integration

This API leverages Google's Veo 3 model for state-of-the-art video generation:

### Key Features
- **High Quality**: 720p resolution at 24fps
- **Native Audio**: Automatically generates synchronized audio
- **8-Second Videos**: Perfect for social media and ads
- **Image-to-Video**: Can animate static images
- **Advanced Prompting**: Supports dialogue, sound effects, and ambient audio

### Model Options
- **Veo 3 Standard**: `veo-3.0-generate-preview` - Best quality
- **Veo 3 Fast**: `veo-3.0-fast-generate-preview` - Optimized for speed

### Prompt Engineering
The service automatically creates UGC-optimized prompts that include:
- Camera positioning and movement
- Visual elements from image analysis
- Dialogue and audio cues
- Authentic UGC styling
- Negative prompts to avoid unwanted elements

### Example Generated Prompt
```
Close-up handheld shot of person opens fitness app. "Ready to transform your workout?" 
Featuring young woman and fitness trainer. Set in modern gym. Including smartphone, 
gym equipment, water bottle. Authentic user-generated content style, natural lighting, 
realistic movements, engaging and relatable. Energetic atmosphere. 
Sound effects: app notification sound.
```

## Configuration Options

### Video Generation
- `aspectRatio`: "16:9" (default), "9:16", "1:1"
- `personGeneration`: "allow_adult" (default), "allow_all", "dont_allow"
- `useFastModel`: false (default) - Use Veo 3 Fast for quicker generation
- `segmentCount`: 1-4 segments per video
- `segmentDuration`: 5-8 seconds per segment

### Image Processing
- `maxImages`: Maximum uploaded images (default: 4)
- `maxFileSize`: Maximum file size in bytes (default: 10MB)
- `generateAdditionalImages`: Generate extra images using Imagen

## Error Handling

The API provides detailed error responses:

```json
{
  "success": false,
  "error": "Video generation blocked by safety filters. Please modify your prompt and try again.",
  "code": "SAFETY_FILTER_ERROR"
}
```

Common error codes:
- `INVALID_CREATIVE_BRIEF` - Missing or invalid creative brief
- `NO_IMAGES_PROVIDED` - No images uploaded
- `TOO_MANY_IMAGES` - Exceeded maximum image limit
- `SAFETY_FILTER_ERROR` - Content blocked by AI safety filters
- `VIDEO_GENERATION_ERROR` - Video generation failed
- `TIMEOUT_ERROR` - Generation took too long (6 minute limit)

## Rate Limits and Timeouts

- **Generation Time**: 11 seconds to 6 minutes per video
- **Video Retention**: Generated videos stored for 2 days
- **Polling Interval**: 10 seconds between status checks
- **Max Segments**: 4 video segments per request

## Project Structure

```
src/
├── controllers/
│   └── ugcController.js          # Main API endpoint handler
├── services/
│   ├── videoGenerationService.js # Veo 3 integration
│   ├── imageGenerationService.js # Imagen integration  
│   └── scriptGenerationService.js # OpenAI integration
├── utils/
│   └── config.js                 # Environment configuration
└── middleware/
    └── errorHandler.js           # Global error handling

tests/
├── unit/
│   └── services/                 # Service layer tests
├── integration/                  # End-to-end tests
└── fixtures/                     # Test data and mocks
```

## Development

### Running Tests
```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
npm test -- videoGenerationService.test.js
```

### Environment Variables
See `.env.example` for all required and optional configuration options.

### Adding New Features
1. Create service in `src/services/`
2. Add controller methods in `src/controllers/`
3. Write comprehensive tests
4. Update API documentation

## Documentation

- **[API Examples](./examples/README.md)** - Complete request/response examples
- **[OpenAPI Specification](./openapi.yaml)** - Swagger/OpenAPI 3.0 specification
- **[Deployment Guide](./DEPLOYMENT.md)** - Production deployment instructions
- **[HTTP Requests](./examples/requests.http)** - REST Client compatible requests

## Docker Support

### Quick Start with Docker

```bash
# Build and run with Docker Compose
docker-compose up -d

# Or build and run manually
docker build -t ugc-ad-creator-api .
docker run -d -p 3000:3000 --env-file .env ugc-ad-creator-api
```

### Production Deployment

```bash
# Run with nginx reverse proxy
docker-compose --profile production up -d
```

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment instructions.

## API Documentation

The API follows OpenAPI 3.0 specification. You can:

1. **View the specification**: [openapi.yaml](./openapi.yaml)
2. **Import into Postman**: Use the OpenAPI spec to generate a Postman collection
3. **Use Swagger UI**: Host the spec file with Swagger UI for interactive documentation
4. **Generate client SDKs**: Use OpenAPI generators to create client libraries

### Key Endpoints

- `POST /api/v1/ugc/generate` - Generate UGC advertisement
- `GET /api/v1/ugc/status/:operationId` - Check generation status  
- `POST /api/v1/ugc/download` - Download generated videos
- `GET /health` - Health check endpoint

## License

ISC