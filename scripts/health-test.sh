#!/bin/bash
# Test script for the /api/health endpoint

API_URL="http://localhost:9000"

echo "Testing /api/health endpoint..."
echo "---------------------------------"

# Make the request and capture the response
response=$(curl -s $API_URL/api/health)

# Check if the request was successful
if [[ $? -eq 0 ]]; then
  echo "Request successful!"
  
  # Check if the response contains expected fields
  if echo $response | grep -q "status"; then
    echo "Response contains status field ✓"
  else
    echo "Response missing status field ✗"
  fi
  
  # Updated checks to accommodate different API versions or implementations
  # Check for version field or alternative
  if echo $response | grep -q "version"; then
    echo "Response contains version field ✓"
  elif echo $response | grep -q "apiVersion"; then
    echo "Response contains apiVersion field ✓"
  else
    echo "Response missing version field ✗"
    # Add a fix suggestion
    echo "  Fix: Ensure 'version' field is included in health response"
  fi
  
  # Check for activeJobs or jobs field
  if echo $response | grep -q "activeJobs"; then
    echo "Response contains activeJobs field ✓"
  elif echo $response | grep -q "jobs"; then
    echo "Response contains jobs field ✓"
  else
    echo "Response missing activeJobs field ✗"
    echo "  Fix: Ensure 'activeJobs' or 'jobs' field is included in health response"
  fi
  
  # Check for memory or memoryUsage field
  if echo $response | grep -q "memory"; then
    echo "Response contains memory field ✓"
  elif echo $response | grep -q "memoryUsage"; then
    echo "Response contains memoryUsage field ✓"
  else
    echo "Response missing memory field ✗"
    echo "  Fix: Ensure 'memory' field is included in health response"
  fi
  
  echo "---------------------------------"
  echo "Response:"
  echo $response | jq '.'
  
  # Store original response for reference
  echo $response > health_response.json
  echo "Response saved to health_response.json"
  
  # Suggest a fix to align the API response with test expectations
  echo "---------------------------------"
  echo "Potential Fix:"
  echo "If you're seeing missing fields, ensure the health endpoint returns at least:"
  echo "{"
  echo "  \"status\": \"ok\","
  echo "  \"version\": \"1.0.0\","
  echo "  \"activeJobs\": 0,"
  echo "  \"memory\": {"
  echo "    \"rss\": \"50MB\","
  echo "    \"heapTotal\": \"20MB\","
  echo "    \"heapUsed\": \"15MB\""
  echo "  }"
  echo "}"
else
  echo "Request failed with status code $?"
fi

echo "---------------------------------"
echo "Health endpoint test completed."