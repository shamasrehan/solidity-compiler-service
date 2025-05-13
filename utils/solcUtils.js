// utils/solcUtils.js - PART 1
const { execSync } = require('child_process');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const dotenv = require('dotenv');
const crypto = require('crypto');

// Load environment variables
dotenv.config();

// Configuration with defaults
const config = {
  SOLC_CACHE_DIR: process.env.SOLC_CACHE_DIR || path.join(os.tmpdir(), 'solc-cache'),
  SOLC_VERSION_CACHE_TIME_MS: parseInt(process.env.SOLC_VERSION_CACHE_TIME_MS) || 86400000, // 24 hours
  DEFAULT_COMPILER_VERSION: process.env.DEFAULT_COMPILER_VERSION || '0.8.19',
  MAX_COMPILATION_TIME_MS: parseInt(process.env.MAX_COMPILATION_TIME_MS) || 30000, // 30 seconds
  CLEANUP_TEMP_FILES: process.env.CLEANUP_TEMP_FILES !== 'false', // Default to true
  DOCKER_TIMEOUT_MS: parseInt(process.env.DOCKER_TIMEOUT_MS) || 60000, // 60 seconds
  SOLC_SELECT_TIMEOUT_MS: parseInt(process.env.SOLC_SELECT_TIMEOUT_MS) || 30000, // 30 seconds
};

// Ensure cache directory exists
fs.ensureDirSync(config.SOLC_CACHE_DIR);

// Cache for installed versions to avoid repeated checks
const installedVersionsCache = new Map();

// Track created resources that need cleanup
const createdResources = new Set();

// Add EVM version mapping
const EVM_VERSION_MAP = {
  '0.8.0': 'berlin',
  '0.8.1': 'berlin',
  '0.8.2': 'berlin',
  '0.8.3': 'berlin',
  '0.8.4': 'berlin',
  '0.8.5': 'berlin',
  '0.8.6': 'berlin',
  '0.8.7': 'berlin',
  '0.8.8': 'berlin',
  '0.8.9': 'berlin',
  '0.8.10': 'berlin',
  '0.8.11': 'berlin',
  '0.8.12': 'berlin',
  '0.8.13': 'berlin',
  '0.8.14': 'berlin',
  '0.8.15': 'berlin',
  '0.8.16': 'berlin',
  '0.8.17': 'london',
  '0.8.18': 'london',
  '0.8.19': 'london',
  '0.8.20': 'paris',
  '0.8.21': 'paris',
  '0.8.22': 'paris',
  '0.8.23': 'paris',
  '0.8.24': 'paris',
  '0.8.25': 'paris',
  '0.9.0': 'paris',
  '0.9.1': 'paris',
  '0.9.2': 'paris',
  '0.9.3': 'paris',
  '0.9.4': 'paris',
  '0.9.5': 'paris',
  '0.9.6': 'paris',
  '0.9.7': 'paris',
  '0.9.8': 'paris',
  '0.9.9': 'paris',
  '0.9.10': 'paris',
  '0.9.11': 'paris',
  '0.9.12': 'paris',
  '0.9.13': 'paris',
  '0.9.14': 'paris',
  '0.9.15': 'paris',
  '0.9.16': 'paris',
  '0.9.17': 'paris',
  '0.9.18': 'paris',
  '0.9.19': 'paris',
  '0.9.20': 'paris',
  '0.9.21': 'paris',
  '0.9.22': 'paris',
  '0.9.23': 'paris',
  '0.9.24': 'paris',
  '0.9.25': 'paris'
};

/**
 * Install a specific Solidity compiler version
 * @param {string} version - Solidity version to install
 * @returns {Promise<boolean>} Whether installation was successful
 */
