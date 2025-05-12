#!/bin/bash

# Enhanced test script for Solidity Compiler API with multiple compiler versions
# Usage: ./test-solidity-compiler-api.sh [API_URL]

# Set default API URL if not provided
API_URL=${1:-"http://localhost:9000"}

echo "=== Solidity Compiler API Enhanced Test Script ==="
echo "API URL: ${API_URL}"
echo ""

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    echo "Error: jq is required but not installed. Please install jq to run this script."
    exit 1
fi

# Function to print section header
print_section() {
    echo "------------------------------------------------------------"
    echo "$1"
    echo "------------------------------------------------------------"
}

# 1. Basic Health Check
print_section "1. Testing API health endpoint"
curl -s "${API_URL}/api/health" | jq
echo ""

# 2. Retrieve available Solidity versions
print_section "2. Retrieving available Solidity versions"
VERSIONS=$(curl -s "${API_URL}/api/versions")
echo "$VERSIONS" | jq
echo ""

# Check if specific versions are available (needed for later tests)
HAS_0819=$(echo "$VERSIONS" | jq -r '.versions[]' | grep -c "0.8.19" || echo "0")
HAS_0820=$(echo "$VERSIONS" | jq -r '.versions[]' | grep -c "0.8.20" || echo "0")
HAS_0821=$(echo "$VERSIONS" | jq -r '.versions[]' | grep -c "0.8.21" || echo "0")
HAS_076=$(echo "$VERSIONS" | jq -r '.versions[]' | grep -c "0.7.6" || echo "0")
HAS_0612=$(echo "$VERSIONS" | jq -r '.versions[]' | grep -c "0.6.12" || echo "0")
HAS_0426=$(echo "$VERSIONS" | jq -r '.versions[]' | grep -c "0.4.26" || echo "0")

echo "Available versions check:"
echo " - 0.8.19: $([ $HAS_0819 -gt 0 ] && echo "Yes" || echo "No")"
echo " - 0.8.20: $([ $HAS_0820 -gt 0 ] && echo "Yes" || echo "No")"
echo " - 0.8.21: $([ $HAS_0821 -gt 0 ] && echo "Yes" || echo "No")"
echo " - 0.7.6: $([ $HAS_076 -gt 0 ] && echo "Yes" || echo "No")"
echo " - 0.6.12: $([ $HAS_0612 -gt 0 ] && echo "Yes" || echo "No")"
echo " - 0.4.26: $([ $HAS_0426 -gt 0 ] && echo "Yes" || echo "No")"
echo ""

# Default to 0.8.19 if available, otherwise use the first available version
DEFAULT_VERSION="0.8.19"
if [ $HAS_0819 -eq 0 ]; then
    DEFAULT_VERSION=$(echo "$VERSIONS" | jq -r '.versions[0]')
    echo "0.8.19 not available, using $DEFAULT_VERSION as default"
fi

# 3. Compile a simple storage contract with default version
print_section "3. Testing basic contract compilation with Solidity $DEFAULT_VERSION"
curl -s -X POST "${API_URL}/api/compile" \
  -H "Content-Type: application/json" \
  -d '{
    "version": "'$DEFAULT_VERSION'",
    "source": "// SPDX-License-Identifier: MIT\npragma solidity ^'$DEFAULT_VERSION';\n\ncontract SimpleStorage {\n    uint256 private value;\n    \n    function set(uint256 newValue) public {\n        value = newValue;\n    }\n    \n    function get() public view returns (uint256) {\n        return value;\n    }\n}"
  }' | jq '.success, .jobId'

# Store the job ID for later use
JOB_ID=$(curl -s -X POST "${API_URL}/api/compile" \
  -H "Content-Type: application/json" \
  -d '{
    "version": "'$DEFAULT_VERSION'",
    "source": "// SPDX-License-Identifier: MIT\npragma solidity ^'$DEFAULT_VERSION';\n\ncontract SimpleStorage {\n    uint256 private value;\n    \n    function set(uint256 newValue) public {\n        value = newValue;\n    }\n    \n    function get() public view returns (uint256) {\n        return value;\n    }\n}"
  }' | jq -r '.jobId')

