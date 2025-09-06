const { BatchOperation, UgcOperation } = require('../models');
const { Op } = require('sequelize');

/**
 * Batch Optimization Service
 * Provides intelligent batching, scheduling, and cost optimization features
 */
class BatchOptimizationService {
  constructor() {
    this.similarityThreshold = 0.7; // Threshold for content similarity
    this.costOptimizationEnabled = true;
    this.maxBatchSize = 50; // Maximum operations per optimized batch
  }

  /**
   * Analyze and optimize batch requests based on content similarity
   * @param {Array} requests - Array of batch requests
   * @returns {Object} Optimization analysis and suggestions
   */
  async analyzeBatchOptimization(requests) {
    if (!Array.isArray(requests) || requests.length === 0) {
      throw new Error('Requests array is required for optimization analysis');
    }

    const analysis = {
      totalRequests: requests.length,
      contentClusters: [],
      optimizationSuggestions: [],
      estimatedCostSavings: 0,
      recommendedBatching: []
    };

    // Analyze content similarity
    const clusters = this.clusterSimilarContent(requests);
    analysis.contentClusters = clusters;

    // Generate optimization suggestions
    analysis.optimizationSuggestions = this.generateOptimizationSuggestions(clusters);

    // Calculate cost savings
    analysis.estimatedCostSavings = this.calculateCostSavings(clusters);

    // Recommend optimal batching strategy
    analysis.recommendedBatching = this.recommendBatchingStrategy(clusters);

    return analysis;
  }

  /**
   * Cluster requests based on content similarity
   * @param {Array} requests - Array of requests
   * @returns {Array} Array of content clusters
   */
  clusterSimilarContent(requests) {
    const clusters = [];
    const processed = new Set();

    for (let i = 0; i < requests.length; i++) {
      if (processed.has(i)) continue;

      const cluster = {
        id: `cluster_${clusters.length + 1}`,
        requests: [{ index: i, request: requests[i] }],
        characteristics: this.analyzeRequestCharacteristics(requests[i]),
        similarity: 1.0
      };

      // Find similar requests
      for (let j = i + 1; j < requests.length; j++) {
        if (processed.has(j)) continue;

        const similarity = this.calculateContentSimilarity(requests[i], requests[j]);
        if (similarity >= this.similarityThreshold) {
          cluster.requests.push({ index: j, request: requests[j] });
          processed.add(j);
        }
      }

      processed.add(i);
      clusters.push(cluster);
    }

    return clusters;
  }

  /**
   * Calculate similarity between two requests
   * @param {Object} request1 - First request
   * @param {Object} request2 - Second request
   * @returns {number} Similarity score (0-1)
   */
  calculateContentSimilarity(request1, request2) {
    let similarity = 0;
    let factors = 0;

    // Compare creative brief similarity (using simple word overlap)
    const brief1Words = this.extractKeywords(request1.creativeBrief || '');
    const brief2Words = this.extractKeywords(request2.creativeBrief || '');
    const briefSimilarity = this.calculateWordOverlap(brief1Words, brief2Words);
    similarity += briefSimilarity * 0.4; // 40% weight
    factors += 0.4;

    // Compare image count similarity
    const img1Count = request1.images?.length || 0;
    const img2Count = request2.images?.length || 0;
    const imageSimilarity = 1 - Math.abs(img1Count - img2Count) / Math.max(img1Count, img2Count, 1);
    similarity += imageSimilarity * 0.2; // 20% weight
    factors += 0.2;

    // Compare script presence
    const script1Present = !!request1.script;
    const script2Present = !!request2.script;
    const scriptSimilarity = script1Present === script2Present ? 1 : 0;
    similarity += scriptSimilarity * 0.2; // 20% weight
    factors += 0.2;

    // Compare options similarity
    const optionsSimilarity = this.compareOptions(request1.options, request2.options);
    similarity += optionsSimilarity * 0.2; // 20% weight
    factors += 0.2;

    return factors > 0 ? similarity / factors : 0;
  }

