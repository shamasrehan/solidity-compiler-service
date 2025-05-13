const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');
const crypto = require('crypto');
const config = require('../config');

// Get paths from parent module
const TEMP_DIR = path.join(__dirname, '../temp');
const ARTIFACTS_DIR = path.join(__dirname, '../artifacts');

// Import utilities
const { 
  extractContractName, 
  extractSolidityVersion, 
  installSolidityVersion,
  compileSolidityWithSolc,
  compileSolidityWithStandardInput,
  compileWithFallbackMethod,
  ErrorTypes,
  createCompilationError,
  parseSolcError
} = require('../utils/solcUtils');
const { 
  extractDependenciesFromCode, 
  installDependencies,
  handleOpenZeppelinManually,
  handleProtocolDependenciesManually,
  preprocessImportPaths,
  copyRequiredFiles
} = require('../utils/dependencyUtils');
const {
  createFoundryConfig,
  cleanupFolders,
  checkFoundryInstallation,
  verifyDependencyInstallation
} = require('../utils/foundryUtils');

// Error categories for better error handling
const ErrorCategories = {
  VALIDATION: 'validation',
  COMPILATION: 'compilation',
  DEPENDENCY: 'dependency',
  VERSION: 'version',
  SYSTEM: 'system'
};

// Error subcategories for more specific error handling
const ErrorSubcategories = {
  // Validation errors
  INVALID_REQUEST: 'invalid_request',
  MISSING_FIELDS: 'missing_fields',
  INVALID_FORMAT: 'invalid_format',
  
  // Compilation errors
  SYNTAX_ERROR: 'syntax_error',
  IMPORT_ERROR: 'import_error',
  TYPE_ERROR: 'type_error',
  REFERENCE_ERROR: 'reference_error',
  
  // Dependency errors
  MISSING_DEPENDENCY: 'missing_dependency',
  VERSION_MISMATCH: 'version_mismatch',
  
  // Version errors
  INVALID_SOLIDITY_VERSION: 'invalid_solidity_version',
  INVALID_EVM_VERSION: 'invalid_evm_version',
  
  // System errors
  COMPILER_ERROR: 'compiler_error',
  FILE_SYSTEM_ERROR: 'file_system_error',
  PERMISSION_ERROR: 'permission_error'
};

/**
 * Format error response with proper structure
 * @param {Error} error - Error object
 * @param {string} category - Error category
 * @param {string} subcategory - Error subcategory
 * @returns {Object} Formatted error response
 */
function formatErrorResponse(error, category, subcategory) {
  return {
    success: false,
    error: {
      message: error.message,
      category,
      subcategory,
      type: error.name || 'Error',
      details: error.details || {},
      timestamp: new Date().toISOString()
    }
  };
}

/**
 * Validate compilation request
 * @param {Object} body - Request body
 * @returns {Object|null} Error object if validation fails, null if valid
 */
function validateCompilationRequest(body) {
  const { source, version, settings } = body;

  // Check required fields
  if (!source) {
    return createCompilationError(
      'Source code is required',
      ErrorTypes.VALIDATION_ERROR,
      { field: 'source' }
    );
  }

  // Validate source code format
  if (typeof source !== 'string' || source.trim().length === 0) {
    return createCompilationError(
      'Source code must be a non-empty string',
      ErrorTypes.VALIDATION_ERROR,
      { field: 'source' }
    );
  }

  // Validate Solidity version format
  if (version && !version.match(/^\d+\.\d+\.\d+$/)) {
    return createCompilationError(
      'Invalid Solidity version format. Must be in format X.Y.Z (e.g., 0.8.17)',
      ErrorTypes.VERSION_ERROR,
      { field: 'version', value: version }
    );
  }

  // Validate settings if provided
  if (settings) {
    if (typeof settings !== 'object') {
      return createCompilationError(
        'Settings must be an object',
        ErrorTypes.VALIDATION_ERROR,
        { field: 'settings' }
      );
    }

    // Validate EVM version if provided
    if (settings.evmVersion && typeof settings.evmVersion !== 'string') {
      return createCompilationError(
        'EVM version must be a string',
        ErrorTypes.VALIDATION_ERROR,
        { field: 'settings.evmVersion' }
      );
    }
  }

  return null;
}

/**
 * Categorize compilation error
 * @param {Error} error - Error object
 * @returns {Object} Error category and subcategory
 */
