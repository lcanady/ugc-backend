const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ApiKey = sequelize.define('ApiKey', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    keyHash: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      field: 'key_hash'
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT
    },
    permissions: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: []
    },
    rateLimit: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
      field: 'rate_limit'
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {}
    },
    lastUsed: {
      type: DataTypes.DATE,
      field: 'last_used'
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'is_active'
    },
    createdBy: {
      type: DataTypes.UUID,
      field: 'created_by',
      references: {
        model: 'users',
        key: 'id'
      }
    }
  }, {
    tableName: 'api_keys',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    indexes: [
      {
        fields: ['is_active']
      },
      {
        fields: ['created_at']
      },
      {
        unique: true,
        fields: ['key_hash']
      }
    ]
  });

  ApiKey.associate = (models) => {
    ApiKey.belongsTo(models.User, {
      foreignKey: 'created_by',
      as: 'creator'
    });
    
    ApiKey.hasMany(models.ApiUsage, {
      foreignKey: 'api_key_id',
      as: 'usage',
      onDelete: 'CASCADE'
    });
    
    ApiKey.hasMany(models.UgcOperation, {
      foreignKey: 'api_key_id',
      as: 'ugcOperations',
      onDelete: 'SET NULL'
    });
  };

  // Instance methods
  ApiKey.prototype.hasPermission = function(permission) {
    return this.permissions.includes(permission) || this.permissions.includes('*');
  };

  ApiKey.prototype.updateLastUsed = function() {
    this.lastUsed = new Date();
    return this.save();
  };

  ApiKey.prototype.getRateLimit = function(type = 'default') {
    return this.rateLimit[type] || null;
  };

  // Class methods
  ApiKey.findByHash = function(keyHash) {
    return this.findOne({ 
      where: { 
        keyHash, 
        isActive: true 
      },
      include: [{
        model: sequelize.models.User,
        as: 'creator',
        attributes: ['id', 'name', 'email', 'role']
      }]
    });
  };

  ApiKey.findActiveKeys = function() {
    return this.findAll({ 
      where: { isActive: true },
      order: [['created_at', 'DESC']]
    });
  };

  return ApiKey;
};