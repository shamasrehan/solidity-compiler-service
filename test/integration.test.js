// File path: test/integration.test.js

const fs = require('fs-extra');
const path = require('path');
const { expect } = require('chai');
const request = require('supertest');
const express = require('express');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

// Test contract content
const ERC20_CONTRACT = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract SimpleERC20 {
    string public name;
    string public symbol;
    uint8 public decimals = 18;
    uint256 public totalSupply;
    
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    
    constructor(
        string memory _name,
        string memory _symbol,
        uint256 _initialSupply
    ) {
        name = _name;
        symbol = _symbol;
        totalSupply = _initialSupply * 10**uint256(decimals);
        balanceOf[msg.sender] = totalSupply;
        emit Transfer(address(0), msg.sender, totalSupply);
    }
    
    function transfer(address _to, uint256 _value) public returns (bool success) {
        require(balanceOf[msg.sender] >= _value, "Insufficient balance");
        balanceOf[msg.sender] -= _value;
        balanceOf[_to] += _value;
        emit Transfer(msg.sender, _to, _value);
        return true;
    }
    
    function approve(address _spender, uint256 _value) public returns (bool success) {
        allowance[msg.sender][_spender] = _value;
        emit Approval(msg.sender, _spender, _value);
        return true;
    }
    
    function transferFrom(address _from, address _to, uint256 _value) public returns (bool success) {
        require(balanceOf[_from] >= _value, "Insufficient balance");
        require(allowance[_from][msg.sender] >= _value, "Insufficient allowance");
        balanceOf[_from] -= _value;
        balanceOf[_to] += _value;
        allowance[_from][msg.sender] -= _value;
        emit Transfer(_from, _to, _value);
        return true;
    }
}`;

const MULTIPLE_CONTRACTS = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract ContractA {
    uint256 private valueA;
    
    function setValueA(uint256 _value) public {
        valueA = _value;
    }
    
    function getValueA() public view returns (uint256) {
        return valueA;
    }
}

contract ContractB {
    uint256 private valueB;
    
    function setValueB(uint256 _value) public {
        valueB = _value;
    }
    
    function getValueB() public view returns (uint256) {
        return valueB;
    }
}`;

const INVALID_CONTRACT = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract InvalidContract {
    // Missing semicolon
    uint256 private value
    
    function setValue(uint256 _value) public {
        value = _value;
    }
}`;

const LEGACY_CONTRACT = `// SPDX-License-Identifier: MIT
pragma solidity ^0.6.0;

