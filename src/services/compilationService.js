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
 * @returns {Promise<boolean>} True if libraries were successfully copied
 */
async function copyPreInstalledLibraries(tempDir) {
  try {
    // First, check if the lib directory exists in the project root
    const rootLibPath = path.resolve(process.cwd(), 'lib');
    const tempLibPath = path.join(tempDir, 'lib');
    
    logger.info(`Checking for libraries in: ${rootLibPath}`);
    
    if (await fs.pathExists(rootLibPath)) {
      // Log what's in the lib directory
      const libContents = await fs.readdir(rootLibPath);
      logger.info(`Found ${libContents.length} items in lib directory: ${libContents.join(', ')}`);
      
      // Specifically check for openzeppelin-contracts
      const hasOpenZeppelin = libContents.some(item => 
        item === 'openzeppelin-contracts' || 
        item.startsWith('openzeppelin-contracts-')
      );
      
      if (hasOpenZeppelin) {
        logger.info(`OpenZeppelin contracts found in lib directory`);
      } else {
        logger.warn(`OpenZeppelin contracts NOT found in lib directory`);
      }
      
      // Create lib directory in temp dir
      await fs.ensureDir(tempLibPath);
      
      // Copy libraries with detailed logging
      logger.info(`Copying libraries from ${rootLibPath} to ${tempLibPath}`);
      await fs.copy(rootLibPath, tempLibPath);
      
      // Verify the copy worked by checking the temp lib directory
      if (await fs.pathExists(tempLibPath)) {
        const tempLibContents = await fs.readdir(tempLibPath);
        logger.info(`After copy: ${tempLibContents.length} items in temp lib directory: ${tempLibContents.join(', ')}`);
        
        // Double-check OpenZeppelin contracts
        const hasOpenZeppelinInTemp = tempLibContents.some(item => 
          item === 'openzeppelin-contracts' || 
          item.startsWith('openzeppelin-contracts-')
        );
        
        if (hasOpenZeppelinInTemp) {
          logger.info(`✅ OpenZeppelin contracts successfully copied to temp directory`);
        } else {
          logger.warn(`❌ OpenZeppelin contracts NOT found in temp directory after copy`);
        }
      }
      
      // Copy remappings.txt if it exists
      const remappingsPath = path.resolve(process.cwd(), 'remappings.txt');
      if (await fs.pathExists(remappingsPath)) {
        logger.info(`Copying remappings.txt from ${remappingsPath}`);
        const remappingsContent = await fs.readFile(remappingsPath, 'utf8');
        logger.info(`Remappings content: ${remappingsContent}`);
        
        await fs.copy(remappingsPath, path.join(tempDir, 'remappings.txt'));
        logger.info(`✅ Copied remappings.txt to temporary directory`);
        
        // Verify remappings were copied correctly
        const tempRemappingsPath = path.join(tempDir, 'remappings.txt');
        if (await fs.pathExists(tempRemappingsPath)) {
          const tempRemappingsContent = await fs.readFile(tempRemappingsPath, 'utf8');
          logger.info(`Temp remappings content: ${tempRemappingsContent}`);
        }
      } else {
        logger.warn(`remappings.txt not found at ${remappingsPath}`);
      }
      
      return true;
    } else {
      logger.warn(`No lib directory found at ${rootLibPath}`);
      return false;
    }
  } catch (error) {
    logger.error(`Error copying pre-installed libraries: ${error.message}`, error);
    return false;
  }
}

/**
 * Diagnose dependency issues
 * @param {string} tempDir - Temporary directory path
 * @param {string} contractCode - Contract source code
 * @returns {Promise<Object>} Diagnosis results
 */
async function diagnoseDependencies(tempDir, contractCode) {
  const results = {
    imports: [],
    librariesFound: [],
    structureValid: false,
    remappingsValid: false,
    remappings: [],
    foundryTomlValid: false,
    issues: []
  };
  
  try {
    // 1. Extract imports from contract
    results.imports = foundryService.extractImports(contractCode);
    logger.info(`Contract imports: ${results.imports.join(', ')}`);
    
    // 2. Check if lib directory exists and what's in it
    const libPath = path.join(tempDir, 'lib');
    if (await fs.pathExists(libPath)) {
      results.librariesFound = await fs.readdir(libPath);
      logger.info(`Libraries found: ${results.librariesFound.join(', ')}`);
    } else {
      results.issues.push('Lib directory not found');
    }
    
    // 3. Verify library structure
    const structureResult = await dependencyService.verifyLibraryStructure(libPath);
    results.structureValid = structureResult.isValid;
    results.issues.push(...structureResult.issues);
    
    // 4. Check remappings.txt
    const remappingsPath = path.join(tempDir, 'remappings.txt');
    if (await fs.pathExists(remappingsPath)) {
      const remappingsContent = await fs.readFile(remappingsPath, 'utf8');
      results.remappings = remappingsContent.split('\n').filter(line => line.trim() !== '');
      logger.info(`Remappings found: ${results.remappings.join(', ')}`);
      
      // Check if OpenZeppelin remappings exist
      results.remappingsValid = results.remappings.some(r => 
        r.includes('@openzeppelin/contracts/') || 
        r.includes('@openzeppelin/=')
      );
      
      if (!results.remappingsValid) {
        results.issues.push('No OpenZeppelin remappings found');
      }
    } else {
      results.issues.push('remappings.txt not found');
    }
    
    // 5. Check foundry.toml
    const foundryTomlPath = path.join(tempDir, 'foundry.toml');
    if (await fs.pathExists(foundryTomlPath)) {
      const foundryContent = await fs.readFile(foundryTomlPath, 'utf8');
      results.foundryTomlValid = foundryContent.includes('@openzeppelin/contracts/');
      
      if (!results.foundryTomlValid) {
        results.issues.push('No OpenZeppelin remappings in foundry.toml');
      }
    } else {
      results.issues.push('foundry.toml not found');
    }
    
    return results;
  } catch (error) {
    logger.error(`Error in dependency diagnosis: ${error.message}`);
    results.issues.push(`Diagnosis error: ${error.message}`);
    return results;
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
      
      // Create contract file
      const contractPath = await fileSystem.createContractFile(
        path.join(tempDir, 'src'),
        contractCode,
        `${contractName}.sol`
      );
      
      // Check if contract uses OpenZeppelin
      const usesOpenZeppelin = contractCode.includes('@openzeppelin/contracts/');
      
      if (usesOpenZeppelin) {
        logger.info('Contract uses OpenZeppelin. Setting up dependencies...');
        
        // First try to copy pre-installed libraries
        const librariesCopied = await copyPreInstalledLibraries(tempDir);
        
        if (!librariesCopied) {
          logger.info('Pre-installed libraries not copied. Installing directly...');
          
          // Try direct installation as fallback
          await dependencyService.installMinimalOpenZeppelinDependencies(tempDir);
        }
        
        // Process remappings
        await dependencyService.processRemappings(tempDir);
        
        // Run diagnosis to verify setup
        const diagnosisResult = await diagnoseDependencies(tempDir, contractCode);
        logger.info('Dependency diagnosis after setup:', diagnosisResult);
        
        if (diagnosisResult.issues.length > 0) {
          logger.warn(`Still have ${diagnosisResult.issues.length} dependency issues after setup.`);
        }
      }
      
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