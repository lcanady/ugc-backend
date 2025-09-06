# API Examples

This directory contains example requests and responses for the UGC Ad Creator API.

## Quick Start

### 1. Health Check

```bash
curl -X GET http://localhost:3000/health
```

**Response:**
```json
{
  "status": "OK",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "environment": "development",
  "version": "1.0.0",
  "uptime": 3600.5,
  "memory": {
    "rss": 45678912,
    "heapTotal": 20971520,
    "heapUsed": 15728640,
    "external": 1048576
  }
}
```

### 2. Generate UGC Ad

```bash
curl -X POST http://localhost:3000/api/v1/ugc/generate \
  -F "creativeBrief=Create an engaging fitness app advertisement showcasing workout tracking features" \
  -F "images=@./examples/fitness-app-screenshot.jpg" \
  -F "images=@./examples/person-working-out.jpg"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "ugc_1705312200_abc123def",
    "creativeBrief": "Create an engaging fitness app advertisement showcasing workout tracking features",
    "imageAnalysis": {
      "uploadedImages": [
        {
          "imageIndex": 0,
          "description": "Screenshot of a fitness tracking app showing workout statistics and progress charts",
          "objects": ["smartphone", "app interface", "charts", "buttons"],
          "people": [],
          "setting": "mobile app interface",
          "actions": ["displaying data", "showing progress"]
        },
        {
          "imageIndex": 1,
          "description": "Young woman in athletic wear performing exercises in a modern gym",
          "objects": ["dumbbells", "gym equipment", "water bottle", "yoga mat"],
          "people": ["young woman", "fitness enthusiast"],
          "setting": "modern gym",
          "actions": ["exercising", "lifting weights", "working out"]
        }
      ],
      "generatedImages": []
    },
    "script": {
      "segments": {
        "segment1": {
          "action": "Person opens fitness app on smartphone, scrolling through workout statistics and progress charts",
          "dialogue": "Ready to transform your workout routine?",
          "duration": 8
        },
        "segment2": {
          "action": "Young woman in gym performs exercises while checking app on phone, showing real-time tracking",
          "dialogue": "Track every rep, every step, every victory!",
          "duration": 8
        }
      }
    },
    "videoSegments": [
      {
        "segmentIndex": 0,
        "videoFile": {
          "url": "https://storage.googleapis.com/veo-generated-videos/segment1_abc123.mp4",
          "filename": "segment1_fitness_app.mp4",
          "mimeType": "video/mp4"
        },
        "duration": 8,
        "resolution": "720p",
        "hasAudio": true
      },
      {
        "segmentIndex": 1,
        "videoFile": {
          "url": "https://storage.googleapis.com/veo-generated-videos/segment2_def456.mp4",
          "filename": "segment2_workout.mp4",
          "mimeType": "video/mp4"
        },
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

### 3. Check Generation Status

```bash
curl -X GET http://localhost:3000/api/v1/ugc/status/ugc_1705312200_abc123def
```

**Response (Processing):**
```json
{
  "success": true,
  "data": {
    "operationId": "ugc_1705312200_abc123def",
    "status": "processing",
    "progress": 65,
    "estimatedTimeRemaining": 30,
    "createdAt": "2024-01-15T10:30:00.000Z"
  }
}
```

**Response (Completed):**
```json
{
  "success": true,
  "data": {
    "operationId": "ugc_1705312200_abc123def",
    "status": "completed",
    "progress": 100,
    "estimatedTimeRemaining": 0,
    "createdAt": "2024-01-15T10:30:00.000Z",
    "completedAt": "2024-01-15T10:31:15.000Z"
  }
}
```

### 4. Download Videos

```bash
curl -X POST http://localhost:3000/api/v1/ugc/download \
  -H "Content-Type: application/json" \
  -d '{"operationId": "ugc_1705312200_abc123def"}'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "videos": [
      {
        "segmentIndex": 0,
        "videoUrl": "https://storage.googleapis.com/veo-generated-videos/segment1_abc123.mp4",
        "duration": 8,
        "fileSize": 2048576
      },
      {
        "segmentIndex": 1,
        "videoUrl": "https://storage.googleapis.com/veo-generated-videos/segment2_def456.mp4",
        "duration": 8,
        "fileSize": 2359296
      }
    ]
  }
}
```

## Error Examples

### Missing Creative Brief

```bash
curl -X POST http://localhost:3000/api/v1/ugc/generate \
  -F "images=@./examples/sample-image.jpg"
