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
  compileSolidityWithStandardInput,
  compileWithFallbackMethod
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