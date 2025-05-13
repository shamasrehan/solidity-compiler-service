# Smart Contract Compiler API

A Node.js service for compiling Solidity smart contracts using Foundry. The service provides a RESTful API that handles concurrent compilation requests, supports custom Solidity and EVM versions, and intelligently manages dependencies.

## Features

- **Contract Compilation**: Compile Solidity smart contracts with Foundry using a RESTful API
- **Concurrent Processing**: Queue and process multiple compilation requests efficiently
- **Version Control**: Specify Solidity compiler and EVM versions for each compilation
- **Dependency Management**:
  - Pre-install common dependencies (OpenZeppelin, Solmate, Uniswap, etc.)
  - Dynamically detect and install missing dependencies from contract imports
  - Properly remap library paths for successful compilation
- **Error Handling**: Detailed error reporting for failed compilations
- **API Validation**: Input validation for all requests

## Prerequisites

Before you begin, ensure you have met the following requirements:

- [Node.js](https://nodejs.org/) 18.x or higher
- [Foundry](https://getfoundry.sh/) installed and accessible in PATH

To install Foundry, run:

```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

## Installation

1. Clone the repository:

```bash
git clone https://github.com/yourusername/smart-contract-compiler-api.git
cd smart-contract-compiler-api
```

2. Install dependencies:

```bash
npm install
```

During installation, the script will automatically install pre-configured Solidity dependencies in the `lib` directory using Foundry.

3. Create environment file:

```bash
cp .env.example .env
```

4. Start the server:

```bash
npm start
```

For development with auto-reload:

```bash
npm run dev
```

## API Endpoints

### Compile a Smart Contract

**Endpoint**: `POST /api/v1/compile`

**Request Body**:

```json
{
  "contractCode": "// SPDX-License-Identifier: MIT\npragma solidity ^0.8.20;\n\ncontract HelloWorld {\n    string public greeting = \"Hello, World!\";\n\n    function setGreeting(string memory _greeting) public {\n        greeting = _greeting;\n    }\n\n    function getGreeting() public view returns (string memory) {\n        return greeting;\n    }\n}",
  "solidityVersion": "0.8.20",
  "evmVersion": "paris",
  "optimize": true,
  "optimizeRuns": 200,
  "contractName": "HelloWorld"
}
```

**Response**:

```json
{
  "success": true,
  "message": "Compilation successful",
  "result": {
    "success": true,
    "contracts": {
      "src/HelloWorld.sol:HelloWorld": {
        "abi": [...],
        "bytecode": "0x...",
        "deployedBytecode": "0x...",
        "gasEstimates": {...},
        "methodIdentifiers": {...}
      }
    },
    "sources": {...}
  }
}
```

### Check if a Contract Compiles

**Endpoint**: `POST /api/v1/compile/check`

Same request body as above, but returns a simplified response indicating only success or failure.

**Response**:

```json
{
  "success": true,
  "message": "Contract compiles successfully"
}
```

### Get Service Status

**Endpoint**: `GET /api/v1/compile/status`

**Response**:

```json
{
  "success": true,
  "status": "Compilation service is running",
  "defaultSolidityVersion": "0.8.20",
  "defaultEvmVersion": "paris",
  "maxConcurrentCompilations": 10
}
```

## Configuration

The service can be configured using environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |
| `NODE_ENV` | Environment (development/production) | `development` |
| `FOUNDRY_BIN_PATH` | Path to Foundry binaries | `/usr/local/bin` |
| `DEFAULT_SOLIDITY_VERSION` | Default Solidity version | `0.8.20` |
| `DEFAULT_EVM_VERSION` | Default EVM version | `paris` |
| `TEMP_DIR` | Directory for temporary files | `./tmp` |
| `COMPILATION_TIMEOUT` | Compilation timeout (ms) | `60000` |
| `PRE_INSTALLED` | Whether to pre-install dependencies | `true` |
| `LIB_PATH` | Path to store dependencies | `./lib` |
| `MAX_CONCURRENT_COMPILATIONS` | Max concurrent compilations | `10` |
| `MAX_CONTRACT_SIZE` | Max contract size (chars) | `500000` |
| `LOG_LEVEL` | Logging level | `info` |

## Example Usage

### Using curl

```bash
curl -X POST http://localhost:3000/api/v1/compile \
  -H "Content-Type: application/json" \
  -d '{
    "contractCode": "// SPDX-License-Identifier: MIT\npragma solidity ^0.8.20;\n\ncontract HelloWorld {\n    string public greeting = \"Hello, World!\";\n\n    function setGreeting(string memory _greeting) public {\n        greeting = _greeting;\n    }\n\n    function getGreeting() public view returns (string memory) {\n        return greeting;\n    }\n}",
    "solidityVersion": "0.8.20"
  }'
```

### Using Node.js

```javascript
const axios = require('axios');

async function compileContract() {
  try {
    const response = await axios.post('http://localhost:3000/api/v1/compile', {
      contractCode: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract HelloWorld {
    string public greeting = "Hello, World!";

    function setGreeting(string memory _greeting) public {
        greeting = _greeting;
    }

    function getGreeting() public view returns (string memory) {
        return greeting;
    }
}`,
      solidityVersion: "0.8.20"
    });
    
    console.log('Compilation successful:', response.data);
  } catch (error) {
    console.error('Compilation failed:', error.response?.data || error.message);
  }
}

compileContract();
```

## Running Tests

```bash
# Run all tests
npm test

# Run unit tests only
npm run test:unit

# Run integration tests only
npm run test:integration
```

## Project Structure

```
/
├── src/
│   ├── app.js                  # Express application setup
│   ├── server.js               # Server entry point
│   ├── config/
│   │   ├── config.js           # Application configuration
│   │   └── dependencies.js     # Pre-installed dependencies list
│   ├── controllers/
│   │   └── compilationController.js  # Route handlers for compilation
│   ├── services/
│   │   ├── compilationService.js     # Main compilation orchestration
│   │   ├── foundryService.js         # Foundry interaction
│   │   └── dependencyService.js      # Dependency management
│   ├── utils/
│   │   ├── logger.js           # Logging utility
│   │   ├── fileSystem.js       # File operations utility
│   │   └── validators.js       # Input validation
│   └── middleware/
│       ├── errorHandler.js     # Global error handling
│       └── requestValidator.js # Request validation
├── test/
│   ├── unit/                   # Unit tests
│   └── integration/            # Integration tests
├── scripts/
│   └── install-dependencies.js # Script to install dependencies
├── package.json
├── .env.example
├── .gitignore
└── README.md
```

## License

This project is licensed under the MIT License - see the LICENSE file for details.