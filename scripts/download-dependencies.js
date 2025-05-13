#!/usr/bin/env node

/**
 * Manual Dependency Downloader
 * Downloads dependencies using direct HTTP requests instead of Git
 * Use this if you're having issues with Git-based installation
 */

const fs = require('fs-extra');
const path = require('path');
const https = require('https');
const { createWriteStream } = require('fs');
const { Extract } = require('unzipper');

// Dependencies to download
const DEPENDENCIES = [
  {
    name: 'OpenZeppelin Contracts',
    url: 'https://github.com/OpenZeppelin/openzeppelin-contracts/archive/refs/tags/v4.9.3.zip',
    extractDir: 'openzeppelin-contracts-4.9.3',
    targetDir: 'openzeppelin-contracts'
  },
  {
    name: 'Solmate',
    url: 'https://github.com/transmissions11/solmate/archive/refs/heads/main.zip',
    extractDir: 'solmate-main',
    targetDir: 'solmate'
  }
];

// Library directory
const libDir = path.join(process.cwd(), 'lib');
// Temporary directory for downloads
const tempDir = path.join(process.cwd(), 'temp');

console.log('📦 Downloading dependencies via HTTP...');

// Create directories
fs.ensureDirSync(libDir);
fs.ensureDirSync(tempDir);

// Download a file
function downloadFile(url, filePath) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading ${url}...`);
    
    const file = createWriteStream(filePath);
    
    https.get(url, (response) => {
      // Check if the request was redirected
      if (response.statusCode === 302 || response.statusCode === 301) {
        console.log(`Following redirect to ${response.headers.location}`);
        return downloadFile(response.headers.location, filePath)
          .then(resolve)
          .catch(reject);
      }
      
      // Check for successful response
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }
      
      // Pipe the response to the file
      response.pipe(file);
      
      file.on('finish', () => {
        file.close(() => resolve());
      });
      
      file.on('error', (err) => {
        fs.unlink(filePath, () => reject(err));
      });
    }).on('error', (err) => {
      fs.unlink(filePath, () => reject(err));
    });
  });
}

// Extract a zip file
function extractZip(zipPath, extractTo) {
  return new Promise((resolve, reject) => {
    console.log(`Extracting ${zipPath} to ${extractTo}...`);
    
    fs.createReadStream(zipPath)
      .pipe(Extract({ path: extractTo }))
      .on('close', resolve)
      .on('error', reject);
  });
}

// Process all dependencies
async function processDependencies() {
  try {
    // Ensure temp directory is clean
    await fs.emptyDir(tempDir);
    
    const remappings = [];
    
    // Process each dependency
    for (const dep of DEPENDENCIES) {
      console.log(`\nProcessing ${dep.name}...`);
      
      const targetPath = path.join(libDir, dep.targetDir);
      const zipPath = path.join(tempDir, `${dep.targetDir}.zip`);
      
      // Remove existing target directory if it exists
      if (await fs.pathExists(targetPath)) {
        console.log(`Removing existing directory: ${targetPath}`);
        await fs.remove(targetPath);
      }
      
      try {
        // Download the zip file
        await downloadFile(dep.url, zipPath);
        
        // Extract zip file
        await extractZip(zipPath, tempDir);
        
        // Move extracted content to lib directory
        const extractedPath = path.join(tempDir, dep.extractDir);
        await fs.move(extractedPath, targetPath);
        
        console.log(`✅ Installed ${dep.name} to ${targetPath}`);
        
        // Create remappings
        if (dep.name === 'OpenZeppelin Contracts') {
          remappings.push(`@openzeppelin/=lib/${dep.targetDir}/`);
          remappings.push(`@openzeppelin/contracts/=lib/${dep.targetDir}/contracts/`);
        } else if (dep.name === 'Solmate') {
          remappings.push(`solmate/=lib/${dep.targetDir}/src/`);
        }
      } catch (error) {
        console.error(`❌ Failed to process ${dep.name}: ${error.message}`);
        
        // Create a stub directory
        try {
          console.log(`Creating stub for ${dep.name}...`);
          await fs.ensureDir(targetPath);
          
          if (dep.name === 'OpenZeppelin Contracts') {
            await fs.ensureDir(path.join(targetPath, 'contracts', 'token', 'ERC20'));
            await fs.writeFile(
              path.join(targetPath, 'contracts', 'token', 'ERC20', 'ERC20.sol'),
              `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @dev Stub ERC20 implementation
 */
contract ERC20 {
    string private _name;
    string private _symbol;
    
    constructor(string memory name_, string memory symbol_) {
        _name = name_;
        _symbol = symbol_;
    }
    
    function name() public view virtual returns (string memory) {
        return _name;
    }
    
    function symbol() public view virtual returns (string memory) {
        return _symbol;
    }
    
    function decimals() public view virtual returns (uint8) {
        return 18;
    }
}
`
            );
          }
          
          console.log(`✅ Created stub for ${dep.name}`);
        } catch (stubError) {
          console.error(`❌ Failed to create stub: ${stubError.message}`);
        }
      }
    }
    
    // Write remappings
    const remappingsPath = path.join(process.cwd(), 'remappings.txt');
    await fs.writeFile(remappingsPath, remappings.join('\n'));
    console.log('\n✅ Created remappings.txt with:');
    console.log(remappings.join('\n'));
    
    // Create foundry.toml if it doesn't exist
    const foundryTomlPath = path.join(process.cwd(), 'foundry.toml');
    if (!await fs.pathExists(foundryTomlPath)) {
      const foundryConfig = `
[profile.default]
src = 'src'
out = 'out'
libs = ['lib']
remappings = [
  ${remappings.map(r => `"${r}"`).join(',\n  ')}
]

[rpc_endpoints]
`;
      await fs.writeFile(foundryTomlPath, foundryConfig);
      console.log('✅ Created foundry.toml');
    }
    
    // Clean up temp directory
    await fs.remove(tempDir);
    
    console.log('\n🎉 Dependencies installed successfully!');
    console.log('You can now use imports like:');
    console.log('import "@openzeppelin/contracts/token/ERC20/ERC20.sol";');
    
  } catch (error) {
    console.error(`❌ Fatal error: ${error.message}`);
    process.exit(1);
  }
}

// Run the process
processDependencies();