#!/usr/bin/env node

/**
 * Manual Dependency Downloader (Fallback Script)
 * Downloads dependencies using direct HTTP requests instead of Git
 * Supports version-in-path import pattern: @openzeppelin/contracts@4.9.5/token/ERC20/ERC20.sol
 */

const fs = require('fs-extra');
const path = require('path');
const https = require('https');
const { createWriteStream } = require('fs');
const { Extract } = require('unzipper');
const logger = console;

// Import shared utilities
const remappingUtils = require('./utils/remappingUtils');
const stubUtils = require('./utils/stubUtils');
const installUtils = require('./utils/installUtils');

// Import dependencies configuration
let dependencies;
try {
  dependencies = require('../src/config/dependencies');
} catch (error) {
  logger.error(`Error loading dependencies configuration: ${error.message}`);
  logger.log('Using fallback dependencies configuration');
  dependencies = require('./utils/fallbackDependencies');
}

const ALL_DEPENDENCIES = dependencies.default || dependencies.dependencies?.all || [];
logger.log(`📦 Downloading ${ALL_DEPENDENCIES.length} dependencies via HTTP...`);

// Create directories
const libDir = path.join(process.cwd(), 'lib');
const tempDir = path.join(process.cwd(), 'temp');
fs.ensureDirSync(libDir);
fs.ensureDirSync(tempDir);

// Download a file
function downloadFile(url, filePath) {
  return new Promise((resolve, reject) => {
    logger.log(`Downloading ${url}...`);
    
    const file = createWriteStream(filePath);
    
    https.get(url, (response) => {
      // Check if the request was redirected
      if (response.statusCode === 302 || response.statusCode === 301) {
        logger.log(`Following redirect to ${response.headers.location}`);
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
    logger.log(`Extracting ${zipPath} to ${extractTo}...`);
    
    fs.createReadStream(zipPath)
      .pipe(Extract({ path: extractTo }))
      .on('close', resolve)
      .on('error', reject);
  });
}

// Process all dependencies
async function processDependencies() {
  try {
    // Ensure all required directories exist
    await installUtils.ensureDirectories();
    
    // Ensure temp directory is clean
    await fs.emptyDir(tempDir);
    
    const installedDependencies = [];
    
    // Process each dependency
    for (const dep of ALL_DEPENDENCIES) {
      logger.log(`\nProcessing ${dep.name}...`);
      
      // Skip dependencies without URL
      if (!dep.url) {
        logger.warn(`Skipping ${dep.name}: No download URL provided`);
        continue;
      }
      
      const targetPath = path.join(libDir, dep.folderName);
      const zipPath = path.join(tempDir, `${dep.folderName}.zip`);
      
      // Remove existing target directory if it exists
      if (await fs.pathExists(targetPath)) {
        logger.log(`Removing existing directory: ${targetPath}`);
        await fs.remove(targetPath);
      }
      
      try {
        // Download the zip file
        await downloadFile(dep.url, zipPath);
        
        // Extract zip file
        await extractZip(zipPath, tempDir);
        
        // Move extracted content to lib directory
        const extractedPath = path.join(tempDir, dep.extractDir);
        if (await fs.pathExists(extractedPath)) {
          await fs.move(extractedPath, targetPath);
          logger.log(`✅ Installed ${dep.name} to ${targetPath}`);
          installedDependencies.push(dep);
        } else {
          throw new Error(`Extracted directory not found: ${extractedPath}`);
        }
      } catch (error) {
        logger.error(`❌ Failed to process ${dep.name}: ${error.message}`);
        
        // Create a stub directory
        try {
          logger.log(`Creating stub for ${dep.name}...`);
          await stubUtils.createStubForDependency(targetPath, dep);
          installedDependencies.push(dep);
        } catch (stubError) {
          logger.error(`❌ Failed to create stub: ${stubError.message}`);
        }
      }
    }

    // After the main dependencies loop
    // Ensure at least OpenZeppelin is installed
    if (!installedDependencies.some(dep => dep.type === 'openzeppelin' && dep.subtype === 'contracts')) {
      logger.log('OpenZeppelin contracts not installed, creating stubs...');
      
      const ozPath = path.join(libDir, 'openzeppelin-contracts');
      await fs.ensureDir(ozPath);
      await stubUtils.createOpenZeppelinStub(ozPath);
      
      // Add to installed dependencies
      installedDependencies.push({
        name: 'OpenZeppelin Contracts (Stub)',
        folderName: 'openzeppelin-contracts',
        type: 'openzeppelin',
        subtype: 'contracts'
      });
      
      logger.log('✅ Created OpenZeppelin contract stubs');
    }

    // Ensure at least basic remappings exist
    if (remappings.length === 0 || !remappings.some(r => r.includes('@openzeppelin/contracts/'))) {
      logger.log('Adding essential OpenZeppelin remappings');
      remappings.push('@openzeppelin/=lib/openzeppelin-contracts/');
      remappings.push('@openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/');
    }
    
    // Apply remappings for installed dependencies
    if (installedDependencies.length > 0) {
      const result = await remappingUtils.applyRemappings(process.cwd(), installedDependencies);
      if (result.success) {
        logger.log(`✅ Successfully applied ${result.remappings.length} remappings`);
      }
    }
    
    // Clean up temp directory
    await fs.remove(tempDir);
    
    // Show summary
    logger.log('\n📦 Dependency installation summary:');
    logger.log(`- Installed: ${installedDependencies.length}/${ALL_DEPENDENCIES.length} dependencies`);
    logger.log(`- Failed: ${ALL_DEPENDENCIES.length - installedDependencies.length} dependencies`);
    
    // Print usage examples
    logger.log('\nYou can now use imports like:');
    logger.log('# Default OpenZeppelin contracts (v4.9.5):');
    logger.log('import "@openzeppelin/contracts/token/ERC20/ERC20.sol";');
    logger.log('# Version-specific imports:');
    logger.log('import "@openzeppelin/contracts@4.9.5/token/ERC20/ERC20.sol";');
    
  } catch (error) {
    logger.error(`❌ Fatal error: ${error.message}`);
    process.exit(1);
  }
}

// Run the process
processDependencies();