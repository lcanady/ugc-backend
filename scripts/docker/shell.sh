#!/bin/bash

# Get shell access to a service
SERVICE=${1:-app}

echo "🐚 Opening shell for service: $SERVICE"

if [ "$SERVICE" = "app" ]; then
    docker-compose exec app sh
elif [ "$SERVICE" = "redis" ]; then
    docker-compose exec redis redis-cli
elif [ "$SERVICE" = "postgres" ]; then
    docker-compose exec postgres psql -U ugc_user -d ugc_db
else
    docker-compose exec $SERVICE sh
fi