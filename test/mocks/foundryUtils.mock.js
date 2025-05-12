// File path: test/mocks/compileController.js

const path = require('path');
const fs = require('fs-extra');
const { extractContractName, extractSolidityVersion } = require('../../utils/solcUtils');
const { extractDependenciesFromCode } = require('../../utils/dependencyUtils');

// Mock implementation of compileContract
function mockCompileContract(req, res) {
  try {
    const { source, compilerVersion, evmVersion, optimizationRuns } = req.body;
    
    if (!source) {
      return res.status(400).json({
        status: 'error',
        message: 'Source code is required'
      });
    }
    
    // Extract contract name
    const contractName = extractContractName(source);
    
    // Validate contract name
    if (!contractName) {
      return res.status(400).json({
        status: 'error',
        message: 'Could not determine contract name'
      });
    }
    
    // Extract Solidity version
    const solidityVersion = extractSolidityVersion(source) || compilerVersion || '0.8.19';
    
    // Extract dependencies
    const dependencies = extractDependenciesFromCode(source);
    
    // For testing purposes, we'll just create a mock bytecode and ABI
    const mockBytecode = '0x608060405234801561001057600080fd5b50600436106100365760003560e01c80632e64cec11461003b5780636057361d14610059575b600080fd5b610043610075565b60405161005091906100a1565b60405180910390f35b610073600480360381019061006e91906100ed565b61007e565b005b60008054905090565b8060008190555050565b6000819050919050565b61009b81610088565b82525050565b60006020820190506100b66000830184610092565b92915050565b600080fd5b6100ca81610088565b81146100d557600080fd5b50565b6000813590506100e7816100c1565b92915050565b600060208284031215610103576101026100bc565b5b6000610111848285016100d8565b9150509291505056fe';
    
    // Create a mock ABI
    const mockAbi = [
      {
        "inputs": [],
        "name": "getValue",
        "outputs": [
          {
            "internalType": "uint256",
            "name": "",
            "type": "uint256"
          }
        ],
        "stateMutability": "view",
        "type": "function"
      },
      {
        "inputs": [
          {
            "internalType": "uint256",
            "name": "_value",
            "type": "uint256"
          }
        ],
        "name": "setValue",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
      }
    ];
    
    // Return success with mock data
    return res.status(200).json({
      status: 'success',
      data: {
        contractName,
        bytecode: mockBytecode,
        abi: mockAbi,
        dependencies: {
          installed: dependencies,
          failed: []
        },
        message: 'Contract compiled successfully with test mock'
      }
    });
  } catch (error) {
    console.error('Mock compilation error:', error);
    
    return res.status(400).json({
      status: 'error',
      message: `Compilation error: ${error.message}`
    });
  }
}

module.exports = {
  mockCompileContract
};