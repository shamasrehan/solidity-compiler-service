#!/bin/bash
# Test script for caching in the /api/compile endpoint

API_URL="http://localhost:9000"

echo "Testing caching functionality in /api/compile endpoint..."
echo "--------------------------------------------------------"

# Create a simple contract for testing
read -r -d '' CONTRACT << 'EOT'
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract CacheTest {
    string public message;
    
    constructor(string memory initialMessage) {
        message = initialMessage;
    }
    
    function setMessage(string memory newMessage) public {
        message = newMessage;
    }
    
    function getMessage() public view returns (string memory) {
        return message;
    }
}
EOT

# Create JSON payload with a custom cache key
read -r -d '' PAYLOAD << EOT
{
  "source": $(jq -Rs . <<< "$CONTRACT"),
  "version": "0.8.19",
  "settings": {
    "optimizer": {
      "enabled": true,
      "runs": 200
    }
  },
  "cacheKey": "custom-cache-test-key-$(date +%s)"
}
EOT

echo "Step 1: First compilation (should cache result)"
start_time=$(date +%s.%N)
first_response=$(curl -s -X POST -H "Content-Type: application/json" -d "$PAYLOAD" $API_URL/api/compile)
end_time=$(date +%s.%N)
first_compile_time=$(echo "$end_time - $start_time" | bc)

if [[ $(echo $first_response | jq '.success') == "true" ]]; then
  echo "✓ First compilation successful"
  jobId=$(echo $first_response | jq -r '.jobId')
  echo "Job ID: $jobId"
  echo "Compilation time: $first_compile_time seconds"
  
  # Prepare second request with the same cache key
  read -r -d '' PAYLOAD_2 << EOT
  {
    "source": $(jq -Rs . <<< "$CONTRACT"),
    "version": "0.8.19",
    "settings": {
      "optimizer": {
        "enabled": true,
        "runs": 200
      }
    },
    "cacheKey": $(echo $PAYLOAD | jq -r '.cacheKey')
  }
EOT
  
  echo "---------------------------------"
  echo "Step 2: Second compilation with same code (should use cache)"
  start_time=$(date +%s.%N)
  second_response=$(curl -s -X POST -H "Content-Type: application/json" -d "$PAYLOAD_2" $API_URL/api/compile)
  end_time=$(date +%s.%N)
  second_compile_time=$(echo "$end_time - $start_time" | bc)
  
  if [[ $(echo $second_response | jq '.success') == "true" ]]; then
    echo "✓ Second compilation successful"
    second_jobId=$(echo $second_response | jq -r '.jobId')
    echo "Job ID: $second_jobId"
    echo "Compilation time: $second_compile_time seconds"
    
    # Check for cached field in response
    if echo $second_response | jq -e '.cached' > /dev/null; then
      cached=$(echo $second_response | jq '.cached')
      if [[ $cached == "true" ]]; then
        echo "✓ Cache was used for second compilation"
      else
        echo "✗ Cache was not used for second compilation"
      fi
    else
      echo "? No cache indicator in response"
    fi
    
    # Compare response times
    time_diff=$(echo "$first_compile_time - $second_compile_time" | bc)
    if (( $(echo "$time_diff > 0" | bc -l) )); then
      echo "✓ Second compilation was faster (by $(echo "$time_diff" | bc) seconds)"
    else
      echo "✗ Second compilation was not faster"
    fi
    
    # Check if both responses have the same bytecode and ABI
    first_bytecode=$(echo $first_response | jq -r '.compiled.bytecode')
    second_bytecode=$(echo $second_response | jq -r '.compiled.bytecode')
    
    if [[ "$first_bytecode" == "$second_bytecode" ]]; then
      echo "✓ Bytecode is consistent between compilations"
    else
      echo "✗ Bytecode differs between compilations"
    fi
    
    first_abi_size=$(echo $first_response | jq '.compiled.abi | length')
    second_abi_size=$(echo $second_response | jq '.compiled.abi | length')
    
    if [[ "$first_abi_size" == "$second_abi_size" ]]; then
      echo "✓ ABI size is consistent between compilations"
    else
      echo "✗ ABI size differs between compilations"
    fi
  else
    echo "✗ Second compilation failed"
    echo "Error: $(echo $second_response | jq -r '.error')"
  fi
else
  echo "✗ First compilation failed"
  echo "Error: $(echo $first_response | jq -r '.error')"
fi

echo "---------------------------------"
echo "Step 3: Modifying the contract to test cache invalidation"

# Modify the contract slightly
read -r -d '' MODIFIED_CONTRACT << 'EOT'
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract CacheTest {
    string public message;
    uint256 public counter;  // Added new variable
    
    constructor(string memory initialMessage) {
        message = initialMessage;
        counter = 0;  // Initialize new variable
    }
    
    function setMessage(string memory newMessage) public {
        message = newMessage;
        counter += 1;  // Increment counter
    }
    
    function getMessage() public view returns (string memory) {
        return message;
    }
    
    function getCounter() public view returns (uint256) {  // Added new function
        return counter;
    }
}
EOT

# Create JSON payload with the same cache key but modified code
read -r -d '' PAYLOAD_3 << EOT
{
  "source": $(jq -Rs . <<< "$MODIFIED_CONTRACT"),
  "version": "0.8.19",
  "settings": {
    "optimizer": {
      "enabled": true,
      "runs": 200
    }
  },
  "cacheKey": $(echo $PAYLOAD | jq -r '.cacheKey')
}
EOT

start_time=$(date +%s.%N)
third_response=$(curl -s -X POST -H "Content-Type: application/json" -d "$PAYLOAD_3" $API_URL/api/compile)
end_time=$(date +%s.%N)
third_compile_time=$(echo "$end_time - $start_time" | bc)

if [[ $(echo $third_response | jq '.success') == "true" ]]; then
  echo "✓ Modified contract compilation successful"
  third_jobId=$(echo $third_response | jq -r '.jobId')
  echo "Job ID: $third_jobId"
  echo "Compilation time: $third_compile_time seconds"
  
  # Check if the cache was used or not
  if echo $third_response | jq -e '.cached' > /dev/null; then
    cached=$(echo $third_response | jq '.cached')
    if [[ $cached == "true" ]]; then
      echo "! Cache was used for modified contract (unexpected)"
    else
      echo "✓ Cache was not used for modified contract (expected)"
    fi
  else
    echo "? No cache indicator in response"
  fi
  
  # Check if the modified contract's ABI has the new function
  if echo $third_response | jq -e '.compiled.abi[] | select(.name == "getCounter")' > /dev/null; then
    echo "✓ Modified contract includes new getCounter function"
  else
    echo "✗ Modified contract is missing getCounter function"
  fi
else
  echo "✗ Modified contract compilation failed"
  echo "Error: $(echo $third_response | jq -r '.error')"
fi

echo "---------------------------------"
echo "Caching test completed."