async function installSolidityVersion(version) {
  try {
    // Validate version format
    if (!version.match(/^\d+\.\d+\.\d+$/)) {
      console.warn(`Invalid Solidity version format: ${version}`);
      return false;
    }
    
    console.log(`Checking and installing Solidity compiler version: ${version}`);
    
    // Check cache first
    const cacheKey = `version-${version}`;
    if (installedVersionsCache.has(cacheKey)) {
      const cachedInfo = installedVersionsCache.get(cacheKey);
      
      // If cache is still valid, return the cached result
      if (Date.now() < cachedInfo.expiresAt) {
        console.log(`Using cached version info for ${version}`);
        return cachedInfo.installed;
      }
      
      // Cache expired, remove it
      installedVersionsCache.delete(cacheKey);
    }
    
    // Track installation attempt
    let installed = false;
    let method = '';
    
    // Check if solc-select is installed and working
    try {
      const solcVersionsOutput = execSync('solc-select versions', { encoding: 'utf8' });
      // Parse installed versions, considering output might include "(current)" marker
      const installedVersions = solcVersionsOutput.split('\n')
        .map(v => v.trim())
        .filter(Boolean)
        .map(v => v.split(' ')[0]); // Take just the version part
      
      // If the version is not installed, install it
      if (!installedVersions.includes(version)) {
        console.log(`Installing Solidity compiler version ${version}`);
        execSync(`solc-select install ${version}`, { 
          stdio: 'pipe',
          timeout: config.SOLC_SELECT_TIMEOUT_MS
        });
      }
      
      // Set the version as active
      execSync(`solc-select use ${version}`, { stdio: 'pipe' });
      console.log(`Solidity version ${version} set as default`);
      installed = true;
      method = 'solc-select';
    } catch (solcSelectError) {
      console.warn('solc-select failed:', solcSelectError.message);
      // Try other methods...
    }
    
    // Update cache with the installation result
    installedVersionsCache.set(cacheKey, {
      installed,
      method,
      expiresAt: Date.now() + config.SOLC_VERSION_CACHE_TIME_MS
    });
    
    return installed;
  } catch (error) {
    console.error(`Failed to install Solidity version ${version}:`, error.message);
    return false;
  }
}

/**
 * Extract the contract name from Solidity code
 * @param {string} code - Solidity code
 * @returns {string} Contract name
 */