echo "Compilation job ID: $JOB_ID"
echo ""

# 4. Compile with Solidity 0.8.20 (if available)
if [ $HAS_0820 -gt 0 ]; then
    print_section "4. Testing contract compilation with Solidity 0.8.20"
    curl -s -X POST "${API_URL}/api/compile" \
      -H "Content-Type: application/json" \
      -d '{
        "version": "0.8.20",
        "source": "// SPDX-License-Identifier: MIT\npragma solidity ^0.8.20;\n\ncontract SimpleStorage {\n    uint256 private value;\n    \n    function set(uint256 newValue) public {\n        value = newValue;\n    }\n    \n    function get() public view returns (uint256) {\n        return value;\n    }\n}"
      }' | jq '.success, .jobId'
    echo ""
else
    print_section "4. Skipping 0.8.20 test (version not available)"
fi

# 5. Compile with the latest Solidity 0.8.21 (if available)
if [ $HAS_0821 -gt 0 ]; then
    print_section "5. Testing contract compilation with Solidity 0.8.21"
    curl -s -X POST "${API_URL}/api/compile" \
      -H "Content-Type: application/json" \
      -d '{
        "version": "0.8.21",
        "source": "// SPDX-License-Identifier: MIT\npragma solidity ^0.8.21;\n\ncontract SimpleStorage {\n    uint256 private value;\n    \n    function set(uint256 newValue) public {\n        value = newValue;\n    }\n    \n    function get() public view returns (uint256) {\n        return value;\n    }\n}"
      }' | jq '.success, .jobId'
    echo ""
else
    print_section "5. Skipping 0.8.21 test (version not available)"
fi

# 6. Compile with an older version 0.7.6 (if available)
if [ $HAS_076 -gt 0 ]; then
    print_section "6. Testing contract compilation with older Solidity 0.7.6"
    curl -s -X POST "${API_URL}/api/compile" \
      -H "Content-Type: application/json" \
      -d '{
        "version": "0.7.6",
        "source": "// SPDX-License-Identifier: MIT\npragma solidity ^0.7.6;\n\ncontract SimpleStorage {\n    uint256 private value;\n    \n    function set(uint256 newValue) public {\n        value = newValue;\n    }\n    \n    function get() public view returns (uint256) {\n        return value;\n    }\n}"
      }' | jq '.success, .jobId'
    echo ""
else
    print_section "6. Skipping 0.7.6 test (version not available)"
fi

# 7. Compile with EVM version specification (Paris)
print_section "7. Testing compilation with EVM version Paris"
curl -s -X POST "${API_URL}/api/compile" \
  -H "Content-Type: application/json" \
  -d '{
    "version": "'$DEFAULT_VERSION'",
    "source": "// SPDX-License-Identifier: MIT\npragma solidity ^'$DEFAULT_VERSION';\n\ncontract SimpleStorage {\n    uint256 private value;\n    \n    function set(uint256 newValue) public {\n        value = newValue;\n    }\n    \n    function get() public view returns (uint256) {\n        return value;\n    }\n}",
    "settings": {
      "evmVersion": "paris",
      "optimizer": {
        "enabled": true,
        "runs": 200
      }
    }
  }' | jq '.success, .jobId'
echo ""

# 8. Compile with EVM version specification (London)
print_section "8. Testing compilation with EVM version London"
curl -s -X POST "${API_URL}/api/compile" \
  -H "Content-Type: application/json" \
  -d '{
    "version": "'$DEFAULT_VERSION'",
    "source": "// SPDX-License-Identifier: MIT\npragma solidity ^'$DEFAULT_VERSION';\n\ncontract SimpleStorage {\n    uint256 private value;\n    \n    function set(uint256 newValue) public {\n        value = newValue;\n    }\n    \n    function get() public view returns (uint256) {\n        return value;\n    }\n}",
    "settings": {
      "evmVersion": "london",
      "optimizer": {
        "enabled": true,
        "runs": 200
      }
    }
  }' | jq '.success, .jobId'
