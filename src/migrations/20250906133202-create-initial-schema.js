'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Create extensions
    await queryInterface.sequelize.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await queryInterface.sequelize.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

    // Create users table
    await queryInterface.createTable('users', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('uuid_generate_v4()'),
        primaryKey: true
      },
      email: {
        type: Sequelize.STRING(255),
        allowNull: false,
        unique: true
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      provider: {
        type: Sequelize.STRING(50),
        allowNull: false
      },
      provider_id: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      role: {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: 'user'
      },
      permissions: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: '[]'
      },
      metadata: {
        type: Sequelize.JSONB,
        defaultValue: '{}'
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()')
      },
      last_login: {
        type: Sequelize.DATE
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      }
    });

    // Create api_keys table
    await queryInterface.createTable('api_keys', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('uuid_generate_v4()'),
        primaryKey: true
      },
      key_hash: {
        type: Sequelize.STRING(255),
        allowNull: false,
        unique: true
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT
      },
      permissions: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: '[]'
      },
      rate_limit: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: '{}'
      },
      metadata: {
        type: Sequelize.JSONB,
        defaultValue: '{}'
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()')
      },
      last_used: {
        type: Sequelize.DATE
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      },
      created_by: {
        type: Sequelize.UUID,
        references: {
          model: 'users',
          key: 'id'
        }
      }
    });

    // Create refresh_tokens table
    await queryInterface.createTable('refresh_tokens', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('uuid_generate_v4()'),
        primaryKey: true
      },
      token_hash: {
        type: Sequelize.STRING(255),
        allowNull: false,
        unique: true
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        onDelete: 'CASCADE'
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()')
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: false
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      }
    });

    // Create api_usage table
    await queryInterface.createTable('api_usage', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('uuid_generate_v4()'),
        primaryKey: true
      },
      api_key_id: {
        type: Sequelize.UUID,
        references: {
          model: 'api_keys',
          key: 'id'
        },
        onDelete: 'CASCADE'
      },
      user_id: {
        type: Sequelize.UUID,
        references: {
          model: 'users',
          key: 'id'
        },
        onDelete: 'CASCADE'
      },
      endpoint: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      method: {
        type: Sequelize.STRING(10),
        allowNull: false
      },
      status_code: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      response_time: {
        type: Sequelize.INTEGER
      },
      user_agent: {
        type: Sequelize.TEXT
      },
      ip_address: {
        type: Sequelize.INET
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()')
      }
    });

    // Create ugc_operations table
    await queryInterface.createTable('ugc_operations', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('uuid_generate_v4()'),
        primaryKey: true
      },
      operation_id: {
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
        onDelete: 'SET NULL'
      },
      user_id: {
        type: Sequelize.UUID,
        references: {
          model: 'users',
          key: 'id'
        },
        onDelete: 'SET NULL'
      },
      status: {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: 'pending'
      },
      creative_brief: {
        type: Sequelize.TEXT
      },
      script_content: {
        type: Sequelize.JSONB
      },
      video_urls: {
        type: Sequelize.JSONB,
        defaultValue: '[]'
      },
      error_message: {
        type: Sequelize.TEXT
      },
      metadata: {
        type: Sequelize.JSONB,
        defaultValue: '{}'
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()')
      },
      completed_at: {
        type: Sequelize.DATE
      }
    });

    // Create indexes
    await queryInterface.addIndex('users', ['email']);
    await queryInterface.addIndex('users', ['provider', 'provider_id'], { unique: true });
    await queryInterface.addIndex('users', ['is_active']);
    
    await queryInterface.addIndex('api_keys', ['is_active']);
    await queryInterface.addIndex('api_keys', ['created_at']);
    
    await queryInterface.addIndex('refresh_tokens', ['user_id']);
    await queryInterface.addIndex('refresh_tokens', ['expires_at']);
    
    await queryInterface.addIndex('api_usage', ['api_key_id']);
    await queryInterface.addIndex('api_usage', ['user_id']);
    await queryInterface.addIndex('api_usage', ['created_at']);
    await queryInterface.addIndex('api_usage', ['endpoint', 'method']);
    await queryInterface.addIndex('api_usage', ['status_code']);
    
    await queryInterface.addIndex('ugc_operations', ['status']);
    await queryInterface.addIndex('ugc_operations', ['created_at']);

    // Create trigger function for updated_at
    await queryInterface.sequelize.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
          NEW.updated_at = NOW();
          RETURN NEW;
      END;
      $$ language 'plpgsql';
    `);

    // Create trigger for ugc_operations table
    await queryInterface.sequelize.query(`
      CREATE TRIGGER update_ugc_operations_updated_at 
          BEFORE UPDATE ON ugc_operations 
          FOR EACH ROW 
          EXECUTE FUNCTION update_updated_at_column();
    `);
  },

  async down(queryInterface, Sequelize) {
    // Drop triggers and functions
    await queryInterface.sequelize.query('DROP TRIGGER IF EXISTS update_ugc_operations_updated_at ON ugc_operations');
    await queryInterface.sequelize.query('DROP FUNCTION IF EXISTS update_updated_at_column()');

    // Drop tables in reverse order (due to foreign key constraints)
    await queryInterface.dropTable('ugc_operations');
    await queryInterface.dropTable('api_usage');
    await queryInterface.dropTable('refresh_tokens');
    await queryInterface.dropTable('api_keys');
    await queryInterface.dropTable('users');

    // Drop extensions
    await queryInterface.sequelize.query('DROP EXTENSION IF EXISTS "pgcrypto"');
    await queryInterface.sequelize.query('DROP EXTENSION IF EXISTS "uuid-ossp"');
  }
};
