// index.js
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);
const fs = require('fs-extra');
const solcUtils = require('./utils/solcUtils');

// Create the Express app
const app = express();
const PORT = process.env.PORT || 9000;

// Middleware
app.use(bodyParser.json());

// Simple health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Get available compiler versions
app.get('/api/versions', async (req, res) => {
  try {
    // Get installed versions
    const { stdout } = await execAsync('solc-select versions');
    const versions = stdout.split('\n')
      .map(v => v.trim())
      .filter(Boolean);
    
    res.json({
      success: true,
      versions
    });
  } catch (error) {
    console.error('Error fetching compiler versions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch compiler versions'
    });
  }
});

// Compile Solidity code
app.post('/api/compile', async (req, res) => {
  try {
    const { source, version, settings } = req.body;
    
    if (!source) {
      return res.status(400).json({ 
        success: false, 
        error: 'Source code is required' 
      });
    }
    
    if (!version) {
      return res.status(400).json({ 
        success: false, 
        error: 'Compiler version is required' 
      });
    }
    
    // Ensure the requested compiler version is installed
    const installed = await solcUtils.installSolidityVersion(version);
    if (!installed) {
      return res.status(400).json({
        success: false,
        error: `Failed to install Solidity compiler version ${version}`
      });
    }
    
    // Create a temporary directory for compilation
    const tempDir = path.join(__dirname, 'temp', `compile-${Date.now()}`);
    await fs.ensureDir(tempDir);
    
    try {
      // Write the source to a file
      const sourcePath = path.join(tempDir, 'input.sol');
      await fs.writeFile(sourcePath, source);
      
      // Prepare compilation command with appropriate flags
      let compileCmd = `cd ${tempDir} && solc-select use ${version} && solc --combined-json abi,bin,bin-runtime`;
      
      // Add optimization settings if provided
      if (settings?.optimizer?.enabled) {
        compileCmd += ` --optimize`;
        if (settings.optimizer.runs) {
          compileCmd += ` --optimize-runs ${settings.optimizer.runs}`;
        }
      }
      
      // Add input file
      compileCmd += ` input.sol`;
      
      // Execute compilation
      const { stdout, stderr } = await execAsync(compileCmd);
      
      if (stderr && stderr.includes('Error')) {
        return res.status(400).json({
          success: false,
          errors: stderr
        });
      }
      
      // Parse the compilation output
      const compilationResult = JSON.parse(stdout);
      
      // Transform the output to a more client-friendly format
      const contracts = {};
      
      for (const [key, value] of Object.entries(compilationResult.contracts)) {
        // Extract filename and contract name from key (format: input.sol:ContractName)
        const [filename, contractName] = key.split(':');
        
        // Initialize the file entry if it doesn't exist
        if (!contracts[filename]) {
          contracts[filename] = {};
        }
        
        // Parse the ABI
        const abi = JSON.parse(value.abi);
        
        // Add the contract to the result
        contracts[filename][contractName] = {
          abi,
          evm: {
            bytecode: {
              object: `0x${value.bin}`
            },
            deployedBytecode: {
              object: `0x${value['bin-runtime']}`
            }
          }
        };
      }
      
      res.json({
        success: true,
        compiled: {
          contracts
        }
      });
    } finally {
      // Clean up temporary directory
      try {
        await fs.remove(tempDir);
      } catch (cleanupError) {
        console.error('Error cleaning up temp directory:', cleanupError);
      }
    }
  } catch (error) {
    console.error('Compilation error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Compilation failed'
    });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Solidity compiler API server running on port ${PORT}`);
});

module.exports = app;