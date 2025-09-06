const jobStatusService = require('../../../src/services/jobStatusService');
const jobManager = require('../../../src/jobs/jobManager');
const operationService = require('../../../src/services/operationService');

// Mock dependencies
jest.mock('../../../src/jobs/jobManager');
jest.mock('../../../src/services/operationService');

// Mock fetch for webhook testing
global.fetch = jest.fn();

describe('JobStatusService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jobStatusService.webhookEndpoints.clear();
    jobStatusService.pollingIntervals.clear();
  });

  describe('registerWebhook', () => {
    it('should register a webhook endpoint', () => {
      const operationId = 'test-operation-id';
      const webhookUrl = 'https://example.com/webhook';
      const options = {
        secret: 'test-secret',
        events: ['completed', 'failed'],
        retries: 3,
        timeout: 10000
      };

      jobStatusService.registerWebhook(operationId, webhookUrl, options);

      const webhook = jobStatusService.webhookEndpoints.get(operationId);
      expect(webhook).toBeDefined();
      expect(webhook.url).toBe(webhookUrl);
      expect(webhook.secret).toBe(options.secret);
      expect(webhook.events).toEqual(options.events);
      expect(webhook.retries).toBe(options.retries);
      expect(webhook.timeout).toBe(options.timeout);
      expect(webhook.registeredAt).toBeInstanceOf(Date);
    });

    it('should use default options when not provided', () => {
      const operationId = 'test-operation-id';
      const webhookUrl = 'https://example.com/webhook';

      jobStatusService.registerWebhook(operationId, webhookUrl);

      const webhook = jobStatusService.webhookEndpoints.get(operationId);
      expect(webhook.events).toEqual(['completed', 'failed']);
      expect(webhook.retries).toBe(3);
      expect(webhook.timeout).toBe(10000);
    });
  });

  describe('unregisterWebhook', () => {
    it('should remove webhook registration', () => {
      const operationId = 'test-operation-id';
      const webhookUrl = 'https://example.com/webhook';

      jobStatusService.registerWebhook(operationId, webhookUrl);
      expect(jobStatusService.webhookEndpoints.has(operationId)).toBe(true);

      jobStatusService.unregisterWebhook(operationId);
      expect(jobStatusService.webhookEndpoints.has(operationId)).toBe(false);
    });
  });

  describe('getJobStatus', () => {
    it('should return enhanced job status', async () => {
      const operationId = 'test-operation-id';
      const mockOperation = {
        operationId,
        status: 'processing',
        creativeBrief: 'Test brief',
        scriptContent: { segments: { 'segment-1': 'Test script' } },
        videoUrls: [],
        errorMessage: null,
        metadata: { videoJobId: 'job-123' },
        created_at: new Date(),
        updated_at: new Date(),
        completedAt: null
      };

      const mockJobStatus = {
        id: 'job-123',
        progress: 50,
        processedOn: Date.now() - 30000, // 30 seconds ago
        finishedOn: null,
        failedReason: null
      };

      operationService.getOperation.mockResolvedValue(mockOperation);
      jobManager.getJobStatus.mockResolvedValue(mockJobStatus);

      const result = await jobStatusService.getJobStatus(operationId);

      expect(result).toBeDefined();
      expect(result.operationId).toBe(operationId);
      expect(result.status).toBe('processing');
      expect(result.progress).toBeGreaterThan(0);
      expect(result.stage).toBe('video_generation');
      expect(result.jobDetails).toBeDefined();
      expect(result.jobDetails.jobId).toBe('job-123');
      expect(result.jobDetails.jobProgress).toBe(50);
    });

    it('should return null for non-existent operation', async () => {
      operationService.getOperation.mockResolvedValue(null);

      const result = await jobStatusService.getJobStatus('non-existent');

      expect(result).toBeNull();
    });

    it('should handle job status retrieval errors gracefully', async () => {
      const operationId = 'test-operation-id';
      const mockOperation = {
        operationId,
        status: 'processing',
        metadata: { videoJobId: 'job-123' },
        created_at: new Date(),
        updated_at: new Date()
      };

      operationService.getOperation.mockResolvedValue(mockOperation);
      jobManager.getJobStatus.mockRejectedValue(new Error('Job not found'));

      const result = await jobStatusService.getJobStatus(operationId);

      expect(result).toBeDefined();
      expect(result.jobDetails).toBeNull();
    });
  });

  describe('calculateOverallProgress', () => {
    it('should return 100 for completed operations', () => {
      const operation = { status: 'completed' };
      const progress = jobStatusService.calculateOverallProgress(operation, null);
      expect(progress).toBe(100);
    });

    it('should return 0 for failed operations', () => {
      const operation = { status: 'failed' };
      const progress = jobStatusService.calculateOverallProgress(operation, null);
      expect(progress).toBe(0);
    });

    it('should calculate progress based on script completion and job progress', () => {
      const operation = { 
        status: 'processing', 
        scriptContent: { segments: {} } 
      };
      const jobStatus = { progress: 50 };
      
      const progress = jobStatusService.calculateOverallProgress(operation, jobStatus);
      expect(progress).toBe(65); // 30% for script + 35% for half video progress
    });

    it('should return base progress for processing without job progress', () => {
      const operation = { 
        status: 'processing', 
        scriptContent: { segments: {} } 
      };
      
      const progress = jobStatusService.calculateOverallProgress(operation, null);
      expect(progress).toBe(35); // 30% for script + 5% for queued
    });
  });

  describe('getCurrentStage', () => {
    it('should return completed for completed operations', () => {
      const operation = { status: 'completed' };
      const stage = jobStatusService.getCurrentStage(operation, null);
      expect(stage).toBe('completed');
    });

    it('should return failed for failed operations', () => {
      const operation = { status: 'failed' };
      const stage = jobStatusService.getCurrentStage(operation, null);
      expect(stage).toBe('failed');
    });

    it('should return script_generation when no script content', () => {
      const operation = { status: 'processing', scriptContent: null };
      const stage = jobStatusService.getCurrentStage(operation, null);
      expect(stage).toBe('script_generation');
    });

    it('should return video_generation when job is processing', () => {
      const operation = { 
        status: 'processing', 
        scriptContent: { segments: {} } 
      };
      const jobStatus = { processedOn: Date.now(), finishedOn: null };
      
      const stage = jobStatusService.getCurrentStage(operation, jobStatus);
      expect(stage).toBe('video_generation');
    });

    it('should return queued when job is not yet processed', () => {
      const operation = { 
        status: 'processing', 
        scriptContent: { segments: {} } 
      };
      const jobStatus = { processedOn: null };
      
      const stage = jobStatusService.getCurrentStage(operation, jobStatus);
      expect(stage).toBe('queued');
    });
  });

  describe('sendWebhookNotification', () => {
    beforeEach(() => {
      fetch.mockClear();
    });

    it('should send webhook notification successfully', async () => {
      const operationId = 'test-operation-id';
      const webhookUrl = 'https://example.com/webhook';
      
      jobStatusService.registerWebhook(operationId, webhookUrl, {
        events: ['completed']
      });

      fetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK'
      });

      await jobStatusService.sendWebhookNotification(operationId, 'completed', {
        videoUrl: 'https://example.com/video.mp4'
      });

      expect(fetch).toHaveBeenCalledWith(
        webhookUrl,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'User-Agent': 'UGC-Ad-Creator-Webhook/1.0'
          }),
          body: expect.stringContaining(operationId)
        })
      );
    });

    it('should not send notification for unregistered webhooks', async () => {
      await jobStatusService.sendWebhookNotification('unregistered-operation', 'completed', {});
      expect(fetch).not.toHaveBeenCalled();
    });

    it('should not send notification for filtered events', async () => {
      const operationId = 'test-operation-id';
      const webhookUrl = 'https://example.com/webhook';
      
      jobStatusService.registerWebhook(operationId, webhookUrl, {
        events: ['completed'] // Only completed events
      });

      await jobStatusService.sendWebhookNotification(operationId, 'failed', {});
      expect(fetch).not.toHaveBeenCalled();
    });

    it('should retry failed webhook notifications', async () => {
      const operationId = 'test-operation-id';
      const webhookUrl = 'https://example.com/webhook';
      
      jobStatusService.registerWebhook(operationId, webhookUrl, {
        events: ['completed'],
        retries: 2
      });

      // First two attempts fail, third succeeds
      fetch
        .mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Internal Server Error' })
        .mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Internal Server Error' })
        .mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK' });

      await jobStatusService.sendWebhookNotification(operationId, 'completed', {});

      expect(fetch).toHaveBeenCalledTimes(3);
    });

    it('should include webhook signature when secret is provided', async () => {
      const operationId = 'test-operation-id';
      const webhookUrl = 'https://example.com/webhook';
      const secret = 'test-secret';
      
      jobStatusService.registerWebhook(operationId, webhookUrl, {
        events: ['completed'],
        secret
      });

      fetch.mockResolvedValue({ ok: true, status: 200, statusText: 'OK' });

      await jobStatusService.sendWebhookNotification(operationId, 'completed', {});

      expect(fetch).toHaveBeenCalledWith(
        webhookUrl,
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Webhook-Signature': expect.stringMatching(/^sha256=[a-f0-9]{64}$/)
          })
        })
      );
    });

    it('should unregister webhook after completion or failure', async () => {
      const operationId = 'test-operation-id';
      const webhookUrl = 'https://example.com/webhook';
      
      jobStatusService.registerWebhook(operationId, webhookUrl);
      expect(jobStatusService.webhookEndpoints.has(operationId)).toBe(true);

      fetch.mockResolvedValue({ ok: true, status: 200, statusText: 'OK' });

      await jobStatusService.sendWebhookNotification(operationId, 'completed', {});
      expect(jobStatusService.webhookEndpoints.has(operationId)).toBe(false);
    });
  });

  describe('generateWebhookSignature', () => {
    it('should generate consistent HMAC signature', () => {
      const payload = { test: 'data' };
      const secret = 'test-secret';

      const signature1 = jobStatusService.generateWebhookSignature(payload, secret);
      const signature2 = jobStatusService.generateWebhookSignature(payload, secret);

      expect(signature1).toBe(signature2);
      expect(signature1).toMatch(/^sha256=[a-f0-9]{64}$/);
    });

    it('should generate different signatures for different payloads', () => {
      const payload1 = { test: 'data1' };
      const payload2 = { test: 'data2' };
      const secret = 'test-secret';

      const signature1 = jobStatusService.generateWebhookSignature(payload1, secret);
      const signature2 = jobStatusService.generateWebhookSignature(payload2, secret);

      expect(signature1).not.toBe(signature2);
    });
  });

  describe('startPolling and stopPolling', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should start polling for job status', () => {
      const operationId = 'test-operation-id';
      const callback = jest.fn();

      jobStatusService.startPolling(operationId, callback, 1000);

      expect(jobStatusService.pollingIntervals.has(operationId)).toBe(true);
    });

    it('should stop polling when job completes', async () => {
      const operationId = 'test-operation-id';
      const callback = jest.fn();

      const mockStatus = { status: 'completed' };
      jest.spyOn(jobStatusService, 'getJobStatus').mockResolvedValue(mockStatus);

      jobStatusService.startPolling(operationId, callback, 1000);

      // Advance timer to trigger polling
      jest.advanceTimersByTime(1000);
      await Promise.resolve(); // Wait for async operations

      expect(callback).toHaveBeenCalledWith(null, mockStatus);
      expect(jobStatusService.pollingIntervals.has(operationId)).toBe(false);
    });

    it('should stop polling manually', () => {
      const operationId = 'test-operation-id';
      const callback = jest.fn();

      jobStatusService.startPolling(operationId, callback, 1000);
      expect(jobStatusService.pollingIntervals.has(operationId)).toBe(true);

      jobStatusService.stopPolling(operationId);
      expect(jobStatusService.pollingIntervals.has(operationId)).toBe(false);
    });

    it('should handle polling errors', async () => {
      const operationId = 'test-operation-id';
      const callback = jest.fn();
      const error = new Error('Polling error');

      jest.spyOn(jobStatusService, 'getJobStatus').mockRejectedValue(error);

      jobStatusService.startPolling(operationId, callback, 1000);

      // Advance timer to trigger polling
      jest.advanceTimersByTime(1000);
      await Promise.resolve(); // Wait for async operations

      expect(callback).toHaveBeenCalledWith(error, null);
    });
  });

  describe('cleanup', () => {
    it('should remove expired webhooks', () => {
      const operationId = 'test-operation-id';
      const webhookUrl = 'https://example.com/webhook';

      // Register webhook with old timestamp
      jobStatusService.registerWebhook(operationId, webhookUrl);
      const webhook = jobStatusService.webhookEndpoints.get(operationId);
      webhook.registeredAt = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago

      expect(jobStatusService.webhookEndpoints.has(operationId)).toBe(true);

      jobStatusService.cleanup();

      expect(jobStatusService.webhookEndpoints.has(operationId)).toBe(false);
    });

    it('should keep recent webhooks', () => {
      const operationId = 'test-operation-id';
      const webhookUrl = 'https://example.com/webhook';

      jobStatusService.registerWebhook(operationId, webhookUrl);

      expect(jobStatusService.webhookEndpoints.has(operationId)).toBe(true);

      jobStatusService.cleanup();

      expect(jobStatusService.webhookEndpoints.has(operationId)).toBe(true);
    });
  });
});