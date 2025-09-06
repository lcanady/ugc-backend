#!/bin/bash

# UGC Ad Creator API Test Script
# This script tests all API endpoints with various scenarios

set -e  # Exit on any error

# Configuration
API_BASE_URL="${API_BASE_URL:-http://localhost:3000}"
SAMPLE_IMAGES_DIR="./examples/sample-images"
TEST_RESULTS_DIR="./test-results"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Create test results directory
mkdir -p "$TEST_RESULTS_DIR"

echo -e "${BLUE}🚀 Starting UGC Ad Creator API Tests${NC}"
echo -e "${BLUE}API Base URL: $API_BASE_URL${NC}\n"

# Function to make HTTP requests and check responses
test_endpoint() {
    local method="$1"
    local endpoint="$2"
    local description="$3"
    local expected_status="$4"
    local additional_args="$5"
    
    echo -e "${YELLOW}Testing: $description${NC}"
    
    local response_file="$TEST_RESULTS_DIR/$(echo "$description" | tr ' ' '_' | tr '[:upper:]' '[:lower:]').json"
    local status_code
    
    if [ "$method" = "GET" ]; then
        status_code=$(curl -s -o "$response_file" -w "%{http_code}" "$API_BASE_URL$endpoint")
    elif [ "$method" = "POST" ] && [ -n "$additional_args" ]; then
        status_code=$(curl -s -o "$response_file" -w "%{http_code}" -X POST $additional_args "$API_BASE_URL$endpoint")
    else
        status_code=$(curl -s -o "$response_file" -w "%{http_code}" -X "$method" "$API_BASE_URL$endpoint")
    fi
    
    if [ "$status_code" = "$expected_status" ]; then
        echo -e "${GREEN}✅ PASS: Status $status_code (expected $expected_status)${NC}"
    else
        echo -e "${RED}❌ FAIL: Status $status_code (expected $expected_status)${NC}"
        echo -e "${RED}Response saved to: $response_file${NC}"
    fi
    
    echo ""
}

