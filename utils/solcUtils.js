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
    const installedVersions = execSync('solc-select versions', { encoding: 'utf8' });
    
    if (!installedVersions.includes(version)) {
      console.log(`Installing Solidity compiler version ${version}`);
      execSync(`solc-select install ${version}`, { stdio: 'pipe' });
    }
    
    execSync(`solc-select use ${version}`, { stdio: 'pipe' });
    console.log(`Solidity version ${version} set as default`);
    return true;
  } catch (error) {
    console.error(`Failed to install Solidity version ${version}:`, error.message);
    throw new Error(`Failed to install Solidity version ${version}: ${error.message}`);
  }
}

/**
 * Extract the contract name from Solidity code
 * @param {string} code - Solidity code
 * @returns {string} Contract name
 */
function extractContractName(code) {
  const contractMatch = code.match(/contract\s+(\w+)/);
  if (contractMatch && contractMatch[1]) {
    return contractMatch[1]; // Return the captured contract name
  }
  return 'Contract'; // Default fallback
}

/**
 * Extract the Solidity version from pragma statement
 * @param {string} code - Solidity code
 * @returns {string|null} Solidity version or null if not found
 */
function extractSolidityVersion(code) {
  const versionMatch = code.match(/pragma\s+solidity\s+(\^|>=|<=|>|<)?\s*(\d+\.\d+\.\d+)/);
  if (versionMatch && versionMatch[2]) {
    return versionMatch[2]; // Return the captured version number
  }
  return null; // No version found
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
      execSync(`solc-select use ${compilerVersion}`, { stdio: 'pipe' });
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
        }
      }
    };
    
    // Write input to a temp file
    const inputFile = path.join(path.dirname(contractPath), 'input.json');
    fs.writeFileSync(inputFile, JSON.stringify(inputJson));
    
    // Run solc with standard input
    const output = execSync(`solc --standard-json ${inputFile}`, {
      encoding: 'utf8'
    });
    
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
    console.error('Failed to compile with solc:', error);
    throw error;
  }
}

/**
 * Compile using solc with standard JSON input
 * @param {string} contractDir - Directory of the contract
 * @param {string} contractFileName - Filename of the contract
 * @param {string} contractName - Name of the contract
 * @param {string} code - Solidity code
 * @param {string} evmVersion - EVM version to use
 * @returns {Object} Object with bytecode and ABI
 */
function compileSolidityWithStandardInput(contractDir, contractFileName, contractName, code, evmVersion) {
  console.log('Attempting fallback to solc standard input format...');
  
  // Create a standard JSON input for solc
  const standardInput = {
    language: 'Solidity',
    sources: {
      [contractFileName]: {
        content: code
      }
    },
    settings: {
      outputSelection: {
        '*': {
          '*': ['abi', 'evm.bytecode.object']
        }
      }
    }
  };
  
  if (evmVersion) {
    standardInput.settings.evmVersion = evmVersion;
  }
  
  // Save the standard input to a file
  const inputPath = path.join(contractDir, 'input.json');
  fs.writeFileSync(inputPath, JSON.stringify(standardInput, null, 2));
  
  // Run solc with standard input
  const solcOutput = execSync(`solc --standard-json ${inputPath}`, {
    encoding: 'utf8'
  });
  
  // Parse the output
  const outputJson = JSON.parse(solcOutput);
  
  // Check for errors
  if (outputJson.errors && outputJson.errors.some(error => error.severity === 'error')) {
    const errorMessages = outputJson.errors
      .filter(error => error.severity === 'error')
      .map(error => error.message)
      .join('\n');
    
    throw new Error(`Solc compilation failed: ${errorMessages}`);
  }
  
  // Extract bytecode and ABI - using the correct contract name
  if (!outputJson.contracts || 
      !outputJson.contracts[contractFileName] || 
      !outputJson.contracts[contractFileName][contractName]) {
    throw new Error(`Contract ${contractName} not found in output`);
  }
  
  const contractOutput = outputJson.contracts[contractFileName][contractName];
  const bytecode = contractOutput.evm.bytecode.object;
  const abi = contractOutput.abi;
  
  return { bytecode, abi };
}

module.exports = {
  installSolidityVersion,
  extractContractName,
  extractSolidityVersion,
  compileSolidityWithSolc,
  compileSolidityWithStandardInput
};