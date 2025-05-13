#!/bin/bash
# Test script for the /api/versions endpoint

API_URL="http://localhost:9000"

echo "Testing /api/versions endpoint..."
echo "---------------------------------"

# Make the request and capture the response
response=$(curl -s $API_URL/api/versions)

# Check if the request was successful
if [[ $? -eq 0 ]]; then
  echo "Request successful!"
  
  # Check if the response contains expected fields
  if echo $response | grep -q "success"; then
    echo "Response contains success field ✓"
  else
    echo "Response missing success field ✗"
  fi
  
  if echo $response | grep -q "versions"; then
    echo "Response contains versions field ✓"
    
    # Extract and print the versions
    echo "---------------------------------"
    echo "Available Solidity versions:"
    echo $response | jq '.versions[]'
  else
    echo "Response missing versions field ✗"
  fi
  
  echo "---------------------------------"
  echo "Response:"
  echo $response | jq '.'
else
  echo "Request failed with status code $?"
fi

echo "---------------------------------"
echo "Versions endpoint test completed."