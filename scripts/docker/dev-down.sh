#!/bin/bash

# Stop development environment
echo "🛑 Stopping UGC Ad Creator development environment..."

# Stop and remove containers
docker-compose down

echo "✅ Development environment stopped."
echo ""
echo "💡 To remove all data (databases, etc.), run:"
echo "   docker-compose down -v"