# Solidity Compiler API Service
## User Guide

This document provides detailed instructions on how to set up and use the Solidity Compiler API Service, which allows you to compile and verify Solidity smart contracts via REST API endpoints using Foundry.

## Table of Contents
1. [Installation](#installation)
2. [API Endpoints](#api-endpoints)
3. [Example Usage](#example-usage)
4. [Troubleshooting](#troubleshooting)
5. [Advanced Configuration](#advanced-configuration)

## Installation

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn
- Foundry tools (forge, cast, anvil)
- solc-select (for Solidity compiler version management)

### Setup Instructions
1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/solidity-compiler-api.git
   cd solidity-compiler-api
   ```

2. Install dependencies:
   ```bash
   npm install
   # or
   yarn install
   ```

3. Make sure Foundry is installed:
   ```bash
   curl -L https://foundry.paradigm.xyz | bash
   foundryup
   ```

4. Install solc-select for Solidity compiler version management:
   ```bash
   pip install solc-select
   solc-select install 0.8.19  # Install default version
   solc-select use 0.8.19      # Set default version
   ```

5. Create a `.env` file in the root directory:
   ```bash
   touch .env
   ```

6. Add the following environment variables to your `.env` file:
   ```
   PORT=3000
   ```

7. Start the server:
   ```bash
   npm start
   # or
   yarn start
   ```

8. For development with auto-restart:
   ```bash
   npm run dev
   # or
   yarn dev
   ```

## API Endpoints

### 1. Compile Solidity Contract
Compiles a Solidity smart contract and returns the compilation result.

- **URL:** `/solidity/compile`
- **Method:** `POST`
- **Content-Type:** `application/json`

#### Request Body Parameters
| Parameter | Type | Description | Required |
|-----------|------|-------------|----------|
| code | string | The complete Solidity smart contract code | Yes |
| evmVersion | string | EVM version to target (e.g., "paris", "shanghai") | No |
| compilerVersion | string | Solidity compiler version (e.g., "0.8.19") | No |
| dependencies | array | List of dependencies to install (e.g., ["OpenZeppelin/openzeppelin-contracts"]) | No |

> **Note:** The service will automatically install the specified Solidity compiler version if it's not already installed. It will also configure the compilation environment to use the specified EVM version.

#### Sample Request
```bash
curl -X POST http://localhost:3000/solidity/compile \
  -H "Content-Type: application/json" \
  -d '{
    "code": "// SPDX-License-Identifier: MIT\npragma solidity ^0.8.19;\n\ncontract SimpleStorage {\n    uint256 private value;\n    \n    function set(uint256 _value) public {\n        value = _value;\n    }\n    \n    function get() public view returns (uint256) {\n        return value;\n    }\n}",
    "evmVersion": "paris",
    "compilerVersion": "0.8.19",
    "dependencies": []
  }'
```

#### Successful Response (200 OK)
```json
{
  "status": "success",
  "contractId": "1683046845123",
  "bytecode": "0x608060405234801561001057600080fd5b5060f78061001f6000396000f3fe6080604052348015600f57600080fd5b506004361060325760003560e01c806360fe47b11460375780636d4ce63c146049575b600080fd5b60476042366004605e565b600055565b005b604c6054565b60405190815260200160405180910390f35b60005490565b600060208284031215606f57600080fd5b503591905056fea26469706673582212207663f755c1c4128f2bef44c36fb7bd7d2201e7c654736b030f5a225f30fa596364736f6c63430008130033",
  "abi": [
    {
      "inputs": [],
      "name": "get",
      "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [{"internalType": "uint256", "name": "_value", "type": "uint256"}],
      "name": "set",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    }
  ],
  "compilerVersion": "0.8.19",
  "evmVersion": "paris",
  "message": "Contract compiled successfully"
}
```

#### Error Response (400 Bad Request / 500 Internal Server Error)
```json
{
  "status": "error",
  "message": "Compilation failed",
  "errors": [
    {
      "component": "general",
      "formattedMessage": "ParserError: Expected pragma, import directive or contract/interface/library/struct/enum/constant/function definition.\n --> Contract.sol:3:1:\n  |\n3 | conract SimpleStorage {\n  | ^-----^\n\n",
      "severity": "error",
      "type": "ParserError"
    }
  ]
}
```

### 2. Verify Contract
Verifies a deployed Solidity smart contract on the blockchain explorer.

- **URL:** `/solidity/verify`
- **Method:** `POST`
- **Content-Type:** `application/json`

#### Request Body Parameters
| Parameter | Type | Description | Required |
|-----------|------|-------------|----------|
| contractAddress | string | The address of the deployed contract | Yes |
| constructorArgs | array | Constructor arguments used during deployment (if any) | No |
| contractId | string | Contract ID received from the compilation endpoint | Yes |
| chainId | number | Chain ID (1=Ethereum, 137=Polygon, 56=BSC, 42161=Arbitrum, 10=Optimism) | Yes |
| explorerApiKey | string | API key for the blockchain explorer | Yes |

#### Sample Request
```bash
curl -X POST http://localhost:3000/solidity/verify \
  -H "Content-Type: application/json" \
  -d '{
    "contractAddress": "0x123abc...",
    "contractId": "1683046845123",
    "chainId": 1,
    "explorerApiKey": "YOUR_ETHERSCAN_API_KEY"
  }'
```

#### Successful Response (200 OK)
```json
{
  "status": "success",
  "message": "Contract successfully verified",
  "details": "Successfully verified contract SimpleStorage on Etherscan."
}
```

#### Error Response (400 Bad Request / 404 Not Found / 500 Internal Server Error)
```json
{
  "status": "error",
  "message": "Contract artifacts not found. Please compile the contract first."
}
```

## Example Usage

### Workflow: Compile and Verify a Contract

1. **Step 1: Compile the contract**

```javascript
// compile-contract.js
const axios = require('axios');

async function compileContract() {
  const contractCode = `
    // SPDX-License-Identifier: MIT
    pragma solidity ^0.8.19;
    
    import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
    
    contract MyToken is ERC20 {
        constructor(uint256 initialSupply) ERC20("MyToken", "MTK") {
            _mint(msg.sender, initialSupply);
        }
    }
  `;
  
  try {
    const response = await axios.post('http://localhost:3000/solidity/compile', {
      code: contractCode,
      compilerVersion: '0.8.19',
      dependencies: ['OpenZeppelin/openzeppelin-contracts']
    });
    
    console.log('Compilation successful!');
    console.log('Contract ID:', response.data.contractId);
    console.log('Bytecode:', response.data.bytecode.substring(0, 50) + '...');
    
    return response.data;
  } catch (error) {
    console.error('Compilation failed:', error.response?.data || error.message);
  }
}

compileContract();
```

2. **Step 2: Deploy the contract using the bytecode** (using ethers.js example)

```javascript
// deploy-contract.js
const { ethers } = require('ethers');
const fs = require('fs');

async function deployContract(compiledData) {
  const provider = new ethers.providers.JsonRpcProvider('YOUR_RPC_URL');
  const wallet = new ethers.Wallet('YOUR_PRIVATE_KEY', provider);
  
  const factory = new ethers.ContractFactory(
    compiledData.abi,
    compiledData.bytecode,
    wallet
  );
  
  // Deploy with constructor arguments (e.g., initial supply of 1000000 tokens)
  const initialSupply = ethers.utils.parseEther('1000000');
  const contract = await factory.deploy(initialSupply);
  
  await contract.deployed();
  console.log('Contract deployed to:', contract.address);
  
  // Save deployment info for verification
  const deploymentInfo = {
    contractAddress: contract.address,
    contractId: compiledData.contractId,
    constructorArgs: [initialSupply.toString()],
    chainId: 1, // Ethereum mainnet
    explorerApiKey: 'YOUR_ETHERSCAN_API_KEY'
  };
  
  fs.writeFileSync('deployment-info.json', JSON.stringify(deploymentInfo, null, 2));
  return deploymentInfo;
}

// Load compiled data and deploy
const compiledData = require('./compiled-contract.json');
deployContract(compiledData);
```

3. **Step 3: Verify the deployed contract**

```javascript
// verify-contract.js
const axios = require('axios');
const fs = require('fs');

async function verifyContract() {
  const deploymentInfo = JSON.parse(fs.readFileSync('deployment-info.json'));
  
  try {
    const response = await axios.post('http://localhost:3000/solidity/verify', deploymentInfo);
    
    console.log('Verification successful!');
    console.log(response.data.message);
    console.log('Details:', response.data.details);
  } catch (error) {
    console.error('Verification failed:', error.response?.data || error.message);
  }
}

verifyContract();
```

## Troubleshooting

### Common Issues and Solutions

1. **Compilation Fails with Dependency Errors**
   - Ensure you have listed all required dependencies
   - Check that dependency versions are compatible with your Solidity version
   - Try installing the dependencies manually with `forge install [dependency]`

2. **Compiler Version Not Found or Installed**
   - The service will attempt to automatically install the specified compiler version
   - If this fails, ensure `solc-select` is properly installed on your server
   - You can manually install compiler versions with `solc-select install [version]`

2. **Verification Fails**
   - Make sure the contract was deployed using exactly the same bytecode
   - Verify that constructor arguments are provided in the correct format
   - Ensure you have the correct API key for the blockchain explorer
   - Check that you're using the correct chainId for your network

3. **Server Connection Issues**
   - Verify the server is running on the expected port
   - Check firewall settings if accessing remotely
   - Ensure request content-type is set to application/json

4. **File System Errors**
   - Ensure the application has write permissions to create temporary directories
   - Check disk space availability

### API Response Status Codes

- `200`: Request processed successfully
- `400`: Bad request (missing parameters, invalid input)
- `404`: Resource not found (e.g., contract artifacts)
- `500`: Internal server error

## Advanced Configuration

### Environment Variables

You can configure the following environment variables in your `.env` file:

```
PORT=3000                        # Port to run the API server
TEMP_DIR=./temp                  # Directory for temporary files
ARTIFACTS_DIR=./artifacts        # Directory to store compilation artifacts
LOG_LEVEL=info                   # Logging level (debug, info, warn, error)
```

### Custom Network Configuration

To add support for additional networks:

1. Edit the `index.js` file
2. Find the network mapping in the `/solidity/verify` endpoint
3. Add your new network configuration:

```javascript
case '100': // xDai Chain
  explorerApiUrl = 'https://api.gnosisscan.io/api';
  break;
```

### Security Considerations

- For production deployments, configure proper rate limiting
- Set up HTTPS for secure API access
- Consider adding authentication for API endpoints
- Configure CORS settings to restrict allowed origins

### Advanced Usage with CI/CD

You can integrate this API with your CI/CD pipeline to automatically verify contracts upon deployment:

1. Deploy the API service to a dedicated server
2. In your deployment script, call the compile endpoint
3. After successful deployment, call the verify endpoint
4. Save verification results to your deployment logs

---

For additional support or feature requests, please open an issue on the GitHub repository.