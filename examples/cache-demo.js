#!/usr/bin/env node

/**
 * Cache Demo Script
 * Demonstrates the Redis caching functionality of the UGC Ad Creator API
 */

const cacheService = require('../src/services/cacheService');
const crypto = require('crypto');

async function demonstrateImageAnalysisCache() {
  console.log('\n🖼️  Image Analysis Cache Demo');
  console.log('================================');

  // Create sample image data
  const sampleImage = Buffer.from('sample image data for demo');
  const options = { focusAreas: ['objects', 'people'] };
  
  // Sample analysis result
  const analysisResult = {
    objects: ['smartphone', 'coffee cup', 'laptop'],
    people: ['young professional'],
    setting: 'modern office',
    actions: ['working', 'drinking coffee'],
    timestamp: new Date().toISOString(),
    model: 'gemini-2.5-flash-image-preview'
  };

  console.log('📝 Caching image analysis result...');
  const cached = await cacheService.setCachedImageAnalysis(sampleImage, options, analysisResult);
  console.log(`✅ Cache set successful: ${cached}`);

  console.log('\n🔍 Retrieving from cache...');
  const retrieved = await cacheService.getCachedImageAnalysis(sampleImage, options);
  
  if (retrieved) {
    console.log('✅ Cache hit! Retrieved result:');
    console.log(`   Objects: ${retrieved.objects.join(', ')}`);
    console.log(`   People: ${retrieved.people.join(', ')}`);
    console.log(`   Setting: ${retrieved.setting}`);
    console.log(`   Cached at: ${retrieved.cachedAt}`);
  } else {
    console.log('❌ Cache miss');
  }
}

async function demonstrateScriptCache() {
  console.log('\n📝 Script Generation Cache Demo');
  console.log('================================');

  const creativeBrief = 'Create an engaging UGC ad for a new productivity app';
  const imageAnalysis = [
    {
      objects: ['smartphone', 'app interface'],
      people: ['young professional'],
      setting: 'modern workspace',
      actions: ['using app', 'smiling']
    }
  ];

  const scriptResult = {
    'segment-1': 'Person opens the productivity app with an excited expression, showing the clean interface',
    'segment-2': 'Person demonstrates key features while nodding approvingly at the camera',
    timestamp: new Date().toISOString(),
    model: 'gpt-4'
  };

  console.log('📝 Caching script generation result...');
  const cached = await cacheService.setCachedScript(creativeBrief, imageAnalysis, null, scriptResult);
  console.log(`✅ Cache set successful: ${cached}`);

  console.log('\n🔍 Retrieving from cache...');
  const retrieved = await cacheService.getCachedScript(creativeBrief, imageAnalysis, null);
  
  if (retrieved) {
    console.log('✅ Cache hit! Retrieved script:');
    console.log(`   Segment 1: ${retrieved['segment-1']}`);
    console.log(`   Segment 2: ${retrieved['segment-2']}`);
    console.log(`   Cached at: ${retrieved.cachedAt}`);
  } else {
    console.log('❌ Cache miss');
  }
}

async function demonstratePerformanceImprovement() {
  console.log('\n⚡ Performance Improvement Demo');
  console.log('===============================');

  const testImage = Buffer.from('performance test image data');
  const analysisResult = {
    objects: ['test object'],
    people: ['test person'],
    setting: 'test setting',
    actions: ['test action'],
    timestamp: new Date().toISOString()
  };

  // Simulate API call delay
  const simulateApiCall = () => new Promise(resolve => setTimeout(resolve, 100));

  console.log('🐌 Simulating first call (API call)...');
  const start1 = Date.now();
  await simulateApiCall(); // Simulate API delay
  await cacheService.setCachedImageAnalysis(testImage, {}, analysisResult);
  const time1 = Date.now() - start1;
  console.log(`   Time taken: ${time1}ms`);

  console.log('\n⚡ Second call (from cache)...');
  const start2 = Date.now();
  const cachedResult = await cacheService.getCachedImageAnalysis(testImage, {});
  const time2 = Date.now() - start2;
  console.log(`   Time taken: ${time2}ms`);

  const improvement = Math.round((time1 - time2) / time1 * 100);
  console.log(`\n🚀 Performance improvement: ${improvement}% faster with cache!`);
}

