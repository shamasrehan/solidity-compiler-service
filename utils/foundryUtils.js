const { execSync } = require('child_process');
const fs = require('fs-extra');
const path = require('path');

/**
 * Check if Foundry is properly installed
 * @returns {boolean} Whether Foundry is installed
 */
function checkFoundryInstallation() {
  try {
    const version = execSync('forge --version', { encoding: 'utf8' });
    console.log(`Foundry version: ${version.trim()}`);
    return true;
  } catch (error) {
    console.error('Foundry is not properly installed:', error.message);
    return false;
  }
}

/**
 * Check if a dependency is already installed
 * @param {string} contractDir - Directory of the contract
 * @param {string} dependency - Dependency to check
 * @returns {boolean} Whether the dependency is installed
 */
function checkDependencyInstalled(contractDir, dependency) {
  try {
    const libDir = path.join(contractDir, 'lib');
    if (!fs.existsSync(libDir)) return false;
    
    // Extract repository name from the dependency string
    let repoName;
    if (dependency.includes('@')) {
      repoName = dependency.split('@')[0].split('/').pop();
    } else {
      repoName = dependency.split('/').pop();
    }
    
    // Check if the directory exists
    return fs.existsSync(path.join(libDir, repoName));
  } catch (error) {
    console.error(`Error checking if dependency ${dependency} is installed:`, error.message);
    return false;
  }
}

/**
 * Clean up folders after compilation
 * @param {string} contractPath - Path to the contract directory
 */
function cleanupFolders(contractPath) {
  try {
    console.log(`Cleaning up folder: ${contractPath}`);
    fs.removeSync(contractPath);
    // Clean cache and other temporary files
    execSync('forge clean', { stdio: 'ignore' });
    console.log('Cleanup complete');
  } catch (error) {
    console.error('Error during cleanup:', error);
  }
}

/**
 * Create a foundry.toml configuration file
 * @param {string} contractDir - Contract directory
 * @param {string[]} dependencies - List of dependencies
 * @param {string} evmVersion - EVM version to use
 * @param {string} compilerVersion - Solidity compiler version
 */
function createFoundryConfig(contractDir, dependencies, evmVersion, compilerVersion) {
  // Create a foundry.toml config file in the contract directory
  let foundryConfig = `[profile.default]\n`;
  foundryConfig += `src = 'src'\n`;
  foundryConfig += `out = 'out'\n`;
  foundryConfig += `libs = ['lib']\n`;
  foundryConfig += `auto_detect_solc = true\n`;
  
  // Add remappings directly in foundry.toml
  foundryConfig += `remappings = [\n`;
  
  // Explicitly set remapping paths in the config
  if (dependencies.some(dep => dep.startsWith('OpenZeppelin/openzeppelin-contracts'))) {
    // More explicit remappings with proper path separators
    foundryConfig += `  '@openzeppelin/=lib/openzeppelin-contracts/',\n`;
    foundryConfig += `  '@openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/',\n`;
    
    // Add explicit remappings for common modules
    foundryConfig += `  '@openzeppelin/contracts/utils/=lib/openzeppelin-contracts/contracts/utils/',\n`;
    foundryConfig += `  '@openzeppelin/contracts/token/=lib/openzeppelin-contracts/contracts/token/',\n`;
    foundryConfig += `  '@openzeppelin/contracts/access/=lib/openzeppelin-contracts/contracts/access/',\n`;
    foundryConfig += `  '@openzeppelin/contracts/security/=lib/openzeppelin-contracts/contracts/security/',\n`;
  }
  
  // Track versioned dependencies to add specific remappings
  const versionedDeps = new Map();
  dependencies.forEach(dep => {
    if (dep.includes('@')) {
      const [repo, version] = dep.split('@');
      versionedDeps.set(repo, version);
    }
  });
  
  // Add standard remappings for OpenZeppelin contracts
  if (dependencies.some(dep => dep.startsWith('OpenZeppelin/openzeppelin-contracts-upgradeable'))) {
    foundryConfig += `  '@openzeppelin/contracts-upgradeable/=lib/openzeppelin-contracts-upgradeable/contracts/',\n`;
  }
  
  // Add remappings for other common libraries
  if (dependencies.some(dep => dep.startsWith('transmissions11/solmate'))) {
    foundryConfig += `  'solmate/=lib/solmate/src/',\n`;
  }
  
  if (dependencies.some(dep => dep.startsWith('vectorized/solady'))) {
    foundryConfig += `  'solady/=lib/solady/src/',\n`;
  }
  
  foundryConfig += `]\n`;
  
  if (evmVersion) {
    foundryConfig += `evm_version = "${evmVersion}"\n`;
  }
  
  if (compilerVersion) {
    foundryConfig += `solc_version = "${compilerVersion}"\n`;
  }
  
  fs.writeFileSync(path.join(contractDir, 'foundry.toml'), foundryConfig);
  console.log('foundry.toml config file created');
}

/**
 * Create remappings.txt file
 * @param {string} contractDir - Contract directory
 * @param {string[]} dependencies - List of dependencies
 */