function categorizeError(error) {
  const errorMessage = error.message.toLowerCase();
  
  // Validation errors
  if (error.name === 'ValidationError' || errorMessage.includes('required') || errorMessage.includes('invalid format')) {
    return {
      category: ErrorCategories.VALIDATION,
      subcategory: ErrorSubcategories.INVALID_REQUEST
    };
  }

  // Compilation errors
  if (errorMessage.includes('parser error') || errorMessage.includes('syntax error')) {
    return {
      category: ErrorCategories.COMPILATION,
      subcategory: ErrorSubcategories.SYNTAX_ERROR
    };
  }

  if (errorMessage.includes('import') || errorMessage.includes('not found')) {
    return {
      category: ErrorCategories.DEPENDENCY,
      subcategory: ErrorSubcategories.MISSING_DEPENDENCY
    };
  }

  // Version errors
  if (errorMessage.includes('version') || errorMessage.includes('solidity')) {
    return {
      category: ErrorCategories.VERSION,
      subcategory: ErrorSubcategories.INVALID_SOLIDITY_VERSION
    };
  }

  // Default to system error
  return {
    category: ErrorCategories.SYSTEM,
    subcategory: ErrorSubcategories.COMPILER_ERROR
  };
}

/**
 * Find JSON files recursively in a directory
 * @param {string} dir - Directory to search
 * @returns {string[]} Array of JSON file paths
 */
function findJsonFiles(dir) {
  let results = [];
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      results = results.concat(findJsonFiles(filePath));
    } else if (file.endsWith('.json') && !file.includes('.metadata')) {
      results.push(filePath);
    }
  }
  
  return results;
}

/**
 * Compile a contract with Foundry
 * @param {string} contractDir - Contract directory
 * @param {string} contractName - Contract name
 * @param {string} outputDir - Output directory for artifacts
 * @param {Object} dependencyResults - Results from dependency installation
 * @param {string} effectiveCompilerVersion - Solidity compiler version
 * @param {string} evmVersion - EVM version
 * @returns {Object} Compilation result with bytecode and ABI
 */
