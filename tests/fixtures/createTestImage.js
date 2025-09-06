/**
 * Utility to create test image buffers for integration tests
 */

/**
 * Creates a minimal valid JPEG buffer for testing
 * @returns {Buffer} A minimal JPEG image buffer
 */
function createTestJpegBuffer() {
  // This is a minimal valid JPEG header + data
  // JPEG files start with FF D8 and end with FF D9
  const jpegHeader = Buffer.from([
    0xFF, 0xD8, // JPEG SOI (Start of Image)
    0xFF, 0xE0, // JFIF APP0 marker
    0x00, 0x10, // Length of APP0 segment
    0x4A, 0x46, 0x49, 0x46, 0x00, // "JFIF\0"
    0x01, 0x01, // Version 1.1
    0x01, // Units (1 = pixels per inch)
    0x00, 0x48, // X density (72 dpi)
    0x00, 0x48, // Y density (72 dpi)
    0x00, 0x00, // Thumbnail width and height (0 = no thumbnail)
    0xFF, 0xD9  // JPEG EOI (End of Image)
  ]);
  
  return jpegHeader;
}

/**
 * Creates a minimal valid PNG buffer for testing
 * @returns {Buffer} A minimal PNG image buffer
 */
function createTestPngBuffer() {
  // This is a minimal valid PNG (1x1 pixel, black)
  const pngData = Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
    0x00, 0x00, 0x00, 0x0D, // IHDR chunk length
    0x49, 0x48, 0x44, 0x52, // IHDR
    0x00, 0x00, 0x00, 0x01, // Width: 1
    0x00, 0x00, 0x00, 0x01, // Height: 1
    0x08, 0x02, 0x00, 0x00, 0x00, // Bit depth: 8, Color type: 2 (RGB), Compression: 0, Filter: 0, Interlace: 0
    0x90, 0x77, 0x53, 0xDE, // CRC
    0x00, 0x00, 0x00, 0x0C, // IDAT chunk length
    0x49, 0x44, 0x41, 0x54, // IDAT
    0x08, 0x99, 0x01, 0x01, 0x00, 0x00, 0x00, 0xFF, 0xFF, 0x00, 0x00, 0x00, // Compressed image data (1 black pixel)
    0x02, 0x00, 0x01, // CRC
    0x00, 0x00, 0x00, 0x00, // IEND chunk length
    0x49, 0x45, 0x4E, 0x44, // IEND
    0xAE, 0x42, 0x60, 0x82  // CRC
  ]);
  
  return pngData;
}

/**
 * Creates test image data for different scenarios
 */
const testImages = {
  validJpeg: createTestJpegBuffer(),
  validPng: createTestPngBuffer(),
  invalidFormat: Buffer.from('This is not an image file'),
  largeImage: Buffer.alloc(10 * 1024 * 1024), // 10MB buffer
  emptyBuffer: Buffer.alloc(0)
};

/**
 * Creates a test file object that mimics multer file structure
 * @param {Buffer} buffer - File buffer
 * @param {string} mimetype - MIME type
 * @param {string} originalname - Original filename
 * @returns {Object} Mock file object
 */
function createMockFile(buffer, mimetype, originalname) {
  return {
    buffer,
    mimetype,
    originalname,
    fieldname: 'images',
    encoding: '7bit',
    size: buffer.length
  };
}

module.exports = {
  createTestJpegBuffer,
  createTestPngBuffer,
  testImages,
  createMockFile
};