echo ""

# 9. Test caching behavior (should be faster the second time)
print_section "9. Testing caching behavior"
echo "First run:"
time curl -s -X POST "${API_URL}/api/compile" \
  -H "Content-Type: application/json" \
  -d '{
    "version": "'$DEFAULT_VERSION'",
    "source": "// SPDX-License-Identifier: MIT\npragma solidity ^'$DEFAULT_VERSION';\n\ncontract CacheTest {\n    uint256 private value;\n    \n    function set(uint256 newValue) public {\n        value = newValue;\n    }\n    \n    function get() public view returns (uint256) {\n        return value;\n    }\n}"
  }' | jq '.success, .jobId, .cached'

echo "Second run (should be cached):"
time curl -s -X POST "${API_URL}/api/compile" \
  -H "Content-Type: application/json" \
  -d '{
    "version": "'$DEFAULT_VERSION'",
    "source": "// SPDX-License-Identifier: MIT\npragma solidity ^'$DEFAULT_VERSION';\n\ncontract CacheTest {\n    uint256 private value;\n    \n    function set(uint256 newValue) public {\n        value = newValue;\n    }\n    \n    function get() public view returns (uint256) {\n        return value;\n    }\n}"
  }' | jq '.success, .jobId, .cached'
echo ""

# 10. Test with syntax error
print_section "10. Testing compilation with syntax error"
curl -s -X POST "${API_URL}/api/compile" \
  -H "Content-Type: application/json" \
  -d '{
    "version": "'$DEFAULT_VERSION'",
    "source": "// SPDX-License-Identifier: MIT\npragma solidity ^'$DEFAULT_VERSION';\n\ncontract BrokenContract {\n    uint256 public value\n    \n    function setValue(uint256 newValue) public {\n        value = newValue;\n    }\n}"
  }' | jq '.success, .error, .errorType'
echo ""

# 11. Test older Solidity version 0.6.12 (if available)
if [ $HAS_0612 -gt 0 ]; then
    print_section "11. Testing compilation with older Solidity version 0.6.12"
    curl -s -X POST "${API_URL}/api/compile" \
      -H "Content-Type: application/json" \
      -d '{
        "version": "0.6.12",
        "source": "pragma solidity ^0.6.12;\n\ncontract LegacyContract {\n    address public owner;\n    uint256 public value;\n    \n    constructor() public {\n        owner = msg.sender;\n    }\n    \n    modifier onlyOwner() {\n        require(msg.sender == owner, \"Not owner\");\n        _;\n    }\n    \n    function setValue(uint256 newValue) public onlyOwner {\n        value = newValue;\n    }\n    \n    function getValue() public view returns (uint256) {\n        return value;\n    }\n}"
      }' | jq '.success, .jobId'
    echo ""
else
    print_section "11. Skipping 0.6.12 test (version not available)"
fi

# 12. Test very old Solidity version 0.4.26 (if available)
if [ $HAS_0426 -gt 0 ]; then
    print_section "12. Testing compilation with very old Solidity version 0.4.26"
    curl -s -X POST "${API_URL}/api/compile" \
      -H "Content-Type: application/json" \
      -d '{
        "version": "0.4.26",
        "source": "pragma solidity ^0.4.26;\n\ncontract VeryLegacyContract {\n    address public owner;\n    uint256 public value;\n    \n    function VeryLegacyContract() public {\n        owner = msg.sender;\n    }\n    \n    modifier onlyOwner() {\n        require(msg.sender == owner);\n        _;\n    }\n    \n    function setValue(uint256 newValue) public onlyOwner {\n        value = newValue;\n    }\n    \n    function getValue() public view returns (uint256) {\n        return value;\n    }\n}"
      }' | jq '.success, .jobId, .error'
    echo ""
