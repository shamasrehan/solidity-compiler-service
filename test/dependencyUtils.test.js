// File path: test/dependencyUtils.test.js

const path = require('path');
const fs = require('fs-extra');
const { expect } = require('chai');
const sinon = require('sinon');
const childProcess = require('child_process');

// Import modules to test
const {
  extractDependenciesFromCode,
  preprocessImportPaths
} = require('../utils/dependencyUtils');

describe('Dependency Utils', () => {
  let execSyncStub;
  
  before(() => {
    // Stub execSync to prevent actual command execution
    execSyncStub = sinon.stub(childProcess, 'execSync');
    execSyncStub.returns(''); // Default empty response
  });
  
  after(() => {
    // Restore original execSync
    execSyncStub.restore();
  });
  
  describe('preprocessImportPaths', () => {
    it('should normalize OpenZeppelin versioned imports', () => {
      const code = `
        pragma solidity ^0.8.0;
        
        import "@openzeppelin/contracts@4.9.0/token/ERC20/ERC20.sol";
        
        contract MyToken is ERC20 {
          constructor() ERC20("MyToken", "MTK") {}
        }
      `;
      
      const processed = preprocessImportPaths(code);
      expect(processed).to.include('@openzeppelin/contracts/token/ERC20/ERC20.sol');
      expect(processed).to.not.include('@openzeppelin/contracts@4.9.0');
    });
    
    it('should normalize Uniswap versioned imports', () => {
      const code = `
        pragma solidity ^0.8.0;
        
        import "@uniswap/v2-core@1.0.1/contracts/interfaces/IUniswapV2Factory.sol";
        import "@uniswap/v2-periphery@1.1.0/contracts/interfaces/IUniswapV2Router02.sol";
        
        contract MyDex {
          IUniswapV2Factory factory;
          IUniswapV2Router02 router;
        }
      `;
      
      const processed = preprocessImportPaths(code);
      expect(processed).to.include('@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol');
      expect(processed).to.include('@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol');
      expect(processed).to.not.include('@uniswap/v2-core@1.0.1');
      expect(processed).to.not.include('@uniswap/v2-periphery@1.1.0');
    });
    
    it('should preserve non-versioned imports', () => {
      const code = `
        pragma solidity ^0.8.0;
        
        import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
        import "./MyOtherContract.sol";
        
        contract MyToken is ERC20 {
          constructor() ERC20("MyToken", "MTK") {}
        }
      `;
      
      const processed = preprocessImportPaths(code);
      expect(processed).to.include('@openzeppelin/contracts/token/ERC20/ERC20.sol');
      expect(processed).to.include('./MyOtherContract.sol');
    });
  });
  
  describe('complex dependency extraction', () => {
    it('should extract multiple dependencies from complex contracts', () => {
      const code = `
        // SPDX-License-Identifier: MIT
        pragma solidity ^0.8.17;
        
        import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
        import "@openzeppelin/contracts/access/Ownable.sol";
        import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
        import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
        
        contract ComplexDeFiProtocol is Ownable {
          IUniswapV2Router02 public uniswapRouter;
          AggregatorV3Interface public priceFeed;
          
          constructor(address _router, address _priceFeed) {
            uniswapRouter = IUniswapV2Router02(_router);
            priceFeed = AggregatorV3Interface(_priceFeed);
          }
          
          function swapTokens(address _tokenIn, address _tokenOut, uint256 _amountIn) external {
            IERC20(_tokenIn).transferFrom(msg.sender, address(this), _amountIn);
            // More complex logic...
          }
        }
      `;
      
      const dependencies = extractDependenciesFromCode(code);
      
      expect(dependencies).to.include('OpenZeppelin/openzeppelin-contracts');
      expect(dependencies).to.include('Uniswap/v2-periphery');
      expect(dependencies).to.include('smartcontractkit/chainlink');
    });
    
    it('should handle indirect dependencies through inheritance', () => {
      const code = `
        // SPDX-License-Identifier: MIT
        pragma solidity ^0.8.0;
        
        import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
        import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
        import "@openzeppelin/contracts/access/Ownable.sol";
        
        contract MyNFT is ERC721Enumerable, Ownable {
          constructor() ERC721("MyNFT", "MNFT") {}
          
          function mint(address to, uint256 tokenId) public onlyOwner {
            _mint(to, tokenId);
          }
        }
      `;
      
      const dependencies = extractDependenciesFromCode(code);
      expect(dependencies).to.include('OpenZeppelin/openzeppelin-contracts');
    });
  });
});