function extractContractName(code) {
  try {
    // First look for the main contract (usually has the same name as the file)
    // Remove comments to avoid false positives in commented code
    const codeWithoutComments = code.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
    
    // Search for contract declarations
    const contractMatches = [...codeWithoutComments.matchAll(/contract\s+(\w+)(?:\s+is\s+|\s*\{)/g)];
    
    if (contractMatches.length === 0) {
      return 'Contract'; // Default fallback
    }
    
    // If there are multiple contracts, try to find the "main" one
    // Usually it's the one that:
    // 1. Has the most code
    // 2. Inherits from other contracts
    // 3. Is declared last
    
    // Check for contract that inherits from others (often the main contract)
    const inheritingContracts = contractMatches.filter(match => 
      match[0].includes(' is ')
    );
    
    if (inheritingContracts.length === 1) {
      return inheritingContracts[0][1];
    }
    
    // If we have multiple inheriting contracts or none, return the last contract
    return contractMatches[contractMatches.length - 1][1];
  } catch (error) {
    console.error('Error extracting contract name:', error.message);
    return 'Contract'; // Default fallback
  }
}

/**
 * Extract the Solidity version from pragma statement
 * @param {string} code - Solidity code
 * @returns {string|null} Solidity version or null if not found
 */
function extractSolidityVersion(code) {
  try {
    // Handle different pragma formats
    const versionMatch = code.match(/pragma\s+solidity\s+(\^|>=|<=|>|<|~)?\s*(\d+\.\d+\.\d+)/);
    
    if (versionMatch && versionMatch[2]) {
      return versionMatch[2]; // Return the captured version number
    }
    
    // Try with X.Y format (without patch version)
    const shortVersionMatch = code.match(/pragma\s+solidity\s+(\^|>=|<=|>|<|~)?\s*(\d+\.\d+)(?:\s|;)/);
    
    if (shortVersionMatch && shortVersionMatch[2]) {
      return `${shortVersionMatch[2]}.0`; // Add .0 as patch version
    }
    
    // If no version found, use default
    console.warn('No Solidity version found in code, using default:', config.DEFAULT_COMPILER_VERSION);
    return config.DEFAULT_COMPILER_VERSION;
  } catch (error) {
    console.error('Error extracting Solidity version:', error.message);
    return config.DEFAULT_COMPILER_VERSION; // Default fallback
  }
}

/**
 * Get the appropriate EVM version for a given Solidity version
 * @param {string} solidityVersion - Solidity compiler version
 * @returns {string} Appropriate EVM version
 */
function getEVMVersionForSolidity(solidityVersion) {
  // If version is provided in settings, use it
  if (solidityVersion) {
    // Check if we have a specific mapping for this version
    if (EVM_VERSION_MAP[solidityVersion]) {
      return EVM_VERSION_MAP[solidityVersion];
    }
    
    // For versions not in our map, use a default based on major.minor
    const [major, minor] = solidityVersion.split('.');
    const versionKey = `${major}.${minor}`;
    
    // Use appropriate EVM version based on version range
    if (parseFloat(versionKey) >= 0.9) {
      return 'paris';
    } else if (parseFloat(versionKey) >= 0.8) {
      return 'london';
    } else {
      return 'berlin';
    }
  }
  
  // Default to london if no version specified
  return 'london';
}

// utils/solcUtils.js - PART 2

/**
 * Try to run solc with Docker
 * @param {string} inputFile - Path to the input JSON file
 * @param {string} version - Solidity compiler version
 * @param {number} timeout - Timeout in milliseconds
 * @returns {string} solc output
 */
function runSolcWithDocker(inputFile, version, timeout = config.DOCKER_TIMEOUT_MS) {
  try {
    const inputDir = path.dirname(inputFile);
    const inputFileName = path.basename(inputFile);
    
    // Use either v{version} or just {version} format
    let dockerTag = version;
    let dockerCommand = '';
    let output = '';
    
    // Try without v prefix first
    try {
      execSync(`docker image inspect ethereum/solc:${version}`, { stdio: 'pipe' });
      dockerCommand = `docker run --rm -v "${inputDir}:/sources" ethereum/solc:${version} --standard-json /sources/${inputFileName}`;
    } catch (error) {
      // If that fails, try with v prefix
      dockerTag = `v${version}`;
      try {
        execSync(`docker image inspect ethereum/solc:${dockerTag}`, { stdio: 'pipe' });
        dockerCommand = `docker run --rm -v "${inputDir}:/sources" ethereum/solc:${dockerTag} --standard-json /sources/${inputFileName}`;
      } catch (vPrefixError) {
        throw new Error(`Docker image not found for version ${version} with or without v prefix`);
      }
    }
    
    // Run solc in Docker
    try {
      output = execSync(dockerCommand, {
        encoding: 'utf8',
        timeout: timeout
      });
    } catch (execError) {
      throw new Error(`Docker execution failed: ${execError.message}`);
    }
    
    return output;
  } catch (error) {
    console.error('Failed to run solc with Docker:', error.message);
    throw error;
  }
}

/**
 * Compile Solidity with solc directly
 * @param {string} source - Solidity source code
 * @param {string} contractName - Name of the contract
 * @param {string} compilerVersion - Solidity compiler version
 * @param {Object} settings - Compiler settings
 * @returns {Object} Object with bytecode and ABI
 */
function compileSolidityWithSolc(source, contractName, compilerVersion, settings = {}, tempDir) {
  const createdPaths = []; // Track created files and directories for cleanup
  
  try {
    console.log(`Compiling ${contractName} with solc directly (version ${compilerVersion})`);
    
    // First check if we have a cached result
    const cacheResult = getCachedCompilationResult(source, compilerVersion, settings);
    if (cacheResult) {
      console.log('Using cached compilation result');
      return cacheResult;
    }
    
    // Create a temporary directory if not provided
    if (!tempDir) {
      tempDir = path.join(os.tmpdir(), `solc-compile-${crypto.randomBytes(8).toString('hex')}`);
      fs.ensureDirSync(tempDir);
      createdPaths.push(tempDir);
      createdResources.add(tempDir);
    }
    
    // Create a temporary file for the contract
    const contractFile = path.join(tempDir, `${contractName}.sol`);
    fs.writeFileSync(contractFile, source);
    createdPaths.push(contractFile);
    createdResources.add(contractFile);
    
    // Get appropriate EVM version
    const evmVersion = settings.evmVersion || getEVMVersionForSolidity(compilerVersion);
    
    // Read remappings from project root
    let remappings = [];
    const projectRemappingsPath = path.join(__dirname, '..', 'remappings.txt');
    if (fs.existsSync(projectRemappingsPath)) {
      remappings = fs.readFileSync(projectRemappingsPath, 'utf8').split('\n').filter(Boolean);
    }
    
    // Add base path and allow paths
    const libPath = path.join(__dirname, '..', 'lib');
    const basePathArg = `--base-path ${libPath}`;
    const allowPathsArg = `--allow-paths ${libPath}`;
    
    // Construct the command with proper flags
    const command = `solc ${contractFile} --abi --bin --optimize ${basePathArg} ${allowPathsArg}`;
    console.log('Executing command:', command);
    
    const output = execSync(command, {
      encoding: 'utf8',
      timeout: config.MAX_COMPILATION_TIME_MS
    });
    
    // Parse the output
    const result = parseSolcOutput(output, contractName);
    
    // Cache the result
    cacheCompilationResult(source, compilerVersion, settings, result);
    
    // Clean up created files and directories
    if (config.CLEANUP_TEMP_FILES) {
      cleanupCreatedFiles(createdPaths);
    }
    
    return result;
  } catch (error) {
    // Clean up created files and directories
    if (config.CLEANUP_TEMP_FILES) {
      cleanupCreatedFiles(createdPaths);
    }
    throw new Error(`Compilation errors: ${error.message}`);
  }
}

/**
 * Compile Solidity with standard input format
 * @param {string} source - Solidity source code
 * @param {string} contractName - Name of the contract to compile
 * @param {string} compilerVersion - Solidity compiler version
 * @param {Object} settings - Compiler settings
 * @returns {Object} Object with bytecode and ABI
 */
function compileSolidityWithStandardInput(source, contractName, compilerVersion, settings = {}, tempDir) {
  const createdPaths = []; // Track created files and directories for cleanup
  
  try {
    console.log(`Compiling ${contractName} with standard input (version ${compilerVersion})`);
    
    // First check if we have a cached result
    const cacheResult = getCachedCompilationResult(source, compilerVersion, settings);
    if (cacheResult) {
      console.log('Using cached compilation result');
      return cacheResult;
    }
    
    // Create a temporary directory if not provided
    if (!tempDir) {
      tempDir = path.join(os.tmpdir(), `solc-compile-${crypto.randomBytes(8).toString('hex')}`);
      fs.ensureDirSync(tempDir);
      createdPaths.push(tempDir);
      createdResources.add(tempDir);
    }
    
    // Create a temporary file for the contract
    const contractFile = path.join(tempDir, `${contractName}.sol`);
    fs.writeFileSync(contractFile, source);
    createdPaths.push(contractFile);
    createdResources.add(contractFile);
    
    // Get appropriate EVM version
    const evmVersion = settings.evmVersion || getEVMVersionForSolidity(compilerVersion);
    
    // Read remappings from project root
    let remappings = [];
    const projectRemappingsPath = path.join(__dirname, '..', 'remappings.txt');
    if (fs.existsSync(projectRemappingsPath)) {
      remappings = fs.readFileSync(projectRemappingsPath, 'utf8').split('\n').filter(Boolean);
    }
    
    // Use standard-json format
    const inputJson = {
      language: "Solidity",
      sources: {
        [`${contractName}.sol`]: {
          content: source
        }
      },
      settings: {
        optimizer: {
          enabled: settings.optimizer?.enabled || false,
          runs: settings.optimizer?.runs || 200
        },
        evmVersion: evmVersion,
        outputSelection: {
          "*": {
            "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object", "metadata"]
          }
        },
        remappings: remappings
      }
    };
    
    // Write input to a temp file
    const inputFile = path.join(tempDir, 'input.json');
    fs.writeFileSync(inputFile, JSON.stringify(inputJson));
    createdPaths.push(inputFile);
    createdResources.add(inputFile);
    
    let output;
    
    // Try to compile with Docker first
    try {
      console.log(`Trying compilation with Docker using solc ${compilerVersion}...`);
      output = runSolcWithDocker(inputFile, compilerVersion);
    } catch (dockerError) {
      console.warn('Docker compilation failed, falling back to solc-select:', dockerError.message);
      
      // Try with solc-select
      try {
        // Make sure the solc version is set
        if (compilerVersion) {
          execSync(`solc-select use ${compilerVersion}`, { stdio: 'pipe' });
        }
        
        // Add base path and allow paths
        const libPath = path.join(__dirname, '..', 'lib');
        const basePathArg = `--base-path ${libPath}`;
        const allowPathsArg = `--allow-paths ${libPath}`;
        
        // Construct the command with proper flags
        const command = `solc --standard-json ${inputFile} ${basePathArg} ${allowPathsArg}`;
        console.log('Executing command:', command);
        
        output = execSync(command, {
          encoding: 'utf8',
          timeout: config.MAX_COMPILATION_TIME_MS
        });
      } catch (solcSelectError) {
        console.error('solc-select compilation failed:', solcSelectError.message);
        // Clean up before throwing
        if (config.CLEANUP_TEMP_FILES) {
          cleanupCreatedFiles(createdPaths);
        }
        throw new Error(`Compilation with solc-select failed: ${solcSelectError.message}`);
      }
    }
    
    // Parse the output
    const compiledOutput = JSON.parse(output);
    
    // Check for errors
    if (compiledOutput.errors && compiledOutput.errors.some(e => e.severity === 'error')) {
      const errors = compiledOutput.errors
        .filter(e => e.severity === 'error')
        .map(e => e.formattedMessage || e.message)
        .join('\n');
      
      // Clean up before throwing
      if (config.CLEANUP_TEMP_FILES) {
        cleanupCreatedFiles(createdPaths);
      }
      throw new Error(`Compilation errors: ${errors}`);
    }
    
    // Find the contract in the output
    if (!compiledOutput.contracts || 
        !compiledOutput.contracts[`${contractName}.sol`] || 
        !compiledOutput.contracts[`${contractName}.sol`][contractName]) {
      
      // Clean up before throwing
      if (config.CLEANUP_TEMP_FILES) {
        cleanupCreatedFiles(createdPaths);
      }
      throw new Error(`Contract ${contractName} not found in compilation output`);
    }
    
    const contract = compiledOutput.contracts[`${contractName}.sol`][contractName];
    
    // Save successful compilation result
    const result = {
      bytecode: contract.evm.bytecode.object,
      deployedBytecode: contract.evm.deployedBytecode.object,
      abi: contract.abi,
      metadata: contract.metadata
    };
    
    // Cache the compilation result
    cacheCompilationResult(source, compilerVersion, settings, result);
    
    // Clean up temporary files and directories if configured to do so
    if (config.CLEANUP_TEMP_FILES) {
      cleanupCreatedFiles(createdPaths);
    }
    
    return result;
  } catch (error) {
    // Clean up files if an error occurs
    if (config.CLEANUP_TEMP_FILES) {
      cleanupCreatedFiles(createdPaths);
    }
    console.error('Failed to compile with standard input:', error.message);
    throw error;
  }
}

