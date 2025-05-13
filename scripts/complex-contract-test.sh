#!/bin/bash
# Test script for the /api/compile endpoint with complex contract features

API_URL="http://localhost:9000"

echo "Testing /api/compile endpoint with a complex contract..."
echo "-------------------------------------------------------"

# Complex contract with multiple inheritance, interfaces, libraries
read -r -d '' CONTRACT << 'EOT'
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

// Interface definition
interface IToken {
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

// Library example
library SafeMath {
    function add(uint256 a, uint256 b) internal pure returns (uint256) {
        uint256 c = a + b;
        require(c >= a, "SafeMath: addition overflow");
        return c;
    }
    
    function sub(uint256 a, uint256 b) internal pure returns (uint256) {
        require(b <= a, "SafeMath: subtraction overflow");
        return a - b;
    }
}

// Base contract
contract Ownable {
    address private _owner;
    
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    
    constructor() {
        _owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }
    
    function owner() public view returns (address) {
        return _owner;
    }
    
    modifier onlyOwner() {
        require(_owner == msg.sender, "Ownable: caller is not the owner");
        _;
    }
    
    function transferOwnership(address newOwner) public onlyOwner {
        require(newOwner != address(0), "Ownable: new owner is the zero address");
        emit OwnershipTransferred(_owner, newOwner);
        _owner = newOwner;
    }
}

// Complex contract with inheritance, library usage, and interface implementation
contract ComplexToken is IToken, Ownable {
    using SafeMath for uint256;
    
    string public name;
    string public symbol;
    uint8 public decimals;
    uint256 private _totalSupply;
    
    mapping(address => uint256) private _balances;
    mapping(address => mapping(address => uint256)) private _allowances;
    
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    
    constructor(string memory tokenName, string memory tokenSymbol, uint8 tokenDecimals, uint256 initialSupply) {
        name = tokenName;
        symbol = tokenSymbol;
        decimals = tokenDecimals;
        _totalSupply = initialSupply * 10**uint256(decimals);
        _balances[msg.sender] = _totalSupply;
        emit Transfer(address(0), msg.sender, _totalSupply);
    }
    
    function totalSupply() public view returns (uint256) {
        return _totalSupply;
    }
    
    function balanceOf(address account) public view override returns (uint256) {
        return _balances[account];
    }
    
    function transfer(address to, uint256 amount) public override returns (bool) {
        require(to != address(0), "Transfer to zero address");
        
        address sender = msg.sender;
        _balances[sender] = _balances[sender].sub(amount);
        _balances[to] = _balances[to].add(amount);
        emit Transfer(sender, to, amount);
        return true;
    }
    
    function allowance(address owner, address spender) public view returns (uint256) {
        return _allowances[owner][spender];
    }
    
    function approve(address spender, uint256 amount) public returns (bool) {
        address sender = msg.sender;
        _allowances[sender][spender] = amount;
        emit Approval(sender, spender, amount);
        return true;
    }
    
    function transferFrom(address from, address to, uint256 amount) public returns (bool) {
        require(from != address(0), "Transfer from zero address");
        require(to != address(0), "Transfer to zero address");
        
        _balances[from] = _balances[from].sub(amount);
        _allowances[from][msg.sender] = _allowances[from][msg.sender].sub(amount);
        _balances[to] = _balances[to].add(amount);
        emit Transfer(from, to, amount);
        return true;
    }
    
    // Owner-only functions
    function mint(address to, uint256 amount) public onlyOwner {
        require(to != address(0), "Mint to zero address");
        
        _totalSupply = _totalSupply.add(amount);
        _balances[to] = _balances[to].add(amount);
        emit Transfer(address(0), to, amount);
    }
    
    function burn(uint256 amount) public {
        address sender = msg.sender;
        _balances[sender] = _balances[sender].sub(amount);
        _totalSupply = _totalSupply.sub(amount);
        emit Transfer(sender, address(0), amount);
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
echo "Sending compilation request for complex contract..."
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
          bytecode_length=$(echo $response | jq -r '.compiled.bytecode' | wc -c)
          echo "Bytecode length: $bytecode_length chars"
        else
          echo "Bytecode missing ✗"
        fi
        
        if echo $response | jq -e '.compiled.abi' > /dev/null; then
          echo "ABI found ✓"
          abi_size=$(echo $response | jq '.compiled.abi | length')
          echo "ABI has $abi_size entries"
          
          # Check if specific methods exist in the ABI
          if echo $response | jq -e '.compiled.abi[] | select(.name == "transfer")' > /dev/null; then
            echo "ABI contains transfer method ✓"
          else
            echo "ABI missing transfer method ✗"
          fi
          
          if echo $response | jq -e '.compiled.abi[] | select(.name == "mint")' > /dev/null; then
            echo "ABI contains mint method ✓"
          else
            echo "ABI missing mint method ✗"
          fi
        else
          echo "ABI missing ✗"
        fi
        
        echo "---------------------------------"
        echo "Complex contract successfully compiled!"
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
echo "Complex contract test completed."