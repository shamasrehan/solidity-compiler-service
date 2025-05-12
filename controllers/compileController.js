const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');

// Get paths from parent module
const TEMP_DIR = path.join(__dirname, '../temp');
const ARTIFACTS_DIR = path.join(__dirname, '../artifacts');

// Import utilities
const { 
  extractContractName, 
  extractSolidityVersion, 
  installSolidityVersion,
  compileSolidityWithSolc,
  compileSolidityWithStandardInput
} = require('../utils/solcUtils');
const { 
  extractDependenciesFromCode, 
  installDependencies,
  handleOpenZeppelinManually,
  preprocessImportPaths,
  copyRequiredFiles
} = require('../utils/dependencyUtils');
const {
  createFoundryConfig,
  cleanupFolders,
  checkFoundryInstallation,
  verifyDependencyInstallation
} = require('../utils/foundryUtils');

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

/**
 * Main contract compilation controller
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function compileContract(req, res) {
  const { code, evmVersion, compilerVersion, dependencies: userProvidedDeps } = req.body;
  
  if (!code) {
    return res.status(400).json({ 
      status: 'error', 
      message: 'Solidity code is required' 
    });
  }

  // Check if Foundry is properly installed
  if (!checkFoundryInstallation()) {
    return res.status(500).json({
      status: 'error',
      message: 'Foundry is not properly installed'
    });
  }

  console.log('Received request to compile contract');
  const contractId = Date.now().toString();
  const contractDir = path.join(TEMP_DIR, contractId);
  
  // Preprocess the code to normalize import paths
  const normalizedCode = preprocessImportPaths(code);
  
  // Extract the contract name from the code
  const contractName = extractContractName(normalizedCode);
  console.log(`Detected contract name: ${contractName}`);
  
  // Extract Solidity version from code if not specified
  const detectedCompilerVersion = extractSolidityVersion(normalizedCode);
  const effectiveCompilerVersion = compilerVersion || detectedCompilerVersion;
  if (effectiveCompilerVersion) {
    console.log(`Detected Solidity version: ${effectiveCompilerVersion}`);
  }
  
  // Analyze code for dependencies
  const detectedDependencies = extractDependenciesFromCode(normalizedCode);
  console.log('Detected dependencies:', detectedDependencies);
  
  // Filter and normalize user-provided dependencies
  const normalizedUserDeps = (userProvidedDeps || []).filter(dep => {
    // Only use dependencies in the format 'owner/repo' or 'owner/repo@version'
    return typeof dep === 'string' && (/^[^\/]+\/[^\/]+$/.test(dep) || /^[^\/]+\/[^\/]+@[\w\.\-]+$/.test(dep));
  });
  
  // Combine user-provided and detected dependencies, removing duplicates
  const allDependencies = [...new Set([
    ...normalizedUserDeps, 
    ...detectedDependencies
  ])];
  
  console.log('All dependencies to install:', allDependencies);
  
  const contractFileName = `${contractName}.sol`;
  const contractPath = path.join(contractDir, contractFileName);
  
  // Create the output directory for artifacts
  const outputDir = path.join(ARTIFACTS_DIR, contractId);
  fs.ensureDirSync(outputDir);
  
  try {
    // Create folder
    fs.ensureDirSync(contractDir);
    fs.writeFileSync(contractPath, normalizedCode);
    console.log(`Contract file created at: ${contractPath}`);
    
    // Make sure required files exist
    await copyRequiredFiles(contractDir, normalizedCode);
    
    // Check and install required Solidity version if specified
    if (effectiveCompilerVersion) {
      console.log(`Checking for compiler version ${effectiveCompilerVersion}`);
      await installSolidityVersion(effectiveCompilerVersion);
    }
    
    // Try to compile using solc directly first (simpler approach)
    try {
      console.log('Attempting direct compilation with solc...');
      const { bytecode, abi } = compileSolidityWithSolc(contractPath, contractName, effectiveCompilerVersion);
      
      // Save the compilation output
      fs.writeFileSync(
        path.join(outputDir, `${contractName}.json`),
        JSON.stringify({ bytecode, abi }, null, 2)
      );
      
      console.log('Contract compiled successfully with solc');
      
      return res.status(200).json({
        status: 'success',
        contractId,
        contractName,
        bytecode,
        abi,
        compilerVersion: effectiveCompilerVersion || 'default',
        evmVersion: evmVersion || 'default',
        dependencies: [],
        message: 'Contract compiled successfully with solc'
      });
    } catch (solcError) {
      console.error('Direct solc compilation failed:', solcError.message);
      console.log('Falling back to Foundry compilation...');
      
      // If solc compilation fails, try with Foundry
      
      // Create a simpler structure without depending on forge-std
      const srcDir = path.join(contractDir, 'src');
      fs.ensureDirSync(srcDir);
      fs.copyFileSync(contractPath, path.join(srcDir, contractFileName));
      
      // Create foundry.toml config file
      createFoundryConfig(contractDir, allDependencies, evmVersion, effectiveCompilerVersion);
      
      // Create lib directory and initialize git before installing dependencies
      fs.ensureDirSync(path.join(contractDir, 'lib'));
      
      // Initialize git repository (required for forge install)
      try {
        execSync('git init', { cwd: contractDir, stdio: 'pipe' });
        console.log('Git repository initialized for dependency installation');
      } catch (gitError) {
        console.warn('Failed to initialize git repository:', gitError.message);
      }
      
      // Install dependencies
      const dependencyResults = await installDependencies(contractDir, allDependencies);
      
      // Additional manual handling for OpenZeppelin if installation failed
      const installedDeps = await handleOpenZeppelinManually(contractDir, allDependencies, dependencyResults);
      
      // Verify dependencies are correctly installed
      verifyDependencyInstallation(contractDir, allDependencies);
      
      // Run forge build
      try {
        const compileResult = await compileWithFoundry(
          contractDir, 
          contractName, 
          outputDir, 
          installedDeps, 
          effectiveCompilerVersion, 
          evmVersion
        );
        
        return res.status(200).json({
          status: 'success',
          contractId,
          contractName,
          bytecode: compileResult.bytecode,
          abi: compileResult.abi,
          compilerVersion: effectiveCompilerVersion || 'default',
          evmVersion: evmVersion || 'default',
          dependencies: installedDeps,
          message: 'Contract compiled successfully with Foundry'
        });
      } catch (forgeError) {
        console.error('Forge build failed:', forgeError.message);
        
        // Try fallback to direct solc standard input (last resort)
        try {
          const { bytecode, abi } = compileSolidityWithStandardInput(
            contractDir, 
            contractFileName, 
            contractName, 
            normalizedCode, 
            evmVersion
          );
          
          // Save artifact
          fs.writeFileSync(
            path.join(outputDir, `${contractName}.json`),
            JSON.stringify({ bytecode, abi }, null, 2)
          );
          
          return res.status(200).json({
            status: 'success',
            contractId,
            contractName,
            bytecode,
            abi,
            compilerVersion: effectiveCompilerVersion || 'default',
            evmVersion: evmVersion || 'default',
            dependencies: dependencyResults ? installedDeps : [],
            message: 'Contract compiled successfully with solc standard input'
          });
        } catch (standardInputError) {
          console.error('Solc standard input compilation failed:', standardInputError.message);
          
          return res.status(400).json({
            status: 'error',
            message: `All compilation methods failed. Last error: ${standardInputError.message}`
          });
        }
      }
    }
  } catch (error) {
    console.error('An error occurred during compilation:', error);
    
    cleanupFolders(contractDir);
    
    return res.status(500).json({
      status: 'error',
      message: error.message || 'An error occurred during compilation'
    });
  } finally {
    // Optional: Clean up regardless of success or failure
    // Uncomment if you want to clean up after each request
    // cleanupFolders(contractDir);
  }
}

module.exports = {
  compileContract
};