else
    print_section "12. Skipping 0.4.26 test (version not available)"
fi

# 13. Test getting compilation history
print_section "13. Testing compilation history endpoint"
curl -s "${API_URL}/api/history?limit=5" | jq
echo ""

# 14. Test getting job details
print_section "14. Testing compilation job details"
if [ ! -z "$JOB_ID" ]; then
  echo "Getting job details for $JOB_ID:"
  curl -s "${API_URL}/api/history/${JOB_ID}" | jq
  echo ""
  echo "Getting source code:"
  curl -s "${API_URL}/api/history/${JOB_ID}/source" | head -n 10
  echo "..."
  echo ""
  echo "Getting compilation result:"
  curl -s "${API_URL}/api/history/${JOB_ID}/result" | jq '.success'
  echo ""
else
  echo "No job ID available to test job details"
fi

# 15. Test complex contract with libraries and interfaces
print_section "15. Testing complex contract with libraries and interfaces"
curl -s -X POST "${API_URL}/api/compile" \
  -H "Content-Type: application/json" \
  -d '{
    "version": "'$DEFAULT_VERSION'",
    "source": "// SPDX-License-Identifier: MIT\npragma solidity ^'$DEFAULT_VERSION';\n\ninterface IERC20 {\n    function totalSupply() external view returns (uint256);\n    function balanceOf(address account) external view returns (uint256);\n    function transfer(address recipient, uint256 amount) external returns (bool);\n    function allowance(address owner, address spender) external view returns (uint256);\n    function approve(address spender, uint256 amount) external returns (bool);\n    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);\n    \n    event Transfer(address indexed from, address indexed to, uint256 value);\n    event Approval(address indexed owner, address indexed spender, uint256 value);\n}\n\nlibrary SafeMath {\n    function add(uint256 a, uint256 b) internal pure returns (uint256) {\n        uint256 c = a + b;\n        require(c >= a, \"SafeMath: addition overflow\");\n        return c;\n    }\n    \n    function sub(uint256 a, uint256 b) internal pure returns (uint256) {\n        require(b <= a, \"SafeMath: subtraction overflow\");\n        return a - b;\n    }\n    \n    function mul(uint256 a, uint256 b) internal pure returns (uint256) {\n        if (a == 0) return 0;\n        uint256 c = a * b;\n        require(c / a == b, \"SafeMath: multiplication overflow\");\n        return c;\n    }\n}\n\ncontract ComplexToken is IERC20 {\n    using SafeMath for uint256;\n    \n    string public name = \"ComplexToken\";\n    string public symbol = \"CPX\";\n    uint8 public decimals = 18;\n    uint256 private _totalSupply;\n    \n    mapping(address => uint256) private _balances;\n    mapping(address => mapping(address => uint256)) private _allowances;\n    \n    event Transfer(address indexed from, address indexed to, uint256 value);\n    event Approval(address indexed owner, address indexed spender, uint256 value);\n    \n    constructor() {\n        _totalSupply = 1000000 * 10 ** uint256(decimals);\n        _balances[msg.sender] = _totalSupply;\n        emit Transfer(address(0), msg.sender, _totalSupply);\n    }\n    \n    function totalSupply() external view override returns (uint256) {\n        return _totalSupply;\n    }\n    \n    function balanceOf(address account) external view override returns (uint256) {\n        return _balances[account];\n    }\n    \n    function transfer(address recipient, uint256 amount) external override returns (bool) {\n        _transfer(msg.sender, recipient, amount);\n        return true;\n    }\n    \n    function allowance(address owner, address spender) external view override returns (uint256) {\n        return _allowances[owner][spender];\n    }\n    \n    function approve(address spender, uint256 amount) external override returns (bool) {\n        _approve(msg.sender, spender, amount);\n        return true;\n    }\n    \n    function transferFrom(address sender, address recipient, uint256 amount) external override returns (bool) {\n        _transfer(sender, recipient, amount);\n        _approve(sender, msg.sender, _allowances[sender][msg.sender].sub(amount));\n        return true;\n    }\n    \n    function _transfer(address sender, address recipient, uint256 amount) internal {\n        require(sender != address(0), \"Transfer from zero address\");\n        require(recipient != address(0), \"Transfer to zero address\");\n        require(_balances[sender] >= amount, \"Transfer amount exceeds balance\");\n        \n        _balances[sender] = _balances[sender].sub(amount);\n        _balances[recipient] = _balances[recipient].add(amount);\n        \n        emit Transfer(sender, recipient, amount);\n    }\n    \n    function _approve(address owner, address spender, uint256 amount) internal {\n        require(owner != address(0), \"Approve from zero address\");\n        require(spender != address(0), \"Approve to zero address\");\n        \n        _allowances[owner][spender] = amount;\n        emit Approval(owner, spender, amount);\n    }\n}"
  }' | jq '.success, .jobId'
