/**
 * Direct Solc Compiler - A fallback compilation method when all else fails
 * This file should be placed in the utils directory
 */

const { execSync } = require('child_process');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');

/**
 * Compile Solidity code using direct solc command line
 * @param {string} code - Solidity code to compile
 * @param {string} contractName - Name of the contract
 * @returns {Object} Object with bytecode and ABI
 */
function directSolcCompile(code, contractName) {
  try {
    console.log('Attempting direct solc compilation as last resort...');
    
    // Create a temporary file
    const tempDir = os.tmpdir();
    const tempFile = path.join(tempDir, `${contractName}.sol`);
    
    // Write the code to the temporary file
    fs.writeFileSync(tempFile, code);
    
    // Run solc directly with simple output format
    const output = execSync(`solc --bin --abi ${tempFile}`, {
      encoding: 'utf8'
    });
    
    // Parse the output
    const lines = output.split('\n');
    let bytecode = '';
    let abi = '';
    let isBytecode = false;
    let isAbi = false;
    
    for (const line of lines) {
      if (line.includes('Binary:')) {
        isBytecode = true;
        isAbi = false;
        continue;
      }
      
      if (line.includes('ABI:')) {
        isBytecode = false;
        isAbi = true;
        continue;
      }
      
      if (isBytecode && line.trim() !== '') {
        bytecode = line.trim();
        isBytecode = false;
      }
      
      if (isAbi && line.trim() !== '') {
        abi = line.trim();
        isAbi = false;
      }
    }
    
    // Clean up
    fs.removeSync(tempFile);
    
    if (!bytecode || !abi) {
      throw new Error('Failed to extract bytecode or ABI from output');
    }
    
    // Parse ABI from string to JSON
    try {
      const abiJson = JSON.parse(abi);
      return {
        bytecode,
        abi: abiJson
      };
    } catch (parseError) {
      console.error('Failed to parse ABI:', parseError.message);
      throw parseError;
    }
  } catch (error) {
    console.error('Direct solc compilation failed:', error.message);
    throw error;
  }
}

/**
 * Try multiple compilation approaches in sequence
 * @param {string} code - Solidity code to compile
 * @param {string} contractName - Name of the contract
 * @returns {Object} Object with bytecode and ABI
 */
async function tryAllCompilationMethods(code, contractName) {
  // Try multiple compilation approaches
  const errors = [];
  
  // 1. Try direct solc compilation
  try {
    return directSolcCompile(code, contractName);
  } catch (error) {
    errors.push(`Direct solc error: ${error.message}`);
    console.warn('Direct solc compilation failed, trying alternative method...');
  }
  
  // 2. Try with solcjs if available
  try {
    const solc = require('solc');
    console.log('Using solcjs for compilation...');
    
    const input = {
      language: 'Solidity',
      sources: {
        [`${contractName}.sol`]: {
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
    
    const output = JSON.parse(solc.compile(JSON.stringify(input)));
    
    if (output.errors) {
      const errorMessages = output.errors
        .map(e => `${e.severity}: ${e.message}`)
        .join('\n');
      
      console.log(`Compilation messages: ${errorMessages}`);
      
      if (output.errors.some(e => e.severity === 'error')) {
        throw new Error(`solcjs compilation errors: ${errorMessages}`);
      }
    }
    
    if (!output.contracts || 
        !output.contracts[`${contractName}.sol`] || 
        !output.contracts[`${contractName}.sol`][contractName]) {
      throw new Error(`Contract ${contractName} not found in output`);
    }
    
    const contract = output.contracts[`${contractName}.sol`][contractName];
    return {
      bytecode: contract.evm.bytecode.object,
      abi: contract.abi
    };
  } catch (solcjsError) {
    if (solcjsError.code === 'MODULE_NOT_FOUND') {
      console.warn('solcjs not available, skipping this method');
    } else {
      errors.push(`solcjs error: ${solcjsError.message}`);
      console.warn('solcjs compilation failed');
    }
  }
  
  // 3. Last attempt - use a simplified shell script approach
  try {
    const tempDir = os.tmpdir();
    const scriptPath = path.join(tempDir, 'compile.sh');
    const contractPath = path.join(tempDir, `${contractName}.sol`);
    
    // Write the contract to a file
    fs.writeFileSync(contractPath, code);
    
    // Create a shell script to compile
    const script = `#!/bin/bash
solc --bin --abi ${contractPath} -o ${tempDir}
`;
    
    fs.writeFileSync(scriptPath, script);
    fs.chmodSync(scriptPath, '755');
    
    // Execute the script
    execSync(scriptPath, { stdio: 'inherit' });
    
    // Read the output files
    const bytecode = fs.readFileSync(path.join(tempDir, `${contractName}.bin`), 'utf8').trim();
    const abi = fs.readFileSync(path.join(tempDir, `${contractName}.abi`), 'utf8').trim();
    
    // Clean up
    fs.removeSync(scriptPath);
    fs.removeSync(contractPath);
    fs.removeSync(path.join(tempDir, `${contractName}.bin`));
    fs.removeSync(path.join(tempDir, `${contractName}.abi`));
    
    return {
      bytecode,
      abi: JSON.parse(abi)
    };
  } catch (shellError) {
    errors.push(`Shell script error: ${shellError.message}`);
    console.error('All compilation methods failed');
  }
  
  throw new Error(`All compilation methods failed: ${errors.join('; ')}`);
}

module.exports = {
  directSolcCompile,
  tryAllCompilationMethods
};