async function demonstrateCacheMetrics() {
  console.log('\n📊 Cache Metrics Demo');
  console.log('=====================');

  // Generate some cache activity
  const images = [
    Buffer.from('image 1'),
    Buffer.from('image 2'),
    Buffer.from('image 1'), // Duplicate for cache hit
  ];

  const result = { objects: ['demo'], timestamp: new Date().toISOString() };

  console.log('🔄 Generating cache activity...');
  for (const image of images) {
    const cached = await cacheService.getCachedImageAnalysis(image);
    if (!cached) {
      await cacheService.setCachedImageAnalysis(image, {}, result);
    }
  }

  console.log('\n📈 Current cache metrics:');
  const metrics = await cacheService.getMetrics();
  console.log(`   Total requests: ${metrics.totalRequests}`);
  console.log(`   Cache hits: ${metrics.hits}`);
  console.log(`   Cache misses: ${metrics.misses}`);
  console.log(`   Hit rate: ${metrics.hitRate}`);
  console.log(`   Cache sets: ${metrics.sets}`);
  console.log(`   Connected: ${metrics.isConnected}`);
}

async function demonstrateCacheInvalidation() {
  console.log('\n🗑️  Cache Invalidation Demo');
  console.log('============================');

  // Add some cache entries
  const testImages = [
    Buffer.from('invalidation test 1'),
    Buffer.from('invalidation test 2')
  ];

  const result = { objects: ['test'], timestamp: new Date().toISOString() };

  console.log('📝 Adding cache entries...');
  for (const image of testImages) {
    await cacheService.setCachedImageAnalysis(image, {}, result);
  }

  console.log('🔍 Verifying entries exist...');
  let count = 0;
  for (const image of testImages) {
    const cached = await cacheService.getCachedImageAnalysis(image);
    if (cached) count++;
  }
  console.log(`   Found ${count} cached entries`);

  console.log('\n🗑️  Invalidating image analysis cache...');
  const deletedCount = await cacheService.invalidateImageAnalysisCache();
  console.log(`   Deleted ${deletedCount} entries`);

  console.log('\n🔍 Verifying entries are gone...');
  count = 0;
  for (const image of testImages) {
    const cached = await cacheService.getCachedImageAnalysis(image);
    if (cached) count++;
  }
  console.log(`   Found ${count} cached entries (should be 0)`);
}

async function runDemo() {
  console.log('🚀 UGC Ad Creator API - Redis Cache Demo');
  console.log('=========================================');

  try {
    // Initialize cache service
    console.log('\n🔧 Initializing cache service...');
    await cacheService.initialize();
    
    if (!cacheService.isConnected) {
      console.log('❌ Redis not available. Please ensure Redis is running on localhost:6379');
      console.log('   You can start Redis with: redis-server');
      process.exit(1);
    }
    
    console.log('✅ Cache service initialized successfully');

    // Reset metrics for clean demo
    cacheService.resetMetrics();

    // Run demonstrations
    await demonstrateImageAnalysisCache();
    await demonstrateScriptCache();
    await demonstratePerformanceImprovement();
    await demonstrateCacheMetrics();
    await demonstrateCacheInvalidation();

    console.log('\n🎉 Demo completed successfully!');
    console.log('\n💡 Key Benefits of Redis Caching:');
    console.log('   • Significant performance improvements (50-90% faster)');
    console.log('   • Reduced API costs by avoiding duplicate requests');
    console.log('   • Better user experience with faster response times');
    console.log('   • Scalable caching with TTL and invalidation strategies');

  } catch (error) {
    console.error('\n❌ Demo failed:', error.message);
    process.exit(1);
  } finally {
    // Clean up
    await cacheService.close();
    console.log('\n🔌 Cache service connection closed');
  }
}

// Run the demo if this script is executed directly
if (require.main === module) {
  runDemo().catch(console.error);
}

module.exports = { runDemo };