/**
 * Try different compilation methods and return the first successful result
 * @param {string} source - Solidity source code
 * @param {string} contractName - Name of the contract
 * @param {string} compilerVersion - Solidity compiler version
 * @param {Object} settings - Compiler settings
 * @returns {Promise<Object>} Compilation result with bytecode and ABI
 */
async function compileWithFallbackMethod(source, contractName, compilerVersion, settings = {}, tempDir) {
  const methods = [
    {
      name: 'standard-input',
      fn: () => compileSolidityWithStandardInput(source, contractName, compilerVersion, settings, tempDir)
    },
    {
      name: 'direct',
      fn: () => compileSolidityWithSolc(source, contractName, compilerVersion, settings, tempDir)
    },
    {
      name: 'temp-file',
      fn: () => compileSolidityWithTempFile(source, contractName, compilerVersion, settings, tempDir)
    },
    {
      name: 'docker-direct',
      fn: () => compileSolidityWithDockerDirect(source, contractName, compilerVersion, settings, tempDir)
    }
  ];

  const errors = [];
  const compilationSettings = {
    ...settings,
    evmVersion: settings.evmVersion || getEVMVersionForSolidity(compilerVersion)
  };

  // Ensure lib directory exists
  const libDir = path.join(__dirname, '..', 'lib');
  if (!fs.existsSync(libDir)) {
    fs.ensureDirSync(libDir);
  }

  // Ensure temp directory exists
  if (!tempDir) {
    tempDir = path.join(os.tmpdir(), `solc-compile-${crypto.randomBytes(8).toString('hex')}`);
  }
  fs.ensureDirSync(tempDir);

  // Copy remappings.txt to temp directory if it exists
  const projectRemappingsPath = path.join(__dirname, '..', 'remappings.txt');
  if (fs.existsSync(projectRemappingsPath)) {
    fs.copyFileSync(projectRemappingsPath, path.join(tempDir, 'remappings.txt'));
  }

  // Try each method in sequence
  for (const method of methods) {
    try {
      console.log(`Trying compilation method: ${method.name}`);
      const result = await method.fn();
      
      // Cache the successful result
      cacheCompilationResult(source, compilerVersion, compilationSettings, result);
      
      return result;
    } catch (error) {
      console.error(`Method ${method.name} failed:`, error.message);
      errors.push({
        method: method.name,
        error: error.message
      });
    }
  }

  // If we get here, all methods failed
  throw new Error(`Compilation failed: All compilation methods failed: ${JSON.stringify(errors)}`);
}

