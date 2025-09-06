const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ApiUsage = sequelize.define('ApiUsage', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    apiKeyId: {
      type: DataTypes.UUID,
      field: 'api_key_id',
      references: {
        model: 'api_keys',
        key: 'id'
      }
    },
    userId: {
      type: DataTypes.UUID,
      field: 'user_id',
      references: {
        model: 'users',
        key: 'id'
      }
    },
    endpoint: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    method: {
      type: DataTypes.STRING(10),
      allowNull: false,
      validate: {
        isIn: [['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD']]
      }
    },
    statusCode: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'status_code'
    },
    responseTime: {
      type: DataTypes.INTEGER,
      field: 'response_time',
      comment: 'Response time in milliseconds'
    },
    userAgent: {
      type: DataTypes.TEXT,
      field: 'user_agent'
    },
    ipAddress: {
      type: DataTypes.INET,
      field: 'ip_address'
    }
  }, {
    tableName: 'api_usage',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    indexes: [
      {
        fields: ['api_key_id']
      },
      {
        fields: ['user_id']
      },
      {
        fields: ['created_at']
      },
      {
        fields: ['endpoint', 'method']
      },
      {
        fields: ['status_code']
      }
    ]
  });

  ApiUsage.associate = (models) => {
    ApiUsage.belongsTo(models.ApiKey, {
      foreignKey: 'api_key_id',
      as: 'apiKey',
      onDelete: 'CASCADE'
    });
    
    ApiUsage.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user',
      onDelete: 'CASCADE'
    });
  };

  // Class methods
  ApiUsage.logRequest = function(data) {
    return this.create({
      apiKeyId: data.apiKeyId,
      userId: data.userId,
      endpoint: data.endpoint,
      method: data.method,
      statusCode: data.statusCode,
      responseTime: data.responseTime,
      userAgent: data.userAgent,
      ipAddress: data.ipAddress
    });
  };

  ApiUsage.getUsageStats = function(filters = {}) {
    const whereClause = {};
    
    if (filters.apiKeyId) whereClause.apiKeyId = filters.apiKeyId;
    if (filters.userId) whereClause.userId = filters.userId;
    if (filters.startDate) {
      whereClause.createdAt = whereClause.createdAt || {};
      whereClause.createdAt[sequelize.Sequelize.Op.gte] = filters.startDate;
    }
    if (filters.endDate) {
      whereClause.createdAt = whereClause.createdAt || {};
      whereClause.createdAt[sequelize.Sequelize.Op.lte] = filters.endDate;
    }

    return this.findAll({
      where: whereClause,
      attributes: [
        'endpoint',
        'method',
        [sequelize.fn('COUNT', '*'), 'requestCount'],
        [sequelize.fn('AVG', sequelize.col('response_time')), 'avgResponseTime'],
        [sequelize.fn('MIN', sequelize.col('created_at')), 'firstRequest'],
        [sequelize.fn('MAX', sequelize.col('created_at')), 'lastRequest']
      ],
      group: ['endpoint', 'method'],
      order: [[sequelize.fn('COUNT', '*'), 'DESC']]
    });
  };

  ApiUsage.getUsageByTimeRange = function(timeRange = '24h', filters = {}) {
    const whereClause = { ...filters };
    const now = new Date();
    
    switch (timeRange) {
      case '1h':
        whereClause.createdAt = { [sequelize.Sequelize.Op.gte]: new Date(now - 60 * 60 * 1000) };
        break;
      case '24h':
        whereClause.createdAt = { [sequelize.Sequelize.Op.gte]: new Date(now - 24 * 60 * 60 * 1000) };
        break;
      case '7d':
        whereClause.createdAt = { [sequelize.Sequelize.Op.gte]: new Date(now - 7 * 24 * 60 * 60 * 1000) };
        break;
      case '30d':
        whereClause.createdAt = { [sequelize.Sequelize.Op.gte]: new Date(now - 30 * 24 * 60 * 60 * 1000) };
        break;
    }

    return this.count({ where: whereClause });
  };

  return ApiUsage;
};