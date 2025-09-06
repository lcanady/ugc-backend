# Project Structure

## Directory Organization

```
/
├── src/
│   ├── controllers/
│   │   └── ugcController.js      # Main API endpoint handler
│   ├── services/
│   │   ├── imageAnalysisService.js    # OpenRouter AI integration
│   │   ├── scriptGenerationService.js # OpenAI integration
│   │   └── videoGenerationService.js  # Kie AI VEO3 integration
│   ├── utils/
│   │   ├── config.js             # Environment configuration
│   │   └── fileHandler.js        # File processing utilities
│   └── middleware/
│       └── errorHandler.js       # Global error handling
├── tests/
│   ├── unit/
│   │   ├── services/             # Service layer tests
│   │   └── controllers/          # Controller tests
│   ├── integration/              # End-to-end workflow tests
│   └── fixtures/                 # Test data and mock responses
├── server.js                     # Application entry point
├── package.json
├── .env.example                  # Environment variable template
└── README.md
```

## Code Organization Principles

### Controllers
- Handle HTTP request/response lifecycle
- Input validation and sanitization
- Orchestrate service calls
- Format API responses
- **Single Responsibility**: One controller per major API endpoint

### Services
- Contain business logic and external API integrations
- **Pure Functions**: Stateless operations where possible
- **Error Propagation**: Let errors bubble up to controllers
- **Async/Await**: All external API calls use modern async patterns

### Utilities
- Shared functionality across services
- Configuration management
- File processing helpers
- **No Business Logic**: Keep utilities generic and reusable

## File Naming Conventions
- **camelCase** for all JavaScript files
- **Descriptive Names**: `imageAnalysisService.js` not `imageService.js`
- **Test Files**: Match source file names with `.test.js` suffix
- **Constants**: Use UPPER_SNAKE_CASE for environment variables

## API Endpoint Structure
- **RESTful Design**: Use appropriate HTTP methods
- **Versioned**: All endpoints under `/api/v1/`
- **Resource-Based**: `/api/v1/ugc/generate`
- **Consistent Responses**: All responses follow same JSON structure

## Error Handling Structure
- **Custom Error Classes**: Extend Error for specific error types
- **HTTP Status Codes**: Map business errors to appropriate HTTP codes
- **Structured Responses**: Consistent error response format
- **Logging**: All errors logged with context and stack traces

## Testing Structure
- **Mirror Source Structure**: Test directory mirrors src directory
- **Separation**: Unit tests separate from integration tests
- **Mocking**: External APIs mocked in tests using nock
- **Coverage**: Aim for 80% code coverage minimum