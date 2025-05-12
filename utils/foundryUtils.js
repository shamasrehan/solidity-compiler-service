const { execSync } = require('child_process');
const fs = require('fs-extra');
const path = require('path');

/**
 * Check if Foundry is properly installed
 * @returns {boolean} Whether Foundry is installed
 */
function checkFoundryInstallation() {
  try {
    const version = execSync('forge --version', { encoding: 'utf8' });
    console.log(`Foundry version: ${version.trim()}`);
    return true;
  } catch (error) {
    console.error('Foundry is not properly installed:', error.message);
    return false;
  }
}

/**
 * Check if a dependency is already installed
 * @param {string} contractDir - Directory of the contract
 * @param {string} dependency - Dependency to check
 * @returns {boolean} Whether the dependency is installed
 */
function checkDependencyInstalled(contractDir, dependency) {
  try {
    const libDir = path.join(contractDir, 'lib');
    if (!fs.existsSync(libDir)) return false;
    
    // Extract repository name from the dependency string
    let repoName;
    if (dependency.includes('@')) {
      repoName = dependency.split('@')[0].split('/').pop();
    } else {
      repoName = dependency.split('/').pop();
    }
    
    // Check if the directory exists
    return fs.existsSync(path.join(libDir, repoName));
  } catch (error) {
    console.error(`Error checking if dependency ${dependency} is installed:`, error.message);
    return false;
  }
}

/**
 * Clean up folders after compilation
 * @param {string} contractPath - Path to the contract directory
 */
function cleanupFolders(contractPath) {
  try {
    console.log(`Cleaning up folder: ${contractPath}`);
    fs.removeSync(contractPath);
    // Clean cache and other temporary files
    execSync('forge clean', { stdio: 'ignore' });
    console.log('Cleanup complete');
  } catch (error) {
    console.error('Error during cleanup:', error);
  }
}

/**
 * Create a foundry.toml configuration file
 * @param {string} contractDir - Contract directory
 * @param {string[]} dependencies - List of dependencies
 * @param {string} evmVersion - EVM version to use
 * @param {string} compilerVersion - Solidity compiler version
 */
