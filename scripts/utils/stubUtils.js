/**
 * Stub creation utilities for dependency installation
 * Creates minimal stub files for common dependencies when full installation fails
 */

const fs = require('fs-extra');
const path = require('path');
const logger = console;

/**
 * Create stub files for OpenZeppelin contracts
 * @param {string} basePath - Path to create stub files
 * @returns {Promise<void>}
 */
async function createOpenZeppelinStub(basePath) {
  logger.log(`Creating OpenZeppelin stub in ${basePath}`);
  
  // Create minimal structure for OpenZeppelin
  await fs.ensureDir(path.join(basePath, 'contracts', 'token', 'ERC20'));
  await fs.writeFile(
    path.join(basePath, 'contracts', 'token', 'ERC20', 'ERC20.sol'),
    `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @dev This is a STUB implementation for when dependency installation fails.
 * It allows compilation to continue but will not provide actual functionality.
 */
contract ERC20 {
    string private _name;
    string private _symbol;
    
    constructor(string memory name_, string memory symbol_) {
        _name = name_;
        _symbol = symbol_;
    }
    
    function name() public view virtual returns (string memory) {
        return _name;
    }
    
    function symbol() public view virtual returns (string memory) {
        return _symbol;
    }
    
    function decimals() public view virtual returns (uint8) {
        return 18;
    }
}
`
  );
  
  // Create Access control stub
  await fs.ensureDir(path.join(basePath, 'contracts', 'access'));
  await fs.writeFile(
    path.join(basePath, 'contracts', 'access', 'Ownable.sol'),
    `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @dev This is a STUB implementation for when dependency installation fails.
 */
abstract contract Ownable {
    address private _owner;
    
    constructor() {
        _owner = msg.sender;
    }
    
    function owner() public view virtual returns (address) {
        return _owner;
    }
    
    modifier onlyOwner() {
        require(owner() == msg.sender, "Ownable: caller is not the owner");
        _;
    }
}
`
  );
}

/**
 * Create stub files for OpenZeppelin Upgradeable contracts
 * @param {string} basePath - Path to create stub files
 * @returns {Promise<void>}
 */
async function createOpenZeppelinUpgradeableStub(basePath) {
  logger.log(`Creating OpenZeppelin Upgradeable stub in ${basePath}`);
  
  // Create minimal structure for OpenZeppelin Upgradeable
  await fs.ensureDir(path.join(basePath, 'contracts', 'proxy', 'utils'));
  await fs.writeFile(
    path.join(basePath, 'contracts', 'proxy', 'utils', 'Initializable.sol'),
    `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @dev This is a STUB implementation for when dependency installation fails.
 * It allows compilation to continue but will not provide actual functionality.
 */
abstract contract Initializable {
    bool private _initialized;
    bool private _initializing;
    
    modifier initializer() {
        require(_initializing || !_initialized, "Initializable: contract is already initialized");
        bool isTopLevelCall = !_initializing;
        if (isTopLevelCall) {
            _initializing = true;
            _initialized = true;
        }
        _;
        if (isTopLevelCall) {
            _initializing = false;
        }
    }
}
`
  );
  
  // Add stub ERC20Upgradeable
  await fs.ensureDir(path.join(basePath, 'contracts', 'token', 'ERC20'));
  await fs.writeFile(
    path.join(basePath, 'contracts', 'token', 'ERC20', 'ERC20Upgradeable.sol'),
    `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../../proxy/utils/Initializable.sol";

/**
 * @dev This is a STUB implementation for when dependency installation fails.
 */
contract ERC20Upgradeable is Initializable {
    string private _name;
    string private _symbol;
    
    function __ERC20_init(string memory name_, string memory symbol_) internal initializer {
        _name = name_;
        _symbol = symbol_;
    }
    
    function name() public view virtual returns (string memory) {
        return _name;
    }
    
    function symbol() public view virtual returns (string memory) {
        return _symbol;
    }
    
    function decimals() public view virtual returns (uint8) {
        return 18;
    }
}
`
  );
}

/**
 * Create stub files for Uniswap V2
 * @param {string} basePath - Path to create stub files
 * @returns {Promise<void>}
 */
