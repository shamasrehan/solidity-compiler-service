#!/bin/bash
# Test script for the /api/compile endpoint with OpenZeppelin dependencies

API_URL="http://localhost:9000"

echo "Testing /api/compile endpoint with OpenZeppelin dependencies..."
echo "-------------------------------------------------------------"

# ERC20 token contract using OpenZeppelin
read -r -d '' CONTRACT << 'EOT'
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MyToken is ERC20, ERC20Burnable, Ownable {
    constructor(address initialOwner)
        ERC20("MyToken", "MTK")
        Ownable(initialOwner)
    {
        _mint(msg.sender, 1000000 * 10 ** decimals());
    }

    function mint(address to, uint256 amount) public onlyOwner {
        _mint(to, amount);
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
    },
    "evmVersion": "paris"
  }
}
EOT

# Make the request and capture the response
echo "Sending compilation request with dependencies..."
response=$(curl -s -X POST -H "Content-Type: application/json" -d "$PAYLOAD" $API_URL/api/compile)

# Check if the request was successful
if [[ $? -eq 0 ]]; then
  echo "Request sent successfully!"
  
  # Check if the response contains expected fields
  if echo $response | grep -q "success"; then
    success=$(echo $response | jq '.success')
    if [[ $success == "true" ]]; then
      echo "Compilation successful ✓"
      
      # Extract job ID for future reference
      jobId=$(echo $response | jq -r '.jobId')
      echo "Job ID: $jobId"
      
      # Check the dependencies handling
      if echo $response | jq -e '.compiled.dependencies' > /dev/null; then
        echo "Dependencies handled ✓"
        deps=$(echo $response | jq '.compiled.dependencies')
        echo "Dependencies: $deps"
      else
        echo "No dependency information in response"
      fi
      
      # Check the compiled output
      if echo $response | grep -q "compiled"; then
        echo "Response contains compiled output ✓"
        
        # Check bytecode and ABI
        if echo $response | jq -e '.compiled.bytecode' > /dev/null; then
          echo "Bytecode found ✓"
        else
          echo "Bytecode missing ✗"
        fi
        
        if echo $response | jq -e '.compiled.abi' > /dev/null; then
          echo "ABI found ✓"
          abi_size=$(echo $response | jq '.compiled.abi | length')
          echo "ABI has $abi_size entries"
        else
          echo "ABI missing ✗"
        fi
        
        echo "---------------------------------"
        echo "Contract with dependencies successfully compiled!"
      else
        echo "Response missing compiled output ✗"
      fi
    else
      echo "Compilation failed ✗"
      echo "Error: $(echo $response | jq -r '.error')"
    fi
  else
    echo "Response missing success field ✗"
  fi
  
  echo "---------------------------------"
  echo "Response preview:"
  echo $response | jq '.success, .jobId, (.compiled.abi | length)'
else
  echo "Request failed with status code $?"
fi

echo "---------------------------------"
echo "Compile with dependencies test completed."