/**
 * Cache compilation result
 * @param {string} source - Source code
 * @param {string} compilerVersion - Compiler version
 * @param {Object} settings - Compiler settings
 * @param {Object} result - Compilation result
 */
function cacheCompilationResult(source, compilerVersion, settings, result) {
  try {
    // Create a cache key based on source, version, and settings
    const cacheKey = generateCacheKey(source, compilerVersion, settings);
    
    // Ensure the cache directory exists
    const versionCacheDir = path.join(config.SOLC_CACHE_DIR, compilerVersion.replace(/\./g, '_'));
    fs.ensureDirSync(versionCacheDir);
    
    // Save the compilation result to the cache
    const cacheFile = path.join(versionCacheDir, `${cacheKey}.json`);
    fs.writeJsonSync(cacheFile, {
      timestamp: Date.now(),
      source: source,
      compilerVersion: compilerVersion,
      settings: settings,
      result: result
    });
    
    console.log(`Cached compilation result to ${cacheFile}`);
    return true;
  } catch (error) {
    console.warn('Failed to cache compilation result:', error.message);
    return false;
  }
}

/**
 * Get cached compilation result
 * @param {string} source - Source code
 * @param {string} compilerVersion - Compiler version
 * @param {Object} settings - Compiler settings
 * @returns {Object|null} Cached compilation result or null if not found
 */
