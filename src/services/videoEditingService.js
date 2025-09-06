const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

// UUID v4 generator function
function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Set FFmpeg path
ffmpeg.setFfmpegPath(ffmpegPath);

class VideoEditingService {
  constructor() {
    this.tempDir = path.join(process.cwd(), 'temp', 'video-editing');
    this.outputDir = path.join(process.cwd(), 'downloads', 'processed');
    this.ensureDirectories();
  }

  /**
   * Ensure required directories exist
   */
  async ensureDirectories() {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
      await fs.mkdir(this.outputDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create directories:', error);
    }
  }

  /**
   * Trim video to specified duration
   * @param {string} inputPath - Path to input video
   * @param {number} startTime - Start time in seconds
   * @param {number} duration - Duration in seconds
   * @param {string} outputPath - Optional output path
   * @returns {Promise<string>} Path to trimmed video
   */
  async trimVideo(inputPath, startTime = 0, duration, outputPath = null) {
    if (!inputPath) {
      throw new Error('Input video path is required');
    }

    if (duration <= 0) {
      throw new Error('Duration must be greater than 0');
    }

    const outputFile = outputPath || path.join(this.outputDir, `trimmed_${uuidv4()}.mp4`);

    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .seekInput(startTime)
        .duration(duration)
        .output(outputFile)
        .videoCodec('libx264')
        .audioCodec('aac')
        .on('end', () => {
          console.log(`Video trimmed successfully: ${outputFile}`);
          resolve(outputFile);
        })
        .on('error', (error) => {
          console.error('Video trimming failed:', error);
          reject(new Error(`Failed to trim video: ${error.message}`));
        })
        .run();
    });
  }

  /**
   * Merge multiple video segments into one
   * @param {Array<string>} videoPaths - Array of video file paths
   * @param {string} outputPath - Optional output path
   * @returns {Promise<string>} Path to merged video
   */
  async mergeVideos(videoPaths, outputPath = null) {
    if (!Array.isArray(videoPaths) || videoPaths.length === 0) {
      throw new Error('Video paths array is required and must not be empty');
    }

    if (videoPaths.length === 1) {
      return videoPaths[0]; // No need to merge single video
    }

    const outputFile = outputPath || path.join(this.outputDir, `merged_${uuidv4()}.mp4`);
    const listFile = path.join(this.tempDir, `merge_list_${uuidv4()}.txt`);

    try {
      // Create file list for FFmpeg concat
      const fileList = videoPaths.map(videoPath => `file '${path.resolve(videoPath)}'`).join('\n');
      await fs.writeFile(listFile, fileList);

      return new Promise((resolve, reject) => {
        ffmpeg()
          .input(listFile)
          .inputOptions(['-f', 'concat', '-safe', '0'])
          .output(outputFile)
          .videoCodec('libx264')
          .audioCodec('aac')
          .on('end', async () => {
            try {
              await fs.unlink(listFile); // Clean up temp file
              console.log(`Videos merged successfully: ${outputFile}`);
              resolve(outputFile);
            } catch (cleanupError) {
              console.warn('Failed to clean up temp file:', cleanupError);
              resolve(outputFile);
            }
          })
          .on('error', async (error) => {
            try {
              await fs.unlink(listFile); // Clean up temp file
            } catch (cleanupError) {
              console.warn('Failed to clean up temp file:', cleanupError);
            }
            console.error('Video merging failed:', error);
            reject(new Error(`Failed to merge videos: ${error.message}`));
          })
          .run();
      });
    } catch (error) {
      throw new Error(`Failed to prepare video merge: ${error.message}`);
    }
  }

  /**
   * Convert video to different format
   * @param {string} inputPath - Path to input video
   * @param {string} format - Output format (mp4, webm, avi, etc.)
   * @param {Object} options - Conversion options
   * @param {string} options.quality - Video quality (high, medium, low)
   * @param {string} options.resolution - Video resolution (1080p, 720p, 480p)
   * @param {number} options.bitrate - Video bitrate in kbps
   * @param {string} outputPath - Optional output path
   * @returns {Promise<string>} Path to converted video
   */
  async convertVideo(inputPath, format = 'mp4', options = {}, outputPath = null) {
    if (!inputPath) {
      throw new Error('Input video path is required');
    }

    const {
      quality = 'medium',
      resolution = null,
      bitrate = null
    } = options;

    const outputFile = outputPath || path.join(this.outputDir, `converted_${uuidv4()}.${format}`);

    return new Promise((resolve, reject) => {
      const command = ffmpeg(inputPath).output(outputFile);

      // Set video codec based on format
      switch (format.toLowerCase()) {
        case 'mp4':
          command.videoCodec('libx264').audioCodec('aac');
          break;
        case 'webm':
          command.videoCodec('libvpx-vp9').audioCodec('libvorbis');
          break;
        case 'avi':
          command.videoCodec('libx264').audioCodec('mp3');
          break;
        default:
          command.videoCodec('libx264').audioCodec('aac');
      }

      // Set quality
      switch (quality) {
        case 'high':
          command.videoBitrate('2000k').audioBitrate('192k');
          break;
        case 'low':
          command.videoBitrate('500k').audioBitrate('96k');
          break;
        default: // medium
          command.videoBitrate('1000k').audioBitrate('128k');
      }

      // Set custom bitrate if provided
      if (bitrate) {
        command.videoBitrate(`${bitrate}k`);
      }

      // Set resolution if provided
      if (resolution) {
        const resolutionMap = {
          '1080p': '1920x1080',
          '720p': '1280x720',
          '480p': '854x480',
          '360p': '640x360'
        };
        
        const size = resolutionMap[resolution] || resolution;
        command.size(size);
      }

      command
        .on('end', () => {
          console.log(`Video converted successfully: ${outputFile}`);
          resolve(outputFile);
        })
        .on('error', (error) => {
          console.error('Video conversion failed:', error);
          reject(new Error(`Failed to convert video: ${error.message}`));
        })
        .run();
    });
  }

  /**
   * Optimize video for web delivery
   * @param {string} inputPath - Path to input video
   * @param {Object} options - Optimization options
   * @param {string} options.preset - FFmpeg preset (ultrafast, fast, medium, slow)
   * @param {boolean} options.twoPass - Use two-pass encoding for better quality
   * @param {string} outputPath - Optional output path
   * @returns {Promise<string>} Path to optimized video
   */
  async optimizeVideo(inputPath, options = {}, outputPath = null) {
    if (!inputPath) {
      throw new Error('Input video path is required');
    }

    const {
      preset = 'medium',
      twoPass = false
    } = options;

    const outputFile = outputPath || path.join(this.outputDir, `optimized_${uuidv4()}.mp4`);

    return new Promise((resolve, reject) => {
      const command = ffmpeg(inputPath)
        .output(outputFile)
        .videoCodec('libx264')
        .audioCodec('aac')
        .preset(preset)
        .videoBitrate('1000k')
        .audioBitrate('128k')
        .size('1280x720')
        .fps(30)
        .addOption('-movflags', '+faststart') // Enable fast start for web
        .addOption('-pix_fmt', 'yuv420p'); // Ensure compatibility

      if (twoPass) {
        command.addOption('-pass', '1');
      }

      command
        .on('end', () => {
          console.log(`Video optimized successfully: ${outputFile}`);
          resolve(outputFile);
        })
        .on('error', (error) => {
          console.error('Video optimization failed:', error);
          reject(new Error(`Failed to optimize video: ${error.message}`));
        })
        .run();
    });
  }

  /**
   * Add watermark to video
   * @param {string} inputPath - Path to input video
   * @param {string} watermarkPath - Path to watermark image
   * @param {Object} options - Watermark options
   * @param {string} options.position - Position (top-left, top-right, bottom-left, bottom-right, center)
   * @param {number} options.opacity - Opacity (0-1)
   * @param {number} options.scale - Scale factor for watermark
   * @param {string} outputPath - Optional output path
   * @returns {Promise<string>} Path to watermarked video
   */
  async addWatermark(inputPath, watermarkPath, options = {}, outputPath = null) {
    if (!inputPath || !watermarkPath) {
      throw new Error('Input video path and watermark path are required');
    }

    const {
      position = 'bottom-right',
      opacity = 0.7,
      scale = 0.1
    } = options;

    const outputFile = outputPath || path.join(this.outputDir, `watermarked_${uuidv4()}.mp4`);

    // Position mapping for FFmpeg overlay filter
    const positionMap = {
      'top-left': '10:10',
      'top-right': 'W-w-10:10',
      'bottom-left': '10:H-h-10',
      'bottom-right': 'W-w-10:H-h-10',
      'center': '(W-w)/2:(H-h)/2'
    };

    const overlayPosition = positionMap[position] || positionMap['bottom-right'];

    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .input(watermarkPath)
        .complexFilter([
          `[1:v]scale=iw*${scale}:ih*${scale},format=rgba,colorchannelmixer=aa=${opacity}[watermark]`,
          `[0:v][watermark]overlay=${overlayPosition}[v]`
        ])
        .map('[v]')
        .map('0:a?')
        .output(outputFile)
        .videoCodec('libx264')
        .audioCodec('aac')
        .on('end', () => {
          console.log(`Watermark added successfully: ${outputFile}`);
          resolve(outputFile);
        })
        .on('error', (error) => {
          console.error('Watermark addition failed:', error);
          reject(new Error(`Failed to add watermark: ${error.message}`));
        })
        .run();
    });
  }

  /**
   * Add branding elements to video
   * @param {string} inputPath - Path to input video
   * @param {Object} branding - Branding options
   * @param {string} branding.logoPath - Path to logo image
   * @param {string} branding.brandText - Brand text to overlay
   * @param {string} branding.brandColor - Brand color (hex)
   * @param {string} outputPath - Optional output path
   * @returns {Promise<string>} Path to branded video
   */
  async addBranding(inputPath, branding = {}, outputPath = null) {
    if (!inputPath) {
      throw new Error('Input video path is required');
    }

    const {
      logoPath,
      brandText,
      brandColor = '#FFFFFF'
    } = branding;

    const outputFile = outputPath || path.join(this.outputDir, `branded_${uuidv4()}.mp4`);

    return new Promise((resolve, reject) => {
      const command = ffmpeg(inputPath);
      const filters = [];

      // Add logo if provided
      if (logoPath) {
        command.input(logoPath);
        filters.push('[1:v]scale=100:100,format=rgba[logo]');
        filters.push('[0:v][logo]overlay=W-w-10:10[branded]');
      }

      // Add text if provided
      if (brandText) {
        const textFilter = `drawtext=text='${brandText}':fontcolor=${brandColor}:fontsize=24:x=10:y=H-th-10`;
        if (filters.length > 0) {
          filters.push(`[branded]${textFilter}[final]`);
        } else {
          filters.push(`[0:v]${textFilter}[final]`);
        }
      }

      if (filters.length > 0) {
        command.complexFilter(filters);
        command.map('[final]');
      }

      command.map('0:a?')
        .output(outputFile)
        .videoCodec('libx264')
        .audioCodec('aac')
        .on('end', () => {
          console.log(`Branding added successfully: ${outputFile}`);
          resolve(outputFile);
        })
        .on('error', (error) => {
          console.error('Branding addition failed:', error);
          reject(new Error(`Failed to add branding: ${error.message}`));
        })
        .run();
    });
  }

  /**
   * Get video information
   * @param {string} inputPath - Path to video file
   * @returns {Promise<Object>} Video metadata
   */
  async getVideoInfo(inputPath) {
    if (!inputPath) {
      throw new Error('Input video path is required');
    }

    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(inputPath, (error, metadata) => {
        if (error) {
          reject(new Error(`Failed to get video info: ${error.message}`));
          return;
        }

        const videoStream = metadata.streams.find(stream => stream.codec_type === 'video');
        const audioStream = metadata.streams.find(stream => stream.codec_type === 'audio');

        const info = {
          duration: parseFloat(metadata.format.duration) || 0,
          size: parseInt(metadata.format.size) || 0,
          bitrate: parseInt(metadata.format.bit_rate) || 0,
          format: metadata.format.format_name,
          video: videoStream ? {
            codec: videoStream.codec_name,
            width: videoStream.width,
            height: videoStream.height,
            fps: eval(videoStream.r_frame_rate) || 0,
            bitrate: parseInt(videoStream.bit_rate) || 0
          } : null,
          audio: audioStream ? {
            codec: audioStream.codec_name,
            sampleRate: parseInt(audioStream.sample_rate) || 0,
            channels: audioStream.channels,
            bitrate: parseInt(audioStream.bit_rate) || 0
          } : null
        };

        resolve(info);
      });
    });
  }

  /**
   * Clean up temporary files
   * @param {Array<string>} filePaths - Array of file paths to clean up
   */
  async cleanupFiles(filePaths) {
    if (!Array.isArray(filePaths)) {
      return;
    }

    for (const filePath of filePaths) {
      try {
        await fs.unlink(filePath);
        console.log(`Cleaned up file: ${filePath}`);
      } catch (error) {
        console.warn(`Failed to clean up file ${filePath}:`, error.message);
      }
    }
  }

  /**
   * Apply video filters and color correction
   * @param {string} inputPath - Path to input video
   * @param {Object} filters - Filter options
   * @param {number} filters.brightness - Brightness adjustment (-1 to 1)
   * @param {number} filters.contrast - Contrast adjustment (0 to 2)
   * @param {number} filters.saturation - Saturation adjustment (0 to 3)
   * @param {number} filters.hue - Hue adjustment (-180 to 180)
   * @param {string} filters.colorBalance - Color balance (warm, cool, neutral)
   * @param {string} outputPath - Optional output path
   * @returns {Promise<string>} Path to filtered video
   */
  async applyVideoFilters(inputPath, filters = {}, outputPath = null) {
    if (!inputPath) {
      throw new Error('Input video path is required');
    }

    const {
      brightness = 0,
      contrast = 1,
      saturation = 1,
      hue = 0,
      colorBalance = 'neutral'
    } = filters;

    const outputFile = outputPath || path.join(this.outputDir, `filtered_${uuidv4()}.mp4`);

    // Build filter chain
    const filterChain = [];

    // Color correction filters
    if (brightness !== 0 || contrast !== 1 || saturation !== 1 || hue !== 0) {
      filterChain.push(`eq=brightness=${brightness}:contrast=${contrast}:saturation=${saturation}:hue=${hue}`);
    }

    // Color balance
    if (colorBalance !== 'neutral') {
      switch (colorBalance) {
        case 'warm':
          filterChain.push('colorbalance=rs=0.1:gs=0.05:bs=-0.1');
          break;
        case 'cool':
          filterChain.push('colorbalance=rs=-0.1:gs=-0.05:bs=0.1');
          break;
      }
    }

    const filterString = filterChain.length > 0 ? filterChain.join(',') : 'null';

    return new Promise((resolve, reject) => {
      const command = ffmpeg(inputPath).output(outputFile);
      
      if (filterString !== 'null') {
        command.videoFilters(filterString);
      }
      
      command
        .videoCodec('libx264')
        .audioCodec('aac')
        .on('end', () => {
          console.log(`Video filters applied successfully: ${outputFile}`);
          resolve(outputFile);
        })
        .on('error', (error) => {
          console.error('Video filtering failed:', error);
          reject(new Error(`Failed to apply video filters: ${error.message}`));
        })
        .run();
    });
  }

  /**
   * Add text overlay and subtitles to video
   * @param {string} inputPath - Path to input video
   * @param {Object} textOptions - Text overlay options
   * @param {string} textOptions.text - Text to overlay
   * @param {string} textOptions.fontFile - Path to font file (optional)
   * @param {number} textOptions.fontSize - Font size
   * @param {string} textOptions.fontColor - Font color (hex)
   * @param {string} textOptions.position - Position (top, center, bottom, custom)
   * @param {number} textOptions.x - Custom X position
   * @param {number} textOptions.y - Custom Y position
   * @param {number} textOptions.startTime - Start time in seconds
   * @param {number} textOptions.duration - Duration in seconds
   * @param {string} outputPath - Optional output path
   * @returns {Promise<string>} Path to video with text overlay
   */
  async addTextOverlay(inputPath, textOptions = {}, outputPath = null) {
    if (!inputPath) {
      throw new Error('Input video path is required');
    }

    const {
      text = 'Sample Text',
      fontFile = null,
      fontSize = 24,
      fontColor = '#FFFFFF',
      position = 'bottom',
      x = null,
      y = null,
      startTime = 0,
      duration = null
    } = textOptions;

    const outputFile = outputPath || path.join(this.outputDir, `text_overlay_${uuidv4()}.mp4`);

    // Position mapping
    let textPosition;
    switch (position) {
      case 'top':
        textPosition = '(w-text_w)/2:50';
        break;
      case 'center':
        textPosition = '(w-text_w)/2:(h-text_h)/2';
        break;
      case 'bottom':
        textPosition = '(w-text_w)/2:h-text_h-50';
        break;
      case 'custom':
        textPosition = `${x || 0}:${y || 0}`;
        break;
      default:
        textPosition = '(w-text_w)/2:h-text_h-50';
    }

    // Build drawtext filter
    let drawTextFilter = `drawtext=text='${text}':fontcolor=${fontColor}:fontsize=${fontSize}:x=${textPosition}`;
    
    if (fontFile) {
      drawTextFilter += `:fontfile=${fontFile}`;
    }

    if (startTime > 0 || duration) {
      const enableCondition = [];
      if (startTime > 0) {
        enableCondition.push(`gte(t,${startTime})`);
      }
      if (duration) {
        enableCondition.push(`lte(t,${startTime + duration})`);
      }
      drawTextFilter += `:enable='${enableCondition.join('*')}'`;
    }

    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .videoFilters(drawTextFilter)
        .output(outputFile)
        .videoCodec('libx264')
        .audioCodec('aac')
        .on('end', () => {
          console.log(`Text overlay added successfully: ${outputFile}`);
          resolve(outputFile);
        })
        .on('error', (error) => {
          console.error('Text overlay failed:', error);
          reject(new Error(`Failed to add text overlay: ${error.message}`));
        })
        .run();
    });
  }

  /**
   * Add subtitles from SRT file
   * @param {string} inputPath - Path to input video
   * @param {string} subtitlePath - Path to SRT subtitle file
   * @param {Object} options - Subtitle options
   * @param {string} options.fontColor - Font color (hex)
   * @param {number} options.fontSize - Font size
   * @param {string} options.fontFile - Path to font file
   * @param {string} outputPath - Optional output path
   * @returns {Promise<string>} Path to video with subtitles
   */
  async addSubtitles(inputPath, subtitlePath, options = {}, outputPath = null) {
    if (!inputPath || !subtitlePath) {
      throw new Error('Input video path and subtitle path are required');
    }

    const {
      fontColor = '#FFFFFF',
      fontSize = 20,
      fontFile = null
    } = options;

    const outputFile = outputPath || path.join(this.outputDir, `subtitled_${uuidv4()}.mp4`);

    let subtitleFilter = `subtitles=${subtitlePath}:force_style='Fontsize=${fontSize},PrimaryColour=${fontColor}'`;
    
    if (fontFile) {
      subtitleFilter += `:fontsdir=${path.dirname(fontFile)}`;
    }

    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .videoFilters(subtitleFilter)
        .output(outputFile)
        .videoCodec('libx264')
        .audioCodec('aac')
        .on('end', () => {
          console.log(`Subtitles added successfully: ${outputFile}`);
          resolve(outputFile);
        })
        .on('error', (error) => {
          console.error('Subtitle addition failed:', error);
          reject(new Error(`Failed to add subtitles: ${error.message}`));
        })
        .run();
    });
  }

  /**
   * Create video transition effects between segments
   * @param {Array<string>} videoPaths - Array of video file paths
   * @param {Object} transitionOptions - Transition options
   * @param {string} transitionOptions.type - Transition type (fade, dissolve, slide, wipe)
   * @param {number} transitionOptions.duration - Transition duration in seconds
   * @param {string} outputPath - Optional output path
   * @returns {Promise<string>} Path to video with transitions
   */
  async addTransitions(videoPaths, transitionOptions = {}, outputPath = null) {
    if (!Array.isArray(videoPaths) || videoPaths.length < 2) {
      throw new Error('At least 2 video paths are required for transitions');
    }

    const {
      type = 'fade',
      duration = 1
    } = transitionOptions;

    const outputFile = outputPath || path.join(this.outputDir, `transitions_${uuidv4()}.mp4`);

    return new Promise((resolve, reject) => {
      const command = ffmpeg();

      // Add all input videos
      videoPaths.forEach(videoPath => {
        command.input(videoPath);
      });

      // Build complex filter for transitions
      const filterComplex = this.buildTransitionFilter(videoPaths.length, type, duration);

      command
        .complexFilter(filterComplex)
        .map('[final]')
        .output(outputFile)
        .videoCodec('libx264')
        .audioCodec('aac')
        .on('end', () => {
          console.log(`Transitions added successfully: ${outputFile}`);
          resolve(outputFile);
        })
        .on('error', (error) => {
          console.error('Transition creation failed:', error);
          reject(new Error(`Failed to add transitions: ${error.message}`));
        })
        .run();
    });
  }

  /**
   * Build transition filter for FFmpeg
   * @param {number} videoCount - Number of videos
   * @param {string} type - Transition type
   * @param {number} duration - Transition duration
   * @returns {Array} Filter complex array
   */
  buildTransitionFilter(videoCount, type, duration) {
    const filters = [];
    
    for (let i = 0; i < videoCount - 1; i++) {
      const input1 = i === 0 ? `[${i}:v]` : `[v${i}]`;
      const input2 = `[${i + 1}:v]`;
      const output = i === videoCount - 2 ? '[final]' : `[v${i + 1}]`;

      switch (type) {
        case 'fade':
          filters.push(`${input1}${input2}xfade=transition=fade:duration=${duration}:offset=0${output}`);
          break;
        case 'dissolve':
          filters.push(`${input1}${input2}xfade=transition=dissolve:duration=${duration}:offset=0${output}`);
          break;
        case 'slide':
          filters.push(`${input1}${input2}xfade=transition=slideleft:duration=${duration}:offset=0${output}`);
          break;
        case 'wipe':
          filters.push(`${input1}${input2}xfade=transition=wiperight:duration=${duration}:offset=0${output}`);
          break;
        default:
          filters.push(`${input1}${input2}xfade=transition=fade:duration=${duration}:offset=0${output}`);
      }
    }

    return filters;
  }

  /**
   * Add background music and audio mixing
   * @param {string} inputPath - Path to input video
   * @param {string} musicPath - Path to background music file
   * @param {Object} audioOptions - Audio mixing options
   * @param {number} audioOptions.musicVolume - Background music volume (0-1)
   * @param {number} audioOptions.originalVolume - Original audio volume (0-1)
   * @param {boolean} audioOptions.fadeIn - Fade in music
   * @param {boolean} audioOptions.fadeOut - Fade out music
   * @param {number} audioOptions.startTime - Music start time in seconds
   * @param {string} outputPath - Optional output path
   * @returns {Promise<string>} Path to video with background music
   */
  async addBackgroundMusic(inputPath, musicPath, audioOptions = {}, outputPath = null) {
    if (!inputPath || !musicPath) {
      throw new Error('Input video path and music path are required');
    }

    const {
      musicVolume = 0.3,
      originalVolume = 1.0,
      fadeIn = false,
      fadeOut = false,
      startTime = 0
    } = audioOptions;

    const outputFile = outputPath || path.join(this.outputDir, `music_${uuidv4()}.mp4`);

    return new Promise((resolve, reject) => {
      const command = ffmpeg(inputPath)
        .input(musicPath);

      // Build audio filter
      let audioFilter = `[0:a]volume=${originalVolume}[original];[1:a]volume=${musicVolume}`;

      if (startTime > 0) {
        audioFilter += `,adelay=${startTime * 1000}|${startTime * 1000}`;
      }

      if (fadeIn) {
        audioFilter += ',afade=t=in:ss=0:d=2';
      }

      if (fadeOut) {
        audioFilter += ',afade=t=out:st=10:d=2';
      }

      audioFilter += '[music];[original][music]amix=inputs=2:duration=first:dropout_transition=2[audio]';

      command
        .complexFilter([audioFilter])
        .map('0:v')
        .map('[audio]')
        .output(outputFile)
        .videoCodec('libx264')
        .audioCodec('aac')
        .on('end', () => {
          console.log(`Background music added successfully: ${outputFile}`);
          resolve(outputFile);
        })
        .on('error', (error) => {
          console.error('Background music addition failed:', error);
          reject(new Error(`Failed to add background music: ${error.message}`));
        })
        .run();
    });
  }

  /**
   * Apply advanced video effects
   * @param {string} inputPath - Path to input video
   * @param {Object} effects - Effects options
   * @param {boolean} effects.blur - Apply blur effect
   * @param {boolean} effects.sharpen - Apply sharpen effect
   * @param {boolean} effects.vintage - Apply vintage effect
   * @param {boolean} effects.blackWhite - Convert to black and white
   * @param {boolean} effects.sepia - Apply sepia effect
   * @param {number} effects.speed - Speed adjustment (0.5 = half speed, 2 = double speed)
   * @param {string} outputPath - Optional output path
   * @returns {Promise<string>} Path to video with effects
   */
  async applyAdvancedEffects(inputPath, effects = {}, outputPath = null) {
    if (!inputPath) {
      throw new Error('Input video path is required');
    }

    const {
      blur = false,
      sharpen = false,
      vintage = false,
      blackWhite = false,
      sepia = false,
      speed = 1
    } = effects;

    const outputFile = outputPath || path.join(this.outputDir, `effects_${uuidv4()}.mp4`);

    // Build filter chain
    const videoFilters = [];
    const audioFilters = [];

    if (blur) {
      videoFilters.push('boxblur=2:1');
    }

    if (sharpen) {
      videoFilters.push('unsharp=5:5:1.0:5:5:0.0');
    }

    if (vintage) {
      videoFilters.push('curves=vintage');
    }

    if (blackWhite) {
      videoFilters.push('hue=s=0');
    }

    if (sepia) {
      videoFilters.push('colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131');
    }

    if (speed !== 1) {
      videoFilters.push(`setpts=${1/speed}*PTS`);
      audioFilters.push(`atempo=${speed}`);
    }

    return new Promise((resolve, reject) => {
      const command = ffmpeg(inputPath);

      if (videoFilters.length > 0) {
        command.videoFilters(videoFilters.join(','));
      }

      if (audioFilters.length > 0) {
        command.audioFilters(audioFilters.join(','));
      }

      command
        .output(outputFile)
        .videoCodec('libx264')
        .audioCodec('aac')
        .on('end', () => {
          console.log(`Advanced effects applied successfully: ${outputFile}`);
          resolve(outputFile);
        })
        .on('error', (error) => {
          console.error('Advanced effects application failed:', error);
          reject(new Error(`Failed to apply advanced effects: ${error.message}`));
        })
        .run();
    });
  }

  /**
   * Process UGC video with standard optimizations
   * @param {string} inputPath - Path to input video
   * @param {Object} options - Processing options
   * @param {Object} options.branding - Branding options
   * @param {boolean} options.optimize - Whether to optimize for web
   * @param {string} options.format - Output format
   * @param {string} outputPath - Optional output path
   * @returns {Promise<Object>} Processing result with file path and metadata
   */
  async processUGCVideo(inputPath, options = {}, outputPath = null) {
    if (!inputPath) {
      throw new Error('Input video path is required');
    }

    const {
      branding = null,
      optimize = true,
      format = 'mp4'
    } = options;

    try {
      let processedPath = inputPath;
      const tempFiles = [];

      // Add branding if specified
      if (branding && (branding.logoPath || branding.brandText)) {
        const brandedPath = path.join(this.tempDir, `branded_${uuidv4()}.mp4`);
        processedPath = await this.addBranding(processedPath, branding, brandedPath);
        tempFiles.push(brandedPath);
      }

      // Optimize for web if requested
      if (optimize) {
        const optimizedPath = path.join(this.tempDir, `optimized_${uuidv4()}.mp4`);
        processedPath = await this.optimizeVideo(processedPath, {}, optimizedPath);
        tempFiles.push(optimizedPath);
      }

      // Convert format if different from mp4
      if (format !== 'mp4') {
        const convertedPath = path.join(this.tempDir, `converted_${uuidv4()}.${format}`);
        processedPath = await this.convertVideo(processedPath, format, {}, convertedPath);
        tempFiles.push(convertedPath);
      }

      // Move to final output location
      const finalPath = outputPath || path.join(this.outputDir, `processed_${uuidv4()}.${format}`);
      if (processedPath !== finalPath) {
        await fs.copyFile(processedPath, finalPath);
      }

      // Get final video info
      const videoInfo = await this.getVideoInfo(finalPath);

      // Clean up temporary files
      await this.cleanupFiles(tempFiles);

      return {
        outputPath: finalPath,
        videoInfo,
        processing: {
          branding: !!branding,
          optimized: optimize,
          format,
          processedAt: new Date().toISOString()
        }
      };
    } catch (error) {
      throw new Error(`Failed to process UGC video: ${error.message}`);
    }
  }
}

module.exports = new VideoEditingService();