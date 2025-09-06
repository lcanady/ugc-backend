#!/bin/bash

# View logs for development environment
SERVICE=${1:-app}

echo "📋 Viewing logs for service: $SERVICE"
echo "Press Ctrl+C to exit"
echo ""

docker-compose logs -f $SERVICE