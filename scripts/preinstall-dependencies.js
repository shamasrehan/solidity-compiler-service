#!/usr/bin/env node

/**
 * Pre-install Dependencies Script (Primary Installation Script)
 * Manually installs common Solidity dependencies for your project
 * Supports version-in-path import pattern: @openzeppelin/contracts@4.9.5/token/ERC20/ERC20.sol
 */

const fs = require('fs-extra');
const path = require('path');
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);
const logger = console;

// Import shared utilities
const stubUtils = require('./utils/stubUtils');
const remappingUtils = require('./utils/remappingUtils');
const installUtils = require('./utils/installUtils');

// Import dependencies configuration
let dependencies;
try {
  dependencies = require('../src/config/dependencies');
} catch (error) {
  logger.error(`Error loading dependencies configuration: ${error.message}`);
  logger.log('Using fallback dependencies configuration');
  dependencies = require('./utils/fallbackDependencies');
}

const ALL_DEPENDENCIES = dependencies.default || dependencies.dependencies?.all || [];
logger.log(`📦 Pre-installing ${ALL_DEPENDENCIES.length} dependencies...`);

// Create lib directory if it doesn't exist
const libDir = path.join(process.cwd(), 'lib');
if (!fs.existsSync(libDir)) {
  fs.mkdirSync(libDir, { recursive: true });
}

// Process dependencies sequentially
async function processDependencies() {
  // First check that git is available
  try {
    const { stdout } = await exec('git --version');
    logger.log(`Git is available: ${stdout.trim()}`);
  } catch (error) {
    logger.error('❌ Git is not available. Falling back to HTTP download...');
    installUtils.runScript('download-dependencies.js');
    return;
  }
  
  // Ensure all required directories exist
  await installUtils.ensureDirectories();
  
  const installedDependencies = [];
  
  // Process each dependency
  for (const dep of ALL_DEPENDENCIES) {
    try {
      logger.log(`\nProcessing ${dep.name}...`);
      
      // Check if the dependency folder already exists
      const depPath = path.join(libDir, dep.folderName);
      if (fs.existsSync(depPath)) {
        logger.log(`Directory already exists: ${depPath}`);
        logger.log('Removing existing directory for clean installation...');
        await fs.remove(depPath);
      }
      
      // Try to install with git
      const success = await installUtils.cloneDependencyWithGit(
        process.cwd(),
        dep.repo,
        dep.version,
        dep.folderName
      );
      
      if (success) {
        installedDependencies.push(dep);
      } else {
        // If git clone fails, create a stub
        const stubSuccess = await stubUtils.createStubForDependency(depPath, dep);
        if (stubSuccess) {
          installedDependencies.push(dep);
        }
      }
    } catch (error) {
      logger.error(`❌ Failed to process ${dep.name}: ${error.message}`);
    }
  }
  
  // Apply remappings for installed dependencies
  if (installedDependencies.length > 0) {
    const result = await remappingUtils.applyRemappings(process.cwd(), installedDependencies);
    if (result.success) {
      logger.log(`✅ Successfully applied ${result.remappings.length} remappings`);
    }
  }
  
  // Show summary
  logger.log('\n📦 Dependency installation summary:');
  logger.log(`- Installed: ${installedDependencies.length}/${ALL_DEPENDENCIES.length} dependencies`);
  logger.log(`- Failed: ${ALL_DEPENDENCIES.length - installedDependencies.length} dependencies`);
  
  // Print usage examples
  logger.log('\nYou can now use imports like:');
  logger.log('# Default OpenZeppelin contracts (v4.9.5):');
  logger.log('import "@openzeppelin/contracts/token/ERC20/ERC20.sol";');
  logger.log('import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";');
  logger.log('\n# Version-specific imports (new style):');
  logger.log('import "@openzeppelin/contracts@4.9.5/token/ERC20/ERC20.sol";');
  logger.log('import "@openzeppelin/contracts@4.9.4/token/ERC20/ERC20.sol";');
  logger.log('import "@openzeppelin/contracts-upgradeable@4.9.5/proxy/utils/Initializable.sol";');
  logger.log('\n# Version-specific imports (old style):');
  logger.log('import "@openzeppelin-4.9.4/contracts/token/ERC20/ERC20.sol";');
  logger.log('import "@openzeppelin-upgradeable-4.8.3/contracts/proxy/utils/Initializable.sol";');
  logger.log('\n# Other dependencies:');
  logger.log('import "solmate/tokens/ERC20.sol";');
  logger.log('import "solady/utils/LibString.sol";');
  logger.log('import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";');
  logger.log('import "@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol";');
}

// Run the process
processDependencies().catch(error => {
  logger.error(`❌ Fatal error in dependency setup: ${error.message}`);
  logger.log('Trying fallback HTTP download method...');
  installUtils.runScript('download-dependencies.js');
});