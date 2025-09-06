# Technology Stack

## Core Framework
- **Runtime**: Node.js
- **Web Framework**: Express.js
- **Language**: JavaScript

## Key Dependencies
- **express**: Web application framework
- **multer**: Multipart file upload handling
- **axios**: HTTP client for external API calls
- **dotenv**: Environment variable management
- **cors**: Cross-origin resource sharing

## Development Dependencies
- **jest**: Testing framework
- **supertest**: HTTP assertion testing
- **nodemon**: Development server auto-restart
- **nock**: HTTP request mocking for tests

## External AI Services
- **OpenRouter AI**: Image analysis using Gemini model
- **OpenAI**: Script generation and refinement
- **Kie AI VEO3**: Video generation and processing

## Common Commands

### Development
```bash
npm run dev          # Start development server with nodemon
npm start           # Start production server
npm test            # Run test suite
npm run test:watch  # Run tests in watch mode
```

### Testing
```bash
npm run test:unit        # Run unit tests only
npm run test:integration # Run integration tests only
npm run test:coverage   # Run tests with coverage report
```

## Configuration Management
- Environment variables loaded via dotenv
- Required variables validated on startup
- API keys and endpoints configurable per environment
- See .env.example for all required configuration

## Architecture Patterns
- **Layered Architecture**: Controllers → Services → External APIs
- **Service-Oriented**: Clear separation between image analysis, script generation, and video services
- **Error-First**: Comprehensive error handling with structured responses
- **Async/Await**: Modern JavaScript async patterns throughout