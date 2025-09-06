module.exports = {
  apps: [{
    name: 'ugc-ad-creator-api',
    script: 'server.js',
    instances: process.env.NODE_ENV === 'production' ? 'max' : 1,
    exec_mode: process.env.NODE_ENV === 'production' ? 'cluster' : 'fork',
    env: {
      NODE_ENV: 'development',
      PORT: 3000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    // Logging
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    
    // Memory and performance
    max_memory_restart: '1G',
    node_args: '--max-old-space-size=1024',
    
    // Restart policy
    restart_delay: 4000,
    max_restarts: 10,
    min_uptime: '10s',
    
    // Monitoring
    watch: process.env.NODE_ENV === 'development',
    watch_delay: 1000,
    ignore_watch: [
      'node_modules',
      'logs',
      'coverage',
      'tests',
      'downloads',
      '.git'
    ],
    
    // Environment-specific settings
    kill_timeout: 5000,
    listen_timeout: 3000,
    
    // Health monitoring
    health_check_grace_period: 3000,
    health_check_fatal_exceptions: true
  }],

  deploy: {
    production: {
      user: 'ugcapi',
      host: 'your-production-server.com',
      ref: 'origin/main',
      repo: 'git@github.com:your-org/ugc-ad-creator-api.git',
      path: '/home/ugcapi/ugc-ad-creator-api',
      'pre-deploy-local': '',
      'post-deploy': 'npm ci --only=production && pm2 reload ecosystem.config.js --env production',
      'pre-setup': ''
    },
    staging: {
      user: 'ugcapi',
      host: 'your-staging-server.com',
      ref: 'origin/develop',
      repo: 'git@github.com:your-org/ugc-ad-creator-api.git',
      path: '/home/ugcapi/ugc-ad-creator-api-staging',
      'post-deploy': 'npm ci && pm2 reload ecosystem.config.js --env staging'
    }
  }
};