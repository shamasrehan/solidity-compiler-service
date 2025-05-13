/**
 * Integration test for compilation API
 */

const request = require('supertest');
const app = require('../../src/app');

describe('Compilation API', () => {
  const helloWorldContract = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract HelloWorld {
    string public greeting = "Hello, World!";

    function setGreeting(string memory _greeting) public {
        greeting = _greeting;
    }

    function getGreeting() public view returns (string memory) {
        return greeting;
    }
}`;

  const openZeppelinImportContract = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MyToken is ERC20 {
    constructor(uint256 initialSupply) ERC20("MyToken", "MTK") {
        _mint(msg.sender, initialSupply);
    }
}`;

  // Get API status
  test('GET /api/v1/compile/status should return service status', async () => {
    const response = await request(app).get('/api/v1/compile/status');
    
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.status).toBeDefined();
    expect(response.body.defaultSolidityVersion).toBeDefined();
  });

  // Compile a simple contract
  test('POST /api/v1/compile should compile a simple contract', async () => {
    const response = await request(app)
      .post('/api/v1/compile')
      .send({
        contractCode: helloWorldContract,
        solidityVersion: '0.8.20',
        contractName: 'HelloWorld'
      });
    
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.result.success).toBe(true);
    expect(response.body.result.contracts).toBeDefined();
  }, 30000); // Increase timeout for compilation
  
  // Check a simple contract
  test('POST /api/v1/compile/check should check if a contract compiles', async () => {
    const response = await request(app)
      .post('/api/v1/compile/check')
      .send({
        contractCode: helloWorldContract,
        solidityVersion: '0.8.20'
      });
    
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.message).toContain('compiles successfully');
  }, 30000); // Increase timeout for compilation

  // Compile a contract with OpenZeppelin imports
  test('POST /api/v1/compile should compile a contract with OpenZeppelin imports', async () => {
    const response = await request(app)
      .post('/api/v1/compile')
      .send({
        contractCode: openZeppelinImportContract,
        solidityVersion: '0.8.20',
        contractName: 'MyToken'
      });
    
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.result.success).toBe(true);
    expect(response.body.result.contracts).toBeDefined();
  }, 60000); // Increase timeout for library dependency resolution
  
  // Test validation errors
  test('POST /api/v1/compile should return validation errors for invalid request', async () => {
    const response = await request(app)
      .post('/api/v1/compile')
      .send({
        // Missing contractCode
        solidityVersion: '0.8.20'
      });
    
    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.errors).toBeDefined();
  });
  
  // Test with invalid Solidity version
  test('POST /api/v1/compile should return an error for invalid Solidity version', async () => {
    const response = await request(app)
      .post('/api/v1/compile')
      .send({
        contractCode: helloWorldContract,
        solidityVersion: 'invalid-version'
      });
    
    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });
});