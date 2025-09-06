const operationService = require('../../../src/services/operationService');
const models = require('../../../src/models');
const databaseService = require('../../../src/services/databaseService');

describe('Operation Service', () => {
  beforeAll(async () => {
    // Load test environment
    require('dotenv').config({ path: '.env.test' });
    
    // Initialize database for testing
    await databaseService.initialize(false);
  });

  afterAll(async () => {
    await databaseService.close();
  });

  beforeEach(async () => {
    // Clean up test data before each test
    await models.UgcOperation.destroy({ where: {}, force: true });
    await models.ApiUsage.destroy({ where: {}, force: true });
    await models.RefreshToken.destroy({ where: {}, force: true });
    await models.ApiKey.destroy({ where: {}, force: true });
    await models.User.destroy({ where: {}, force: true });
  });

  describe('createOperation', () => {
    test('should create a new operation successfully', async () => {
      const user = await models.User.create({
        email: 'test@example.com',
        name: 'Test User',
        provider: 'local',
        providerId: 'test-123'
      });

      const apiKey = await models.ApiKey.create({
        keyHash: 'test-key-hash',
        name: 'Test Key',
        permissions: ['ugc:generate'],
        createdBy: user.id
      });

      const operation = await operationService.createOperation({
        creativeBrief: 'Test creative brief',
        apiKeyId: apiKey.id,
        userId: user.id,
        metadata: { test: true }
      });

      expect(operation.operationId).toBeDefined();
      expect(operation.operationId).toMatch(/^op_[a-f0-9]{16}$/);
      expect(operation.status).toBe('pending');
      expect(operation.creativeBrief).toBe('Test creative brief');
      expect(operation.apiKeyId).toBe(apiKey.id);
      expect(operation.userId).toBe(user.id);
      expect(operation.metadata.test).toBe(true);
    });

    test('should create operation without user ID', async () => {
      const user = await models.User.create({
        email: 'test@example.com',
        name: 'Test User',
        provider: 'local',
        providerId: 'test-123'
      });

      const apiKey = await models.ApiKey.create({
        keyHash: 'test-key-hash',
        name: 'Test Key',
        permissions: ['ugc:generate'],
        createdBy: user.id
      });

      const operation = await operationService.createOperation({
        creativeBrief: 'Test creative brief',
        apiKeyId: apiKey.id,
        metadata: { anonymous: true }
      });

      expect(operation.operationId).toBeDefined();
      expect(operation.status).toBe('pending');
      expect(operation.userId).toBeNull();
      expect(operation.apiKeyId).toBe(apiKey.id);
    });
  });

  describe('updateOperationStatus', () => {
    let operation;

    beforeEach(async () => {
      const user = await models.User.create({
        email: 'test@example.com',
        name: 'Test User',
        provider: 'local',
        providerId: 'test-123'
      });

      operation = await operationService.createOperation({
        creativeBrief: 'Test creative brief',
        userId: user.id
      });
    });

    test('should update operation status to processing', async () => {
      const updated = await operationService.updateOperationStatus(
        operation.operationId, 
        'processing'
      );

      expect(updated.status).toBe('processing');
      expect(updated.completedAt).toBeNull();
    });

    test('should update operation status to completed', async () => {
      const updated = await operationService.updateOperationStatus(
        operation.operationId, 
        'completed',
        {
          scriptContent: { 'segment-1': 'Test script', 'segment-2': 'Test script 2' },
          videoUrls: ['http://example.com/video1.mp4'],
          metadata: { duration: 15000 }
        }
      );

      expect(updated.status).toBe('completed');
      expect(updated.completedAt).toBeDefined();
      expect(updated.scriptContent).toEqual({ 'segment-1': 'Test script', 'segment-2': 'Test script 2' });
      expect(updated.videoUrls).toEqual(['http://example.com/video1.mp4']);
    });

    test('should update operation status to failed with error message', async () => {
      const updated = await operationService.updateOperationStatus(
        operation.operationId, 
        'failed',
        { errorMessage: 'Test error message' }
      );

      expect(updated.status).toBe('failed');
      expect(updated.errorMessage).toBe('Test error message');
      expect(updated.completedAt).toBeDefined();
    });

    test('should throw error for non-existent operation', async () => {
      await expect(
        operationService.updateOperationStatus('op_nonexistent123456', 'completed')
      ).rejects.toThrow('Operation not found');
    });
  });

  describe('getOperation', () => {
    test('should retrieve operation by ID', async () => {
      const user = await models.User.create({
        email: 'test@example.com',
        name: 'Test User',
        provider: 'local',
        providerId: 'test-123'
      });

      const created = await operationService.createOperation({
        creativeBrief: 'Test creative brief',
        userId: user.id
      });

      const retrieved = await operationService.getOperation(created.operationId);

      expect(retrieved).toBeTruthy();
      expect(retrieved.operationId).toBe(created.operationId);
      expect(retrieved.creativeBrief).toBe('Test creative brief');
    });

    test('should return null for non-existent operation', async () => {
      const retrieved = await operationService.getOperation('op_nonexistent123456');
      expect(retrieved).toBeNull();
    });
  });

  describe('getUserOperations', () => {
    let user;

    beforeEach(async () => {
      user = await models.User.create({
        email: 'test@example.com',
        name: 'Test User',
        provider: 'local',
        providerId: 'test-123'
      });

      // Create multiple operations
      await operationService.createOperation({
        creativeBrief: 'Brief 1',
        userId: user.id
      });

      await operationService.createOperation({
        creativeBrief: 'Brief 2',
        userId: user.id
      });

      const op3 = await operationService.createOperation({
        creativeBrief: 'Brief 3',
        userId: user.id
      });

      // Update one to completed
      await operationService.updateOperationStatus(op3.operationId, 'completed');
    });

    test('should get all operations for user', async () => {
      const operations = await operationService.getUserOperations(user.id);

      expect(operations).toHaveLength(3);
      expect(operations[0].userId).toBe(user.id);
      expect(operations[1].userId).toBe(user.id);
      expect(operations[2].userId).toBe(user.id);
    });

    test('should filter operations by status', async () => {
      const completedOps = await operationService.getUserOperations(user.id, {
        status: 'completed'
      });

      expect(completedOps).toHaveLength(1);
      expect(completedOps[0].status).toBe('completed');
    });

    test('should limit number of operations returned', async () => {
      const operations = await operationService.getUserOperations(user.id, {
        limit: 2
      });

      expect(operations).toHaveLength(2);
    });
  });

  describe('checkUserQuotas', () => {
    let user;

    beforeEach(async () => {
      user = await models.User.create({
        email: 'test@example.com',
        name: 'Test User',
        provider: 'local',
        providerId: 'test-123'
      });
    });

    test('should return quota status for user with no operations', async () => {
      const quotaStatus = await operationService.checkUserQuotas(user.id);

      expect(quotaStatus.daily.used).toBe(0);
      expect(quotaStatus.daily.limit).toBe(100);
      expect(quotaStatus.daily.remaining).toBe(100);
      expect(quotaStatus.daily.exceeded).toBe(false);

      expect(quotaStatus.monthly.used).toBe(0);
      expect(quotaStatus.monthly.limit).toBe(1000);
      expect(quotaStatus.monthly.remaining).toBe(1000);
      expect(quotaStatus.monthly.exceeded).toBe(false);

      expect(quotaStatus.concurrent.used).toBe(0);
      expect(quotaStatus.concurrent.limit).toBe(5);
      expect(quotaStatus.concurrent.remaining).toBe(5);
      expect(quotaStatus.concurrent.exceeded).toBe(false);
    });

    test('should count daily operations correctly', async () => {
      // Create operations today
      await operationService.createOperation({
        creativeBrief: 'Brief 1',
        userId: user.id
      });

      await operationService.createOperation({
        creativeBrief: 'Brief 2',
        userId: user.id
      });

      const quotaStatus = await operationService.checkUserQuotas(user.id);

      expect(quotaStatus.daily.used).toBe(2);
      expect(quotaStatus.daily.remaining).toBe(98);
      expect(quotaStatus.monthly.used).toBe(2);
    });

    test('should detect quota exceeded', async () => {
      const quotaStatus = await operationService.checkUserQuotas(user.id, {
        dailyLimit: 1
      });

      // Create operation to exceed quota
      await operationService.createOperation({
        creativeBrief: 'Brief 1',
        userId: user.id
      });

      const updatedQuotaStatus = await operationService.checkUserQuotas(user.id, {
        dailyLimit: 1
      });

      expect(updatedQuotaStatus.daily.exceeded).toBe(true);
      expect(updatedQuotaStatus.daily.remaining).toBe(0);
    });
  });

  describe('addWorkflowStep', () => {
    let operation;

    beforeEach(async () => {
      const user = await models.User.create({
        email: 'test@example.com',
        name: 'Test User',
        provider: 'local',
        providerId: 'test-123'
      });

      operation = await operationService.createOperation({
        creativeBrief: 'Test creative brief',
        userId: user.id
      });
    });

    test('should add workflow step to operation', async () => {
      await operationService.addWorkflowStep(operation.operationId, {
        step: 'image_analysis',
        status: 'started'
      });

      const updated = await operationService.getOperation(operation.operationId);
      
      expect(updated.metadata.workflow).toBeDefined();
      expect(updated.metadata.workflow.steps).toHaveLength(1);
      expect(updated.metadata.workflow.steps[0].step).toBe('image_analysis');
      expect(updated.metadata.workflow.steps[0].status).toBe('started');
      expect(updated.metadata.workflow.steps[0].timestamp).toBeDefined();
    });

    test('should add multiple workflow steps', async () => {
      await operationService.addWorkflowStep(operation.operationId, {
        step: 'image_analysis',
        status: 'started'
      });

      await operationService.addWorkflowStep(operation.operationId, {
        step: 'image_analysis',
        status: 'completed',
        result: { analyzedImages: 2 }
      });

      const updated = await operationService.getOperation(operation.operationId);
      
      expect(updated.metadata.workflow.steps).toHaveLength(2);
      expect(updated.metadata.workflow.steps[1].result.analyzedImages).toBe(2);
    });
  });

  describe('getOperationStats', () => {
    let user;

    beforeEach(async () => {
      user = await models.User.create({
        email: 'test@example.com',
        name: 'Test User',
        provider: 'local',
        providerId: 'test-123'
      });

      // Create operations with different statuses
      const op1 = await operationService.createOperation({
        creativeBrief: 'Brief 1',
        userId: user.id
      });

      const op2 = await operationService.createOperation({
        creativeBrief: 'Brief 2',
        userId: user.id
      });

      const op3 = await operationService.createOperation({
        creativeBrief: 'Brief 3',
        userId: user.id
      });

      // Update statuses
      await operationService.updateOperationStatus(op1.operationId, 'completed');
      await operationService.updateOperationStatus(op2.operationId, 'completed');
      await operationService.updateOperationStatus(op3.operationId, 'failed');
    });

    test('should get operation statistics', async () => {
      const stats = await operationService.getOperationStats();

      expect(stats.totalOperations).toBe(3);
      expect(stats.byStatus.completed.count).toBe(2);
      expect(stats.byStatus.failed.count).toBe(1);
    });

    test('should filter statistics by user', async () => {
      const stats = await operationService.getOperationStats({ userId: user.id });

      expect(stats.totalOperations).toBe(3);
    });
  });
});