function getCachedCompilationResult(source, compilerVersion, settings) {
  try {
    // Create a cache key based on source, version, and settings
    const cacheKey = generateCacheKey(source, compilerVersion, settings);
    
    // Check if the cache file exists
    const versionCacheDir = path.join(config.SOLC_CACHE_DIR, compilerVersion.replace(/\./g, '_'));
    const cacheFile = path.join(versionCacheDir, `${cacheKey}.json`);
    
    if (!fs.existsSync(cacheFile)) {
      return null;
    }
    
    // Read the cache file
    const cacheData = fs.readJsonSync(cacheFile);
    
    // Check if the cache is still valid
    const now = Date.now();
    if (now - cacheData.timestamp > config.SOLC_VERSION_CACHE_TIME_MS) {
      console.log('Cache expired, will recompile');
      return null;
    }
    
    console.log(`Using cached compilation result from ${cacheFile}`);
    return cacheData.result;
  } catch (error) {
    console.warn('Failed to get cached compilation result:', error.message);
    return null;
  }
}

/**
 * Generate cache key based on source, version, and settings
 * @param {string} source - Source code
 * @param {string} version - Compiler version
 * @param {Object} settings - Compiler settings
 * @returns {string} Cache key
 */
function generateCacheKey(source, version, settings) {
  const settingsJson = JSON.stringify(settings || {});
  return crypto.createHash('sha256')
    .update(`${source}|${version}|${settingsJson}`)
    .digest('hex');
}

