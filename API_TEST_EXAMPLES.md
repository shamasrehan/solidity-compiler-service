# API Test Examples

This document contains examples for testing the Smart Contract Compiler API using different tools and use cases.

## Prerequisites

- The API service is running at `http://localhost:3000`
- Foundry is installed and properly configured
- cURL or Postman or another API testing tool is available

## Test Examples

### 1. Compile a Simple Hello World Contract

**Request:**

```bash
curl -X POST http://localhost:3001/api/v1/compile \
  -H "Content-Type: application/json" \
  -d '{
    "contractCode": "// SPDX-License-Identifier: MIT\npragma solidity ^0.8.20;\n\ncontract HelloWorld {\n    string public greeting = \"Hello, World!\";\n\n    function setGreeting(string memory _greeting) public {\n        greeting = _greeting;\n    }\n\n    function getGreeting() public view returns (string memory) {\n        return greeting;\n    }\n}",
    "solidityVersion": "0.8.20",
    "evmVersion": "paris",
    "optimize": true,
    "contractName": "HelloWorld"
  }'
```

### 2. Compile an ERC20 Token with OpenZeppelin Imports

**Request:**

```bash
curl -X POST http://localhost:3001/api/v1/compile \
  -H "Content-Type: application/json" \
  -d '{
    "contractCode": "// SPDX-License-Identifier: MIT\npragma solidity ^0.8.20;\n\nimport \"@openzeppelin/contracts/token/ERC20/ERC20.sol\";\n\ncontract MyToken is ERC20 {\n    constructor(uint256 initialSupply) ERC20(\"MyToken\", \"MTK\") {\n        _mint(msg.sender, initialSupply);\n    }\n}",
    "solidityVersion": "0.8.20",
    "contractName": "MyToken"
  }'
```

### 3. Compile a Uniswap V2 Pair Clone

**Request:**

```bash
curl -X POST http://localhost:3000/api/v1/compile \
  -H "Content-Type: application/json" \
  -d '{
    "contractCode": "// SPDX-License-Identifier: GPL-3.0\npragma solidity ^0.8.20;\n\nimport \"@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol\";\nimport \"@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol\";\n\ncontract UniswapInteractor {\n    IUniswapV2Factory public factory;\n    \n    constructor(address _factory) {\n        factory = IUniswapV2Factory(_factory);\n    }\n    \n    function createPair(address tokenA, address tokenB) external returns (address pair) {\n        return factory.createPair(tokenA, tokenB);\n    }\n    \n    function getPair(address tokenA, address tokenB) external view returns (address pair) {\n        return factory.getPair(tokenA, tokenB);\n    }\n}",
    "solidityVersion": "0.8.20",
    "contractName": "UniswapInteractor"
  }'
```

### 4. Compile with an Older Solidity Version

**Request:**

```bash
curl -X POST http://localhost:3000/api/v1/compile \
  -H "Content-Type: application/json" \
  -d '{
    "contractCode": "// SPDX-License-Identifier: MIT\npragma solidity ^0.7.6;\n\ncontract OldVersionContract {\n    uint256 public value;\n    \n    function setValue(uint256 _value) public {\n        value = _value;\n    }\n    \n    function getValue() public view returns (uint256) {\n        return value;\n    }\n}",
    "solidityVersion": "0.7.6",
    "contractName": "OldVersionContract"
  }'
```

### 5. Check Compilation Status Only

**Request:**

```bash
curl -X POST http://localhost:3000/api/v1/compile/check \
  -H "Content-Type: application/json" \
  -d '{
    "contractCode": "// SPDX-License-Identifier: MIT\npragma solidity ^0.8.20;\n\ncontract SimpleStorage {\n    uint256 private value;\n    \n    function set(uint256 _value) public {\n        value = _value;\n    }\n    \n    function get() public view returns (uint256) {\n        return value;\n    }\n}",
    "solidityVersion": "0.8.20",
    "contractName": "SimpleStorage"
  }'
```

### 6. Expected Failure Case (Invalid Syntax)

**Request:**

```bash
curl -X POST http://localhost:3000/api/v1/compile \
  -H "Content-Type: application/json" \
  -d '{
    "contractCode": "// SPDX-License-Identifier: MIT\npragma solidity ^0.8.20;\n\ncontract BrokenContract {\n    uint256 public value\n    \n    function setValue(uint256 _value) public {\n        value = _value;\n    }\n}",
    "solidityVersion": "0.8.20",
    "contractName": "BrokenContract"
  }'
```

### 7. Get API Status

**Request:**

```bash
curl -X GET http://localhost:3000/api/v1/compile/status
```

## Using with Node.js

Here's an example of using the API from a Node.js application:

```javascript
const axios = require('axios');
const fs = require('fs');

// Read contract code from a file
const contractCode = fs.readFileSync('./MyContract.sol', 'utf8');

async function compileContract() {
  try {
    const response = await axios.post('http://localhost:3000/api/v1/compile', {
      contractCode,
      solidityVersion: "0.8.20",
      optimize: true,
      contractName: "MyContract"
    });
    
    console.log('Compilation successful!');
    
    // Save the compilation result
    fs.writeFileSync(
      './compilation-output.json', 
      JSON.stringify(response.data.result, null, 2)
    );
    
    // Extract the ABI
    const contractKey = Object.keys(response.data.result.contracts)[0];
    const abi = response.data.result.contracts[contractKey].abi;
    
    fs.writeFileSync('./abi.json', JSON.stringify(abi, null, 2));
    
    console.log('Saved compilation output and ABI to files');
  } catch (error) {
    console.error('Compilation failed:');
    if (error.response) {
      console.error(error.response.data);
    } else {
      console.error(error.message);
    }
  }
}

compileContract();
```

## Performance Testing

To test the concurrent compilation feature, you can use a script like this:

```javascript
const axios = require('axios');

// Simple contract template
const createContract = (name, value) => `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract ${name} {
    uint256 public constant VALUE = ${value};
    
    function getValue() public pure returns (uint256) {
        return VALUE;
    }
}`;

// Send multiple compilation requests simultaneously
async function testConcurrentCompilations(count) {
  console.time('compilationTime');
  
  const requests = [];
  
  for (let i = 0; i < count; i++) {
    const contract = createContract(`Contract${i}`, i * 1000);
    
    requests.push(
      axios.post('http://localhost:3000/api/v1/compile', {
        contractCode: contract,
        solidityVersion: "0.8.20",
        contractName: `Contract${i}`
      })
    );
  }
  
  try {
    const results = await Promise.all(requests);
    
    const successful = results.filter(r => r.data.success).length;
    console.log(`Successfully compiled ${successful} of ${count} contracts`);
  } catch (error) {
    console.error('Error during concurrent compilation test:', error.message);
  }
  
  console.timeEnd('compilationTime');
}

// Test with 5 concurrent requests
testConcurrentCompilations(5);
```

## When Testing the API

1. Start with simple contracts to verify basic functionality
2. Test with contracts that use external dependencies
3. Try various Solidity and EVM versions
4. Test error handling with invalid contracts
5. Test the concurrent compilation limits
6. Examine the detailed output for contract ABIs and bytecode