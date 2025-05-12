const path = require('path');
const fs = require('fs-extra');
const { expect } = require('chai');
const sinon = require('sinon');

// Import the modules we want to test
const solcUtils = require('../utils/solcUtils');
const dependencyUtils = require('../utils/dependencyUtils');

// Extract the specific functions we need (destructuring should match exactly what's exported)
const { extractContractName, extractSolidityVersion } = solcUtils;
const { extractDependenciesFromCode } = dependencyUtils;

// Define test paths
const TEMP_DIR = path.join(__dirname, '../temp_test');
const ARTIFACTS_DIR = path.join(__dirname, '../artifacts_test');

// Check if the functions are properly exported
if (!extractContractName) {
  console.error('extractContractName is not properly exported from solcUtils');
}
if (!extractSolidityVersion) {
  console.error('extractSolidityVersion is not properly exported from solcUtils');
}
if (!extractDependenciesFromCode) {
  console.error('extractDependenciesFromCode is not properly exported from dependencyUtils');
}

describe('Compiler Controller', () => {
  before(() => {
    // Create test directories
    fs.ensureDirSync(TEMP_DIR);
    fs.ensureDirSync(ARTIFACTS_DIR);
  });
  
  after(() => {
    // Clean up test directories
    fs.removeSync(TEMP_DIR);
    fs.removeSync(ARTIFACTS_DIR);
  });
  
  describe('extractContractName', () => {
    it('should extract a contract name from Solidity code', () => {
      const code = `
        pragma solidity ^0.8.0;
        
        contract TestContract {
          function add(uint256 a, uint256 b) public pure returns (uint256) {
            return a + b;
          }
        }
      `;
      
      const contractName = extractContractName(code);
      expect(contractName).to.equal('TestContract');
    });
    
    it('should extract the main contract when multiple contracts are defined', () => {
      const code = `
        pragma solidity ^0.8.0;
        
        contract BaseContract {
          function getValue() public pure returns (uint256) {
            return 42;
          }
        }
        
        contract TestContract is BaseContract {
          function add(uint256 a, uint256 b) public pure returns (uint256) {
            return a + b;
          }
        }
      `;
      
      const contractName = extractContractName(code);
      expect(contractName).to.equal('TestContract');
    });
    
    it('should handle contracts with comments', () => {
      const code = `
        pragma solidity ^0.8.0;
        
        // This is a comment
        /* This is a multiline
           comment */
        contract /* comment */ TestContract /* another comment */ {
          // More comments
          function add(uint256 a, uint256 b) public pure returns (uint256) {
            return a + b; // End of line comment
          }
        }
      `;
      
      const contractName = extractContractName(code);
      expect(contractName).to.equal('TestContract');
    });
  });
  
  describe('extractSolidityVersion', () => {
    it('should extract the Solidity version from pragma statement', () => {
      const code = 'pragma solidity ^0.8.4;';
      const version = extractSolidityVersion(code);
      expect(version).to.equal('0.8.4');
    });
    
    it('should handle different pragma formats', () => {
      let code = 'pragma solidity >=0.8.0;';
      let version = extractSolidityVersion(code);
      expect(version).to.equal('0.8.0');
      
      code = 'pragma solidity 0.8.10;';
      version = extractSolidityVersion(code);
      expect(version).to.equal('0.8.10');
      
      code = 'pragma solidity ~0.8.4;';
      version = extractSolidityVersion(code);
      expect(version).to.equal('0.8.4');
    });
    
    it('should handle short version format (without patch)', () => {
      const code = 'pragma solidity ^0.8;';
      const version = extractSolidityVersion(code);
      expect(version).to.equal('0.8.0');
    });
    
    it('should return null if no version is found', () => {
      const code = 'contract Test {}';
      const version = extractSolidityVersion(code);
      expect(version).to.be.null;
    });
  });
  
  describe('extractDependenciesFromCode', () => {
    it('should extract OpenZeppelin dependencies', () => {
      const code = `
        pragma solidity ^0.8.0;
        
        import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
        
        contract MyToken is ERC20 {
          constructor() ERC20("MyToken", "MTK") {}
        }
      `;
      
      const dependencies = extractDependenciesFromCode(code);
      expect(dependencies).to.include('OpenZeppelin/openzeppelin-contracts');
    });
    
    it('should extract versioned dependencies', () => {
      const code = `
        pragma solidity ^0.8.0;
        
        import "@openzeppelin/contracts@4.9.0/token/ERC20/ERC20.sol";
        
        contract MyToken is ERC20 {
          constructor() ERC20("MyToken", "MTK") {}
        }
      `;
      
      const dependencies = extractDependenciesFromCode(code);
      expect(dependencies).to.include('OpenZeppelin/openzeppelin-contracts@4.9.0');
    });
    
    it('should extract multiple dependencies', () => {
      const code = `
        pragma solidity ^0.8.0;
        
        import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
        import "@openzeppelin/contracts/access/Ownable.sol";
        import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
        
        contract MyToken is ERC20, Ownable {
          constructor() ERC20("MyToken", "MTK") {}
        }
      `;
      
      const dependencies = extractDependenciesFromCode(code);
      expect(dependencies).to.include('OpenZeppelin/openzeppelin-contracts');
      expect(dependencies).to.include('Uniswap/v2-periphery');
    });
    
    it('should detect dependencies from contract usage even without imports', () => {
      const code = `
        pragma solidity ^0.8.0;
        
        contract MyToken {
          IUniswapV2Router02 router;
          AggregatorV3Interface priceFeed;
          
          constructor() {}
        }
      `;
      
      const dependencies = extractDependenciesFromCode(code);
      expect(dependencies).to.include.oneOf(['Uniswap/v2-periphery', 'Uniswap/v2-core']);
      expect(dependencies).to.include('smartcontractkit/chainlink');
    });
  });
});