```

**Response:**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_CREATIVE_BRIEF",
    "message": "Creative brief is required"
  }
}
```

### No Images Provided

```bash
curl -X POST http://localhost:3000/api/v1/ugc/generate \
  -F "creativeBrief=Create a fitness ad"
```

**Response:**
```json
{
  "success": false,
  "error": {
    "code": "NO_IMAGES_PROVIDED",
    "message": "At least one image is required"
  }
}
```

### Too Many Images

```bash
curl -X POST http://localhost:3000/api/v1/ugc/generate \
  -F "creativeBrief=Create a fitness ad" \
  -F "images=@./image1.jpg" \
  -F "images=@./image2.jpg" \
  -F "images=@./image3.jpg" \
  -F "images=@./image4.jpg" \
  -F "images=@./image5.jpg"
```

**Response:**
```json
{
  "success": false,
  "error": {
    "code": "TOO_MANY_IMAGES",
    "message": "Maximum 4 images allowed"
  }
}
```

### Invalid File Type

```bash
curl -X POST http://localhost:3000/api/v1/ugc/generate \
  -F "creativeBrief=Create a fitness ad" \
  -F "images=@./document.pdf"
```

**Response:**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_FILE_TYPE",
    "message": "Invalid file type. Only image/jpeg, image/jpg, image/png are allowed."
  }
}
```

### External Service Error

```json
{
  "success": false,
  "error": {
    "code": "VIDEO_GENERATION_ERROR",
    "message": "Video generation service is temporarily unavailable. Please try again later."
  }
}
```

### Safety Filter Error

```json
{
  "success": false,
  "error": {
    "code": "SAFETY_FILTER_ERROR",
    "message": "Video generation blocked by safety filters. Please modify your prompt and try again."
  }
}
```

## Advanced Examples

### Using Optional Script

```bash
curl -X POST http://localhost:3000/api/v1/ugc/generate \
  -F "creativeBrief=Create an engaging fitness app advertisement" \
  -F "script=Person opens app and starts tracking workout" \
  -F "images=@./examples/fitness-app.jpg"
```

### With Custom Options

```bash
curl -X POST http://localhost:3000/api/v1/ugc/generate \
  -F "creativeBrief=Create a vertical social media ad for fitness app" \
  -F 'options={"aspectRatio":"9:16","segmentCount":1,"useFastModel":true}' \
  -F "images=@./examples/fitness-app.jpg"
```

## Testing with Different Content Types

### E-commerce Product

```bash
curl -X POST http://localhost:3000/api/v1/ugc/generate \
  -F "creativeBrief=Create an engaging product showcase for wireless headphones highlighting sound quality and comfort" \
  -F "images=@./examples/headphones-product.jpg" \
  -F "images=@./examples/person-listening.jpg"
```

### Food & Restaurant

```bash
curl -X POST http://localhost:3000/api/v1/ugc/generate \
  -F "creativeBrief=Create an appetizing restaurant advertisement showcasing fresh ingredients and delicious meals" \
  -F "images=@./examples/restaurant-dish.jpg" \
  -F "images=@./examples/chef-cooking.jpg"
```

### Travel & Tourism

```bash
curl -X POST http://localhost:3000/api/v1/ugc/generate \
  -F "creativeBrief=Create an inspiring travel advertisement for a tropical destination highlighting beautiful beaches and activities" \
  -F "images=@./examples/beach-resort.jpg" \
  -F "images=@./examples/tourists-activities.jpg"
```

## Rate Limiting

The API implements rate limiting to ensure fair usage:

- **General API endpoints**: 10 requests per second per IP
- **Upload endpoints**: 2 requests per second per IP
- **Burst allowance**: Up to 20 requests in burst for general endpoints, 5 for uploads

When rate limited, you'll receive a `429 Too Many Requests` response:

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests. Please try again later."
  }
}
```