function createFoundryConfig(contractDir, dependencies, evmVersion, compilerVersion) {
  // Create a foundry.toml config file in the contract directory
  let foundryConfig = `[profile.default]\n`;
  foundryConfig += `src = 'src'\n`;
  foundryConfig += `out = 'out'\n`;
  foundryConfig += `libs = ['lib']\n`;
  foundryConfig += `auto_detect_solc = true\n`;
  
  // Add remappings directly in foundry.toml
  foundryConfig += `remappings = [\n`;
  
  // Map of dependency patterns to remapping configurations
  const remappingConfigs = [
    // OpenZeppelin
    {
      pattern: dep => dep.startsWith('OpenZeppelin/openzeppelin-contracts'),
      remappings: [
        '@openzeppelin/=lib/openzeppelin-contracts/',
        '@openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/',
        '@openzeppelin/contracts/utils/=lib/openzeppelin-contracts/contracts/utils/',
        '@openzeppelin/contracts/token/=lib/openzeppelin-contracts/contracts/token/',
        '@openzeppelin/contracts/access/=lib/openzeppelin-contracts/contracts/access/',
        '@openzeppelin/contracts/security/=lib/openzeppelin-contracts/contracts/security/',
      ]
    },
    {
      pattern: dep => dep.startsWith('OpenZeppelin/openzeppelin-contracts-upgradeable'),
      remappings: [
        '@openzeppelin/contracts-upgradeable/=lib/openzeppelin-contracts-upgradeable/contracts/',
      ]
    },
    // Uniswap V2
    {
      pattern: dep => dep.startsWith('Uniswap/v2-core'),
      remappings: [
        '@uniswap/v2-core/=lib/v2-core/',
        '@uniswap/v2-core/contracts/=lib/v2-core/contracts/',
        '@uniswap/v2-core/interfaces/=lib/v2-core/interfaces/',
      ]
    },
    {
      pattern: dep => dep.startsWith('Uniswap/v2-periphery'),
      remappings: [
        '@uniswap/v2-periphery/=lib/v2-periphery/',
        '@uniswap/v2-periphery/contracts/=lib/v2-periphery/contracts/',
        '@uniswap/v2-periphery/interfaces/=lib/v2-periphery/interfaces/',
      ]
    },
    // Uniswap V3
    {
      pattern: dep => dep.startsWith('Uniswap/v3-core'),
      remappings: [
        '@uniswap/v3-core/=lib/v3-core/',
        '@uniswap/v3-core/contracts/=lib/v3-core/contracts/',
        '@uniswap/v3-core/interfaces/=lib/v3-core/interfaces/',
      ]
    },
    {
      pattern: dep => dep.startsWith('Uniswap/v3-periphery'),
      remappings: [
        '@uniswap/v3-periphery/=lib/v3-periphery/',
        '@uniswap/v3-periphery/contracts/=lib/v3-periphery/contracts/',
        '@uniswap/v3-periphery/interfaces/=lib/v3-periphery/interfaces/',
      ]
    },
    // Solidity Libraries
    {
      pattern: dep => dep.startsWith('transmissions11/solmate'),
      remappings: [
        'solmate/=lib/solmate/src/',
      ]
    },
    {
      pattern: dep => dep.startsWith('vectorized/solady'),
      remappings: [
        'solady/=lib/solady/src/',
      ]
    },
    // Aave
    {
      pattern: dep => dep.startsWith('aave/aave-v3-core'),
      remappings: [
        '@aave/core-v3/=lib/aave-v3-core/',
        '@aave/core-v3/contracts/=lib/aave-v3-core/contracts/',
      ]
    },
    // Compound
    {
      pattern: dep => dep.startsWith('compound-finance/compound-protocol'),
      remappings: [
        'compound-protocol/=lib/compound-protocol/',
        'compound-protocol/contracts/=lib/compound-protocol/contracts/',
        '@compound-finance/contracts/=lib/compound-protocol/contracts/',
      ]
    },
    // Chainlink
    {
      pattern: dep => dep.startsWith('smartcontractkit/chainlink'),
      remappings: [
        '@chainlink/contracts/=lib/chainlink/contracts/',
        '@chainlink/=lib/chainlink/',
      ]
    },
  ];
  
  // Add remappings based on dependencies
  for (const config of remappingConfigs) {
    if (dependencies.some(config.pattern)) {
      for (const remapping of config.remappings) {
        foundryConfig += `  '${remapping}',\n`;
      }
    }
  }
  
  foundryConfig += `]\n`;
  
  if (evmVersion) {
    foundryConfig += `evm_version = "${evmVersion}"\n`;
  }
  
  if (compilerVersion) {
    foundryConfig += `solc_version = "${compilerVersion}"\n`;
  }
  
  // Add optimizer settings
  foundryConfig += `[profile.default.optimizer]\n`;
  foundryConfig += `enabled = true\n`;
  foundryConfig += `runs = 200\n`;
  
  // Add any extra settings that might help with compilation
  foundryConfig += `[profile.default.model_checker]\n`;
  foundryConfig += `contracts = { 'src/${extractFilenameFromDependencies(dependencies)}' = [] }\n`;
  
  fs.writeFileSync(path.join(contractDir, 'foundry.toml'), foundryConfig);
  console.log('foundry.toml config file created');
}

/**
 * Create remappings.txt file
 * @param {string} contractDir - Contract directory
 * @param {string[]} dependencies - List of dependencies
 */
