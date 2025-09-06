# Docker Development Environment

This directory contains Docker configuration files for the UGC Ad Creator API development environment.

## Quick Start

1. **Start the development environment:**
   ```bash
   ./scripts/docker/dev-up.sh
   ```

2. **Access the services:**
   - **API**: http://localhost:3000
   - **Redis Commander**: http://localhost:8081
   - **pgAdmin**: http://localhost:8080 (admin@ugc.local / admin123)

3. **Stop the environment:**
   ```bash
   ./scripts/docker/dev-down.sh
   ```

## Services

### Application (app)
- **Port**: 3000
- **Environment**: Development with hot reloading
- **Features**: 
  - Nodemon for automatic restarts
  - Volume mounting for live code changes
  - Health checks

### Redis
- **Port**: 6379
- **Purpose**: Caching and session storage
- **Features**:
  - Persistent data storage
  - Redis Commander web interface

### PostgreSQL
- **Port**: 5432
- **Database**: ugc_db
- **User**: ugc_user
- **Password**: ugc_password
- **Features**:
  - Initialized with schema and sample data
  - pgAdmin web interface

### Redis Commander
- **Port**: 8081
- **Purpose**: Redis database management
- **Access**: http://localhost:8081

### pgAdmin
- **Port**: 8080
- **Purpose**: PostgreSQL database management
- **Login**: admin@ugc.local / admin123

## Docker Files

### docker-compose.yml
Main composition file defining all services and their relationships.

### docker-compose.override.yml
Development-specific overrides (automatically loaded).

### docker-compose.prod.yml
Production configuration (use with `-f` flag).

### Dockerfile
Production-optimized container build.

### Dockerfile.dev
Development-optimized container with hot reloading.

## Scripts

All scripts are located in `scripts/docker/`:

### ./scripts/docker/dev-up.sh
Starts the complete development environment with health checks.

### ./scripts/docker/dev-down.sh
Stops the development environment.

### ./scripts/docker/dev-reset.sh
Completely resets the environment (removes all data).

### ./scripts/docker/logs.sh [service]
Views logs for a specific service (defaults to 'app').
```bash
./scripts/docker/logs.sh app     # Application logs
./scripts/docker/logs.sh redis   # Redis logs
./scripts/docker/logs.sh postgres # PostgreSQL logs
```

### ./scripts/docker/shell.sh [service]
Opens a shell in the specified service.
```bash
./scripts/docker/shell.sh app      # Shell in app container
./scripts/docker/shell.sh redis    # Redis CLI
./scripts/docker/shell.sh postgres # PostgreSQL CLI
```

### ./scripts/docker/test.sh [type]
Runs tests in the Docker environment.
```bash
./scripts/docker/test.sh unit        # Unit tests only
./scripts/docker/test.sh integration # Integration tests only
./scripts/docker/test.sh coverage    # Tests with coverage
./scripts/docker/test.sh all         # All tests (default)
```

## Environment Variables

### Development (.env)
```bash
NODE_ENV=development
REDIS_URL=redis://redis:6379
POSTGRES_URL=postgresql://ugc_user:ugc_password@postgres:5432/ugc_db
JWT_SECRET=dev_jwt_secret_change_in_production
```

### Production
Set these environment variables for production:
```bash
NODE_ENV=production
REDIS_URL=redis://redis:6379
POSTGRES_URL=postgresql://ugc_user:${POSTGRES_PASSWORD}@postgres:5432/ugc_db
JWT_SECRET=${JWT_SECRET}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
```

## Database Schema

The PostgreSQL database is automatically initialized with:
- **api_keys**: API key management
- **users**: OAuth2 user management
- **refresh_tokens**: JWT refresh tokens
- **api_usage**: API usage tracking
- **ugc_operations**: UGC generation operations

Sample data is inserted for development:
- Admin user: admin@ugc.local
- Test user: user@ugc.local

## Volumes

### Persistent Data
- `redis_data`: Redis data persistence
- `postgres_data`: PostgreSQL data persistence
- `pgadmin_data`: pgAdmin configuration

### Development
- `.:/app`: Live code mounting for hot reloading
- `/app/node_modules`: Node modules volume for performance

## Networking

All services communicate through the `ugc-network` bridge network:
- Services can reach each other by service name
- External access only through exposed ports

## Production Deployment

For production deployment:

```bash
# Using production compose file
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# With environment variables
POSTGRES_PASSWORD=secure_password JWT_SECRET=secure_jwt_secret \
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

## Troubleshooting

### Services not starting
1. Check Docker is running: `docker info`
2. Check port conflicts: `lsof -i :3000`
3. View logs: `./scripts/docker/logs.sh`

### Database connection issues
1. Ensure PostgreSQL is ready: `docker-compose exec postgres pg_isready`
2. Check connection string in environment variables
3. Verify database initialization: `./scripts/docker/shell.sh postgres`

### Redis connection issues
1. Test Redis: `docker-compose exec redis redis-cli ping`
2. Check Redis logs: `./scripts/docker/logs.sh redis`

### Application not updating
1. Ensure volume mounting is working
2. Check nodemon is running: `./scripts/docker/logs.sh app`
3. Restart the app service: `docker-compose restart app`

## Performance Tips

1. **Use .dockerignore**: Reduces build context size
2. **Volume mounting**: Faster than copying files during development
3. **Multi-stage builds**: Smaller production images
4. **Health checks**: Ensure services are ready before use

## Security Notes

- Default passwords are for development only
- Change all credentials for production
- Use secrets management in production
- Limit network exposure in production