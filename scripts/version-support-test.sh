#!/bin/bash
# Test script for the /api/compile endpoint with different Solidity versions

API_URL="http://localhost:9000"

echo "Testing /api/compile endpoint with different Solidity versions..."
echo "-----------------------------------------------------------------"

# Function to compile contract with specified version
compile_with_version() {
  local version=$1
  echo "Testing compilation with Solidity version $version..."
  
  # Adjust pragma based on version
  read -r -d '' CONTRACT << EOT
// SPDX-License-Identifier: MIT
pragma solidity ^$version;

contract VersionTest {
    string public version = "$version";
    
    function getVersion() public view returns (string memory) {
        return version;
    }
}
EOT

  # Create JSON payload
  read -r -d '' PAYLOAD << EOT
{
  "source": $(jq -Rs . <<< "$CONTRACT"),
  "version": "$version",
  "settings": {
    "optimizer": {
      "enabled": true,
      "runs": 200
    }
  }
}
EOT

  # Make the request and capture the response
  response=$(curl -s -X POST -H "Content-Type: application/json" -d "$PAYLOAD" $API_URL/api/compile)

  # Check if the request was successful
  if [[ $? -eq 0 ]]; then
    echo "Request sent successfully!"
    
    # Check if the response contains expected fields
    if echo $response | grep -q "success"; then
      success=$(echo $response | jq '.success')
      if [[ $success == "true" ]]; then
        echo "Compilation with Solidity $version successful ✓"
        
        # Extract job ID for future reference
        jobId=$(echo $response | jq -r '.jobId')
        echo "Job ID: $jobId"
        
        echo "---------------------------------"
        echo "Contract successfully compiled with Solidity $version!"
        return 0
      else
        echo "Compilation with Solidity $version failed ✗"
        echo "Error: $(echo $response | jq -r '.error')"
        return 1
      fi
    else
      echo "Response missing success field ✗"
      return 1
    fi
  else
    echo "Request failed with status code $?"
    return 1
  fi
}

# Test with different Solidity versions
versions=("0.7.6" "0.8.0" "0.8.19" "0.8.20")
successful=0
failed=0

for version in "${versions[@]}"; do
  echo "---------------------------------"
  if compile_with_version $version; then
    ((successful++))
  else
    ((failed++))
  fi
  echo ""
done

echo "---------------------------------"
echo "Version support test summary:"
echo "Successful: $successful"
echo "Failed: $failed"
echo "---------------------------------"
echo "Version support test completed."