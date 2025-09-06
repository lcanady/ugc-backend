const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const RefreshToken = sequelize.define('RefreshToken', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    tokenHash: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      field: 'token_hash'
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id',
      references: {
        model: 'users',
        key: 'id'
      }
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'expires_at'
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'is_active'
    }
  }, {
    tableName: 'refresh_tokens',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    indexes: [
      {
        fields: ['user_id']
      },
      {
        fields: ['expires_at']
      },
      {
        unique: true,
        fields: ['token_hash']
      }
    ]
  });

  RefreshToken.associate = (models) => {
    RefreshToken.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user',
      onDelete: 'CASCADE'
    });
  };

  // Instance methods
  RefreshToken.prototype.isExpired = function() {
    return new Date() > this.expiresAt;
  };

  RefreshToken.prototype.revoke = function() {
    this.isActive = false;
    return this.save();
  };

  // Class methods
  RefreshToken.findByHash = function(tokenHash) {
    return this.findOne({ 
      where: { 
        tokenHash, 
        isActive: true 
      },
      include: [{
        model: sequelize.models.User,
        as: 'user',
        where: { isActive: true }
      }]
    });
  };

  RefreshToken.findByUser = function(userId) {
    return this.findAll({ 
      where: { 
        userId, 
        isActive: true 
      },
      order: [['created_at', 'DESC']]
    });
  };

  RefreshToken.cleanupExpired = function() {
    return this.update(
      { isActive: false },
      { 
        where: { 
          expiresAt: { [sequelize.Sequelize.Op.lt]: new Date() },
          isActive: true
        }
      }
    );
  };

  return RefreshToken;
};