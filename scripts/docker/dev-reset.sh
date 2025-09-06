#!/bin/bash

# Reset development environment (remove all data)
echo "🔄 Resetting UGC Ad Creator development environment..."
echo "⚠️  This will remove all data including databases!"

read -p "Are you sure? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    # Stop and remove containers, networks, and volumes
    docker-compose down -v
    
    # Remove images
    docker-compose build --no-cache
    
    echo "✅ Development environment reset complete."
    echo "Run './scripts/docker/dev-up.sh' to start fresh."
else
    echo "❌ Reset cancelled."
fi