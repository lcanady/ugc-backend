const { sequelize } = require('../../../src/config/database');
const models = require('../../../src/models');
const databaseService = require('../../../src/services/databaseService');

describe('Database Models', () => {
  beforeAll(async () => {
    // Load test environment
    require('dotenv').config({ path: '.env.test' });
    
    // Initialize database for testing
    await databaseService.initialize(false); // don't force sync, use existing tables
  });

  afterAll(async () => {
    await databaseService.close();
  });

  beforeEach(async () => {
    // Clean up test data before each test (in correct order due to foreign keys)
    await models.UgcOperation.destroy({ where: {}, force: true });
    await models.ApiUsage.destroy({ where: {}, force: true });
    await models.RefreshToken.destroy({ where: {}, force: true });
    await models.ApiKey.destroy({ where: {}, force: true });
    await models.User.destroy({ where: {}, force: true });
  });

  describe('User Model', () => {
    test('should create a user successfully', async () => {
      const userData = {
        email: 'test@example.com',
        name: 'Test User',
        provider: 'local',
        providerId: 'test-123',
        role: 'user',
        permissions: ['ugc:generate']
      };

      const user = await models.User.create(userData);
      
      expect(user.id).toBeDefined();
      expect(user.email).toBe(userData.email);
      expect(user.name).toBe(userData.name);
      expect(user.provider).toBe(userData.provider);
      expect(user.providerId).toBe(userData.providerId);
      expect(user.role).toBe(userData.role);
      expect(user.permissions).toEqual(userData.permissions);
      expect(user.isActive).toBe(true);
      expect(user.created_at).toBeDefined();
    });

    test('should find user by email', async () => {
      // Create a user first
      await models.User.create({
        email: 'findtest@example.com',
        name: 'Find Test User',
        provider: 'local',
        providerId: 'find-test-123',
        role: 'user',
        permissions: ['ugc:generate']
      });

      const user = await models.User.findByEmail('findtest@example.com');
      expect(user).toBeTruthy();
      expect(user.email).toBe('findtest@example.com');
    });

    test('should check user permissions', async () => {
      // Create a user first
      const createdUser = await models.User.create({
        email: 'permtest@example.com',
        name: 'Permission Test User',
        provider: 'local',
        providerId: 'perm-test-123',
        role: 'user',
        permissions: ['ugc:generate']
      });

      expect(createdUser.hasPermission('ugc:generate')).toBe(true);
      expect(createdUser.hasPermission('admin:delete')).toBe(false);
    });

    test('should validate email format', async () => {
      const userData = {
        email: 'invalid-email',
        name: 'Test User',
        provider: 'local',
        providerId: 'test-456'
      };

      await expect(models.User.create(userData)).rejects.toThrow();
    });
  });

  describe('ApiKey Model', () => {
    let testUser;

    beforeEach(async () => {
      testUser = await models.User.create({
        email: 'apikey-test@example.com',
        name: 'API Key Test User',
        provider: 'local',
        providerId: 'apikey-test-123',
        role: 'user'
      });
    });

    test('should create an API key successfully', async () => {
      const keyData = {
        keyHash: 'hashed-key-123',
        name: 'Test API Key',
        description: 'Test key for unit tests',
        permissions: ['ugc:generate', 'cache:read'],
        rateLimit: { default: { windowMs: 900000, maxRequests: 100 } },
        createdBy: testUser.id
      };

      const apiKey = await models.ApiKey.create(keyData);
      
      expect(apiKey.id).toBeDefined();
      expect(apiKey.keyHash).toBe(keyData.keyHash);
      expect(apiKey.name).toBe(keyData.name);
      expect(apiKey.permissions).toEqual(keyData.permissions);
      expect(apiKey.isActive).toBe(true);
    });

    test('should check API key permissions', async () => {
      const apiKey = await models.ApiKey.create({
        keyHash: 'hashed-key-456',
        name: 'Permission Test Key',
        permissions: ['ugc:generate'],
        createdBy: testUser.id
      });

      expect(apiKey.hasPermission('ugc:generate')).toBe(true);
      expect(apiKey.hasPermission('cache:write')).toBe(false);
    });

    test('should find API key by hash', async () => {
      const keyHash = 'hashed-key-789';
      await models.ApiKey.create({
        keyHash,
        name: 'Find Test Key',
        permissions: ['ugc:generate'],
        createdBy: testUser.id
      });

      const foundKey = await models.ApiKey.findByHash(keyHash);
      expect(foundKey).toBeTruthy();
      expect(foundKey.keyHash).toBe(keyHash);
    });
  });

  describe('UgcOperation Model', () => {
    let testUser, testApiKey;

    beforeEach(async () => {
      testUser = await models.User.create({
        email: 'ugc-test@example.com',
        name: 'UGC Test User',
        provider: 'local',
        providerId: 'ugc-test-123'
      });

      testApiKey = await models.ApiKey.create({
        keyHash: 'ugc-key-hash',
        name: 'UGC Test Key',
        permissions: ['ugc:generate'],
        createdBy: testUser.id
      });
    });

    test('should create a UGC operation successfully', async () => {
      const operationData = {
        operationId: 'op_test_123',
        apiKeyId: testApiKey.id,
        userId: testUser.id,
        status: 'pending',
        creativeBrief: 'Test creative brief for unit test',
        metadata: { test: true }
      };

      const operation = await models.UgcOperation.create(operationData);
      
      expect(operation.id).toBeDefined();
      expect(operation.operationId).toBe(operationData.operationId);
      expect(operation.status).toBe('pending');
      expect(operation.creativeBrief).toBe(operationData.creativeBrief);
      expect(operation.metadata).toEqual(operationData.metadata);
    });

    test('should update operation status', async () => {
      const operation = await models.UgcOperation.create({
        operationId: 'op_status_test',
        apiKeyId: testApiKey.id,
        userId: testUser.id,
        status: 'pending'
      });

      await operation.updateStatus('completed');
      
      expect(operation.status).toBe('completed');
      expect(operation.completedAt).toBeDefined();
    });

    test('should find operation by operation ID', async () => {
      const operationId = 'op_find_test';
      await models.UgcOperation.create({
        operationId,
        apiKeyId: testApiKey.id,
        userId: testUser.id,
        status: 'processing'
      });

      const foundOperation = await models.UgcOperation.findByOperationId(operationId);
      expect(foundOperation).toBeTruthy();
      expect(foundOperation.operationId).toBe(operationId);
    });

    test('should check if operation is completed', async () => {
      const pendingOp = await models.UgcOperation.create({
        operationId: 'op_pending',
        apiKeyId: testApiKey.id,
        status: 'pending'
      });

      const completedOp = await models.UgcOperation.create({
        operationId: 'op_completed',
        apiKeyId: testApiKey.id,
        status: 'completed'
      });

      expect(pendingOp.isCompleted()).toBe(false);
      expect(completedOp.isCompleted()).toBe(true);
    });
  });

  describe('Database Service', () => {
    test('should check database health', async () => {
      const health = await databaseService.checkHealth();
      expect(health.status).toBe('healthy');
      expect(health.connection).toBe('active');
      expect(health.pool).toBeDefined();
    });

    test('should get database statistics', async () => {
      const stats = await databaseService.getStatistics();
      expect(stats).toBeDefined();
      expect(typeof stats.userCount).toBe('number');
      expect(typeof stats.apikeyCount).toBe('number');
      expect(typeof stats.ugcoperationCount).toBe('number');
    });

    test('should execute raw queries', async () => {
      const result = await databaseService.query('SELECT 1 as test');
      expect(result).toBeDefined();
      expect(result[0].test).toBe(1);
    });
  });

  describe('Model Associations', () => {
    let user, apiKey;

    beforeEach(async () => {
      user = await models.User.create({
        email: 'association-test@example.com',
        name: 'Association Test User',
        provider: 'local',
        providerId: 'assoc-test-123'
      });

      apiKey = await models.ApiKey.create({
        keyHash: 'assoc-key-hash',
        name: 'Association Test Key',
        permissions: ['ugc:generate'],
        createdBy: user.id
      });
    });

    test('should load user with API keys', async () => {
      const userWithKeys = await models.User.findByPk(user.id, {
        include: [{
          model: models.UgcOperation,
          as: 'ugcOperations'
        }]
      });

      expect(userWithKeys).toBeTruthy();
      expect(userWithKeys.ugcOperations).toBeDefined();
    });

    test('should load API key with creator', async () => {
      const keyWithCreator = await models.ApiKey.findByPk(apiKey.id, {
        include: [{
          model: models.User,
          as: 'creator'
        }]
      });

      expect(keyWithCreator).toBeTruthy();
      expect(keyWithCreator.creator).toBeTruthy();
      expect(keyWithCreator.creator.id).toBe(user.id);
    });
  });
});