# Function to test file upload endpoints
test_upload_endpoint() {
    local endpoint="$1"
    local description="$2"
    local expected_status="$3"
    local form_data="$4"
    
    echo -e "${YELLOW}Testing: $description${NC}"
    
    local response_file="$TEST_RESULTS_DIR/$(echo "$description" | tr ' ' '_' | tr '[:upper:]' '[:lower:]').json"
    local status_code
    
    status_code=$(curl -s -o "$response_file" -w "%{http_code}" -X POST $form_data "$API_BASE_URL$endpoint")
    
    if [ "$status_code" = "$expected_status" ]; then
        echo -e "${GREEN}✅ PASS: Status $status_code (expected $expected_status)${NC}"
        
        # If successful, extract operation ID for follow-up tests
        if [ "$status_code" = "200" ] && [ "$endpoint" = "/api/v1/ugc/generate" ]; then
            OPERATION_ID=$(cat "$response_file" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
            echo -e "${BLUE}📝 Operation ID: $OPERATION_ID${NC}"
        fi
    else
        echo -e "${RED}❌ FAIL: Status $status_code (expected $expected_status)${NC}"
        echo -e "${RED}Response saved to: $response_file${NC}"
    fi
    
    echo ""
}

# Generate sample images if they don't exist
if [ ! -d "$SAMPLE_IMAGES_DIR" ]; then
    echo -e "${YELLOW}📁 Generating sample images...${NC}"
    npm run generate-samples
    echo ""
fi

# Test 1: Health Check
test_endpoint "GET" "/health" "Health Check" "200"

# Test 2: API Information
test_endpoint "GET" "/api" "API Information" "200"

# Test 3: Generate UGC Ad - Valid Request
if [ -f "$SAMPLE_IMAGES_DIR/fitness-app-screenshot.svg" ]; then
    test_upload_endpoint "/api/v1/ugc/generate" "Generate UGC Ad - Valid Request" "200" \
        "-F 'creativeBrief=Create an engaging fitness app advertisement showcasing workout tracking features' \
         -F 'images=@$SAMPLE_IMAGES_DIR/fitness-app-screenshot.svg' \
         -F 'images=@$SAMPLE_IMAGES_DIR/person-working-out.svg'"
else
    echo -e "${RED}❌ Sample images not found. Skipping upload tests.${NC}"
fi

# Test 4: Generate UGC Ad - Missing Creative Brief
test_upload_endpoint "/api/v1/ugc/generate" "Generate UGC Ad - Missing Creative Brief" "400" \
    "-F 'images=@$SAMPLE_IMAGES_DIR/fitness-app-screenshot.svg'"

# Test 5: Generate UGC Ad - No Images
test_upload_endpoint "/api/v1/ugc/generate" "Generate UGC Ad - No Images" "400" \
    "-F 'creativeBrief=Create a fitness advertisement'"

# Test 6: Generate UGC Ad - With Optional Script
test_upload_endpoint "/api/v1/ugc/generate" "Generate UGC Ad - With Optional Script" "200" \
    "-F 'creativeBrief=Create a compelling fitness app advertisement' \
     -F 'script=Person opens the fitness app and starts tracking their workout' \
     -F 'images=@$SAMPLE_IMAGES_DIR/fitness-app-screenshot.svg'"

# Test 7: Generate UGC Ad - With Custom Options
test_upload_endpoint "/api/v1/ugc/generate" "Generate UGC Ad - With Custom Options" "200" \
    "-F 'creativeBrief=Create a vertical social media ad for fitness app' \
     -F 'options={\"aspectRatio\":\"9:16\",\"segmentCount\":1,\"useFastModel\":true}' \
     -F 'images=@$SAMPLE_IMAGES_DIR/fitness-app-screenshot.svg'"

# Test 8: Check Generation Status - Valid Operation ID
if [ -n "$OPERATION_ID" ]; then
    test_endpoint "GET" "/api/v1/ugc/status/$OPERATION_ID" "Check Generation Status - Valid ID" "200"
else
    echo -e "${YELLOW}⚠️  Skipping status check - no operation ID available${NC}\n"
fi

# Test 9: Check Generation Status - Invalid Operation ID
test_endpoint "GET" "/api/v1/ugc/status/invalid_operation_id" "Check Generation Status - Invalid ID" "404"

# Test 10: Download Videos - Valid Operation ID
if [ -n "$OPERATION_ID" ]; then
    test_endpoint "POST" "/api/v1/ugc/download" "Download Videos - Valid ID" "200" \
        "-H 'Content-Type: application/json' -d '{\"operationId\":\"$OPERATION_ID\"}'"
else
    echo -e "${YELLOW}⚠️  Skipping download test - no operation ID available${NC}\n"
fi

# Test 11: Download Videos - Invalid Operation ID
test_endpoint "POST" "/api/v1/ugc/download" "Download Videos - Invalid ID" "404" \
    "-H 'Content-Type: application/json' -d '{\"operationId\":\"invalid_id\"}'"

# Test 12: 404 for Non-existent Endpoint
test_endpoint "GET" "/api/v1/nonexistent" "Non-existent Endpoint" "404"

# Performance Test: Multiple Concurrent Requests
echo -e "${YELLOW}🏃 Performance Test: Multiple Concurrent Health Checks${NC}"
for i in {1..5}; do
    curl -s "$API_BASE_URL/health" > "$TEST_RESULTS_DIR/concurrent_$i.json" &
done
wait
echo -e "${GREEN}✅ Concurrent requests completed${NC}\n"

# Summary
echo -e "${BLUE}📊 Test Summary${NC}"
echo -e "${BLUE}=================${NC}"
echo -e "Test results saved to: $TEST_RESULTS_DIR"
echo -e "API Base URL: $API_BASE_URL"

if [ -n "$OPERATION_ID" ]; then
    echo -e "Last Operation ID: $OPERATION_ID"
fi

echo -e "\n${GREEN}🎉 API testing completed!${NC}"
echo -e "${BLUE}💡 Check the response files in $TEST_RESULTS_DIR for detailed results${NC}"

# Optional: Clean up old test results
read -p "Clean up test results? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    rm -rf "$TEST_RESULTS_DIR"
    echo -e "${GREEN}✅ Test results cleaned up${NC}"
fi