  /**
   * Extract keywords from text
   * @param {string} text - Text to analyze
   * @returns {Array} Array of keywords
   */
  extractKeywords(text) {
    if (!text || typeof text !== 'string') return [];

    // Simple keyword extraction (in production, use NLP library)
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should']);
    
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word))
      .slice(0, 20); // Limit to top 20 keywords
  }

  /**
   * Calculate word overlap between two keyword arrays
   * @param {Array} words1 - First word array
   * @param {Array} words2 - Second word array
   * @returns {number} Overlap score (0-1)
   */
  calculateWordOverlap(words1, words2) {
    if (words1.length === 0 && words2.length === 0) return 1;
    if (words1.length === 0 || words2.length === 0) return 0;

    const set1 = new Set(words1);
    const set2 = new Set(words2);
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return intersection.size / union.size;
  }

  /**
   * Compare options between two requests
   * @param {Object} options1 - First options object
   * @param {Object} options2 - Second options object
   * @returns {number} Similarity score (0-1)
   */
  compareOptions(options1 = {}, options2 = {}) {
    const keys1 = Object.keys(options1);
    const keys2 = Object.keys(options2);
    
    if (keys1.length === 0 && keys2.length === 0) return 1;
    
    const allKeys = new Set([...keys1, ...keys2]);
    let matches = 0;
    
    for (const key of allKeys) {
      if (options1[key] === options2[key]) {
        matches++;
      }
    }
    
    return matches / allKeys.size;
  }

  /**
   * Analyze characteristics of a request
   * @param {Object} request - Request to analyze
   * @returns {Object} Request characteristics
   */
  analyzeRequestCharacteristics(request) {
    const brief = request.creativeBrief || '';
    const keywords = this.extractKeywords(brief);
    
    return {
      briefLength: brief.length,
      imageCount: request.images?.length || 0,
      hasCustomScript: !!request.script,
      keywords: keywords.slice(0, 5), // Top 5 keywords
      estimatedComplexity: this.estimateComplexity(request),
      category: this.categorizeRequest(request)
    };
  }

  /**
   * Estimate request complexity
   * @param {Object} request - Request to analyze
   * @returns {string} Complexity level
   */
  estimateComplexity(request) {
    let complexity = 0;
    
    // Brief length factor
    const briefLength = request.creativeBrief?.length || 0;
    if (briefLength > 1000) complexity += 2;
    else if (briefLength > 500) complexity += 1;
    
    // Image count factor
    const imageCount = request.images?.length || 0;
    if (imageCount > 5) complexity += 2;
    else if (imageCount > 2) complexity += 1;
    
    // Custom script factor
    if (request.script) complexity += 1;
    
    // Options complexity
    const optionsCount = Object.keys(request.options || {}).length;
    if (optionsCount > 3) complexity += 1;
    
    if (complexity >= 4) return 'high';
    if (complexity >= 2) return 'medium';
    return 'low';
  }

  /**
   * Categorize request based on content
   * @param {Object} request - Request to categorize
   * @returns {string} Category
   */
  categorizeRequest(request) {
    const brief = (request.creativeBrief || '').toLowerCase();
    
    // Simple categorization based on keywords
    if (brief.includes('food') || brief.includes('restaurant') || brief.includes('coffee') || brief.includes('drink')) {
      return 'food_beverage';
    }
    if (brief.includes('tech') || brief.includes('software') || brief.includes('app') || brief.includes('digital')) {
      return 'technology';
    }
    if (brief.includes('fashion') || brief.includes('clothing') || brief.includes('style') || brief.includes('wear')) {
      return 'fashion';
    }
    if (brief.includes('health') || brief.includes('fitness') || brief.includes('wellness') || brief.includes('medical')) {
      return 'health_fitness';
    }
    if (brief.includes('travel') || brief.includes('vacation') || brief.includes('hotel') || brief.includes('destination')) {
      return 'travel';
    }
    
    return 'general';
  }

  /**
   * Generate optimization suggestions based on clusters
   * @param {Array} clusters - Content clusters
   * @returns {Array} Optimization suggestions
   */
  generateOptimizationSuggestions(clusters) {
    const suggestions = [];

    // Suggest merging similar clusters
    const largeClusters = clusters.filter(c => c.requests.length > 1);
    if (largeClusters.length > 0) {
      suggestions.push({
        type: 'cluster_optimization',
        title: 'Similar Content Detected',
        description: `Found ${largeClusters.length} groups of similar requests that can be processed together for better efficiency.`,
        impact: 'medium',
        estimatedSavings: '15-25%'
      });
    }

    // Suggest processing strategy based on complexity
    const complexRequests = clusters.filter(c => 
      c.characteristics?.estimatedComplexity === 'high'
    ).reduce((sum, c) => sum + c.requests.length, 0);

    if (complexRequests > 0) {
      suggestions.push({
        type: 'processing_strategy',
        title: 'Complex Requests Detected',
        description: `${complexRequests} complex requests detected. Consider sequential processing to avoid resource contention.`,
        impact: 'high',
        recommendation: 'sequential'
      });
    }

    // Suggest scheduling optimization
    const totalRequests = clusters.reduce((sum, c) => sum + c.requests.length, 0);
    if (totalRequests > 20) {
      suggestions.push({
        type: 'scheduling',
        title: 'Large Batch Detected',
        description: 'Consider scheduling during off-peak hours for better resource availability and cost savings.',
        impact: 'medium',
        estimatedSavings: '10-20%'
      });
    }

    // Suggest priority optimization
    const categories = [...new Set(clusters.map(c => c.characteristics?.category))];
    if (categories.length > 3) {
      suggestions.push({
        type: 'priority_optimization',
        title: 'Diverse Content Categories',
        description: 'Multiple content categories detected. Consider prioritizing by business value or urgency.',
        impact: 'low',
        recommendation: 'category_based_priority'
      });
    }

    return suggestions;
  }

  /**
   * Calculate estimated cost savings from optimization
   * @param {Array} clusters - Content clusters
   * @returns {number} Estimated cost savings percentage
   */
  calculateCostSavings(clusters) {
    let savings = 0;

    // Savings from similar content processing
    const similarClusters = clusters.filter(c => c.requests.length > 1);
    const similarRequests = similarClusters.reduce((sum, c) => sum + c.requests.length, 0);
    const totalRequests = clusters.reduce((sum, c) => sum + c.requests.length, 0);

    if (similarRequests > 0) {
      // Assume 5% savings per similar request due to caching and optimization
      savings += (similarRequests / totalRequests) * 5;
    }

    // Savings from batch processing efficiency
    if (totalRequests > 10) {
      savings += Math.min(15, totalRequests * 0.5); // Up to 15% savings for large batches
    }

    // Savings from complexity-based optimization
    const complexClusters = clusters.filter(c => c.characteristics?.estimatedComplexity === 'high');
    if (complexClusters.length > 0) {
      savings += 5; // 5% savings from better resource allocation
    }

    return Math.min(30, Math.round(savings)); // Cap at 30% savings
  }

  /**
   * Recommend optimal batching strategy
   * @param {Array} clusters - Content clusters
   * @returns {Array} Batching recommendations
   */
  recommendBatchingStrategy(clusters) {
    const recommendations = [];
    const totalRequests = clusters.reduce((sum, c) => sum + c.requests.length, 0);

    // Group by complexity and category
    const complexityGroups = {
      high: clusters.filter(c => c.characteristics?.estimatedComplexity === 'high'),
      medium: clusters.filter(c => c.characteristics?.estimatedComplexity === 'medium'),
      low: clusters.filter(c => c.characteristics?.estimatedComplexity === 'low')
    };

    // Recommend processing order
    if (complexityGroups.high.length > 0) {
      recommendations.push({
        type: 'processing_order',
        priority: 1,
        title: 'Process High Complexity First',
        description: 'Process complex requests first when resources are fresh',
        clusters: complexityGroups.high.map(c => c.id),
        processingStrategy: 'sequential',
        estimatedTime: this.estimateProcessingTime(complexityGroups.high)
      });
    }

    if (complexityGroups.medium.length > 0) {
      recommendations.push({
        type: 'processing_order',
        priority: 2,
        title: 'Batch Medium Complexity',
        description: 'Process medium complexity requests in small parallel batches',
        clusters: complexityGroups.medium.map(c => c.id),
        processingStrategy: 'parallel',
        maxConcurrency: 3,
        estimatedTime: this.estimateProcessingTime(complexityGroups.medium)
      });
    }

    if (complexityGroups.low.length > 0) {
      recommendations.push({
        type: 'processing_order',
        priority: 3,
        title: 'Parallel Process Simple Requests',
        description: 'Process simple requests in parallel for maximum efficiency',
        clusters: complexityGroups.low.map(c => c.id),
        processingStrategy: 'parallel',
        maxConcurrency: 5,
        estimatedTime: this.estimateProcessingTime(complexityGroups.low)
      });
    }

    // Recommend optimal batch sizes
    if (totalRequests > this.maxBatchSize) {
      const numBatches = Math.ceil(totalRequests / this.maxBatchSize);
      recommendations.push({
        type: 'batch_splitting',
        title: 'Split Large Batch',
        description: `Split into ${numBatches} smaller batches for better resource management`,
        recommendedBatchSize: this.maxBatchSize,
        totalBatches: numBatches
      });
    }

    return recommendations;
  }

  /**
   * Estimate processing time for clusters
   * @param {Array} clusters - Clusters to estimate
   * @returns {number} Estimated time in minutes
   */
  estimateProcessingTime(clusters) {
    const totalRequests = clusters.reduce((sum, c) => sum + c.requests.length, 0);
    const avgComplexity = clusters.reduce((sum, c) => {
      const complexity = c.characteristics?.estimatedComplexity;
      return sum + (complexity === 'high' ? 3 : complexity === 'medium' ? 2 : 1);
    }, 0) / clusters.length;

    // Base time: 5 minutes per request, adjusted by complexity
    return Math.round(totalRequests * 5 * avgComplexity);
  }

  /**
   * Apply intelligent scheduling based on system load and cost optimization
   * @param {Object} batchData - Batch data
   * @returns {Object} Optimized scheduling recommendation
   */
  async optimizeScheduling(batchData) {
    const { requests, priority = 5, scheduledFor } = batchData;
    
    // Get current system load
    const systemLoad = await this.getCurrentSystemLoad();
    
    // Analyze optimal scheduling time
    const recommendation = {
      originalSchedule: scheduledFor,
      optimizedSchedule: null,
      reasoning: [],
      estimatedCostSavings: 0,
      estimatedTimeReduction: 0
    };

    // If no specific schedule requested, recommend optimal time
    if (!scheduledFor) {
      const optimalTime = this.findOptimalProcessingTime(requests.length, priority);
      recommendation.optimizedSchedule = optimalTime;
      recommendation.reasoning.push('Scheduled for optimal resource availability');
      recommendation.estimatedCostSavings = 15;
    }

    // Check if current schedule can be optimized
    if (scheduledFor) {
      const scheduledTime = new Date(scheduledFor);
      const optimalTime = this.findOptimalProcessingTime(requests.length, priority);
      
      if (Math.abs(scheduledTime - optimalTime) > 60 * 60 * 1000) { // More than 1 hour difference
        recommendation.optimizedSchedule = optimalTime;
        recommendation.reasoning.push('Rescheduled to off-peak hours for cost savings');
        recommendation.estimatedCostSavings = 20;
      }
    }

    // Consider system load
    if (systemLoad.cpuUsage > 80 || systemLoad.queueLength > 50) {
      const delayTime = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes delay
      recommendation.optimizedSchedule = delayTime;
      recommendation.reasoning.push('Delayed due to high system load');
      recommendation.estimatedTimeReduction = 25;
    }

    return recommendation;
  }

  /**
   * Find optimal processing time based on historical data and system patterns
   * @param {number} requestCount - Number of requests
   * @param {number} priority - Priority level
   * @returns {Date} Optimal processing time
   */
  findOptimalProcessingTime(requestCount, priority) {
    const now = new Date();
    const currentHour = now.getHours();
    
    // Define off-peak hours (typically 2 AM - 6 AM local time)
    const offPeakStart = 2;
    const offPeakEnd = 6;
    
    // High priority requests should be processed immediately
    if (priority <= 2) {
      return now;
    }
    
    // For large batches, prefer off-peak hours
    if (requestCount > 20) {
      if (currentHour >= offPeakEnd && currentHour < offPeakStart + 12) {
        // Schedule for next off-peak period
        const nextOffPeak = new Date(now);
        nextOffPeak.setDate(nextOffPeak.getDate() + 1);
        nextOffPeak.setHours(offPeakStart, 0, 0, 0);
        return nextOffPeak;
      }
    }
    
    // For medium batches, schedule within next few hours if not peak time
    if (requestCount > 5 && (currentHour < 9 || currentHour > 17)) {
      return new Date(now.getTime() + 60 * 60 * 1000); // 1 hour delay
    }
    
    // Default: process immediately
    return now;
  }

  /**
   * Get current system load metrics
   * @returns {Object} System load information
   */
  async getCurrentSystemLoad() {
    // In a real implementation, this would query actual system metrics
    // For now, return mock data
    return {
      cpuUsage: Math.random() * 100,
      memoryUsage: Math.random() * 100,
      queueLength: Math.floor(Math.random() * 100),
      activeJobs: Math.floor(Math.random() * 20),
      timestamp: new Date()
    };
  }

  /**
   * Generate batch analytics and reporting
   * @param {string} batchId - Batch ID
   * @returns {Object} Detailed batch analytics
   */
  async generateBatchAnalytics(batchId) {
    const batch = await BatchOperation.findByBatchId(batchId);
    if (!batch) {
      throw new Error('Batch not found');
    }

    const operations = await UgcOperation.findAll({
      where: { batchId: batch.id },
      order: [['metadata', 'ASC']]
    });

    const analytics = {
      batchId: batch.batchId,
      name: batch.name,
      performance: this.analyzeBatchPerformance(batch, operations),
      costAnalysis: this.analyzeBatchCosts(batch, operations),
      efficiency: this.analyzeBatchEfficiency(batch, operations),
      recommendations: this.generatePerformanceRecommendations(batch, operations)
    };

    return analytics;
  }

  /**
   * Analyze batch performance metrics
   * @param {Object} batch - Batch object
   * @param {Array} operations - Operations array
   * @returns {Object} Performance analysis
   */
  analyzeBatchPerformance(batch, operations) {
    const totalTime = batch.getDuration();
    const avgTimePerOperation = totalTime ? totalTime / operations.length : null;
    
    const statusCounts = operations.reduce((counts, op) => {
      counts[op.status] = (counts[op.status] || 0) + 1;
      return counts;
    }, {});

    return {
      totalDuration: totalTime ? Math.round(totalTime / 1000) : null, // seconds
      averageTimePerOperation: avgTimePerOperation ? Math.round(avgTimePerOperation / 1000) : null,
      successRate: operations.length > 0 ? Math.round((statusCounts.completed || 0) / operations.length * 100) : 0,
      statusBreakdown: statusCounts,
      throughput: totalTime ? Math.round(operations.length / (totalTime / 1000 / 60)) : null // operations per minute
    };
  }

  /**
   * Analyze batch costs
   * @param {Object} batch - Batch object
   * @param {Array} operations - Operations array
   * @returns {Object} Cost analysis
   */
  analyzeBatchCosts(batch, operations) {
    // Mock cost calculation - in production, integrate with actual billing
    const baseCostPerOperation = 0.50; // $0.50 per operation
    const complexityMultiplier = {
      low: 1.0,
      medium: 1.5,
      high: 2.0
    };

    let totalCost = 0;
    const costBreakdown = {
      imageAnalysis: 0,
      scriptGeneration: 0,
      videoGeneration: 0
    };

    operations.forEach(op => {
      const complexity = op.metadata?.estimatedComplexity || 'medium';
      const operationCost = baseCostPerOperation * complexityMultiplier[complexity];
      
      totalCost += operationCost;
      costBreakdown.imageAnalysis += operationCost * 0.2;
      costBreakdown.scriptGeneration += operationCost * 0.3;
      costBreakdown.videoGeneration += operationCost * 0.5;
    });

    return {
      totalCost: Math.round(totalCost * 100) / 100,
      costPerOperation: Math.round((totalCost / operations.length) * 100) / 100,
      costBreakdown,
      estimatedSavings: batch.metadata?.estimatedCostSavings || 0
    };
  }

  /**
   * Analyze batch efficiency
   * @param {Object} batch - Batch object
   * @param {Array} operations - Operations array
   * @returns {Object} Efficiency analysis
   */
  analyzeBatchEfficiency(batch, operations) {
    const completedOps = operations.filter(op => op.status === 'completed');
    const failedOps = operations.filter(op => op.status === 'failed');
    
    return {
      completionRate: Math.round((completedOps.length / operations.length) * 100),
      failureRate: Math.round((failedOps.length / operations.length) * 100),
      resourceUtilization: this.calculateResourceUtilization(batch),
      parallelismEfficiency: this.calculateParallelismEfficiency(batch, operations),
      cacheHitRate: Math.random() * 100 // Mock data - would be real in production
    };
  }

  /**
   * Calculate resource utilization
   * @param {Object} batch - Batch object
   * @returns {number} Resource utilization percentage
   */
  calculateResourceUtilization(batch) {
    // Mock calculation - in production, use actual resource metrics
    const processingStrategy = batch.options?.processingStrategy || 'sequential';
    const baseUtilization = processingStrategy === 'parallel' ? 75 : 45;
    const priorityBonus = (10 - batch.priority) * 2; // Higher priority = better resources
    
    return Math.min(100, baseUtilization + priorityBonus + Math.random() * 10);
  }

  /**
   * Calculate parallelism efficiency
   * @param {Object} batch - Batch object
   * @param {Array} operations - Operations array
   * @returns {number} Parallelism efficiency percentage
   */
  calculateParallelismEfficiency(batch, operations) {
    const processingStrategy = batch.options?.processingStrategy || 'sequential';
    
    if (processingStrategy === 'sequential') {
      return 100; // Sequential is 100% efficient for its strategy
    }
    
    const maxConcurrency = batch.options?.maxConcurrency || 3;
    const actualConcurrency = Math.min(maxConcurrency, operations.length);
    const theoreticalSpeedup = actualConcurrency;
    const actualSpeedup = Math.random() * theoreticalSpeedup * 0.8 + theoreticalSpeedup * 0.2; // Mock
    
    return Math.round((actualSpeedup / theoreticalSpeedup) * 100);
  }

  /**
   * Generate performance recommendations
   * @param {Object} batch - Batch object
   * @param {Array} operations - Operations array
   * @returns {Array} Performance recommendations
   */
  generatePerformanceRecommendations(batch, operations) {
    const recommendations = [];
    const performance = this.analyzeBatchPerformance(batch, operations);
    const efficiency = this.analyzeBatchEfficiency(batch, operations);

    // Success rate recommendations
    if (performance.successRate < 90) {
      recommendations.push({
        type: 'reliability',
        priority: 'high',
        title: 'Improve Success Rate',
        description: `Success rate is ${performance.successRate}%. Consider adding retry logic or improving input validation.`,
        impact: 'high'
      });
    }

    // Efficiency recommendations
    if (efficiency.resourceUtilization < 60) {
      recommendations.push({
        type: 'efficiency',
        priority: 'medium',
        title: 'Optimize Resource Usage',
        description: 'Resource utilization is low. Consider increasing batch size or using parallel processing.',
        impact: 'medium'
      });
    }

    // Performance recommendations
    if (performance.throughput && performance.throughput < 2) {
      recommendations.push({
        type: 'performance',
        priority: 'medium',
        title: 'Improve Processing Speed',
        description: 'Processing throughput is low. Consider optimizing processing strategy or increasing resources.',
        impact: 'medium'
      });
    }

    // Cost optimization recommendations
    const avgCost = this.analyzeBatchCosts(batch, operations).costPerOperation;
    if (avgCost > 1.0) {
      recommendations.push({
        type: 'cost',
        priority: 'low',
        title: 'Reduce Processing Costs',
        description: 'Cost per operation is high. Consider scheduling during off-peak hours or optimizing content similarity.',
        impact: 'low'
      });
    }

    return recommendations;
  }
}

module.exports = new BatchOptimizationService();