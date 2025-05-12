// File path: test/directSolcCompiler.test.js

const path = require('path');
const fs = require('fs-extra');
const { expect } = require('chai');
const sinon = require('sinon');
const os = require('os');
const rewire = require('rewire');

// Import module using rewire
const directSolcCompiler = rewire('../utils/directSolcCompiler');

describe('Direct Solc Compiler', () => {
  let execSyncStub;
  let fsWriteFileSyncStub;
  let fsReadFileSyncStub;
  let fsRemoveSyncStub;
  let reverts = [];
  
  beforeEach(() => {
    // Create stubs
    execSyncStub = sinon.stub();
    fsWriteFileSyncStub = sinon.stub();
    fsReadFileSyncStub = sinon.stub();
    fsRemoveSyncStub = sinon.stub();
    
    // Setup fs stub with only the methods we need to override
    const fsStub = {
      ...fs,  // Keep original methods
      writeFileSync: fsWriteFileSyncStub,
      readFileSync: fsReadFileSyncStub,
      removeSync: fsRemoveSyncStub
    };
    
    // Replace functions in the module
    reverts.push(directSolcCompiler.__set__('execSync', execSyncStub));
    reverts.push(directSolcCompiler.__set__('fs', fsStub));
  });
  
  afterEach(() => {
    // Restore original functions
    reverts.forEach(revert => revert());
    reverts = [];
  });
  
  describe('directSolcCompile', () => {
    it('should compile a contract using direct solc command', () => {
      // Simulate solc output
      const solcOutput = `
======= SimpleStorage.sol:SimpleStorage =======
Binary: 
608060405234801561001057600080fd5b50610150806100206000396000f3fe608060405234801561001057600080fd5b50600436106100365760003560e01c80632e64cec11461003b5780636057361d14610059575b600080fd5b610043610075565b60405161005091906100a1565b60405180910390f35b610073600480360381019061006e91906100ed565b61007e565b005b60008054905090565b8060008190555050565b6000819050919050565b61009b81610088565b82525050565b60006020820190506100b66000830184610092565b92915050565b600080fd5b6100ca81610088565b81146100d557600080fd5b50565b6000813590506100e7816100c1565b92915050565b600060208284031215610103576101026100bc565b5b6000610111848285016100d8565b9150509291505056fe
ABI: 
[{"inputs":[],"name":"retrieve","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"num","type":"uint256"}],"name":"store","outputs":[],"stateMutability":"nonpayable","type":"function"}]
      `;
      
      // Configure the stubs
      execSyncStub.returns(solcOutput);
      
      const code = `
        // SPDX-License-Identifier: MIT
        pragma solidity ^0.8.0;
        
        contract SimpleStorage {
            uint256 private value;
            
            function store(uint256 num) public {
                value = num;
            }
            
            function retrieve() public view returns (uint256) {
                return value;
            }
        }
      `;
      
      const result = directSolcCompiler.directSolcCompile(code, 'SimpleStorage');
      
      expect(result).to.have.property('bytecode');
      expect(result).to.have.property('abi');
      expect(result.bytecode).to.equal('608060405234801561001057600080fd5b50610150806100206000396000f3fe608060405234801561001057600080fd5b50600436106100365760003560e01c80632e64cec11461003b5780636057361d14610059575b600080fd5b610043610075565b60405161005091906100a1565b60405180910390f35b610073600480360381019061006e91906100ed565b61007e565b005b60008054905090565b8060008190555050565b6000819050919050565b61009b81610088565b82525050565b60006020820190506100b66000830184610092565b92915050565b600080fd5b6100ca81610088565b81146100d557600080fd5b50565b6000813590506100e7816100c1565b92915050565b600060208284031215610103576101026100bc565b5b6000610111848285016100d8565b9150509291505056fe');
      expect(result.abi).to.be.an('array');
      expect(result.abi.length).to.equal(2);
    });
    
    it('should handle errors when solc compilation fails', () => {
      // Configure the stub to throw an error
      execSyncStub.throws(new Error('Solidity compilation error'));
      
      const code = `
        // SPDX-License-Identifier: MIT
        pragma solidity ^0.8.0;
        
        contract BrokenContract {
            uint256 private value = 100  // Missing semicolon
            
            function getValue() public view returns (uint256) {
                return value;
            }
        }
      `;
      
      expect(() => directSolcCompiler.directSolcCompile(code, 'BrokenContract')).to.throw('Solidity compilation error');
    });
  });
  
  describe('tryAllCompilationMethods', () => {
    let solcjsStub;
    
    beforeEach(() => {
      // Setup stubs for shellscript approach
      fsWriteFileSyncStub.returns(undefined);
      fsReadFileSyncStub.callsFake((filepath) => {
        if (filepath.endsWith('.bin')) {
          return '0xabcdef';
        } else if (filepath.endsWith('.abi')) {
          return JSON.stringify([
            {
              "inputs": [],
              "name": "getValue",
              "outputs": [{"internalType":"uint256","name":"","type":"uint256"}],
              "stateMutability": "view",
              "type": "function"
            }
          ]);
        }
        return '';
      });
      
      // Make execSync throw for first approach but succeed for shell script
      execSyncStub.callsFake((command) => {
        if (command.includes('--bin --abi') && !command.includes('.sh')) {
          throw new Error('Direct solc failed');
        }
        return '';
      });
    });
    
    it('should try different compilation methods in sequence', async () => {
      const code = `
        // SPDX-License-Identifier: MIT
        pragma solidity ^0.8.0;
        
        contract TestContract {
            uint256 private value = 100;
            
            function getValue() public view returns (uint256) {
                return value;
            }
        }
      `;
      
      const result = await directSolcCompiler.tryAllCompilationMethods(code, 'TestContract');
      
      expect(result).to.have.property('bytecode');
      expect(result).to.have.property('abi');
      expect(result.bytecode).to.equal('0xabcdef');
      expect(result.abi).to.be.an('array');
      expect(result.abi.length).to.equal(1);
    });
  });
});