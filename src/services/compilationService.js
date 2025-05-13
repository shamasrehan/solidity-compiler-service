/**
 * Compilation Service
 * Orchestrates the smart contract compilation process
 */

const path = require('path');
const os = require('os');
const fs = require('fs-extra');
const logger = require('../utils/logger');
const fileSystem = require('../utils/fileSystem');
const foundryService = require('./foundryService');
const dependencyService = require('./dependencyService');

// Use a default config if the real one doesn't exist yet
let config;
try {
  config = require('../config/config');
} catch (error) {
  config = {
    foundry: {
      defaultSolidityVersion: '0.8.20',
      defaultEvmVersion: 'paris',
      timeout: 60000,
    },
    limits: {
      maxConcurrentCompilations: 10,
    },
    dependencies: {
      preInstalled: true,
      libPath: './lib',
    }
  };
}

// Semaphore to limit concurrent compilations
let activeCompilations = 0;
const compilationQueue = [];

/**
 * Process the next compilation in the queue if available
 */
function processNextCompilation() {
  if (compilationQueue.length > 0 && activeCompilations < config.limits.maxConcurrentCompilations) {
    const { compileFn, resolve, reject } = compilationQueue.shift();
    activeCompilations++;
    
    compileFn()
      .then(result => {
        activeCompilations--;
        resolve(result);
        processNextCompilation();
      })
      .catch(error => {
        activeCompilations--;
        reject(error);
        processNextCompilation();
      });
  }
}

/**
 * Queue a compilation function to run when resources are available
 * @param {Function} compileFn - Async function that performs compilation
 * @returns {Promise<any>} Result of the compilation
 */
function queueCompilation(compileFn) {
  return new Promise((resolve, reject) => {
    compilationQueue.push({ compileFn, resolve, reject });
    processNextCompilation();
  });
}

/**
 * Copy pre-installed libraries to temp directory
 * @param {string} tempDir - Temporary directory path
 * @returns {Promise<void>}
 */
async function copyPreInstalledLibraries(tempDir) {
  try {
    const libPath = path.resolve(process.cwd(), 'lib');
    const tempLibPath = path.join(tempDir, 'lib');
    
    // Check if lib directory exists in project
    if (await fs.pathExists(libPath)) {
      // Create lib directory in temp dir
      await fs.ensureDir(tempLibPath);
      
      // Copy libraries
      await fs.copy(libPath, tempLibPath);
      logger.info(`Copied pre-installed libraries to temporary directory`);
      
      // Copy remappings.txt if it exists
      const remappingsPath = path.resolve(process.cwd(), 'remappings.txt');
      if (await fs.pathExists(remappingsPath)) {
        await fs.copy(remappingsPath, path.join(tempDir, 'remappings.txt'));
        logger.info(`Copied remappings.txt to temporary directory`);
      }
      
      return true;
    } else {
      logger.info('No pre-installed libraries found to copy');
      return false;
    }
  } catch (error) {
    logger.error(`Error copying pre-installed libraries: ${error.message}`);
    return false;
  }
}

/**
 * Compile a smart contract
 * @param {Object} options - Compilation options
 * @returns {Promise<Object>} Compilation result
 */
async function compileContract(options) {
  const {
    contractCode,
    solidityVersion = config.foundry.defaultSolidityVersion,
    evmVersion = config.foundry.defaultEvmVersion,
    optimize = true,
    optimizeRuns = 200,
    contractName = 'Contract',
  } = options;
  
  // Queue the compilation to manage concurrent compilations
  return queueCompilation(async () => {
    logger.info(`Starting compilation of contract (${contractCode.length} chars) with Solidity ${solidityVersion}, EVM ${evmVersion}`);
    
    let tempDir = null;
    let cleanupFn = null;
    
    try {
      // Create a temporary directory for this compilation
      const tempDirResult = await fileSystem.createTempDirectory();
      tempDir = tempDirResult.path;
      cleanupFn = tempDirResult.cleanup;
      
      // Set up Foundry project structure
      await fileSystem.setupFoundryProject(tempDir);
      
      // Copy pre-installed libraries to temp directory
      await copyPreInstalledLibraries(tempDir);
      
      // Create contract file
      const contractPath = await fileSystem.createContractFile(
        path.join(tempDir, 'src'),
        contractCode,
        `${contractName}.sol`
      );
      
      // Pre-install common dependencies if enabled
      if (config.dependencies.preInstalled) {
        await dependencyService.installPreConfiguredDependencies(tempDir);
      }
      
      // Parse imports and install missing dependencies
      await dependencyService.installDependenciesFromImports(tempDir, contractCode);
      
      // Process remappings
      await dependencyService.processRemappings(tempDir);
      
      // Compile the contract
      const compilationResult = await foundryService.compileContract(tempDir, {
        solidityVersion,
        evmVersion,
        optimize,
        optimizeRuns,
      });
      
      // Process the result to extract relevant information
      const processedResult = processCompilationResult(compilationResult, contractName);
      
      logger.info(`Successfully compiled contract: ${contractName}`);
      return processedResult;
    } catch (error) {
      logger.error(`Compilation failed: ${error.message}`, error);
      throw new Error(`Compilation failed: ${error.message}`);
    } finally {
      // Clean up the temporary directory
      if (tempDir && cleanupFn) {
        await fileSystem.cleanupDirectory(tempDir, cleanupFn);
      }
    }
  });
}

/**
 * Process the compilation result to extract relevant information
 * @param {Object} result - Raw compilation result
 * @param {string} contractName - Name of the contract
 * @returns {Object} Processed compilation result
 */
function processCompilationResult(result, contractName) {
  try {
    // Handle format from build-info file
    if (result.output && result.output.contracts) {
      const processedResult = {
        success: true,
        contracts: {},
        sources: {}
      };
      
      // Process contracts
      for (const [sourcePath, contracts] of Object.entries(result.output.contracts)) {
        for (const [cName, contract] of Object.entries(contracts)) {
          const contractKey = `${sourcePath}:${cName}`;
          processedResult.contracts[contractKey] = {
            abi: contract.abi,
            bytecode: contract.evm.bytecode.object,
            deployedBytecode: contract.evm.deployedBytecode.object,
            gasEstimates: contract.evm.gasEstimates,
            methodIdentifiers: contract.evm.methodIdentifiers
          };
        }
      }
      
      // Process sources
      if (result.output.sources) {
        for (const [sourcePath, source] of Object.entries(result.output.sources)) {
          processedResult.sources[sourcePath] = {
            id: source.id,
            ast: source.ast
          };
        }
      }
      
      return processedResult;
    }
    
    // If result is already in a good format, return it
    if (result.success === true) {
      return result;
    }
    
    // Default basic result if we can't parse it properly
    return {
      success: true,
      message: 'Compilation successful, but could not parse detailed results',
      rawOutput: JSON.stringify(result).substring(0, 1000) + '...' // Include truncated raw output for debugging
    };
  } catch (error) {
    logger.error('Error processing compilation result:', error);
    return {
      success: true,
      message: 'Compilation successful, but error processing result',
      error: error.message
    };
  }
}

module.exports = {
  compileContract
};