async function compileWithFoundry(contractDir, contractName, outputDir, dependencyResults, effectiveCompilerVersion, evmVersion) {
  console.log('Building contract with Foundry...');
  
  // Before compiling, ensure all import paths are correctly mapped in the source file
  const srcDir = path.join(contractDir, 'src');
  const sourceFiles = fs.readdirSync(srcDir);
  
  for (const file of sourceFiles) {
    if (file.endsWith('.sol')) {
      const filePath = path.join(srcDir, file);
      let content = fs.readFileSync(filePath, 'utf8');
      
      // Replace any problematic import paths with correct ones
      // This is a safeguard if remappings don't work properly
      content = content.replace(
        /import\s+["']@openzeppelin\/contracts\/([^"']+)["']/g, 
        'import "@openzeppelin/contracts/$1"'
      );
      
      content = content.replace(
        /import\s+["']@openzeppelin\/contracts@[^\/]+\/([^"']+)["']/g,
        'import "@openzeppelin/contracts/$1"'
      );
      
      // Fix Uniswap V2 imports
      content = content.replace(
        /import\s+["']@uniswap\/v2-core\/([^"']+)["']/g,
        'import "@uniswap/v2-core/$1"'
      );
      content = content.replace(
        /import\s+["']@uniswap\/v2-periphery\/([^"']+)["']/g,
        'import "@uniswap/v2-periphery/$1"'
      );
      
      // Fix Uniswap V3 imports
      content = content.replace(
        /import\s+["']@uniswap\/v3-core\/([^"']+)["']/g,
        'import "@uniswap/v3-core/$1"'
      );
      content = content.replace(
        /import\s+["']@uniswap\/v3-periphery\/([^"']+)["']/g,
        'import "@uniswap/v3-periphery/$1"'
      );
      
      // Fix Aave imports
      content = content.replace(
        /import\s+["']@aave\/core-v3\/([^"']+)["']/g,
        'import "@aave/core-v3/$1"'
      );
      
      // Fix Compound imports
      content = content.replace(
        /import\s+["']@compound-finance\/contracts\/([^"']+)["']/g,
        'import "@compound-finance/contracts/$1"'
      );
      
      // Fix Chainlink imports
      content = content.replace(
        /import\s+["']@chainlink\/contracts\/([^"']+)["']/g,
        'import "@chainlink/contracts/$1"'
      );
      
      fs.writeFileSync(filePath, content);
    }
  }
  
  // Check forge help for the correct command
  const forgeHelp = execSync('forge build --help', { 
    encoding: 'utf8', 
    stdio: 'pipe' 
  });
  
  // Use a more compatible build command
  let buildCommand = 'forge build';
  if (forgeHelp.includes('--skip')) {
    buildCommand += ' --skip test';
  }
  
  try {
    const buildOutput = execSync(buildCommand, { 
      cwd: contractDir,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    console.log('Forge build completed');
  } catch (buildError) {
    console.error('Forge build failed:', buildError.message);
    
    // Try again with verbose output to get more information
    try {
      console.log('Retrying build with verbose output...');
      execSync(`forge build -vvv`, {
        cwd: contractDir,
        stdio: 'inherit' // Show output directly
      });
    } catch (verboseError) {
      throw new Error(`Forge build failed: ${verboseError.message}`);
    }
  }
  
  // Look in the correct output directory
  const outDir = path.join(contractDir, 'out');
  if (!fs.existsSync(outDir)) {
    throw new Error('Compilation did not produce output files');
  }
  
  const outFiles = fs.readdirSync(outDir);
  console.log('Output files:', outFiles);
  
  if (outFiles.length === 0) {
    throw new Error('No output files found after compilation');
  }
  
  // Find all JSON files in the output directory
  const jsonFiles = findJsonFiles(outDir);
  console.log('Found JSON files:', jsonFiles);
  
  // Look for the contract artifact
  let artifactPath = null;
  let artifact = null;
  
  for (const jsonFile of jsonFiles) {
    try {
      const content = fs.readFileSync(jsonFile, 'utf8');
      const data = JSON.parse(content);
      
      // Check if this JSON file contains the contract bytecode and ABI
      if (data.abi && (data.bytecode || data.evm?.bytecode?.object)) {
        artifactPath = jsonFile;
        artifact = data;
        break;
      }
    } catch (error) {
      console.warn(`Failed to parse ${jsonFile}:`, error.message);
    }
  }
  
  if (!artifactPath || !artifact) {
    throw new Error('Contract artifact not found in Forge output');
  }
  
  console.log('Found artifact file:', artifactPath);
  
  // Extract bytecode and ABI
  const bytecode = artifact.bytecode?.object || 
                  artifact.bytecode || 
                  artifact.evm?.bytecode?.object;
  const abi = artifact.abi;
  
  if (!bytecode || !abi) {
    throw new Error('Bytecode or ABI not found in artifact');
  }
  
  // Save the artifact
  fs.writeFileSync(
    path.join(outputDir, `${contractName}.json`),
    JSON.stringify({ bytecode, abi }, null, 2)
  );
  
  console.log('Artifacts saved successfully');
  
  return {
    bytecode,
    abi,
    dependencies: dependencyResults,
    message: 'Contract compiled successfully with Foundry'
  };
}

async function compileContract(req, res) {
  const jobId = crypto.randomBytes(16).toString('hex');
  const { source, version = '0.8.19', settings = {} } = req.body;

  try {
    // Validate request
    const validationError = validateCompilationRequest(req.body);
    if (validationError) {
      return res.status(400).json(formatErrorResponse(
        validationError,
        ErrorCategories.VALIDATION,
        ErrorSubcategories.INVALID_REQUEST
      ));
    }

    // Update job status to processing
    updateJobStatus(jobId, 'processing', {
      source: source.substring(0, 100) + (source.length > 100 ? '...' : ''),
      version,
      settings: settings ? JSON.stringify(settings).substring(0, 100) + (JSON.stringify(settings).length > 100 ? '...' : '') : ''
    });

    // Extract contract name from source
    const contractName = extractContractName(source);
    if (!contractName) {
      const error = createCompilationError(
        'Could not determine contract name from source code',
        ErrorTypes.VALIDATION_ERROR,
        { field: 'source' }
      );
      return res.status(400).json(formatErrorResponse(
        error,
        ErrorCategories.VALIDATION,
        ErrorSubcategories.INVALID_FORMAT
      ));
    }

    // Create a temporary directory for compilation
    const tempDir = path.join(os.tmpdir(), `solc-compile-${jobId}`);
    fs.ensureDirSync(tempDir);

    // Write the source code to a temporary file
    const sourceFile = path.join(tempDir, `${contractName}.sol`);
    fs.writeFileSync(sourceFile, source);

    // Copy remappings.txt from project root if it exists
    const projectRemappingsPath = path.join(__dirname, '..', 'remappings.txt');
    if (fs.existsSync(projectRemappingsPath)) {
      fs.copyFileSync(projectRemappingsPath, path.join(tempDir, 'remappings.txt'));
    }

    // Compile the contract
    const result = await compileWithFallbackMethod(source, contractName, version, settings, tempDir);

    // Clean up temporary files
    if (config.CLEANUP_TEMP_FILES) {
      fs.removeSync(tempDir);
    }

    // Update job status to completed
    updateJobStatus(jobId, 'completed', {
      contractName,
      bytecode: result.bytecode.substring(0, 100) + '...',
      abi: JSON.stringify(result.abi).substring(0, 100) + '...'
    });

    // Return successful response
    res.json({
      success: true,
      jobId,
      result: {
        contractName,
        bytecode: result.bytecode,
        abi: result.abi,
        metadata: result.metadata,
        compilerVersion: version,
        evmVersion: settings.evmVersion || 'london'
      }
    });

  } catch (error) {
    console.error('Compilation error:', error);
    
    // Categorize the error
    const { category, subcategory } = categorizeError(error);
    
    // Update job status to failed
    updateJobStatus(jobId, 'failed', {
      error: error.message,
      errorType: error.name,
      category,
      subcategory
    });

    // Return formatted error response
    res.status(500).json(formatErrorResponse(
      error,
      category,
      subcategory
    ));
  }
}

function updateJobStatus(jobId, status, details = {}) {
  // Implementation of job status tracking
  console.log(`Job ${jobId} status: ${status}`, details);
}

module.exports = {
  compileContract,
  ErrorCategories,
  ErrorSubcategories
};