echo ""

# 16. Test active compilation status
print_section "16. Testing active compilation status"
curl -s "${API_URL}/api/status" | jq
echo ""

# 17. Test with custom optimization settings
print_section "17. Testing custom optimization settings (high runs)"
curl -s -X POST "${API_URL}/api/compile" \
  -H "Content-Type: application/json" \
  -d '{
    "version": "'$DEFAULT_VERSION'",
    "source": "// SPDX-License-Identifier: MIT\npragma solidity ^'$DEFAULT_VERSION';\n\ncontract OptimizedContract {\n    uint256 private value;\n    \n    function set(uint256 newValue) public {\n        value = newValue;\n    }\n    \n    function get() public view returns (uint256) {\n        return value;\n    }\n}",
    "settings": {
      "optimizer": {
        "enabled": true,
        "runs": 10000
      }
    }
  }' | jq '.success, .jobId'
echo ""

# 18. Test with custom optimization settings (low runs)
print_section "18. Testing custom optimization settings (low runs)"
curl -s -X POST "${API_URL}/api/compile" \
  -H "Content-Type: application/json" \
  -d '{
    "version": "'$DEFAULT_VERSION'",
    "source": "// SPDX-License-Identifier: MIT\npragma solidity ^'$DEFAULT_VERSION';\n\ncontract OptimizedContract {\n    uint256 private value;\n    \n    function set(uint256 newValue) public {\n        value = newValue;\n    }\n    \n    function get() public view returns (uint256) {\n        return value;\n    }\n}",
    "settings": {
      "optimizer": {
        "enabled": true,
        "runs": 1
      }
    }
  }' | jq '.success, .jobId'
echo ""

# 19. Test without optimization
print_section "19. Testing with optimization disabled"
curl -s -X POST "${API_URL}/api/compile" \
  -H "Content-Type: application/json" \
  -d '{
    "version": "'$DEFAULT_VERSION'",
    "source": "// SPDX-License-Identifier: MIT\npragma solidity ^'$DEFAULT_VERSION';\n\ncontract UnoptimizedContract {\n    uint256 private value;\n    \n    function set(uint256 newValue) public {\n        value = newValue;\n    }\n    \n    function get() public view returns (uint256) {\n        return value;\n    }\n}",
    "settings": {
      "optimizer": {
        "enabled": false
      }
    }
  }' | jq '.success, .jobId'
echo ""

# 20. Check compilation history after all tests
print_section "20. Final check of compilation history"
echo "Number of compilation jobs in history:"
curl -s "${API_URL}/api/history?limit=100" | jq '.history | length'
echo ""

echo "=== End of Enhanced Test Script ==="