async function createUniswapV2Stub(basePath) {
  logger.log(`Creating Uniswap V2 stub in ${basePath}`);
  
  // Create minimal structure for Uniswap V2
  await fs.ensureDir(path.join(basePath, 'contracts', 'interfaces'));
  await fs.writeFile(
    path.join(basePath, 'contracts', 'interfaces', 'IUniswapV2Router02.sol'),
    `// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.6.0;

/**
 * @dev This is a STUB implementation for when dependency installation fails.
 * It allows compilation to continue but will not provide actual functionality.
 */
interface IUniswapV2Router02 {
    function swapExactTokensForTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external returns (uint[] memory amounts);
    
    function addLiquidity(
        address tokenA,
        address tokenB,
        uint amountADesired,
        uint amountBDesired,
        uint amountAMin,
        uint amountBMin,
        address to,
        uint deadline
    ) external returns (uint amountA, uint amountB, uint liquidity);
}
`
  );
}

/**
 * Create stub files for Uniswap V3
 * @param {string} basePath - Path to create stub files
 * @returns {Promise<void>}
 */
async function createUniswapV3Stub(basePath) {
  logger.log(`Creating Uniswap V3 stub in ${basePath}`);
  
  // Create minimal structure for Uniswap V3
  await fs.ensureDir(path.join(basePath, 'contracts', 'interfaces'));
  await fs.writeFile(
    path.join(basePath, 'contracts', 'interfaces', 'IUniswapV3Pool.sol'),
    `// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.7.0;

/**
 * @dev This is a STUB implementation for when dependency installation fails.
 * It allows compilation to continue but will not provide actual functionality.
 */
interface IUniswapV3Pool {
    function initialize(uint160 sqrtPriceX96) external;
    
    function slot0() external view returns (
        uint160 sqrtPriceX96,
        int24 tick,
        uint16 observationIndex,
        uint16 observationCardinality,
        uint16 observationCardinalityNext,
        uint8 feeProtocol,
        bool unlocked
    );
    
    function liquidity() external view returns (uint128);
}
`
  );
}

/**
 * Create stub files for Aave Protocol
 * @param {string} basePath - Path to create stub files
 * @returns {Promise<void>}
 */
async function createAaveStub(basePath) {
  logger.log(`Creating Aave stub in ${basePath}`);
  
  // Create minimal structure for Aave
  await fs.ensureDir(path.join(basePath, 'contracts', 'interfaces'));
  await fs.writeFile(
    path.join(basePath, 'contracts', 'interfaces', 'IPoolAddressesProvider.sol'),
    `// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

/**
 * @dev This is a STUB implementation for when dependency installation fails.
 * It allows compilation to continue but will not provide actual functionality.
 */
interface IPoolAddressesProvider {
    function getPool() external view returns (address);
    function getPoolConfigurator() external view returns (address);
    function getPriceOracle() external view returns (address);
    function getACLAdmin() external view returns (address);
    function getACLManager() external view returns (address);
    function getMarketId() external view returns (string memory);
}
`
  );
}

/**
 * Create stub files for Chainlink contracts
 * @param {string} basePath - Path to create stub files
 * @returns {Promise<void>}
 */
async function createChainlinkStub(basePath) {
  logger.log(`Creating Chainlink stub in ${basePath}`);
  
  // Create minimal structure for Chainlink
  await fs.ensureDir(path.join(basePath, 'contracts', 'src', 'v0.8', 'interfaces'));
  await fs.writeFile(
    path.join(basePath, 'contracts', 'src', 'v0.8', 'interfaces', 'AggregatorV3Interface.sol'),
    `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @dev This is a STUB implementation for when dependency installation fails.
 * It allows compilation to continue but will not provide actual functionality.
 */
interface AggregatorV3Interface {
  function decimals() external view returns (uint8);
  function description() external view returns (string memory);
  function version() external view returns (uint256);
  
  function latestRoundData()
    external
    view
    returns (
      uint80 roundId,
      int256 answer,
      uint256 startedAt,
      uint256 updatedAt,
      uint80 answeredInRound
    );
}
`
  );
}

/**
 * Create stub files for Solmate library
 * @param {string} basePath - Path to create stub files
 * @returns {Promise<void>}
 */
async function createSolmateStub(basePath) {
  logger.log(`Creating Solmate stub in ${basePath}`);
  
  // Create minimal structure for Solmate
  await fs.ensureDir(path.join(basePath, 'src', 'tokens'));
  await fs.writeFile(
    path.join(basePath, 'src', 'tokens', 'ERC20.sol'),
    `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @dev This is a STUB implementation for when dependency installation fails.
 * It allows compilation to continue but will not provide actual functionality.
 */
contract ERC20 {
    string public name;
    string public symbol;
    uint8 public immutable decimals;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(
        string memory _name,
        string memory _symbol,
        uint8 _decimals
    ) {
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
    }
}
`
  );
}

