# Solidity Compiler API

A robust API service for compiling Solidity smart contracts, with support for multiple compiler versions, dependency management, caching, and concurrent compilation.

## Features

- **Multiple Compiler Versions**: Compile contracts with any Solidity version
- **Concurrent Compilation**: Process multiple compilation requests simultaneously
- **Caching**: Cache compilation results to improve performance
- **Artifact Management**: Keep track of compilation history and artifacts
- **Docker Integration**: Use Docker containers for isolated compilation environments
- **Dependency Management**: Support for common Solidity libraries like OpenZeppelin
- **Detailed API Documentation**: Swagger documentation for all endpoints
- **Environment Configuration**: Easily configurable via environment variables
- **Resource Tracking**: Proper cleanup of temporary files and resources

## Installation

### Prerequisites

- Node.js (v16.0.0 or higher)
- npm or yarn
- solc-select (Python tool for managing Solidity compiler versions)
- Docker (optional, for isolated compilation)

### Setup

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/solidity-compiler-api.git
   cd solidity-compiler-api
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create configuration file:
   ```
   cp .env.example .env
   ```

4. Edit the `.env` file to configure your environment.

5. Start the service:
   ```
   npm start
   ```

## API Endpoints

### Health Check
```
GET /api/health
```
Returns the current status of the API service.

### Get Available Compiler Versions
```
GET /api/versions
```
Returns a list of installed Solidity compiler versions.

### Compile Solidity Code
```
POST /api/compile
```
Compiles Solidity source code with the specified version and settings.

#### Request Body

```json
{
  "source": "// SPDX-License-Identifier: MIT\npragma solidity ^0.8.19;\n\ncontract SimpleStorage {\n    uint256 private value;\n    \n    function set(uint256 newValue) public {\n        value = newValue;\n    }\n    \n    function get() public view returns (uint256) {\n        return value;\n    }\n}",
  "version": "0.8.19",
  "settings": {
    "optimizer": {
      "enabled": true,
      "runs": 200
    },
    "evmVersion": "paris"
  }
}
```

### Get Compilation Status
```
GET /api/status
```
Returns information about currently active compilation jobs.

### Get Compilation History
```
GET /api/history
```
Returns information about previously compiled contracts.

### Get Compilation Details
```
GET /api/history/{jobId}
```
Returns detailed information about a specific compilation.

### Get Source Code
```
GET /api/history/{jobId}/source
```
Returns the original source code for a specific compilation.

### Get Compilation Result
```
GET /api/history/{jobId}/result
```
Returns the compilation result for a specific job.

## Configuration

All configuration can be done via environment variables. See `.env.example` for available options.

Key configurations:

- `PORT`: Port for the API server (default: 9000)
- `TEMP_DIR`: Directory for temporary files
- `ARTIFACTS_DIR`: Directory to store compilation artifacts
- `CACHE_DIR`: Directory for caching
- `MAX_COMPILATION_TIME_MS`: Maximum compilation time (default: 30000ms)
- `MAX_CONTRACT_SIZE_BYTES`: Maximum contract size (default: 1MB)

## Examples

### Simple Contract Compilation

```bash
curl -X POST http://localhost:9000/api/compile \
  -H "Content-Type: application/json" \
  -d '{
    "version": "0.8.19",
    "source": "// SPDX-License-Identifier: MIT\npragma solidity ^0.8.19;\n\ncontract SimpleStorage {\n    uint256 private value;\n    \n    function set(uint256 newValue) public {\n        value = newValue;\n    }\n    \n    function get() public view returns (uint256) {\n        return value;\n    }\n}"
  }'
```

### Contract with OpenZeppelin Dependencies

```bash
curl -X POST http://localhost:9000/api/compile \
  -H "Content-Type: application/json" \
  -d '{
    "version": "0.8.19",
    "source": "// SPDX-License-Identifier: MIT\npragma solidity ^0.8.19;\n\nimport \"@openzeppelin/contracts/token/ERC20/ERC20.sol\";\nimport \"@openzeppelin/contracts/access/Ownable.sol\";\n\ncontract MyToken is ERC20, Ownable {\n    constructor() ERC20(\"MyToken\", \"MTK\") {\n        _mint(msg.sender, 1000000 * 10 ** decimals());\n    }\n    \n    function mint(address to, uint256 amount) public onlyOwner {\n        _mint(to, amount);\n    }\n}"
  }'
```

## Documentation

API documentation is available at `http://localhost:9000/api-docs` when the service is running.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request