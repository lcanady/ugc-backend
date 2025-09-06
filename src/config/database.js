const { Sequelize } = require('sequelize');
const config = require('../utils/config');

// Database configuration
const dbConfig = {
  host: config.DB_HOST || 'localhost',
  port: config.DB_PORT || 5432,
  database: config.DB_NAME || 'ugc_db',
  username: config.DB_USER || 'ugc_user',
  password: config.DB_PASSWORD || 'ugc_password',
  dialect: 'postgres',
  logging: config.NODE_ENV === 'development' ? console.log : false,
  pool: {
    max: parseInt(config.DB_POOL_MAX) || 20,
    min: parseInt(config.DB_POOL_MIN) || 0,
    acquire: parseInt(config.DB_POOL_ACQUIRE) || 30000,
    idle: parseInt(config.DB_POOL_IDLE) || 10000,
  },
  dialectOptions: {
    ssl: config.DB_SSL === 'true' ? {
      require: true,
      rejectUnauthorized: false
    } : false
  }
};

// Create Sequelize instance
let sequelize;

if (config.DATABASE_URL) {
  // Use DATABASE_URL if provided (for production/cloud deployments)
  sequelize = new Sequelize(config.DATABASE_URL, {
    dialect: 'postgres',
    logging: dbConfig.logging,
    pool: dbConfig.pool,
    dialectOptions: dbConfig.dialectOptions
  });
} else {
  // Use individual config values
  sequelize = new Sequelize(
    dbConfig.database,
    dbConfig.username,
    dbConfig.password,
    dbConfig
  );
}

// Test database connection
const testConnection = async () => {
  try {
    await sequelize.authenticate();
    console.log('Database connection established successfully.');
    return true;
  } catch (error) {
    console.error('Unable to connect to the database:', error.message);
    return false;
  }
};

// Sync database models
const syncDatabase = async (force = false) => {
  try {
    await sequelize.sync({ force });
    console.log('Database synchronized successfully.');
    return true;
  } catch (error) {
    console.error('Database synchronization failed:', error.message);
    return false;
  }
};

module.exports = {
  sequelize,
  testConnection,
  syncDatabase,
  Sequelize
};