#!/usr/bin/env node

/**
 * Generate Sample Images for Testing
 * 
 * This script creates simple colored rectangles as sample images for testing the API.
 * In a real scenario, you would use actual product photos, screenshots, etc.
 */

const fs = require('fs');
const path = require('path');

// Create sample-images directory if it doesn't exist
const sampleImagesDir = path.join(__dirname, 'sample-images');
if (!fs.existsSync(sampleImagesDir)) {
  fs.mkdirSync(sampleImagesDir, { recursive: true });
}

// Simple function to create a colored rectangle as base64 PNG
function createColoredRectangle(width, height, color, text) {
  // This is a minimal PNG header for a colored rectangle
  // In practice, you'd use a proper image library like sharp or canvas
  const canvas = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="${color}"/>
      <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="24" 
            fill="white" text-anchor="middle" dominant-baseline="middle">
        ${text}
      </text>
    </svg>
  `;
  
  return Buffer.from(canvas);
}

// Sample image configurations
const sampleImages = [
  {
    filename: 'fitness-app-screenshot.jpg',
    width: 375,
    height: 812,
    color: '#4A90E2',
    text: 'Fitness App\nScreenshot'
  },
  {
    filename: 'person-working-out.jpg',
    width: 800,
    height: 600,
    color: '#7ED321',
    text: 'Person\nWorking Out'
  },
  {
    filename: 'product-headphones.jpg',
    width: 600,
    height: 600,
    color: '#9013FE',
    text: 'Wireless\nHeadphones'
  },
  {
    filename: 'restaurant-dish.jpg',
    width: 800,
    height: 600,
    color: '#FF6B35',
    text: 'Delicious\nFood'
  },
  {
    filename: 'beach-resort.jpg',
    width: 1200,
    height: 800,
    color: '#00BCD4',
    text: 'Beach\nResort'
  },
  {
    filename: 'app-interface.jpg',
    width: 375,
    height: 667,
    color: '#E91E63',
    text: 'App\nInterface'
  }
];

console.log('🎨 Generating sample images for testing...\n');

// Generate sample images
sampleImages.forEach(({ filename, width, height, color, text }) => {
  const svgContent = createColoredRectangle(width, height, color, text);
  const filePath = path.join(sampleImagesDir, filename.replace('.jpg', '.svg'));
  
  fs.writeFileSync(filePath, svgContent);
  console.log(`✅ Created: ${filename} (${width}x${height}) - ${color}`);
});

// Create a README for the sample images
const readmeContent = `# Sample Images

These are sample images generated for testing the UGC Ad Creator API.

## Available Images

${sampleImages.map(img => `- **${img.filename}** - ${img.width}x${img.height} - ${img.text.replace('\n', ' ')}`).join('\n')}

## Usage

Use these images when testing the API endpoints:

\`\`\`bash
curl -X POST http://localhost:3000/api/v1/ugc/generate \\
  -F "creativeBrief=Create an engaging fitness app advertisement" \\
  -F "images=@./examples/sample-images/fitness-app-screenshot.svg" \\
  -F "images=@./examples/sample-images/person-working-out.svg"
\`\`\`

## Note

These are simple SVG files for testing purposes. In production, you would use:
- Actual product photographs
- App screenshots
- User-generated content
- Professional marketing images

The API accepts PNG, JPG, and JPEG formats. SVG files are used here for simplicity.
`;

fs.writeFileSync(path.join(sampleImagesDir, 'README.md'), readmeContent);

console.log('\n📝 Created sample images README');
console.log('\n🎉 Sample image generation complete!');
console.log(`\n📁 Images saved to: ${sampleImagesDir}`);
console.log('\n💡 You can now use these images to test the API endpoints.');
console.log('   See examples/README.md for usage instructions.');