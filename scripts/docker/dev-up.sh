#!/bin/bash

# Start development environment with Docker Compose
echo "🚀 Starting UGC Ad Creator development environment..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Build and start services
docker-compose up --build -d

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."
sleep 10

# Check service health
echo "🔍 Checking service health..."

# Check Redis
if docker-compose exec redis redis-cli ping > /dev/null 2>&1; then
    echo "✅ Redis is ready"
else
    echo "❌ Redis is not ready"
fi

# Check PostgreSQL
if docker-compose exec postgres pg_isready -U ugc_user > /dev/null 2>&1; then
    echo "✅ PostgreSQL is ready"
else
    echo "❌ PostgreSQL is not ready"
fi

# Check main application
if curl -f http://localhost:3000/health > /dev/null 2>&1; then
    echo "✅ Application is ready"
else
    echo "❌ Application is not ready yet, it may still be starting..."
fi

echo ""
echo "🎉 Development environment is starting up!"
echo ""
echo "📋 Available services:"
echo "   • Application:      http://localhost:3000"
echo "   • API Documentation: http://localhost:3000/api"
echo "   • Redis Commander:  http://localhost:8081"
echo "   • pgAdmin:          http://localhost:8080 (admin@ugc.local / admin123)"
echo ""
echo "🔧 Useful commands:"
echo "   • View logs:        docker-compose logs -f"
echo "   • Stop services:    docker-compose down"
echo "   • Restart app:      docker-compose restart app"
echo "   • Shell into app:   docker-compose exec app sh"
echo ""
echo "📊 To view logs in real-time:"
echo "   docker-compose logs -f app"