'use strict';

const bcrypt = require('bcryptjs');
const crypto = require('crypto');

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Insert demo users
    const users = await queryInterface.bulkInsert('users', [
      {
        id: '550e8400-e29b-41d4-a716-446655440001',
        email: 'admin@ugc.local',
        name: 'Admin User',
        provider: 'local',
        provider_id: 'admin-local',
        role: 'admin',
        permissions: JSON.stringify(['*']),
        metadata: JSON.stringify({ demo: true }),
        created_at: new Date(),
        is_active: true
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440002',
        email: 'user@ugc.local',
        name: 'Test User',
        provider: 'local',
        provider_id: 'user-local',
        role: 'user',
        permissions: JSON.stringify(['ugc:generate', 'cache:read']),
        metadata: JSON.stringify({ demo: true }),
        created_at: new Date(),
        is_active: true
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440003',
        email: 'developer@ugc.local',
        name: 'Developer User',
        provider: 'local',
        provider_id: 'developer-local',
        role: 'user',
        permissions: JSON.stringify(['ugc:generate', 'ugc:batch', 'cache:read', 'cache:write']),
        metadata: JSON.stringify({ demo: true, tier: 'premium' }),
        created_at: new Date(),
        is_active: true
      }
    ], { returning: true });

    // Generate API keys for demo users
    const apiKeys = [
      {
        id: '550e8400-e29b-41d4-a716-446655440011',
        key_hash: await bcrypt.hash('ugc_admin_key_demo_12345', 10),
        name: 'Admin Demo Key',
        description: 'Demo API key for admin user with full permissions',
        permissions: JSON.stringify(['*']),
        rate_limit: JSON.stringify({
          default: { windowMs: 900000, maxRequests: 1000 },
          daily: { maxRequests: 10000 }
        }),
        metadata: JSON.stringify({ demo: true, tier: 'admin' }),
        created_at: new Date(),
        is_active: true,
        created_by: '550e8400-e29b-41d4-a716-446655440001'
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440012',
        key_hash: await bcrypt.hash('ugc_user_key_demo_67890', 10),
        name: 'User Demo Key',
        description: 'Demo API key for regular user with standard permissions',
        permissions: JSON.stringify(['ugc:generate', 'cache:read']),
        rate_limit: JSON.stringify({
          default: { windowMs: 900000, maxRequests: 100 },
          daily: { maxRequests: 1000 }
        }),
        metadata: JSON.stringify({ demo: true, tier: 'standard' }),
        created_at: new Date(),
        is_active: true,
        created_by: '550e8400-e29b-41d4-a716-446655440002'
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440013',
        key_hash: await bcrypt.hash('ugc_dev_key_demo_abcdef', 10),
        name: 'Developer Demo Key',
        description: 'Demo API key for developer with premium permissions',
        permissions: JSON.stringify(['ugc:generate', 'ugc:batch', 'cache:read', 'cache:write']),
        rate_limit: JSON.stringify({
          default: { windowMs: 900000, maxRequests: 500 },
          daily: { maxRequests: 5000 }
        }),
        metadata: JSON.stringify({ demo: true, tier: 'premium' }),
        created_at: new Date(),
        is_active: true,
        created_by: '550e8400-e29b-41d4-a716-446655440003'
      }
    ];

    await queryInterface.bulkInsert('api_keys', apiKeys);

    // Insert some demo UGC operations
    const operations = [
      {
        id: '550e8400-e29b-41d4-a716-446655440021',
        operation_id: 'op_demo_completed_001',
        api_key_id: '550e8400-e29b-41d4-a716-446655440012',
        user_id: '550e8400-e29b-41d4-a716-446655440002',
        status: 'completed',
        creative_brief: 'Create a fun and engaging ad for a new fitness app targeting young adults',
        script_content: JSON.stringify({
          'segment-1': 'Young person struggling to get motivated for workout at home',
          'segment-2': 'Same person energized and working out with the new fitness app'
        }),
        video_urls: JSON.stringify(['https://example.com/video1.mp4']),
        metadata: JSON.stringify({ demo: true, duration: 15000 }),
        created_at: new Date(Date.now() - 86400000), // 1 day ago
        updated_at: new Date(Date.now() - 86400000 + 300000), // 5 minutes later
        completed_at: new Date(Date.now() - 86400000 + 300000)
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440022',
        operation_id: 'op_demo_processing_002',
        api_key_id: '550e8400-e29b-41d4-a716-446655440013',
        user_id: '550e8400-e29b-41d4-a716-446655440003',
        status: 'processing',
        creative_brief: 'Showcase a new coffee brand with emphasis on sustainability and quality',
        script_content: JSON.stringify({
          'segment-1': 'Coffee beans being harvested sustainably by local farmers',
          'segment-2': 'Perfect cup of coffee being enjoyed in a cozy setting'
        }),
        metadata: JSON.stringify({ demo: true }),
        created_at: new Date(Date.now() - 3600000), // 1 hour ago
        updated_at: new Date(Date.now() - 1800000) // 30 minutes ago
      }
    ];

    await queryInterface.bulkInsert('ugc_operations', operations);

    // Insert some demo API usage logs
    const usageLogs = [];
    const endpoints = ['/api/v1/ugc/generate', '/api/v1/cache/clear', '/api/v1/health'];
    const methods = ['POST', 'GET', 'DELETE'];
    const statusCodes = [200, 201, 400, 500];

    for (let i = 0; i < 50; i++) {
      usageLogs.push({
        id: crypto.randomUUID(),
        api_key_id: i % 2 === 0 ? '550e8400-e29b-41d4-a716-446655440012' : '550e8400-e29b-41d4-a716-446655440013',
        user_id: i % 2 === 0 ? '550e8400-e29b-41d4-a716-446655440002' : '550e8400-e29b-41d4-a716-446655440003',
        endpoint: endpoints[i % endpoints.length],
        method: methods[i % methods.length],
        status_code: statusCodes[i % statusCodes.length],
        response_time: Math.floor(Math.random() * 2000) + 100,
        user_agent: 'UGC-Client/1.0',
        ip_address: `192.168.1.${Math.floor(Math.random() * 255)}`,
        created_at: new Date(Date.now() - Math.random() * 86400000 * 7) // Random time in last 7 days
      });
    }

    await queryInterface.bulkInsert('api_usage', usageLogs);

    console.log('Demo data seeded successfully!');
    console.log('Demo API Keys:');
    console.log('- Admin: ugc_admin_key_demo_12345');
    console.log('- User: ugc_user_key_demo_67890');
    console.log('- Developer: ugc_dev_key_demo_abcdef');
  },

  async down(queryInterface, Sequelize) {
    // Remove demo data in reverse order
    await queryInterface.bulkDelete('api_usage', { 
      api_key_id: {
        [Sequelize.Op.in]: [
          '550e8400-e29b-41d4-a716-446655440012',
          '550e8400-e29b-41d4-a716-446655440013'
        ]
      }
    });

    await queryInterface.bulkDelete('ugc_operations', {
      operation_id: {
        [Sequelize.Op.in]: ['op_demo_completed_001', 'op_demo_processing_002']
      }
    });

    await queryInterface.bulkDelete('api_keys', {
      id: {
        [Sequelize.Op.in]: [
          '550e8400-e29b-41d4-a716-446655440011',
          '550e8400-e29b-41d4-a716-446655440012',
          '550e8400-e29b-41d4-a716-446655440013'
        ]
      }
    });

    await queryInterface.bulkDelete('users', {
      email: {
        [Sequelize.Op.in]: ['admin@ugc.local', 'user@ugc.local', 'developer@ugc.local']
      }
    });
  }
};
