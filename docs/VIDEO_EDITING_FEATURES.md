# Advanced Video Editing Features

The UGC Ad Creator API now includes comprehensive video post-processing and editing capabilities through the `VideoEditingService`. This service provides professional-grade video editing features using FFmpeg integration.

## Features Overview

### 🎬 Post-Processing Capabilities
- **Video Trimming**: Cut videos to specific durations and time ranges
- **Video Merging**: Combine multiple video segments into one
- **Format Conversion**: Convert between MP4, WebM, AVI formats
- **Video Optimization**: Optimize videos for web delivery with configurable quality settings
- **Watermarking**: Add image watermarks with customizable positioning and opacity
- **Branding**: Add logos and text branding to videos

### 🎨 Advanced Effects & Filters
- **Color Correction**: Adjust brightness, contrast, saturation, and hue
- **Color Balance**: Apply warm, cool, or neutral color balance
- **Text Overlays**: Add custom text with positioning, timing, and styling
- **Subtitles**: Add SRT subtitle files with custom styling
- **Video Transitions**: Create smooth transitions between segments (fade, dissolve, slide, wipe)
- **Background Music**: Mix background audio with volume control and fade effects
- **Visual Effects**: Apply blur, sharpen, vintage, black & white, sepia effects
- **Speed Control**: Adjust video playback speed

## API Usage Examples

### Basic Video Processing
```javascript
const videoEditingService = require('./src/services/videoEditingService');

// Process UGC video with branding and optimization
const result = await videoEditingService.processUGCVideo('/input/video.mp4', {
  branding: {
    logoPath: '/assets/logo.png',
    brandText: 'My Brand',
    brandColor: '#FF0000'
  },
  optimize: true,
  format: 'mp4'
});

console.log('Processed video:', result.outputPath);
console.log('Video info:', result.videoInfo);
```

### Advanced Effects Chain
```javascript
// Apply multiple effects in sequence
const filteredVideo = await videoEditingService.applyVideoFilters('/input/video.mp4', {
  brightness: 0.1,
  contrast: 1.2,
  saturation: 1.1,
  colorBalance: 'warm'
});

const textVideo = await videoEditingService.addTextOverlay(filteredVideo, {
  text: 'Amazing Product!',
  fontSize: 32,
  fontColor: '#FFFFFF',
  position: 'bottom',
  startTime: 2,
  duration: 5
});

const finalVideo = await videoEditingService.applyAdvancedEffects(textVideo, {
  vintage: true,
  sharpen: true,
  speed: 1.2
});
```

### Video Transitions and Music
```javascript
// Create video with transitions and background music
const videoPaths = ['/segment1.mp4', '/segment2.mp4', '/segment3.mp4'];

const transitionVideo = await videoEditingService.addTransitions(videoPaths, {
  type: 'fade',
  duration: 1.5
});

const finalVideo = await videoEditingService.addBackgroundMusic(
  transitionVideo,
  '/background-music.mp3',
  {
    musicVolume: 0.3,
    originalVolume: 0.8,
    fadeIn: true,
    fadeOut: true
  }
);
```

## Configuration

### FFmpeg Installation
The service uses FFmpeg for video processing. FFmpeg is automatically installed via the `@ffmpeg-installer/ffmpeg` package.

### Directory Structure
```
temp/video-editing/     # Temporary processing files
downloads/processed/    # Final output files
```

### Supported Formats
- **Input**: MP4, AVI, MOV, WebM, MKV
- **Output**: MP4, WebM, AVI
- **Audio**: MP3, AAC, WAV, OGG
- **Images**: PNG, JPG, JPEG (for watermarks/logos)

## Performance Considerations

### Memory Usage
- Large video files may require significant memory
- Temporary files are automatically cleaned up after processing
- Use video optimization for web delivery to reduce file sizes

### Processing Time
- Complex effects and high-resolution videos take longer to process
- Background job processing recommended for production use
- Progress monitoring available through job status endpoints

### Quality Settings
```javascript
// High quality (larger file size)
{ quality: 'high', resolution: '1080p', bitrate: 2000 }

// Medium quality (balanced)
{ quality: 'medium', resolution: '720p', bitrate: 1000 }

// Low quality (smaller file size)
{ quality: 'low', resolution: '480p', bitrate: 500 }
```

## Error Handling

The service includes comprehensive error handling for:
- Invalid input files or parameters
- FFmpeg processing errors
- File system errors
- Memory limitations
- Format compatibility issues

```javascript
try {
  const result = await videoEditingService.processUGCVideo(inputPath, options);
  console.log('Success:', result);
} catch (error) {
  console.error('Video processing failed:', error.message);
  // Handle error appropriately
}
```

## Integration with UGC Workflow

The video editing service integrates seamlessly with the existing UGC generation workflow:

1. **Image Analysis** → Extract visual elements
2. **Script Generation** → Create video segments
3. **Video Generation** → Generate raw video content
4. **Video Editing** → Apply post-processing and effects ✨ **NEW**
5. **Final Output** → Deliver polished UGC advertisement

## Testing

Comprehensive test coverage includes:
- Unit tests for all service methods
- Integration tests for complete workflows
- Error handling scenarios
- Performance testing for large files
- Mock FFmpeg integration for CI/CD

Run video editing tests:
```bash
npm test tests/unit/services/videoEditingService.test.js
npm test tests/integration/videoEditingIntegration.test.js
```

## Future Enhancements

Planned features for future releases:
- Real-time video preview
- Advanced audio processing
- 3D effects and animations
- Batch video processing
- Cloud-based rendering
- AI-powered auto-editing

---

The advanced video editing features transform the UGC Ad Creator API from a basic video generator into a comprehensive video production platform, enabling users to create professional-quality advertisements with minimal effort.