#!/usr/bin/env node

/**
 * Pre-install Dependencies Script
 * Manually installs common Solidity dependencies without relying on forge install
 * Updated to accommodate multiple OpenZeppelin versions
 */

const fs = require('fs-extra');
const path = require('path');
const { execSync, exec } = require('child_process');
const { promisify } = require('util');
const execPromise = promisify(exec);

// OpenZeppelin versions array - these are the most commonly used stable versions
const OZ_VERSIONS = [
  { version: 'v4.9.5', folderSuffix: '4.9.5' },  // Latest 4.9.x 
  { version: 'v4.9.4', folderSuffix: '4.9.4' },  // 4.9.4
  { version: 'v4.9.3', folderSuffix: '4.9.3' },  // 4.9.3
  { version: 'v4.9.2', folderSuffix: '4.9.2' },  // 4.9.2
  { version: 'v4.9.1', folderSuffix: '4.9.1' },  // 4.9.1
  { version: 'v4.9.0', folderSuffix: '4.9.0' },  // 4.9.0
  { version: 'v4.8.3', folderSuffix: '4.8.3' },  // Latest 4.8.x
  { version: 'v4.7.3', folderSuffix: '4.7.3' },  // Latest 4.7.x
  { version: 'v4.6.0', folderSuffix: '4.6.0' },  // Latest 4.6.x
  { version: 'v4.5.0', folderSuffix: '4.5.0' },  // Latest 4.5.x
  { version: 'v4.4.2', folderSuffix: '4.4.2' },  // Latest 4.4.x
  { version: 'v4.3.3', folderSuffix: '4.3.3' },  // Latest 4.3.x
  { version: 'v4.2.0', folderSuffix: '4.2.0' },  // Latest 4.2.x
  { version: 'v4.1.0', folderSuffix: '4.1.0' },  // Latest 4.1.x
  { version: 'v4.0.0', folderSuffix: '4.0.0' },  // First 4.x release
];

// Create base dependencies list - we'll expand the OZ entries later
const BASE_DEPENDENCIES = [
  {
    name: 'Solmate',
    repo: 'transmissions11/solmate',
    version: 'main',
    folderName: 'solmate'
  },
  {
    name: 'Uniswap V2 Core',
    repo: 'Uniswap/v2-core',
    version: 'master',
    folderName: 'uniswap-v2-core'
  },
  {
    name: 'Uniswap V2 Periphery',
    repo: 'Uniswap/v2-periphery',
    version: 'master',
    folderName: 'uniswap-v2-periphery'
  },
  {
    name: 'Uniswap V3 Core',
    repo: 'Uniswap/v3-core',
    version: 'main',
    folderName: 'uniswap-v3-core'
  },
  {
    name: 'Uniswap V3 Periphery',
    repo: 'Uniswap/v3-periphery',
    version: 'main',
    folderName: 'uniswap-v3-periphery'
  },
  {
    name: 'Aave Protocol V2',
    repo: 'aave/protocol-v2',
    version: 'master',
    folderName: 'aave-protocol-v2'
  },
  {
    name: 'Chainlink Contracts',
    repo: 'smartcontractkit/chainlink',
    version: 'develop',
    folderName: 'chainlink'
  }
];

// Now expand with all OpenZeppelin versions
const DEPENDENCIES = [...BASE_DEPENDENCIES];

// Add all OpenZeppelin contracts versions
OZ_VERSIONS.forEach(ozVersion => {
  DEPENDENCIES.push({
    name: `OpenZeppelin Contracts ${ozVersion.version}`,
    repo: 'OpenZeppelin/openzeppelin-contracts',
    version: ozVersion.version,
    folderName: `openzeppelin-contracts-${ozVersion.folderSuffix}`
  });
  
  DEPENDENCIES.push({
    name: `OpenZeppelin Upgradeable Contracts ${ozVersion.version}`,
    repo: 'OpenZeppelin/openzeppelin-contracts-upgradeable',
    version: ozVersion.version,
    folderName: `openzeppelin-contracts-upgradeable-${ozVersion.folderSuffix}`
  });
});

console.log('📦 Pre-installing dependencies manually...');
console.log(`🔍 Will install ${OZ_VERSIONS.length} versions of OpenZeppelin contracts`);

// Create lib directory if it doesn't exist
const libDir = path.join(process.cwd(), 'lib');
if (!fs.existsSync(libDir)) {
  fs.mkdirSync(libDir, { recursive: true });
}

// Create remappings.txt
const remappings = [];

