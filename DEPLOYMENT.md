# Deployment Guide

This guide covers different deployment options for the UGC Ad Creator API.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Environment Configuration](#environment-configuration)
- [Local Development](#local-development)
- [Docker Deployment](#docker-deployment)
- [Production Deployment](#production-deployment)
- [Cloud Deployment](#cloud-deployment)
- [Monitoring and Logging](#monitoring-and-logging)
- [Troubleshooting](#troubleshooting)

## Prerequisites

### Required Services

Before deploying, ensure you have access to the following AI services:

1. **OpenAI API** - For script generation
   - Sign up at [OpenAI Platform](https://platform.openai.com/)
   - Create an API key with GPT-4 access

2. **Google AI Studio** - For image analysis and video generation
   - Sign up at [Google AI Studio](https://aistudio.google.com/)
   - Create API keys for Gemini and Veo 3 models

3. **Kie AI** (Optional) - Legacy video generation service
   - Sign up at [Kie AI](https://kie.ai/)
   - Create an API key for VEO3 access

### System Requirements

- **Node.js**: Version 18 or higher
- **Memory**: Minimum 512MB RAM, recommended 1GB+
- **Storage**: 2GB free space for temporary files
- **Network**: Stable internet connection for AI service calls

## Environment Configuration

### 1. Copy Environment Template

```bash
cp .env.example .env
```

### 2. Configure Required Variables

Edit `.env` file with your API keys:

```bash
# Server Configuration
PORT=3000
NODE_ENV=production

# Required API Keys
OPENAI_API_KEY=sk-your-openai-key-here
GEMINI_API_KEY=your-gemini-api-key-here
GOOGLE_AI_API_KEY=your-google-ai-key-here

# Optional API Keys
KIE_AI_API_KEY=your-kie-ai-key-here

# Optional Configuration
MAX_IMAGES=4
MAX_FILE_SIZE=10485760
ALLOWED_ORIGINS=https://yourdomain.com

# Video Generation Settings
VIDEO_POLL_INTERVAL=10000
VIDEO_TIMEOUT=360000

# Model Configuration
OPENAI_MODEL=gpt-4
GEMINI_MODEL=gemini-2.5-flash-image-preview
```

### 3. Validate Configuration

```bash
npm start
```

The server will validate all required environment variables on startup.

## Local Development

### 1. Install Dependencies

```bash
npm install
```

### 2. Start Development Server

```bash
npm run dev
```

The server will start on `http://localhost:3000` with auto-reload enabled.

### 3. Run Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test suites
npm run test:unit
npm run test:integration
```

## Docker Deployment

### 1. Build Docker Image

```bash
docker build -t ugc-ad-creator-api .
```

### 2. Run with Docker

```bash
docker run -d \
  --name ugc-api \
  -p 3000:3000 \
  --env-file .env \
  -v $(pwd)/downloads:/app/downloads \
  ugc-ad-creator-api
```

### 3. Using Docker Compose

```bash
# Start all services
docker-compose up -d

# Start with nginx proxy (production profile)
docker-compose --profile production up -d

# View logs
docker-compose logs -f ugc-api

# Stop services
docker-compose down
```

### 4. Health Check

```bash
curl http://localhost:3000/health
```

## Production Deployment

### 1. Server Setup

#### Ubuntu/Debian

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 for process management
sudo npm install -g pm2

# Create application user
sudo useradd -m -s /bin/bash ugcapi
sudo usermod -aG sudo ugcapi
```

#### CentOS/RHEL

```bash
# Update system
sudo yum update -y

# Install Node.js 18
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs

# Install PM2
sudo npm install -g pm2

# Create application user
sudo useradd -m ugcapi
```

### 2. Application Deployment

```bash
# Switch to application user
sudo su - ugcapi

# Clone repository
git clone https://github.com/your-org/ugc-ad-creator-api.git
cd ugc-ad-creator-api

# Install dependencies
npm ci --only=production

# Configure environment
cp .env.example .env
# Edit .env with production values

# Start with PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### 3. PM2 Configuration

Create `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [{
    name: 'ugc-ad-creator-api',
    script: 'server.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    max_memory_restart: '1G',
    node_args: '--max-old-space-size=1024'
  }]
};
```

### 4. Nginx Reverse Proxy

```bash
# Install Nginx
sudo apt install nginx -y

# Copy configuration
sudo cp nginx.conf /etc/nginx/sites-available/ugc-api
sudo ln -s /etc/nginx/sites-available/ugc-api /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Start Nginx
sudo systemctl enable nginx
sudo systemctl start nginx
```

### 5. SSL Certificate (Let's Encrypt)

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx -y

# Obtain certificate
sudo certbot --nginx -d yourdomain.com

# Auto-renewal
sudo crontab -e
# Add: 0 12 * * * /usr/bin/certbot renew --quiet
```

## Cloud Deployment

### AWS Deployment

#### Using EC2

1. **Launch EC2 Instance**
   - Choose Ubuntu 20.04 LTS
   - Instance type: t3.medium or larger
   - Configure security groups (ports 22, 80, 443)

2. **Deploy Application**
   ```bash
   # Connect to instance
   ssh -i your-key.pem ubuntu@your-instance-ip
   
   # Follow production deployment steps above
   ```

#### Using ECS with Fargate

1. **Create Task Definition**
   ```json
   {
     "family": "ugc-ad-creator-api",
     "networkMode": "awsvpc",
     "requiresCompatibilities": ["FARGATE"],
     "cpu": "512",
     "memory": "1024",
     "executionRoleArn": "arn:aws:iam::account:role/ecsTaskExecutionRole",
     "containerDefinitions": [
       {
         "name": "ugc-api",
         "image": "your-account.dkr.ecr.region.amazonaws.com/ugc-ad-creator-api:latest",
         "portMappings": [
           {
             "containerPort": 3000,
             "protocol": "tcp"
           }
         ],
         "environment": [
           {
             "name": "NODE_ENV",
             "value": "production"
           }
         ],
         "secrets": [
           {
             "name": "OPENAI_API_KEY",
             "valueFrom": "arn:aws:secretsmanager:region:account:secret:ugc-api-secrets"
           }
         ]
       }
     ]
   }
   ```

2. **Create Service**
   ```bash
   aws ecs create-service \
     --cluster your-cluster \
     --service-name ugc-ad-creator-api \
     --task-definition ugc-ad-creator-api:1 \
     --desired-count 2 \
     --launch-type FARGATE \
     --network-configuration "awsvpcConfiguration={subnets=[subnet-12345],securityGroups=[sg-12345],assignPublicIp=ENABLED}"
   ```

### Google Cloud Platform

#### Using Cloud Run

1. **Build and Push Image**
   ```bash
   # Build image
   docker build -t gcr.io/your-project/ugc-ad-creator-api .
   
   # Push to Container Registry
   docker push gcr.io/your-project/ugc-ad-creator-api
   ```

2. **Deploy to Cloud Run**
   ```bash
   gcloud run deploy ugc-ad-creator-api \
     --image gcr.io/your-project/ugc-ad-creator-api \
     --platform managed \
     --region us-central1 \
     --allow-unauthenticated \
     --memory 1Gi \
     --cpu 1 \
     --set-env-vars NODE_ENV=production \
     --set-secrets OPENAI_API_KEY=openai-key:latest
   ```

### Azure Deployment

#### Using Container Instances

```bash
az container create \
  --resource-group myResourceGroup \
  --name ugc-ad-creator-api \
  --image your-registry.azurecr.io/ugc-ad-creator-api:latest \
  --cpu 1 \
  --memory 1 \
  --ports 3000 \
  --environment-variables NODE_ENV=production \
  --secure-environment-variables OPENAI_API_KEY=your-key
```

## Monitoring and Logging

### 1. Application Monitoring

#### PM2 Monitoring

```bash
# View status
pm2 status

# View logs
pm2 logs ugc-ad-creator-api

# Monitor resources
pm2 monit
```

#### Health Check Monitoring

Create a monitoring script:

```bash
#!/bin/bash
# health-check.sh

ENDPOINT="http://localhost:3000/health"
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" $ENDPOINT)

if [ $RESPONSE -eq 200 ]; then
    echo "$(date): Health check passed"
else
    echo "$(date): Health check failed with status $RESPONSE"
    # Restart application
    pm2 restart ugc-ad-creator-api
fi
```

Add to crontab:
```bash
# Check every 5 minutes
*/5 * * * * /path/to/health-check.sh >> /var/log/health-check.log 2>&1
```

### 2. Log Management

#### Centralized Logging with ELK Stack

1. **Install Filebeat**
   ```bash
   curl -L -O https://artifacts.elastic.co/downloads/beats/filebeat/filebeat-8.0.0-linux-x86_64.tar.gz
   tar xzvf filebeat-8.0.0-linux-x86_64.tar.gz
   ```

2. **Configure Filebeat**
   ```yaml
   # filebeat.yml
   filebeat.inputs:
   - type: log
     enabled: true
     paths:
       - /home/ugcapi/ugc-ad-creator-api/logs/*.log
   
   output.elasticsearch:
     hosts: ["localhost:9200"]
   ```

### 3. Performance Monitoring

#### Application Performance Monitoring (APM)

Install New Relic agent:

```bash
npm install newrelic
```

Add to the top of `server.js`:

```javascript
require('newrelic');
```

## Troubleshooting

### Common Issues

#### 1. API Key Errors

**Symptom**: `Configuration validation failed: OPENAI_API_KEY is required`

**Solution**:
```bash
# Check environment variables
printenv | grep API_KEY

# Verify .env file
cat .env | grep API_KEY

# Test API key
curl -H "Authorization: Bearer $OPENAI_API_KEY" https://api.openai.com/v1/models
```

#### 2. Memory Issues

**Symptom**: Application crashes with out-of-memory errors

**Solution**:
```bash
# Increase Node.js memory limit
node --max-old-space-size=2048 server.js

# Or in PM2 ecosystem.config.js
node_args: '--max-old-space-size=2048'
```

#### 3. File Upload Issues

**Symptom**: `File too large` or upload timeouts

**Solution**:
```bash
# Check nginx client_max_body_size
sudo nginx -T | grep client_max_body_size

# Increase timeout values in nginx.conf
proxy_read_timeout 300s;
client_max_body_size 50M;
```

#### 4. External Service Timeouts

**Symptom**: Video generation fails with timeout errors

**Solution**:
```bash
# Increase timeout in .env
VIDEO_TIMEOUT=600000  # 10 minutes

# Check network connectivity
curl -I https://api.openai.com
curl -I https://generativelanguage.googleapis.com
```

### Log Analysis

#### Common Log Patterns

```bash
# Check for errors
grep -i error /path/to/logs/combined.log

# Monitor API response times
grep "Processing time" /path/to/logs/combined.log | tail -20

# Check memory usage
grep "Memory usage" /path/to/logs/combined.log | tail -10
```

### Performance Optimization

#### 1. Enable Compression

Already configured in nginx.conf:
```nginx
gzip on;
gzip_types text/plain application/json;
```

#### 2. Implement Caching

Add Redis for caching:

```bash
# Install Redis
sudo apt install redis-server

# Configure in application
npm install redis
```

#### 3. Load Balancing

For high traffic, use multiple instances:

```javascript
// ecosystem.config.js
instances: 'max',  // Use all CPU cores
exec_mode: 'cluster'
```

### Security Checklist

- [ ] API keys stored securely (not in code)
- [ ] HTTPS enabled with valid SSL certificate
- [ ] Rate limiting configured
- [ ] Input validation implemented
- [ ] Security headers configured
- [ ] Regular security updates applied
- [ ] Firewall configured (only necessary ports open)
- [ ] Application running as non-root user
- [ ] Log files properly secured

### Backup and Recovery

#### 1. Configuration Backup

```bash
# Backup configuration
tar -czf ugc-api-config-$(date +%Y%m%d).tar.gz .env ecosystem.config.js nginx.conf

# Store in secure location
aws s3 cp ugc-api-config-*.tar.gz s3://your-backup-bucket/
```

#### 2. Application Backup

```bash
# Backup application code
git archive --format=tar.gz --output=ugc-api-$(date +%Y%m%d).tar.gz HEAD

# Backup logs
tar -czf logs-$(date +%Y%m%d).tar.gz logs/
```

#### 3. Recovery Procedure

```bash
# Stop application
pm2 stop ugc-ad-creator-api

# Restore from backup
tar -xzf ugc-api-backup.tar.gz

# Restore configuration
tar -xzf ugc-api-config-backup.tar.gz

# Start application
pm2 start ecosystem.config.js
```