/**
 * Create stub files for Solady library
 * @param {string} basePath - Path to create stub files
 * @returns {Promise<void>}
 */
async function createSoladyStub(basePath) {
  logger.log(`Creating Solady stub in ${basePath}`);
  
  // Create minimal structure for Solady
  await fs.ensureDir(path.join(basePath, 'src', 'utils'));
  await fs.writeFile(
    path.join(basePath, 'src', 'utils', 'LibString.sol'),
    `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @dev This is a STUB implementation for when dependency installation fails.
 * It allows compilation to continue but will not provide actual functionality.
 */
library LibString {
    function toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) {
            return "0";
        }
        
        // Stub implementation
        return "Stub";
    }
}
`
  );
}

/**
 * Create stub file for ERC721A
 * @param {string} basePath - Path to create stub files
 * @returns {Promise<void>}
 */
async function createERC721AStub(basePath) {
  logger.log(`Creating ERC721A stub in ${basePath}`);
  
  // Create minimal structure for ERC721A
  await fs.ensureDir(path.join(basePath, 'contracts'));
  await fs.writeFile(
    path.join(basePath, 'contracts', 'ERC721A.sol'),
    `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @dev This is a STUB implementation for when dependency installation fails.
 * It allows compilation to continue but will not provide actual functionality.
 */
contract ERC721A {
    string private _name;
    string private _symbol;
    
    constructor(string memory name_, string memory symbol_) {
        _name = name_;
        _symbol = symbol_;
    }
    
    function name() public view virtual returns (string memory) {
        return _name;
    }
    
    function symbol() public view virtual returns (string memory) {
        return _symbol;
    }
}
`
  );
}

/**
 * Create stub for Compound Protocol
 * @param {string} basePath - Path to create stub files
 * @param {string} version - Version of compound (v2 or v3)
 * @returns {Promise<void>}
 */
async function createCompoundStub(basePath, version = 'v2') {
  logger.log(`Creating Compound ${version} stub in ${basePath}`);
  
  if (version === 'v2') {
    await fs.ensureDir(path.join(basePath, 'contracts'));
    await fs.writeFile(
      path.join(basePath, 'contracts', 'CToken.sol'),
      `// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.0;

/**
 * @dev This is a STUB implementation for when dependency installation fails.
 * It allows compilation to continue but will not provide actual functionality.
 */
contract CToken {
    function transfer(address dst, uint amount) external returns (bool) {
        return false;
    }
    
    function transferFrom(address src, address dst, uint amount) external returns (bool) {
        return false;
    }
    
    function approve(address spender, uint amount) external returns (bool) {
        return false;
    }
    
    function balanceOf(address owner) external view returns (uint) {
        return 0;
    }
}
`
    );
  } else if (version === 'v3') {
    await fs.ensureDir(path.join(basePath, 'contracts'));
    await fs.writeFile(
      path.join(basePath, 'contracts', 'CometInterface.sol'),
      `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @dev This is a STUB implementation for when dependency installation fails.
 * It allows compilation to continue but will not provide actual functionality.
 */
interface CometInterface {
    function supply(address asset, uint amount) external;
    function withdraw(address asset, uint amount) external;
    function balanceOf(address account) external view returns (uint);
}
`
    );
  }
}

/**
 * Create stub for a dependency based on its type
 * @param {string} basePath - Path to create stub files
 * @param {Object} dependency - Dependency information
 * @returns {Promise<void>}
 */
async function createStubForDependency(basePath, dependency) {
  try {
    if (dependency.type === 'openzeppelin') {
      if (dependency.subtype === 'contracts') {
        await createOpenZeppelinStub(basePath);
      } else if (dependency.subtype === 'contracts-upgradeable') {
        await createOpenZeppelinUpgradeableStub(basePath);
      }
    } else if (dependency.type === 'uniswap') {
      if (dependency.subtype && dependency.subtype.includes('v2')) {
        await createUniswapV2Stub(basePath);
      } else if (dependency.subtype && dependency.subtype.includes('v3')) {
        await createUniswapV3Stub(basePath);
      }
    } else if (dependency.type === 'aave') {
      await createAaveStub(basePath);
    } else if (dependency.type === 'chainlink') {
      await createChainlinkStub(basePath);
    } else if (dependency.type === 'solmate') {
      await createSolmateStub(basePath);
    } else if (dependency.type === 'solady') {
      await createSoladyStub(basePath);
    } else if (dependency.type === 'erc721a') {
      await createERC721AStub(basePath);
    } else if (dependency.type === 'compound') {
      await createCompoundStub(basePath, dependency.subtype);
    } else {
      // Generic stub
      await fs.ensureDir(basePath);
      await fs.writeFile(
        path.join(basePath, 'README.md'),
        `# ${dependency.name} (STUB)\n\nThis is a stub directory created because the original installation failed.\n\nOriginal repo: https://github.com/${dependency.repo}\n`
      );
    }
    
    logger.log(`✅ Created stub for ${dependency.name}`);
    return true;
  } catch (error) {
    logger.error(`❌ Failed to create stub for ${dependency.name}: ${error.message}`);
    return false;
  }
}