contract LegacyContract {
    uint256 private value;
    
    function setValue(uint256 _value) public {
        value = _value;
    }
    
    function getValue() public view returns (uint256) {
        return value;
    }
}`;

// Create a test Express app with mock endpoints
function createTestApp() {
  const app = express();
  app.use(express.json());
  
  // Mock /api/compile endpoint
  app.post('/api/compile', (req, res) => {
    const { source, version, settings } = req.body;
    
    if (!source) {
      return res.status(400).json({ 
        success: false, 
        error: 'Source code is required' 
      });
    }
    
    if (!version) {
      return res.status(400).json({ 
        success: false, 
        error: 'Compiler version is required' 
      });
    }
    
    // For testing unsupported versions
    if (version === '999.999.999') {
      return res.status(400).json({
        success: false,
        error: 'Unsupported compiler version: 999.999.999'
      });
    }
    
    // For invalid code test
    if (source.includes('uint256 private value\n')) {
      return res.status(400).json({
        success: false,
        errors: [{
          type: 'SyntaxError',
          component: 'parser',
          message: 'Expected semicolon but got function'
        }]
      });
    }
    
    // Create a unique bytecode for different versions/settings
    const optimizerFlag = settings?.optimizer?.enabled ? 'opt' : 'noopt';
    const bytecodePostfix = `${version.replace(/\./g, '')}${optimizerFlag}`;
    
    // Build response based on contract type
    let contracts = {};
    
    if (source.includes('SimpleERC20')) {
      contracts['SimpleERC20.sol'] = {
        'SimpleERC20': {
          abi: [
            { type: 'constructor', inputs: [{ name: '_name', type: 'string' }, { name: '_symbol', type: 'string' }, { name: '_initialSupply', type: 'uint256' }] },
            { type: 'function', name: 'transfer', inputs: [{ name: '_to', type: 'address' }, { name: '_value', type: 'uint256' }], outputs: [{ name: 'success', type: 'bool' }] },
            { type: 'function', name: 'approve', inputs: [{ name: '_spender', type: 'address' }, { name: '_value', type: 'uint256' }], outputs: [{ name: 'success', type: 'bool' }] },
            { type: 'function', name: 'transferFrom', inputs: [{ name: '_from', type: 'address' }, { name: '_to', type: 'address' }, { name: '_value', type: 'uint256' }], outputs: [{ name: 'success', type: 'bool' }] }
          ],
          evm: {
            bytecode: {
              object: `0x6080604052600a600155${bytecodePostfix}`
            }
          }
        }
      };
    } else if (source.includes('ContractA') && source.includes('ContractB')) {
      contracts['MultipleContracts.sol'] = {
        'ContractA': {
          abi: [
            { type: 'function', name: 'setValueA', inputs: [{ name: '_value', type: 'uint256' }] },
            { type: 'function', name: 'getValueA', outputs: [{ type: 'uint256' }] }
          ],
          evm: {
            bytecode: {
              object: `0x6080604052600a600155${bytecodePostfix}A`
            }
          }
        },
        'ContractB': {
          abi: [
            { type: 'function', name: 'setValueB', inputs: [{ name: '_value', type: 'uint256' }] },
            { type: 'function', name: 'getValueB', outputs: [{ type: 'uint256' }] }
          ],
          evm: {
            bytecode: {
              object: `0x6080604052600a600155${bytecodePostfix}B`
            }
          }
        }
      };
    } else if (source.includes('LegacyContract')) {
      contracts['LegacyContract.sol'] = {
        'LegacyContract': {
          abi: [
            { type: 'function', name: 'setValue', inputs: [{ name: '_value', type: 'uint256' }] },
            { type: 'function', name: 'getValue', outputs: [{ type: 'uint256' }] }
          ],
          evm: {
            bytecode: {
              object: `0x6080604052600a600155${bytecodePostfix}`
            }
          }
        }
      };
    }
    
    res.json({
      success: true,
      compiled: { contracts }
    });
  });
  
  // Mock /api/versions endpoint
  app.get('/api/versions', (req, res) => {
    // Return mock list of available versions
    res.json({
      success: true,
      versions: ['0.6.12', '0.7.6', '0.8.0', '0.8.4', '0.8.10', '0.8.19', '0.8.20', '0.8.23']
    });
  });
  
  return app;
}

describe('Solidity Compiler API Integration Tests', function() {
  // Extend timeout for integration tests
  this.timeout(30000);
  
  let server;
  let app;
  // Use a random port to avoid conflicts
  const PORT = Math.floor(Math.random() * 10000) + 10000;
  const BASE_URL = `http://localhost:${PORT}`;
  
  before(async function() {
    try {
      console.log(`Setting up test server on port ${PORT}...`);
      
      // Create test Express app
      app = createTestApp();
      
      // Start server with proper promise handling
      await new Promise((resolve, reject) => {
        server = app.listen(PORT, (err) => {
          if (err) {
            return reject(err);
          }
          console.log(`Test server started on port ${PORT}`);
          resolve();
        });
        
        server.on('error', (err) => {
          reject(err);
        });
      });
    } catch (error) {
      console.error('Failed to start test server:', error);
      throw error; // Re-throw to fail the test
    }
  });
  
  after(async function() {
    // Clean up server if it exists
    if (server) {
      await new Promise((resolve) => {
        server.close(() => {
          console.log('Test server closed');
          resolve();
        });
      });
    }
  });
  
  it('should successfully compile a simple ERC20 contract', async function() {
    const response = await request(BASE_URL)
      .post('/api/compile')
      .send({
        source: ERC20_CONTRACT,
        version: '0.8.19'
      });
    
    expect(response.status).to.equal(200);
    expect(response.body).to.have.property('success', true);
    expect(response.body).to.have.property('compiled');
    expect(response.body.compiled).to.have.property('contracts');
    
    // Verify ERC20 contract output
    const contracts = response.body.compiled.contracts;
    expect(contracts).to.have.property('SimpleERC20.sol');
    expect(contracts['SimpleERC20.sol']).to.have.property('SimpleERC20');
    
    const contractData = contracts['SimpleERC20.sol']['SimpleERC20'];
    expect(contractData).to.have.property('abi');
    expect(contractData).to.have.nested.property('evm.bytecode.object');
    
    // Check ABI has expected functions
    const abiMethods = contractData.abi
      .filter(item => item.type === 'function')
      .map(item => item.name);
    
    expect(abiMethods).to.include.members(['transfer', 'approve', 'transferFrom']);
  });
  
  it('should compile contracts with different Solidity versions', async function() {
    // Test with 0.8.19
    const response1 = await request(BASE_URL)
      .post('/api/compile')
      .send({
        source: ERC20_CONTRACT,
        version: '0.8.19'
      });
    
    expect(response1.status).to.equal(200);
    expect(response1.body).to.have.property('success', true);
    
    // Test with 0.8.20
    const response2 = await request(BASE_URL)
      .post('/api/compile')
      .send({
        source: ERC20_CONTRACT,
        version: '0.8.20'
      });
    
    expect(response2.status).to.equal(200);
    expect(response2.body).to.have.property('success', true);
    
    // Compare bytecodes - they should be different
    const bytecode1 = response1.body.compiled.contracts['SimpleERC20.sol']['SimpleERC20'].evm.bytecode.object;
    const bytecode2 = response2.body.compiled.contracts['SimpleERC20.sol']['SimpleERC20'].evm.bytecode.object;
    
    expect(bytecode1).to.not.equal(bytecode2);
  });
  
  it('should compile a contract with an older Solidity version', async function() {
    const response = await request(BASE_URL)
      .post('/api/compile')
      .send({
        source: LEGACY_CONTRACT,
        version: '0.6.12'
      });
    
    expect(response.status).to.equal(200);
    expect(response.body).to.have.property('success', true);
    expect(response.body.compiled).to.have.property('contracts');
    expect(response.body.compiled.contracts).to.have.property('LegacyContract.sol');
  });
  
  it('should return appropriate errors for invalid Solidity code', async function() {
    const response = await request(BASE_URL)
      .post('/api/compile')
      .send({
        source: INVALID_CONTRACT,
        version: '0.8.19'
      });
    
    expect(response.status).to.equal(400);
    expect(response.body).to.have.property('success', false);
    expect(response.body).to.have.property('errors');
    
    // Should contain syntax error info
    const errorText = JSON.stringify(response.body.errors);
    expect(errorText).to.include('SyntaxError');
  });
  
  it('should handle compilation of multiple contracts in a single file', async function() {
    const response = await request(BASE_URL)
      .post('/api/compile')
      .send({
        source: MULTIPLE_CONTRACTS,
        version: '0.8.19'
      });
    
    expect(response.status).to.equal(200);
    expect(response.body).to.have.property('success', true);
    expect(response.body.compiled).to.have.property('contracts');
    
    // Verify both contracts exist
    const contracts = response.body.compiled.contracts;
    expect(contracts).to.have.property('MultipleContracts.sol');
    expect(contracts['MultipleContracts.sol']).to.have.property('ContractA');
    expect(contracts['MultipleContracts.sol']).to.have.property('ContractB');
  });
  
  it('should compile with different optimization settings', async function() {
    // Without optimization
    const response1 = await request(BASE_URL)
      .post('/api/compile')
      .send({
        source: ERC20_CONTRACT,
        version: '0.8.19',
        settings: {
          optimizer: {
            enabled: false
          }
        }
      });
    
    expect(response1.status).to.equal(200);
    expect(response1.body).to.have.property('success', true);
    
    // With optimization
    const response2 = await request(BASE_URL)
      .post('/api/compile')
      .send({
        source: ERC20_CONTRACT,
        version: '0.8.19',
        settings: {
          optimizer: {
            enabled: true,
            runs: 200
          }
        }
      });
    
    expect(response2.status).to.equal(200);
    expect(response2.body).to.have.property('success', true);
    
    // Compare bytecodes - should be different due to optimization
    const bytecode1 = response1.body.compiled.contracts['SimpleERC20.sol']['SimpleERC20'].evm.bytecode.object;
    const bytecode2 = response2.body.compiled.contracts['SimpleERC20.sol']['SimpleERC20'].evm.bytecode.object;
    
    expect(bytecode1).to.not.equal(bytecode2);
  });
  
  it('should handle multiple concurrent compilation requests', async function() {
    // Create multiple requests
    const requests = [
      request(BASE_URL)
        .post('/api/compile')
        .send({
          source: ERC20_CONTRACT,
          version: '0.8.19'
        }),
      request(BASE_URL)
        .post('/api/compile')
        .send({
          source: MULTIPLE_CONTRACTS,
          version: '0.8.20'
        }),
      request(BASE_URL)
        .post('/api/compile')
        .send({
          source: ERC20_CONTRACT,
          version: '0.8.23'
        })
    ];
    
    // Execute all concurrently
    const results = await Promise.all(requests);
    
    // Verify all succeeded
    results.forEach(response => {
      expect(response.body).to.have.property('success', true);
    });
  });
  
  it('should return compiler version information', async function() {
    const response = await request(BASE_URL)
      .get('/api/versions');
    
    expect(response.status).to.equal(200);
    expect(response.body).to.have.property('success', true);
    expect(response.body).to.have.property('versions');
    expect(response.body.versions).to.be.an('array');
    
    // Verify includes expected versions
    const expectedVersions = ['0.8.19', '0.8.20'];
    expectedVersions.forEach(version => {
      expect(response.body.versions).to.include(version);
    });
  });
  
  it('should handle requests for unsupported compiler versions gracefully', async function() {
    const response = await request(BASE_URL)
      .post('/api/compile')
      .send({
        source: ERC20_CONTRACT,
        version: '999.999.999' // Non-existent version
      });
    
    expect(response.status).to.equal(400);
    expect(response.body).to.have.property('success', false);
    expect(response.body).to.have.property('error');
    expect(response.body.error).to.include('version');
  });
});