function createRemappingsFile(contractDir, dependencies) {
  try {
    console.log('Creating manual remappings...');
    let remappingsContent = '';
    
    // Map of dependency patterns to remapping configurations
    const remappingConfigs = [
      // OpenZeppelin
      {
        pattern: dep => dep.startsWith('OpenZeppelin/openzeppelin-contracts'),
        remappings: [
          '@openzeppelin/=lib/openzeppelin-contracts/',
          '@openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/',
          '@openzeppelin/contracts/utils/=lib/openzeppelin-contracts/contracts/utils/',
          '@openzeppelin/contracts/token/=lib/openzeppelin-contracts/contracts/token/',
          '@openzeppelin/contracts/access/=lib/openzeppelin-contracts/contracts/access/',
          '@openzeppelin/contracts/security/=lib/openzeppelin-contracts/contracts/security/',
        ]
      },
      {
        pattern: dep => dep.startsWith('OpenZeppelin/openzeppelin-contracts-upgradeable'),
        remappings: [
          '@openzeppelin/contracts-upgradeable/=lib/openzeppelin-contracts-upgradeable/contracts/',
        ]
      },
      // Uniswap V2
      {
        pattern: dep => dep.startsWith('Uniswap/v2-core'),
        remappings: [
          '@uniswap/v2-core/=lib/v2-core/',
          '@uniswap/v2-core/contracts/=lib/v2-core/contracts/',
          '@uniswap/v2-core/interfaces/=lib/v2-core/interfaces/',
        ]
      },
      {
        pattern: dep => dep.startsWith('Uniswap/v2-periphery'),
        remappings: [
          '@uniswap/v2-periphery/=lib/v2-periphery/',
          '@uniswap/v2-periphery/contracts/=lib/v2-periphery/contracts/',
          '@uniswap/v2-periphery/interfaces/=lib/v2-periphery/interfaces/',
        ]
      },
      // Uniswap V3
      {
        pattern: dep => dep.startsWith('Uniswap/v3-core'),
        remappings: [
          '@uniswap/v3-core/=lib/v3-core/',
          '@uniswap/v3-core/contracts/=lib/v3-core/contracts/',
          '@uniswap/v3-core/interfaces/=lib/v3-core/interfaces/',
        ]
      },
      {
        pattern: dep => dep.startsWith('Uniswap/v3-periphery'),
        remappings: [
          '@uniswap/v3-periphery/=lib/v3-periphery/',
          '@uniswap/v3-periphery/contracts/=lib/v3-periphery/contracts/',
          '@uniswap/v3-periphery/interfaces/=lib/v3-periphery/interfaces/',
        ]
      },
      // Solidity Libraries
      {
        pattern: dep => dep.startsWith('transmissions11/solmate'),
        remappings: [
          'solmate/=lib/solmate/src/',
        ]
      },
      {
        pattern: dep => dep.startsWith('vectorized/solady'),
        remappings: [
          'solady/=lib/solady/src/',
        ]
      },
      // Aave
      {
        pattern: dep => dep.startsWith('aave/aave-v3-core'),
        remappings: [
          '@aave/core-v3/=lib/aave-v3-core/',
          '@aave/core-v3/contracts/=lib/aave-v3-core/contracts/',
        ]
      },
      // Compound
      {
        pattern: dep => dep.startsWith('compound-finance/compound-protocol'),
        remappings: [
          'compound-protocol/=lib/compound-protocol/',
          'compound-protocol/contracts/=lib/compound-protocol/contracts/',
          '@compound-finance/contracts/=lib/compound-protocol/contracts/',
        ]
      },
      // Chainlink
      {
        pattern: dep => dep.startsWith('smartcontractkit/chainlink'),
        remappings: [
          '@chainlink/contracts/=lib/chainlink/contracts/',
          '@chainlink/=lib/chainlink/',
        ]
      },
    ];
    
    // Add remappings based on dependencies
    for (const config of remappingConfigs) {
      if (dependencies.some(config.pattern)) {
        for (const remapping of config.remappings) {
          remappingsContent += `${remapping}\n`;
        }
      }
    }
    
    // Add absolute paths for OpenZeppelin if needed
    if (dependencies.some(dep => dep.startsWith('OpenZeppelin/openzeppelin-contracts'))) {
      const absoluteContractPath = path.resolve(contractDir, 'lib/openzeppelin-contracts/contracts');
      remappingsContent += `@openzeppelin/contracts/=${absoluteContractPath}/\n`;
    }
    
    // Add any other remappings from forge
    try {
      const forgeRemappings = execSync('forge remappings', { 
        cwd: contractDir,
        encoding: 'utf8',
        stdio: 'pipe'
      });
      
      remappingsContent += forgeRemappings;
    } catch (error) {
      console.warn('Failed to get forge remappings:', error.message);
    }
    
    // Write the remappings file
    const remappingsPath = path.join(contractDir, 'remappings.txt');
    fs.writeFileSync(remappingsPath, remappingsContent);
    console.log(`Remappings file created at ${remappingsPath}`);
    console.log('Remappings content:', remappingsContent);
    
    return remappingsContent;
  } catch (error) {
    console.warn('Failed to create remappings:', error.message);
    return '';
  }
}