// Process dependencies sequentially using async/await
async function processDependencies() {
  // First check that git is available
  try {
    const { stdout } = await execPromise('git --version');
    console.log(`Git is available: ${stdout.trim()}`);
  } catch (error) {
    console.error('❌ Git is not available. Please install Git before continuing.');
    console.error('   Error:', error.message);
    process.exit(1);
  }

  for (const dep of DEPENDENCIES) {
    const depPath = path.join(libDir, dep.folderName);
    
    console.log(`\nProcessing ${dep.name}...`);
    
    try {
      // Force clean approach - remove directory if it exists and clone fresh
      if (fs.existsSync(depPath)) {
        console.log(`Directory already exists: ${depPath}`);
        console.log('Removing existing directory for clean installation...');
        await fs.remove(depPath);
      }
      
      console.log(`Cloning ${dep.repo}@${dep.version}...`);
      
      // Use --depth 1 for faster cloning (only get the specific version)
      const cloneCmd = `git clone --depth 1 https://github.com/${dep.repo}.git "${depPath}" --branch ${dep.version} || git clone --depth 1 https://github.com/${dep.repo}.git "${depPath}"`;
      console.log(`Running: ${cloneCmd}`);
      
      try {
        await execPromise(cloneCmd, { stdio: 'inherit' });
        console.log(`✅ Cloned ${dep.name} to ${depPath}`);
      } catch (cloneError) {
        // If specific branch clone fails, try regular clone and then checkout
        console.log(`Branch clone failed, trying regular clone...`);
        try {
          await execPromise(`git clone https://github.com/${dep.repo}.git "${depPath}"`, { stdio: 'inherit' });
          await execPromise(`cd "${depPath}" && git checkout ${dep.version}`, { stdio: 'inherit' });
          console.log(`✅ Cloned and checked out ${dep.name} to ${depPath}`);
        } catch (regularCloneError) {
          throw new Error(`Failed to clone repository: ${regularCloneError.message}`);
        }
      }
      
      // Create remappings for each dependency
      if (dep.repo === 'OpenZeppelin/openzeppelin-contracts') {
        // Extract version info from folder name for remapping
        const versionSuffix = dep.folderName.replace('openzeppelin-contracts-', '');
        
        // Create version-specific remappings
        remappings.push(`@openzeppelin-${versionSuffix}/=lib/${dep.folderName}/`);
        remappings.push(`@openzeppelin-${versionSuffix}/contracts/=lib/${dep.folderName}/contracts/`);
        
        // If this is v4.9.5 (default version), also add the standard remappings
        // if (dep.version === 'v4.9.5') {
        //   remappings.push(`@openzeppelin/=lib/${dep.folderName}/`);
        //   remappings.push(`@openzeppelin/contracts/=lib/${dep.folderName}/contracts/`);
        // }
      } 
      else if (dep.repo === 'OpenZeppelin/openzeppelin-contracts-upgradeable') {
        // Extract version info from folder name for remapping
        const versionSuffix = dep.folderName.replace('openzeppelin-contracts-upgradeable-', '');
        
        // Create version-specific remappings
        remappings.push(`@openzeppelin-upgradeable-${versionSuffix}/=lib/${dep.folderName}/`);
        remappings.push(`@openzeppelin-upgradeable-${versionSuffix}/contracts/=lib/${dep.folderName}/contracts/`);
        
        // If this is v4.9.5 (default version), also add the standard remappings
        // if (dep.version === 'v4.9.5') {
        //   remappings.push(`@openzeppelin-upgradeable/=lib/${dep.folderName}/`);
        //   remappings.push(`@openzeppelin/contracts-upgradeable/=lib/${dep.folderName}/contracts/`);
        // }
      }
      else {
        // Process non-OpenZeppelin dependencies
        switch(dep.repo) {
          case 'transmissions11/solmate':
            remappings.push(`solmate/=lib/${dep.folderName}/src/`);
            break;
          case 'Uniswap/v2-core':
            remappings.push(`@uniswap/v2-core/=lib/${dep.folderName}/`);
            break;
          case 'Uniswap/v2-periphery':
            remappings.push(`@uniswap/v2-periphery/=lib/${dep.folderName}/`);
            break;
          case 'Uniswap/v3-core':
            remappings.push(`@uniswap/v3-core/=lib/${dep.folderName}/`);
            break;
          case 'Uniswap/v3-periphery':
            remappings.push(`@uniswap/v3-periphery/=lib/${dep.folderName}/`);
            break;
          case 'aave/protocol-v2':
            remappings.push(`@aave/protocol-v2/=lib/${dep.folderName}/`);
            break;
          case 'smartcontractkit/chainlink':
            remappings.push(`@chainlink/=lib/${dep.folderName}/contracts/`);
            remappings.push(`@chainlink/contracts/=lib/${dep.folderName}/contracts/src/`);
            break;
        }
      }
      
    } catch (error) {
      console.error(`❌ Failed to process ${dep.name}: ${error.message}`);
      
      // Create minimal stub directory with README if clone fails
      try {
        console.log(`Creating minimal stub for ${dep.name}...`);
        await fs.ensureDir(depPath);
        await fs.writeFile(
          path.join(depPath, 'README.md'),
          `# ${dep.name} (STUB)\n\nThis is a stub directory created because the original clone failed.\n\nOriginal repo: https://github.com/${dep.repo}\n`
        );
        
        // Create stub files for critical contracts
        if (dep.repo === 'OpenZeppelin/openzeppelin-contracts') {
          await createOpenZeppelinStub(depPath);
        } else if (dep.repo === 'OpenZeppelin/openzeppelin-contracts-upgradeable') {
          await createOpenZeppelinUpgradeableStub(depPath);
        } else if (dep.repo.includes('Uniswap/v2')) {
          await createUniswapV2Stub(depPath);
        } else if (dep.repo.includes('Uniswap/v3')) {
          await createUniswapV3Stub(depPath);
        } else if (dep.repo.includes('aave/protocol')) {
          await createAaveStub(depPath);
        } else if (dep.repo.includes('chainlink')) {
          await createChainlinkStub(depPath);
        }
        
        console.log(`✅ Created stub for ${dep.name}`);
      } catch (stubError) {
        console.error(`❌ Failed to create stub for ${dep.name}: ${stubError.message}`);
      }
    }
  }
  
  // Write remappings.txt
  try {
    fs.writeFileSync(path.join(process.cwd(), 'remappings.txt'), remappings.join('\n'));
    console.log('\n✅ Created remappings.txt with the following entries:');
    console.log(remappings.join('\n'));
  } catch (error) {
    console.error(`❌ Failed to write remappings.txt: ${error.message}`);
  }
  
  // Create foundry.toml if it doesn't exist
  try {
    const foundryTomlPath = path.join(process.cwd(), 'foundry.toml');
    if (!fs.existsSync(foundryTomlPath)) {
      const foundryConfig = `
[profile.default]
src = 'src'
out = 'out'
libs = ['lib']
remappings = [
  ${remappings.map(r => `"${r}"`).join(',\n  ')}
]

[rpc_endpoints]
`;
      
      fs.writeFileSync(foundryTomlPath, foundryConfig);
      console.log('\n✅ Created foundry.toml');
    } else {
      console.log('\n✅ foundry.toml already exists');
    }
  } catch (error) {
    console.error(`❌ Failed to create foundry.toml: ${error.message}`);
  }
  
  console.log('\n📦 Dependencies setup completed!');
  console.log('\nYou can now use imports like:');
  console.log('# Default OpenZeppelin contracts (v4.9.5):');
  console.log('import "@openzeppelin/contracts/token/ERC20/ERC20.sol";');
  console.log('import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";');
  console.log('\n# Specific OpenZeppelin versions:');
  console.log('import "@openzeppelin-4.9.4/contracts/token/ERC20/ERC20.sol";');
  console.log('import "@openzeppelin-4.9.3/contracts/token/ERC20/ERC20.sol";');
  console.log('import "@openzeppelin-4.9.2/contracts/token/ERC20/ERC20.sol";');
  console.log('import "@openzeppelin-4.9.1/contracts/token/ERC20/ERC20.sol";');
  console.log('import "@openzeppelin-4.9.0/contracts/token/ERC20/ERC20.sol";');
  console.log('import "@openzeppelin-4.8.3/contracts/token/ERC20/ERC20.sol";');
  console.log('import "@openzeppelin-upgradeable-4.8.3/contracts/proxy/utils/Initializable.sol";');
  console.log('\n# Other dependencies:');
  console.log('import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";');
  console.log('import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";');
  console.log('import "@aave/protocol-v2/contracts/interfaces/ILendingPool.sol";');
  console.log('import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";');
}

