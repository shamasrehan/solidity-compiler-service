/**
 * File system utility
 * Handles file operations for contract compilation
 */

const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const tmp = require('tmp-promise');
const logger = require('./logger');
const config = require('../config/config');

/**
 * Creates a temporary directory for compilation
 * @returns {Promise<{path: string, cleanup: Function}>} Object containing path and cleanup function
 */
async function createTempDirectory() {
  try {
    const tmpDir = await tmp.dir({
      prefix: 'sol-compiler-',
      unsafeCleanup: true, // Allows removal of non-empty directories
    });
    
    logger.debug(`Created temporary directory: ${tmpDir.path}`);
    return {
      path: tmpDir.path,
      cleanup: tmpDir.cleanup
    };
  } catch (error) {
    logger.error('Failed to create temporary directory', error);
    throw new Error('Failed to create temporary directory');
  }
}

/**
 * Creates a contract file in the specified directory
 * @param {string} dirPath - Directory path
 * @param {string} contractCode - Contract source code
 * @param {string} [filename='Contract.sol'] - Filename for the contract
 * @returns {Promise<string>} Path to the created file
 */
async function createContractFile(dirPath, contractCode, filename = 'Contract.sol') {
  try {
    // Ensure the directory exists
    await fs.ensureDir(dirPath);
    
    const contractPath = path.join(dirPath, filename);
    await fs.writeFile(contractPath, contractCode);
    
    logger.debug(`Created contract file at: ${contractPath}`);
    return contractPath;
  } catch (error) {
    logger.error(`Failed to create contract file: ${error.message}`);
    throw new Error('Failed to create contract file');
  }
}

/**
 * Creates a Foundry project structure in the specified directory
 * @param {string} dirPath - Directory path
 * @returns {Promise<void>}
 */
async function setupFoundryProject(dirPath) {
  try {
    // Create essential directories for a foundry project
    await fs.ensureDir(path.join(dirPath, 'src'));
    await fs.ensureDir(path.join(dirPath, 'lib'));
    await fs.ensureDir(path.join(dirPath, 'out'));
    
    // Create a minimal foundry.toml
    const foundryConfig = `
[profile.default]
src = 'src'
out = 'out'
libs = ['lib']
remappings = []

[rpc_endpoints]
    `;
    
    await fs.writeFile(path.join(dirPath, 'foundry.toml'), foundryConfig);
    logger.debug(`Set up Foundry project structure at: ${dirPath}`);
  } catch (error) {
    logger.error(`Failed to setup Foundry project: ${error.message}`);
    throw new Error('Failed to setup Foundry project');
  }
}

/**
 * Reads compilation output
 * @param {string} outputPath - Path to compilation output
 * @returns {Promise<Object>} Compilation result
 */
async function readCompilationOutput(outputPath) {
  try {
    if (await fs.pathExists(outputPath)) {
      const output = await fs.readJson(outputPath);
      return output;
    }
    throw new Error('Compilation output not found');
  } catch (error) {
    logger.error(`Failed to read compilation output: ${error.message}`);
    throw new Error('Failed to read compilation output');
  }
}

/**
 * Safely removes a directory and its contents
 * @param {string} dirPath - Directory to remove
 * @param {Function} cleanup - Cleanup function from tmp-promise
 * @returns {Promise<void>}
 */
async function cleanupDirectory(dirPath, cleanup) {
  try {
    if (cleanup && typeof cleanup === 'function') {
      cleanup();
      logger.debug(`Cleaned up temporary directory with cleanup function: ${dirPath}`);
    } else if (dirPath && await fs.pathExists(dirPath)) {
      await fs.remove(dirPath);
      logger.debug(`Cleaned up directory manually: ${dirPath}`);
    }
  } catch (error) {
    logger.warn(`Error cleaning up directory ${dirPath}: ${error.message}`);
    // Non-fatal error, just log it
  }
}

module.exports = {
  createTempDirectory,
  createContractFile,
  setupFoundryProject,
  readCompilationOutput,
  cleanupDirectory,
};