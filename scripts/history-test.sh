#!/bin/bash
# Test script for the /api/history/:jobId/source and /api/history/:jobId/result endpoints

API_URL="http://localhost:9000"

echo "Testing /api/history endpoints..."
echo "---------------------------------"

# First, compile a simple contract to get a job ID
read -r -d '' CONTRACT << 'EOT'
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract TestContract {
    string public greeting = "Hello, World!";
    
    function setGreeting(string memory _greeting) public {
        greeting = _greeting;
    }
    
    function getGreeting() public view returns (string memory) {
        return greeting;
    }
}
EOT

# Create JSON payload
read -r -d '' PAYLOAD << EOT
{
  "source": $(jq -Rs . <<< "$CONTRACT"),
  "version": "0.8.19",
  "settings": {
    "optimizer": {
      "enabled": true,
      "runs": 200
    }
  }
}
EOT

echo "Compiling a test contract to get a job ID..."
compile_response=$(curl -s -X POST -H "Content-Type: application/json" -d "$PAYLOAD" $API_URL/api/compile)

# Check if the compilation was successful
if [[ $(echo $compile_response | jq '.success') == "true" ]]; then
  # Extract the job ID
  jobId=$(echo $compile_response | jq -r '.jobId')
  echo "Compilation successful. Job ID: $jobId"
  
  # Now test the /api/history/:jobId/source endpoint
  echo "---------------------------------"
  echo "Testing /api/history/$jobId/source endpoint..."
  
  source_response=$(curl -s $API_URL/api/history/$jobId/source)
  
  # Check if the source code was retrieved
  if [[ $? -eq 0 ]]; then
    echo "Source code retrieved successfully!"
    
    # Compare with original contract
    if [[ "$source_response" == "$CONTRACT" ]]; then
      echo "Source code matches the original contract ✓"
    else
      echo "Source code does not match the original contract ✗"
    fi
    
    echo "---------------------------------"
    echo "Source code preview:"
    echo "$source_response" | head -n 10
  else
    echo "Failed to retrieve source code. Status code: $?"
  fi
  
  # Test the /api/history/:jobId/result endpoint
  echo "---------------------------------"
  echo "Testing /api/history/$jobId/result endpoint..."
  
  result_response=$(curl -s $API_URL/api/history/$jobId/result)
  
  # Check if the result was retrieved
  if [[ $? -eq 0 ]]; then
    if echo $result_response | grep -q "success"; then
      success=$(echo $result_response | jq '.success')
      if [[ $success == "true" ]]; then
        echo "Result retrieved successfully ✓"
        
        # Check the result fields
        if echo $result_response | jq -e '.result' > /dev/null; then
          echo "Result contains compilation data ✓"
          
          # Check bytecode and ABI
          if echo $result_response | jq -e '.result.bytecode' > /dev/null; then
            echo "Bytecode found ✓"
          else
            echo "Bytecode missing ✗"
          fi
          
          if echo $result_response | jq -e '.result.abi' > /dev/null; then
            echo "ABI found ✓"
            abi_size=$(echo $result_response | jq '.result.abi | length')
            echo "ABI has $abi_size entries"
          else
            echo "ABI missing ✗"
          fi
        else
          echo "Result missing compilation data ✗"
        fi
      else
        echo "Result retrieval failed ✗"
        echo "Error: $(echo $result_response | jq -r '.error')"
      fi
    else
      echo "Response missing success field ✗"
    fi
    
    echo "---------------------------------"
    echo "Result preview:"
    echo $result_response | jq '.success, .result.abi[0]'
  else
    echo "Failed to retrieve result. Status code: $?"
  fi
else
  echo "Compilation failed. Cannot test history endpoints."
  echo "Error: $(echo $compile_response | jq -r '.error')"
fi

echo "---------------------------------"
echo "History endpoints test completed."