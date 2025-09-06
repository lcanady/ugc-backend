const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const BatchOperation = sequelize.define('BatchOperation', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    batchId: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      field: 'batch_id'
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
        isIn: [['pending', 'processing', 'completed', 'failed', 'cancelled', 'partial']]
      }
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT
    },
    totalOperations: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'total_operations'
    },
    completedOperations: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'completed_operations'
    },
    failedOperations: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'failed_operations'
    },
    priority: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 5,
      validate: {
        min: 1,
        max: 10
      }
    },
    scheduledFor: {
      type: DataTypes.DATE,
      field: 'scheduled_for'
    },
    startedAt: {
      type: DataTypes.DATE,
      field: 'started_at'
    },
    completedAt: {
      type: DataTypes.DATE,
      field: 'completed_at'
    },
    errorMessage: {
      type: DataTypes.TEXT,
      field: 'error_message'
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {}
    },
    options: {
      type: DataTypes.JSONB,
      defaultValue: {}
    }
  }, {
    tableName: 'batch_operations',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        unique: true,
        fields: ['batch_id']
      },
      {
        fields: ['status']
      },
      {
        fields: ['priority']
      },
      {
        fields: ['scheduled_for']
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

  BatchOperation.associate = (models) => {
    BatchOperation.belongsTo(models.ApiKey, {
      foreignKey: 'api_key_id',
      as: 'apiKey',
      onDelete: 'SET NULL'
    });
    
    BatchOperation.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user',
      onDelete: 'SET NULL'
    });

    BatchOperation.hasMany(models.UgcOperation, {
      foreignKey: 'batch_id',
      as: 'operations',
      onDelete: 'CASCADE'
    });
  };

  // Instance methods
  BatchOperation.prototype.updateProgress = function() {
    const progress = this.totalOperations > 0 
      ? Math.round((this.completedOperations / this.totalOperations) * 100)
      : 0;
    
    // Update status based on progress
    if (this.completedOperations === this.totalOperations && this.failedOperations === 0) {
      this.status = 'completed';
      this.completedAt = new Date();
    } else if (this.completedOperations + this.failedOperations === this.totalOperations) {
      this.status = this.completedOperations > 0 ? 'partial' : 'failed';
      this.completedAt = new Date();
    } else if (this.completedOperations > 0 || this.failedOperations > 0) {
      this.status = 'processing';
      if (!this.startedAt) {
        this.startedAt = new Date();
      }
    }

    return this.save();
  };

  BatchOperation.prototype.incrementCompleted = function() {
    this.completedOperations += 1;
    return this.updateProgress();
  };

  BatchOperation.prototype.incrementFailed = function() {
    this.failedOperations += 1;
    return this.updateProgress();
  };

  BatchOperation.prototype.getProgress = function() {
    return {
      total: this.totalOperations,
      completed: this.completedOperations,
      failed: this.failedOperations,
      pending: this.totalOperations - this.completedOperations - this.failedOperations,
      percentage: this.totalOperations > 0 
        ? Math.round((this.completedOperations / this.totalOperations) * 100)
        : 0
    };
  };

  BatchOperation.prototype.getDuration = function() {
    if (!this.completedAt || !this.startedAt) return null;
    return this.completedAt - this.startedAt;
  };

  BatchOperation.prototype.getEstimatedTimeRemaining = function() {
    if (!this.startedAt || this.status === 'completed' || this.status === 'failed') {
      return null;
    }

    const elapsed = Date.now() - this.startedAt.getTime();
    const progress = this.getProgress();
    
    if (progress.percentage <= 0) {
      return null;
    }

    const estimatedTotal = elapsed / (progress.percentage / 100);
    const remaining = Math.max(0, estimatedTotal - elapsed);
    
    return Math.round(remaining / 1000); // Return seconds
  };

  BatchOperation.prototype.isCompleted = function() {
    return ['completed', 'failed', 'cancelled', 'partial'].includes(this.status);
  };

  // Class methods
  BatchOperation.findByBatchId = function(batchId) {
    return this.findOne({ 
      where: { batchId },
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

  BatchOperation.findByUser = function(userId, limit = 50) {
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

  BatchOperation.findByApiKey = function(apiKeyId, limit = 50) {
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

  BatchOperation.findPendingBatches = function() {
    return this.findAll({
      where: {
        status: 'pending',
        scheduledFor: {
          [sequelize.Sequelize.Op.or]: [
            null,
            { [sequelize.Sequelize.Op.lte]: new Date() }
          ]
        }
      },
      order: [['priority', 'ASC'], ['created_at', 'ASC']]
    });
  };

  BatchOperation.getBatchStats = function(filters = {}) {
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
        [sequelize.fn('SUM', sequelize.col('total_operations')), 'totalOperations'],
        [sequelize.fn('SUM', sequelize.col('completed_operations')), 'completedOperations'],
        [sequelize.fn('SUM', sequelize.col('failed_operations')), 'failedOperations'],
        [sequelize.fn('AVG', 
          sequelize.literal('EXTRACT(EPOCH FROM (completed_at - started_at))')
        ), 'avgDurationSeconds']
      ],
      group: ['status']
    });
  };

  return BatchOperation;
};