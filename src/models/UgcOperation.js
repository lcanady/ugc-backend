const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const UgcOperation = sequelize.define('UgcOperation', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    operationId: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      field: 'operation_id'
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
    status: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'pending',
      validate: {
        isIn: [['pending', 'processing', 'completed', 'failed', 'cancelled']]
      }
    },
    creativeBrief: {
      type: DataTypes.TEXT,
      field: 'creative_brief'
    },
    scriptContent: {
      type: DataTypes.JSONB,
      field: 'script_content'
    },
    videoUrls: {
      type: DataTypes.JSONB,
      defaultValue: [],
      field: 'video_urls'
    },
    errorMessage: {
      type: DataTypes.TEXT,
      field: 'error_message'
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {}
    },
    completedAt: {
      type: DataTypes.DATE,
      field: 'completed_at'
    }
  }, {
    tableName: 'ugc_operations',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        unique: true,
        fields: ['operation_id']
      },
      {
        fields: ['status']
      },
      {
        fields: ['created_at']
      },
      {
        fields: ['api_key_id']
      },
      {
        fields: ['user_id']
      }
    ]
  });

  UgcOperation.associate = (models) => {
    UgcOperation.belongsTo(models.ApiKey, {
      foreignKey: 'api_key_id',
      as: 'apiKey',
      onDelete: 'SET NULL'
    });
    
    UgcOperation.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user',
      onDelete: 'SET NULL'
    });
  };

  // Instance methods
  UgcOperation.prototype.updateStatus = function(status, errorMessage = null) {
    this.status = status;
    if (errorMessage) this.errorMessage = errorMessage;
    if (status === 'completed' || status === 'failed') {
      this.completedAt = new Date();
    }
    return this.save();
  };

  UgcOperation.prototype.addVideoUrl = function(url) {
    if (!Array.isArray(this.videoUrls)) {
      this.videoUrls = [];
    }
    this.videoUrls.push(url);
    return this.save();
  };

  UgcOperation.prototype.setScript = function(script) {
    this.scriptContent = script;
    return this.save();
  };

  UgcOperation.prototype.addMetadata = function(key, value) {
    if (!this.metadata) this.metadata = {};
    this.metadata[key] = value;
    return this.save();
  };

  UgcOperation.prototype.getDuration = function() {
    if (!this.completedAt) return null;
    return this.completedAt - this.createdAt;
  };

  UgcOperation.prototype.isCompleted = function() {
    return ['completed', 'failed', 'cancelled'].includes(this.status);
  };

  // Class methods
  UgcOperation.findByOperationId = function(operationId) {
    return this.findOne({ 
      where: { operationId },
      include: [
        {
          model: sequelize.models.ApiKey,
          as: 'apiKey',
          attributes: ['id', 'name']
        },
        {
          model: sequelize.models.User,
          as: 'user',
          attributes: ['id', 'name', 'email']
        }
      ]
    });
  };

  UgcOperation.findByUser = function(userId, limit = 50) {
    return this.findAll({ 
      where: { userId },
      order: [['created_at', 'DESC']],
      limit,
      include: [{
        model: sequelize.models.ApiKey,
        as: 'apiKey',
        attributes: ['id', 'name']
      }]
    });
  };

  UgcOperation.findByApiKey = function(apiKeyId, limit = 50) {
    return this.findAll({ 
      where: { apiKeyId },
      order: [['created_at', 'DESC']],
      limit,
      include: [{
        model: sequelize.models.User,
        as: 'user',
        attributes: ['id', 'name', 'email']
      }]
    });
  };

  UgcOperation.getOperationStats = function(filters = {}) {
    const whereClause = {};
    
    if (filters.userId) whereClause.userId = filters.userId;
    if (filters.apiKeyId) whereClause.apiKeyId = filters.apiKeyId;
    if (filters.status) whereClause.status = filters.status;
    if (filters.startDate) {
      whereClause.created_at = whereClause.created_at || {};
      whereClause.created_at[sequelize.Sequelize.Op.gte] = filters.startDate;
    }
    if (filters.endDate) {
      whereClause.created_at = whereClause.created_at || {};
      whereClause.created_at[sequelize.Sequelize.Op.lte] = filters.endDate;
    }

    return this.findAll({
      where: whereClause,
      attributes: [
        'status',
        [sequelize.fn('COUNT', '*'), 'count'],
        [sequelize.fn('AVG', 
          sequelize.literal('EXTRACT(EPOCH FROM (completed_at - created_at))')
        ), 'avgDurationSeconds']
      ],
      group: ['status']
    });
  };

  UgcOperation.cleanupOldOperations = function(daysOld = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    
    return this.destroy({
      where: {
        created_at: { [sequelize.Sequelize.Op.lt]: cutoffDate },
        status: { [sequelize.Sequelize.Op.in]: ['completed', 'failed', 'cancelled'] }
      }
    });
  };

  return UgcOperation;
};