/**
 * Clean up created files and directories
 * @param {string[]} paths - Paths to clean up
 */
function cleanupCreatedFiles(paths) {
  for (const pathToClean of paths) {
    try {
      if (fs.existsSync(pathToClean)) {
        const stats = fs.statSync(pathToClean);
        if (stats.isDirectory()) {
          fs.removeSync(pathToClean);
          console.log(`Removed directory: ${pathToClean}`);
        } else {
          fs.unlinkSync(pathToClean);
          console.log(`Removed file: ${pathToClean}`);
        }
        // Remove from the set of tracked resources
        createdResources.delete(pathToClean);
      }
    } catch (error) {
      console.warn(`Failed to clean up ${pathToClean}:`, error.message);
    }
  }
}

/**
 * Register a resource for cleanup
 * @param {string} resourcePath - Path to the resource
 */
function trackResource(resourcePath) {
  createdResources.add(resourcePath);
  console.log(`Tracking resource for cleanup: ${resourcePath}`);
}

/**
 * Cleanup all tracked resources
 */
function cleanupAllResources() {
  console.log(`Cleaning up ${createdResources.size} tracked resources...`);
  cleanupCreatedFiles([...createdResources]);
  console.log('Resource cleanup complete');
}

// Register cleanup handler for process exit
process.on('exit', () => {
  if (config.CLEANUP_TEMP_FILES) {
    cleanupAllResources();
  }
});

// Register cleanup for graceful shutdown
process.on('SIGTERM', () => {
  if (config.CLEANUP_TEMP_FILES) {
    cleanupAllResources();
  }
  process.exit(0);
});

process.on('SIGINT', () => {
  if (config.CLEANUP_TEMP_FILES) {
    cleanupAllResources();
  }
  process.exit(0);
});

// Custom error class for compilation errors
class CompilationError extends Error {
  constructor(message, type, details = {}) {
    super(message);
    this.name = 'CompilationError';
    this.type = type;
    this.details = details;
    this.timestamp = Date.now();
  }

  toJSON() {
    return {
      error: this.message,
      type: this.type,
      details: this.details,
      timestamp: this.timestamp
    };
  }
}

// Error types
const ErrorTypes = {
  SYNTAX_ERROR: 'SyntaxError',
  VERSION_ERROR: 'VersionError',
  TIMEOUT_ERROR: 'TimeoutError',
  DEPENDENCY_ERROR: 'DependencyError',
  DOCKER_ERROR: 'DockerError',
  RESOURCE_ERROR: 'ResourceError',
  INTERNAL_ERROR: 'InternalError',
  VALIDATION_ERROR: 'ValidationError',
  FILE_NOT_FOUND: 'FileNotFoundError',
  UNKNOWN_ERROR: 'UnknownError'
};

