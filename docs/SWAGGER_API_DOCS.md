# Swagger API Documentation

The UGC Ad Creator API includes comprehensive interactive API documentation powered by Swagger UI. This provides a user-friendly interface to explore, test, and understand all available endpoints.

## Accessing the Documentation

### Local Development
When running the application locally, the Swagger UI is available at:
- **Primary URL**: http://localhost:3000/api-docs
- **Convenience URL**: http://localhost:3000/docs (redirects to api-docs)

### Docker Development
When running with Docker Compose, the Swagger UI is available at:
- **Primary URL**: http://localhost:3000/api-docs
- **Convenience URL**: http://localhost:3000/docs

## Features

### Interactive API Explorer
- **Try It Out**: Test API endpoints directly from the documentation
- **Request/Response Examples**: See real examples of API calls and responses
- **Schema Validation**: Understand required and optional parameters
- **Authentication Testing**: Test with API keys or JWT tokens

### Comprehensive Documentation
- **All Endpoints**: Complete coverage of all API endpoints
- **Request Schemas**: Detailed parameter and body schemas
- **Response Schemas**: Expected response formats and status codes
- **Error Handling**: Documentation of error responses and codes

### Organized by Categories
- **UGC Generation**: Core video generation endpoints
- **Video Editing**: Advanced video editing and post-processing
- **Batch Processing**: Bulk operations and batch management
- **Job Management**: Background job monitoring and control
- **Authentication**: API key and OAuth2 management
- **System**: Health checks and system information

## API Categories

### 🎬 UGC Generation
Core endpoints for generating User Generated Content videos:
- `POST /api/v1/ugc/generate` - Generate UGC advertisement video
- `GET /api/v1/ugc/status/{operationId}` - Check generation status
- `POST /api/v1/ugc/download` - Download generated videos
- `GET /api/v1/ugc/history` - View operation history

### 🎨 Video Editing (NEW)
Advanced video editing and post-processing capabilities:
- `POST /api/v1/video/process` - Apply multiple editing operations
- `POST /api/v1/video/process-ugc` - Standard UGC video processing
- `POST /api/v1/video/info` - Get video metadata
- `POST /api/v1/video/filters` - Apply color correction filters
- `POST /api/v1/video/text-overlay` - Add text overlays

### 📦 Batch Processing
Bulk operations for multiple video generations:
- `POST /api/v1/batch/generate` - Create batch video generation
- `GET /api/v1/batch/{batchId}/status` - Check batch status
- `GET /api/v1/batch/{batchId}/results` - Get batch results
- `POST /api/v1/batch/generate-optimized` - Optimized batch processing

### 🔧 Job Management
Background job monitoring and control:
- `GET /api/v1/jobs/dashboard` - Job dashboard overview
- `GET /api/v1/jobs/queues/stats` - Queue statistics
- `GET /api/v1/jobs/recent` - Recent job activity
- `GET /api/v1/jobs/metrics` - Performance metrics

### 🔐 Authentication
API authentication and user management:
- `POST /api/v1/auth/keys` - Generate API keys
- `GET /api/v1/auth/keys` - List API keys
- `POST /api/v1/oauth/login` - OAuth2 login
- `GET /api/v1/oauth/profile` - User profile

### 🏥 System
System health and monitoring:
- `GET /health` - Health check endpoint
- `GET /api` - API information and endpoints
- `GET /api/v1/cache/metrics` - Cache metrics
- `GET /api/v1/cache/health` - Cache health status

## Authentication in Swagger UI

### API Key Authentication
1. Click the "Authorize" button in Swagger UI
2. Enter your API key in the "ApiKeyAuth" section
3. Format: `ugc_[key_id]_[secret]`
4. The key will be automatically included in all requests

### JWT Bearer Token Authentication
1. Click the "Authorize" button in Swagger UI
2. Enter your JWT token in the "BearerAuth" section
3. Format: `Bearer [your-jwt-token]`
4. The token will be automatically included in all requests

### Getting API Keys
You can generate API keys using the authentication endpoints:
```bash
curl -X POST http://localhost:3000/api/v1/auth/keys \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Key", "permissions": ["ugc:generate"]}'
```

## Example Usage

### Testing Video Generation
1. Navigate to the UGC Generation section
2. Click on `POST /api/v1/ugc/generate`
3. Click "Try it out"
4. Fill in the creative brief: "Create an engaging fitness app advertisement"
5. Optionally upload images
6. Click "Execute" to test the endpoint

### Testing Video Editing
1. Navigate to the Video Editing section
2. Click on `POST /api/v1/video/filters`
3. Click "Try it out"
4. Provide an input video path and filter parameters
5. Click "Execute" to apply filters

### Testing Batch Processing
1. Navigate to the Batch Processing section
2. Click on `POST /api/v1/batch/generate`
3. Click "Try it out"
4. Provide an array of UGC requests
5. Click "Execute" to start batch processing

## Schema Documentation

### Request Schemas
All request schemas are fully documented with:
- Required vs optional fields
- Data types and formats
- Validation rules and constraints
- Example values

### Response Schemas
Response schemas include:
- Success response structures
- Error response formats
- HTTP status codes
- Response headers

### Common Schemas
Reusable schemas for common objects:
- `UGCRequest` - Video generation request format
- `UGCResponse` - Video generation response format
- `BatchRequest` - Batch processing request format
- `JobStatus` - Job status information
- `Error` - Standard error response format

## Development Tips

### Using Swagger for Development
1. **API First**: Use Swagger docs to understand endpoints before coding
2. **Testing**: Test all endpoints interactively before integration
3. **Schema Validation**: Verify request/response formats match expectations
4. **Error Handling**: Understand all possible error responses

### Customization
The Swagger configuration can be customized in:
- `src/config/swagger.js` - Main Swagger configuration
- `server.js` - Endpoint documentation annotations

### Adding New Endpoints
When adding new endpoints:
1. Add Swagger JSDoc comments above route definitions
2. Define request/response schemas in the configuration
3. Test the documentation in Swagger UI
4. Update this documentation as needed

## Troubleshooting

### Common Issues
- **404 on /api-docs**: Ensure the server is running and Swagger is properly configured
- **Missing endpoints**: Check that JSDoc comments are properly formatted
- **Authentication errors**: Verify API keys or JWT tokens are valid
- **Schema validation errors**: Check request format matches documented schema

### Getting Help
- Check the console for Swagger-related errors
- Verify JSDoc comment syntax
- Test endpoints with curl before using Swagger UI
- Review the Swagger configuration in `src/config/swagger.js`

---

The Swagger API documentation provides a comprehensive, interactive way to explore and test the UGC Ad Creator API, making it easier for developers to integrate and use all available features including the new advanced video editing capabilities.