function createRemappingsFile(contractDir, dependencies) {
  try {
    console.log('Creating manual remappings...');
    let remappingsContent = '';
    
    // Add common remappings for known libraries
    if (dependencies.some(dep => dep.startsWith('OpenZeppelin/openzeppelin-contracts'))) {
      // More explicit remappings to handle different import paths
      remappingsContent += '@openzeppelin/=lib/openzeppelin-contracts/\n';
      remappingsContent += '@openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/\n';
      
      // Add direct path remappings for common imports that might be causing issues
      remappingsContent += '@openzeppelin/contracts/utils/=lib/openzeppelin-contracts/contracts/utils/\n';
      remappingsContent += '@openzeppelin/contracts/token/=lib/openzeppelin-contracts/contracts/token/\n';
      remappingsContent += '@openzeppelin/contracts/access/=lib/openzeppelin-contracts/contracts/access/\n';
      remappingsContent += '@openzeppelin/contracts/security/=lib/openzeppelin-contracts/contracts/security/\n';
      
      // Also ensure absolute paths are correctly mapped
      const absoluteContractPath = path.resolve(contractDir, 'lib/openzeppelin-contracts/contracts');
      remappingsContent += `@openzeppelin/contracts/=${absoluteContractPath}/\n`;
      
      // Ensure the lib directory exists
      if (fs.existsSync(path.join(contractDir, 'lib/openzeppelin-contracts'))) {
        console.log('OpenZeppelin contracts found in lib directory');
      } else {
        console.log('Creating directory structure for OpenZeppelin...');
        // Try to create a directory structure for OpenZeppelin manually
        fs.ensureDirSync(path.join(contractDir, 'lib/openzeppelin-contracts/contracts'));
      }
    }
    
    if (dependencies.some(dep => dep.startsWith('OpenZeppelin/openzeppelin-contracts-upgradeable'))) {
      remappingsContent += '@openzeppelin/contracts-upgradeable/=lib/openzeppelin-contracts-upgradeable/contracts/\n';
    }
    
    // Add common remappings for other popular libraries
    if (dependencies.some(dep => dep.startsWith('transmissions11/solmate'))) {
      remappingsContent += 'solmate/=lib/solmate/src/\n';
    }
    
    if (dependencies.some(dep => dep.startsWith('vectorized/solady'))) {
      remappingsContent += 'solady/=lib/solady/src/\n';
    }
    
    // Add any other remappings from forge
    try {
      const forgeRemappings = execSync('forge remappings', { 
        cwd: contractDir,
        encoding: 'utf8',
        stdio: 'pipe'
      });
      
      remappingsContent += forgeRemappings;
    } catch (error) {
      console.warn('Failed to get forge remappings:', error.message);
    }
    
    // Write the remappings file
    const remappingsPath = path.join(contractDir, 'remappings.txt');
    fs.writeFileSync(remappingsPath, remappingsContent);
    console.log(`Remappings file created at ${remappingsPath}`);
    console.log('Remappings content:', remappingsContent);
    
    return remappingsContent;
  } catch (error) {
    console.warn('Failed to create remappings:', error.message);
    return '';
  }
}

/**
 * Verify and fix dependency installation
 * @param {string} contractDir - Contract directory
 * @param {string[]} dependencies - List of dependencies
 */
function verifyDependencyInstallation(contractDir, dependencies) {
  try {
    console.log('Verifying dependency installation...');
    
    // Check if key OpenZeppelin files exist
    if (dependencies.some(dep => dep.startsWith('OpenZeppelin/openzeppelin-contracts'))) {
      const contractsDir = path.join(contractDir, 'lib/openzeppelin-contracts/contracts');
      const utilsDir = path.join(contractsDir, 'utils');
      const tokenDir = path.join(contractsDir, 'token');
      const accessDir = path.join(contractsDir, 'access');
      
      if (!fs.existsSync(contractsDir)) {
        console.error('OpenZeppelin contracts directory not found');
        // Try to recreate the directory structure
        fs.ensureDirSync(contractsDir);
        fs.ensureDirSync(utilsDir);
        fs.ensureDirSync(tokenDir);
        fs.ensureDirSync(accessDir);
        
        console.log('Created OpenZeppelin directory structure, but files may be missing');
        return false;
      }
      
      // Check specific files that might be commonly imported
      const criticalFiles = [
        path.join(utilsDir, 'Counters.sol'),
        path.join(tokenDir, 'ERC20/ERC20.sol'),
        path.join(tokenDir, 'ERC721/extensions/ERC721URIStorage.sol'),
        path.join(accessDir, 'Ownable.sol')
      ];
      
      for (const file of criticalFiles) {
        if (!fs.existsSync(file)) {
          console.warn(`Critical file missing: ${file}`);
        }
      }
    }
    
    return true;
  } catch (error) {
    console.error('Error verifying dependencies:', error.message);
    return false;
  }
}

module.exports = {
  checkFoundryInstallation,
  checkDependencyInstalled,
  cleanupFolders,
  createFoundryConfig,
  createRemappingsFile,
  verifyDependencyInstallation
};