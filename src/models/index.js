const { sequelize } = require('../config/database');

// Import all models
const User = require('./User');
const ApiKey = require('./ApiKey');
const RefreshToken = require('./RefreshToken');
const ApiUsage = require('./ApiUsage');
const UgcOperation = require('./UgcOperation');

// Initialize models
const models = {
  User: User(sequelize),
  ApiKey: ApiKey(sequelize),
  RefreshToken: RefreshToken(sequelize),
  ApiUsage: ApiUsage(sequelize),
  UgcOperation: UgcOperation(sequelize)
};

// Define associations
Object.keys(models).forEach(modelName => {
  if (models[modelName].associate) {
    models[modelName].associate(models);
  }
});

// Export models and sequelize instance
module.exports = {
  sequelize,
  ...models
};