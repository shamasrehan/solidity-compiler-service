#!/usr/bin/env node

/**
 * Install Dependencies Script (Post-install script)
 * Runs during npm install to install Solidity dependencies using forge
 * Supports version-in-path import pattern: @openzeppelin/contracts@4.9.5/token/ERC20/ERC20.sol
 */

const fs = require('fs-extra');
const path = require('path');
const logger = console;

// Import shared utilities
const remappingUtils = require('./utils/remappingUtils');
const installUtils = require('./utils/installUtils');

logger.log('Running post-install script to set up Foundry dependencies...');

// Ensure required directories exist
installUtils.ensureDirectories();

// Skip when CI=true or when running as a dependency
if (process.env.CI === 'true' || process.env.SKIP_DEPS === 'true') {
  logger.log('Skipping Foundry dependency installation in CI environment');
  process.exit(0);
}

// Import dependencies configuration
let dependencies;
try {
  dependencies = require('../src/config/dependencies');
} catch (error) {
  logger.error(`Error loading dependencies configuration: ${error.message}`);
  logger.log('Using fallback dependencies configuration');
  dependencies = require('./utils/fallbackDependencies');
}

// Main execution function
async function main() {
  // Check if Foundry is installed
  const foundryInstalled = await installUtils.checkFoundryInstallation();
  
  if (!foundryInstalled) {
    logger.warn('Foundry is not installed. Using preinstall-dependencies.js instead...');
    await installUtils.runScript('preinstall-dependencies.js');
    return;
  }
  
  // Locate forge binary
  const forgePath = await installUtils.findForgePath();
  if (forgePath) {
    logger.log(`Found forge binary at: ${forgePath}`);
  } else {
    logger.warn('Could not locate forge binary. Using preinstall-dependencies.js instead...');
    await installUtils.runScript('preinstall-dependencies.js');
    return;
  }

  // Use the primary dependencies script
  logger.log('Running primary dependency installation...');
  await installUtils.runScript('preinstall-dependencies.js');
}

// Run the script
main().catch(error => {
  logger.error(`Error in install-dependencies.js: ${error.message}`);
  process.exit(1);
});