/**
 * Extract the filename from the dependencies array (helper function)
 * @param {string[]} dependencies - Dependencies array
 * @returns {string} A filename or default
 */
function extractFilenameFromDependencies(dependencies) {
  // This is just a helper to get a reasonable filename for model checker config
  return 'Contract.sol';
}

/**
 * Verify and fix dependency installation
 * @param {string} contractDir - Contract directory
 * @param {string[]} dependencies - List of dependencies
 */
function verifyDependencyInstallation(contractDir, dependencies) {
  try {
    console.log('Verifying dependency installation...');
    
    // Define critical directories for various protocols
    const criticalDirectories = [
      // OpenZeppelin
      {
        pattern: dep => dep.startsWith('OpenZeppelin/openzeppelin-contracts'),
        dirs: [
          'lib/openzeppelin-contracts/contracts',
          'lib/openzeppelin-contracts/contracts/utils',
          'lib/openzeppelin-contracts/contracts/token',
          'lib/openzeppelin-contracts/contracts/access',
          'lib/openzeppelin-contracts/contracts/security'
        ]
      },
      // Uniswap V2
      {
        pattern: dep => dep.startsWith('Uniswap/v2-core'),
        dirs: [
          'lib/v2-core/contracts',
          'lib/v2-core/interfaces'
        ]
      },
      {
        pattern: dep => dep.startsWith('Uniswap/v2-periphery'),
        dirs: [
          'lib/v2-periphery/contracts',
          'lib/v2-periphery/interfaces'
        ]
      },
      // Uniswap V3
      {
        pattern: dep => dep.startsWith('Uniswap/v3-core'),
        dirs: [
          'lib/v3-core/contracts',
          'lib/v3-core/interfaces'
        ]
      },
      {
        pattern: dep => dep.startsWith('Uniswap/v3-periphery'),
        dirs: [
          'lib/v3-periphery/contracts',
          'lib/v3-periphery/interfaces'
        ]
      },
      // Aave
      {
        pattern: dep => dep.startsWith('aave/aave-v3-core'),
        dirs: [
          'lib/aave-v3-core/contracts',
          'lib/aave-v3-core/interfaces'
        ]
      },
      // Compound
      {
        pattern: dep => dep.startsWith('compound-finance/compound-protocol'),
        dirs: [
          'lib/compound-protocol/contracts'
        ]
      },
      // Solmate
      {
        pattern: dep => dep.startsWith('transmissions11/solmate'),
        dirs: [
          'lib/solmate/src'
        ]
      },
      // Solady
      {
        pattern: dep => dep.startsWith('vectorized/solady'),
        dirs: [
          'lib/solady/src'
        ]
      },
      // Chainlink
      {
        pattern: dep => dep.startsWith('smartcontractkit/chainlink'),
        dirs: [
          'lib/chainlink/contracts',
          'lib/chainlink/interfaces'
        ]
      }
    ];
    
    // Check each protocol that's in dependencies
    for (const { pattern, dirs } of criticalDirectories) {
      if (dependencies.some(pattern)) {
        for (const dirPath of dirs) {
          const fullPath = path.join(contractDir, dirPath);
          if (!fs.existsSync(fullPath)) {
            console.warn(`Critical directory missing: ${fullPath}`);
            fs.ensureDirSync(fullPath);
            console.log(`Created directory: ${fullPath}`);
          }
        }
      }
    }
    
    return true;
  } catch (error) {
    console.error('Error verifying dependencies:', error.message);
    return false;
  }
}

module.exports = {
  checkFoundryInstallation,
  checkDependencyInstalled,
  cleanupFolders,
  createFoundryConfig,
  createRemappingsFile,
  verifyDependencyInstallation
};