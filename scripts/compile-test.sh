#!/bin/bash
# Test script for the /api/compile endpoint with a simple ERC20 token contract

API_URL="http://localhost:9000"

echo "Testing /api/compile endpoint..."
echo "---------------------------------"

# Simple ERC20 token contract
read -r -d '' CONTRACT << 'EOT'
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract SimpleToken {
    string public name = "SimpleToken";
    string public symbol = "ST";
    uint8 public decimals = 18;
    uint256 public totalSupply = 1000000 * 10 ** uint256(decimals);
    
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    
    constructor() {
        balanceOf[msg.sender] = totalSupply;
    }
    
    function transfer(address to, uint256 value) public returns (bool success) {
        require(balanceOf[msg.sender] >= value, "Insufficient balance");
        balanceOf[msg.sender] -= value;
        balanceOf[to] += value;
        emit Transfer(msg.sender, to, value);
        return true;
    }
    
    function approve(address spender, uint256 value) public returns (bool success) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }
    
    function transferFrom(address from, address to, uint256 value) public returns (bool success) {
        require(balanceOf[from] >= value, "Insufficient balance");
        require(allowance[from][msg.sender] >= value, "Insufficient allowance");
        balanceOf[from] -= value;
        balanceOf[to] += value;
        allowance[from][msg.sender] -= value;
        emit Transfer(from, to, value);
        return true;
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
echo "Sending compilation request..."
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
        echo "Contract successfully compiled!"
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
echo "Compile endpoint test completed."