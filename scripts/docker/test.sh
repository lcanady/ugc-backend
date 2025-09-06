#!/bin/bash

# Run tests in Docker environment
TEST_TYPE=${1:-all}

echo "🧪 Running tests in Docker environment..."

case $TEST_TYPE in
    "unit")
        echo "Running unit tests..."
        docker-compose exec app npm run test:unit
        ;;
    "integration")
        echo "Running integration tests..."
        docker-compose exec app npm run test:integration
        ;;
    "coverage")
        echo "Running tests with coverage..."
        docker-compose exec app npm run test:coverage
        ;;
    "all"|*)
        echo "Running all tests..."
        docker-compose exec app npm test
        ;;
esac