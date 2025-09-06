const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const User = sequelize.define('User', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true
      }
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    provider: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    providerId: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'provider_id'
    },
    role: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'user',
      validate: {
        isIn: [['admin', 'user', 'viewer']]
      }
    },
    permissions: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: []
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {}
    },
    lastLogin: {
      type: DataTypes.DATE,
      field: 'last_login'
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'is_active'
    }
  }, {
    tableName: 'users',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    indexes: [
      {
        unique: true,
        fields: ['provider', 'provider_id']
      },
      {
        fields: ['email']
      },
      {
        fields: ['is_active']
      }
    ]
  });

  User.associate = (models) => {
    User.hasMany(models.RefreshToken, {
      foreignKey: 'user_id',
      as: 'refreshTokens',
      onDelete: 'CASCADE'
    });
    
    User.hasMany(models.ApiUsage, {
      foreignKey: 'user_id',
      as: 'apiUsage',
      onDelete: 'CASCADE'
    });
    
    User.hasMany(models.UgcOperation, {
      foreignKey: 'user_id',
      as: 'ugcOperations',
      onDelete: 'SET NULL'
    });
  };

  // Instance methods
  User.prototype.hasPermission = function(permission) {
    if (this.role === 'admin') return true;
    return this.permissions.includes(permission) || this.permissions.includes('*');
  };

  User.prototype.updateLastLogin = function() {
    this.lastLogin = new Date();
    return this.save();
  };

  // Class methods
  User.findByEmail = function(email) {
    return this.findOne({ where: { email, isActive: true } });
  };

  User.findByProvider = function(provider, providerId) {
    return this.findOne({ 
      where: { 
        provider, 
        providerId, 
        isActive: true 
      } 
    });
  };

  return User;
};