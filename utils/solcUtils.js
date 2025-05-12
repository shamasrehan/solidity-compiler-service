const { execSync } = require('child_process');
const fs = require('fs-extra');
const path = require('path');

/**
 * Install a specific Solidity compiler version
 * @param {string} version - Solidity version to install
 * @returns {Promise<boolean>} Whether installation was successful
 */
async function installSolidityVersion(version) {
  try {
    console.log(`Checking and installing Solidity compiler version: ${version}`);
    
    // Check if solc-select is installed and working
    try {
      const installedVersions = execSync('solc-select versions', { encoding: 'utf8' });
      
      // If the version is not installed, install it
      if (!installedVersions.includes(version)) {
        console.log(`Installing Solidity compiler version ${version}`);
        execSync(`solc-select install ${version}`, { stdio: 'pipe' });
      }
      
      // Set the version as active
      execSync(`solc-select use ${version}`, { stdio: 'pipe' });
      console.log(`Solidity version ${version} set as default`);
      return true;
    } catch (solcSelectError) {
      console.warn('solc-select failed:', solcSelectError.message);
      console.log('Falling back to direct solc installation...');
      
      // Try to use Docker if solc-select fails
      try {
        // Check if Docker is available
        execSync('docker --version', { stdio: 'pipe' });
        
        // Check if the solc image exists
        try {
          execSync(`docker pull ethereum/solc:${version}`, { stdio: 'pipe' });
          console.log(`Docker image for solc ${version} pulled successfully`);
          return true;
        } catch (dockerPullError) {
          console.warn(`Failed to pull Docker image for solc ${version}:`, dockerPullError.message);
          
          // Try with v prefix if it doesn't work without
          try {
            execSync(`docker pull ethereum/solc:v${version}`, { stdio: 'pipe' });
            console.log(`Docker image for solc v${version} pulled successfully`);
            return true;
          } catch (dockerPullWithVError) {
            console.warn(`Failed to pull Docker image for solc v${version}:`, dockerPullWithVError.message);
          }
        }
      } catch (dockerError) {
        console.warn('Docker not available:', dockerError.message);
      }
      
      // If all else fails, warn but don't throw an error
      console.warn(`Could not install Solidity version ${version}, will try to continue with system version`);
      return false;
    }
  } catch (error) {
    console.error(`Failed to install Solidity version ${version}:`, error.message);
    console.warn('Will try to continue with system solc version');
    return false;
  }
}

/**
 * Extract the contract name from Solidity code
 * @param {string} code - Solidity code
 * @returns {string} Contract name
 */
function extractContractName(code) {
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
}

/**
 * Extract the Solidity version from pragma statement
 * @param {string} code - Solidity code
 * @returns {string|null} Solidity version or null if not found
 */
function extractSolidityVersion(code) {
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
  
  return null; // No version found
}

/**
 * Try to run solc with Docker if direct solc fails
 * @param {string} inputFile - Path to the input JSON file
 * @param {string} version - Solidity compiler version
 * @returns {string} solc output
 */
function runSolcWithDocker(inputFile, version) {
  try {
    const inputDir = path.dirname(inputFile);
    const inputFileName = path.basename(inputFile);
    
    // Use either v{version} or just {version} format
    let dockerTag = version;
    try {
      // Try without v prefix first
      execSync(`docker image inspect ethereum/solc:${version}`, { stdio: 'pipe' });
    } catch (error) {
      // If that fails, try with v prefix
      dockerTag = `v${version}`;
      execSync(`docker image inspect ethereum/solc:${dockerTag}`, { stdio: 'pipe' });
    }
    
    // Run solc in Docker
    const output = execSync(`docker run --rm -v "${inputDir}:/sources" ethereum/solc:${dockerTag} --standard-json /sources/${inputFileName}`, {
      encoding: 'utf8'
    });
    
    return output;
  } catch (error) {
    console.error('Failed to run solc with Docker:', error.message);
    throw error;
  }
}

/**
 * Compile Solidity with solc directly
 * @param {string} contractPath - Path to the contract file
 * @param {string} contractName - Name of the contract
 * @param {string} compilerVersion - Solidity compiler version
 * @returns {Object} Object with bytecode and ABI
 */
function compileSolidityWithSolc(contractPath, contractName, compilerVersion) {
  try {
    // Make sure the solc version is set
    if (compilerVersion) {
      try {
        execSync(`solc-select use ${compilerVersion}`, { stdio: 'pipe' });
      } catch (error) {
        console.warn(`Failed to set solc version to ${compilerVersion}:`, error.message);
      }
    }
    
    // Use standard-json instead of combined-json to be safer
    const inputJson = {
      language: "Solidity",
      sources: {
        [path.basename(contractPath)]: {
          content: fs.readFileSync(contractPath, 'utf8')
        }
      },
      settings: {
        outputSelection: {
          "*": {
            "*": ["abi", "evm.bytecode.object"]
          }
        },
        optimizer: {
          enabled: true,
          runs: 200
        }
      }
    };
    
    // Write input to a temp file
    const inputFile = path.join(path.dirname(contractPath), 'input.json');
    fs.writeFileSync(inputFile, JSON.stringify(inputJson));
    
    let output;
    try {
      // Try running solc directly
      output = execSync(`solc --standard-json ${inputFile}`, {
        encoding: 'utf8'
      });
    } catch (directSolcError) {
      console.warn('Direct solc command failed:', directSolcError.message);
      
      // Try with Docker if direct solc fails and we have a specific compiler version
      if (compilerVersion) {
        console.log(`Trying compilation with Docker using solc ${compilerVersion}...`);
        output = runSolcWithDocker(inputFile, compilerVersion);
      } else {
        throw directSolcError;
      }
    }
    
    // Parse the output
    const compiledOutput = JSON.parse(output);
    
    // Check for errors
    if (compiledOutput.errors && compiledOutput.errors.some(e => e.severity === 'error')) {
      const errors = compiledOutput.errors
        .filter(e => e.severity === 'error')
        .map(e => e.message)
        .join('\n');
      throw new Error(`Compilation errors: ${errors}`);
    }
    
    // Find the contract in the output
    const fileName = path.basename(contractPath);
    if (!compiledOutput.contracts || !compiledOutput.contracts[fileName] || !compiledOutput.contracts[fileName][contractName]) {
      throw new Error(`Contract ${contractName} not found in compilation output`);
    }
    
    const contract = compiledOutput.contracts[fileName][contractName];
    
    return {
      bytecode: contract.evm.bytecode.object,
      abi: contract.abi
    };
  } catch (error) {
    console.error(`Failed to compile Solidity contract:`, error.message);
    throw error;
  }
}