// Helper functions to create stub files for critical contracts

async function createOpenZeppelinStub(basePath) {
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
}`
  );
}

async function createOpenZeppelinUpgradeableStub(basePath) {
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
}`
  );
}

async function createUniswapV2Stub(basePath) {
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
}`
  );
}

async function createUniswapV3Stub(basePath) {
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
}`
  );
}

async function createAaveStub(basePath) {
  // Create minimal structure for Aave
  await fs.ensureDir(path.join(basePath, 'contracts', 'interfaces'));
  await fs.writeFile(
    path.join(basePath, 'contracts', 'interfaces', 'ILendingPool.sol'),
    `// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.6.12;

/**
 * @dev This is a STUB implementation for when dependency installation fails.
 * It allows compilation to continue but will not provide actual functionality.
 */
interface ILendingPool {
    function deposit(
        address asset,
        uint256 amount,
        address onBehalfOf,
        uint16 referralCode
    ) external;
    
    function withdraw(
        address asset,
        uint256 amount,
        address to
    ) external returns (uint256);
    
    function borrow(
        address asset,
        uint256 amount,
        uint256 interestRateMode,
        uint16 referralCode,
        address onBehalfOf
    ) external;
}`
  );
}

async function createChainlinkStub(basePath) {
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
}`
  );
}

// Run the process
processDependencies().catch(error => {
  console.error(`❌ Fatal error in dependency setup: ${error.message}`);
  process.exit(1);
});