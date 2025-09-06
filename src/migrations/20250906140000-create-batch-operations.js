'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Create batch_operations table
    await queryInterface.createTable('batch_operations', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      batch_id: {
        type: Sequelize.STRING(255),
        allowNull: false,
        unique: true
      },
      api_key_id: {
        type: Sequelize.UUID,
        references: {
          model: 'api_keys',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      user_id: {
        type: Sequelize.UUID,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      status: {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: 'pending'
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT
      },
      total_operations: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      completed_operations: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      failed_operations: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      priority: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 5
      },
      scheduled_for: {
        type: Sequelize.DATE
      },
      started_at: {
        type: Sequelize.DATE
      },
      completed_at: {
        type: Sequelize.DATE
      },
      error_message: {
        type: Sequelize.TEXT
      },
      metadata: {
        type: Sequelize.JSONB,
        defaultValue: {}
      },
      options: {
        type: Sequelize.JSONB,
        defaultValue: {}
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      }
    });

    // Add indexes for batch_operations
    await queryInterface.addIndex('batch_operations', ['batch_id'], { unique: true });
    await queryInterface.addIndex('batch_operations', ['status']);
    await queryInterface.addIndex('batch_operations', ['priority']);
    await queryInterface.addIndex('batch_operations', ['scheduled_for']);
    await queryInterface.addIndex('batch_operations', ['created_at']);
    await queryInterface.addIndex('batch_operations', ['api_key_id']);
    await queryInterface.addIndex('batch_operations', ['user_id']);

    // Add batch_id column to ugc_operations table
    await queryInterface.addColumn('ugc_operations', 'batch_id', {
      type: Sequelize.UUID,
      references: {
        model: 'batch_operations',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });

    // Add index for batch_id in ugc_operations
    await queryInterface.addIndex('ugc_operations', ['batch_id']);
  },

  down: async (queryInterface, Sequelize) => {
    // Remove batch_id column from ugc_operations
    await queryInterface.removeColumn('ugc_operations', 'batch_id');
    
    // Drop batch_operations table
    await queryInterface.dropTable('batch_operations');
  }
};