/**
 * Create minimal OpenZeppelin stubs
 * @param {string} tempDir - Temporary directory path
 * @returns {Promise<boolean>} True if successful
 */
async function createMinimalOpenZeppelinStubs(tempDir) {
    try {
      // Ensure the directory structure exists
      const ozDir = path.join(tempDir, 'lib', 'openzeppelin-contracts');
      await fs.ensureDir(path.join(ozDir, 'contracts', 'token', 'ERC20'));
      await fs.ensureDir(path.join(ozDir, 'contracts', 'token', 'ERC20', 'extensions'));
      await fs.ensureDir(path.join(ozDir, 'contracts', 'access'));
      
      // Create ERC20.sol stub
      await fs.writeFile(
        path.join(ozDir, 'contracts', 'token', 'ERC20', 'ERC20.sol'),
        `// SPDX-License-Identifier: MIT
  pragma solidity ^0.8.0;
  
  /**
   * @dev Stub ERC20 implementation
   */
  contract ERC20 {
      string private _name;
      string private _symbol;
      uint8 private _decimals;
      
      mapping(address => uint256) private _balances;
      mapping(address => mapping(address => uint256)) private _allowances;
      uint256 private _totalSupply;
      
      constructor(string memory name_, string memory symbol_) {
          _name = name_;
          _symbol = symbol_;
          _decimals = 18;
      }
      
      function name() public view virtual returns (string memory) {
          return _name;
      }
      
      function symbol() public view virtual returns (string memory) {
          return _symbol;
      }
      
      function decimals() public view virtual returns (uint8) {
          return _decimals;
      }
      
      function totalSupply() public view virtual returns (uint256) {
          return _totalSupply;
      }
      
      function balanceOf(address account) public view virtual returns (uint256) {
          return _balances[account];
      }
      
      function _mint(address account, uint256 amount) internal virtual {
          _totalSupply += amount;
          _balances[account] += amount;
      }
  }
  `
      );
      
      // Create ERC20Burnable.sol stub
      await fs.writeFile(
        path.join(ozDir, 'contracts', 'token', 'ERC20', 'extensions', 'ERC20Burnable.sol'),
        `// SPDX-License-Identifier: MIT
  pragma solidity ^0.8.0;
  
  import "../ERC20.sol";
  
  /**
   * @dev Stub ERC20Burnable implementation
   */
  abstract contract ERC20Burnable is ERC20 {
      function burn(uint256 amount) public virtual {
          // Stub implementation
      }
      
      function burnFrom(address account, uint256 amount) public virtual {
          // Stub implementation
      }
  }
  `
      );
      
      // Create Ownable.sol stub
      await fs.writeFile(
        path.join(ozDir, 'contracts', 'access', 'Ownable.sol'),
        `// SPDX-License-Identifier: MIT
  pragma solidity ^0.8.0;
  
  /**
   * @dev Stub Ownable implementation
   */
  abstract contract Ownable {
      address private _owner;
      
      constructor() {
          _owner = msg.sender;
      }
      
      function owner() public view virtual returns (address) {
          return _owner;
      }
      
      modifier onlyOwner() {
          require(owner() == msg.sender, "Ownable: caller is not the owner");
          _;
      }
  }
  `
      );
      
      // Create remappings.txt
      const remappings = [
        '@openzeppelin/=lib/openzeppelin-contracts/',
        '@openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/'
      ];
      
      await fs.writeFile(path.join(tempDir, 'remappings.txt'), remappings.join('\n'));
      
      return true;
    } catch (error) {
      logger.error(`Failed to create minimal OpenZeppelin stubs: ${error.message}`);
      return false;
    }
  }

module.exports = {
  createOpenZeppelinStub,
  createOpenZeppelinUpgradeableStub,
  createUniswapV2Stub,
  createUniswapV3Stub,
  createAaveStub,
  createChainlinkStub,
  createSolmateStub,
  createSoladyStub,
  createERC721AStub,
  createCompoundStub,
  createStubForDependency,
  createMinimalOpenZeppelinStubs
};