/**
 * Create a standardized error object for compilation errors
 * @param {string} message - Error message
 * @param {string} type - Error type from ErrorTypes
 * @param {Object} details - Additional error details
 * @returns {CompilationError} Standardized error object
 */
function createCompilationError(message, type = ErrorTypes.UNKNOWN_ERROR, details = {}) {
  return new CompilationError(message, type, details);
}

/**
 * Parse solc error messages and create a standardized error
 * @param {string} errorOutput - Error output from solc
 * @returns {CompilationError} Standardized error object
 */
function parseSolcError(errorOutput) {
  let errorType = ErrorTypes.UNKNOWN_ERROR;
  let errorDetails = {};
  
  // Parse error type based on content
  if (errorOutput.includes('ParserError') || errorOutput.includes('SyntaxError')) {
    errorType = ErrorTypes.SYNTAX_ERROR;
  } else if (errorOutput.includes('Source file requires different compiler version')) {
    errorType = ErrorTypes.VERSION_ERROR;
  } else if (errorOutput.includes('timed out') || errorOutput.includes('timeout')) {
    errorType = ErrorTypes.TIMEOUT_ERROR;
  } else if (errorOutput.includes('not found') || errorOutput.includes('does not exist')) {
    errorType = ErrorTypes.FILE_NOT_FOUND;
  } else if (errorOutput.includes('docker')) {
    errorType = ErrorTypes.DOCKER_ERROR;
  }
  
  // Extract line and column information if available
  const locationMatch = errorOutput.match(/line\s+(\d+)[^\d]+(\d+)/i);
  if (locationMatch) {
    errorDetails.line = parseInt(locationMatch[1]);
    errorDetails.column = parseInt(locationMatch[2]);
  }
  
  // Extract file information if available
  const fileMatch = errorOutput.match(/file\s+"([^"]+)"/i);
  if (fileMatch) {
    errorDetails.file = fileMatch[1];
  }
  
  return createCompilationError(errorOutput, errorType, errorDetails);
}

/**
 * Log error details with consistent format
 * @param {Error} error - Error object
 * @param {string} context - Context where error occurred
 */
function logErrorDetails(error, context) {
  console.error(`[ERROR][${context}][${error.type || 'Unknown'}] ${error.message}`);
  
  if (error.details && Object.keys(error.details).length > 0) {
    console.error('Error details:', JSON.stringify(error.details, null, 2));
  }
  
  if (error.stack && process.env.NODE_ENV === 'development') {
    console.error('Stack trace:', error.stack);
  }
}

/**
 * Safe execution of compiler commands with proper error handling
 * @param {Function} commandFn - Function that executes compiler command
 * @param {string} errorContext - Context for error logging
 * @param {Function} cleanup - Cleanup function to run on error
 * @returns {Promise<any>} Result of the command
 */
async function safeExecuteCommand(commandFn, errorContext, cleanup = null) {
  try {
    return await commandFn();
  } catch (error) {
    // Transform error into standardized format if not already
    const compilationError = error instanceof CompilationError 
      ? error 
      : parseSolcError(error.message || String(error));
    
    // Log error details
    logErrorDetails(compilationError, errorContext);
    
    // Run cleanup if provided
    if (cleanup && typeof cleanup === 'function') {
      try {
        await cleanup();
      } catch (cleanupError) {
        console.warn(`Cleanup failed after error in ${errorContext}:`, cleanupError.message);
      }
    }
    
    throw compilationError;
  }
}

module.exports = {
  installSolidityVersion,
  extractContractName,
  extractSolidityVersion,
  compileSolidityWithSolc,
  compileSolidityWithStandardInput,
  compileWithFallbackMethod,
  runSolcWithDocker,
  cleanupCreatedFiles,
  trackResource,
  cleanupAllResources,
  generateCacheKey,
  getCachedCompilationResult,
  cacheCompilationResult,
  config,


  CompilationError,
  ErrorTypes,
  createCompilationError,
  parseSolcError,
  logErrorDetails,
  safeExecuteCommand,
  getEVMVersionForSolidity,
  EVM_VERSION_MAP
};