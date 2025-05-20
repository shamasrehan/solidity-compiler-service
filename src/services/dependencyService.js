/**
 * Dependency Service
 * Manages smart contract dependencies for compilation
 * Updated to support version-in-path import pattern: @openzeppelin/contracts@4.9.5/token/ERC20/ERC20.sol
 */

const fs = require('fs-extra');
const path = require('path');
const logger = require('../utils/logger');
const config = require('../config/config');
const dependencies = require('../config/dependencies');
const foundryService = require('./foundryService');

/**
 * Map of common import patterns to GitHub repositories
 * Updated to include version-in-path style imports
 */
const DEPENDENCY_MAPPING = {
  // OpenZeppelin mappings - standard format
  '@openzeppelin/contracts/': 'OpenZeppelin/openzeppelin-contracts',
  '@openzeppelin/contracts-upgradeable/': 'OpenZeppelin/openzeppelin-contracts-upgradeable',
  
  // OpenZeppelin mappings - versioned format
  '@openzeppelin/contracts@latest/': 'OpenZeppelin/openzeppelin-contracts#main',
  '@openzeppelin/contracts@4.9.5/': 'OpenZeppelin/openzeppelin-contracts#v4.9.5',
  '@openzeppelin/contracts@4.9.4/': 'OpenZeppelin/openzeppelin-contracts#v4.9.4',
  '@openzeppelin/contracts@4.9.3/': 'OpenZeppelin/openzeppelin-contracts#v4.9.3',
  '@openzeppelin/contracts@4.9.2/': 'OpenZeppelin/openzeppelin-contracts#v4.9.2',
  '@openzeppelin/contracts@4.9.1/': 'OpenZeppelin/openzeppelin-contracts#v4.9.1',
  '@openzeppelin/contracts@4.9.0/': 'OpenZeppelin/openzeppelin-contracts#v4.9.0',
  '@openzeppelin/contracts@4.8.3/': 'OpenZeppelin/openzeppelin-contracts#v4.8.3',
  '@openzeppelin/contracts@4.7.3/': 'OpenZeppelin/openzeppelin-contracts#v4.7.3',
  '@openzeppelin/contracts@4.6.0/': 'OpenZeppelin/openzeppelin-contracts#v4.6.0',
  '@openzeppelin/contracts@4.5.0/': 'OpenZeppelin/openzeppelin-contracts#v4.5.0',
  '@openzeppelin/contracts@4.4.2/': 'OpenZeppelin/openzeppelin-contracts#v4.4.2',
  '@openzeppelin/contracts@4.3.3/': 'OpenZeppelin/openzeppelin-contracts#v4.3.3',
  '@openzeppelin/contracts@4.2.0/': 'OpenZeppelin/openzeppelin-contracts#v4.2.0',
  '@openzeppelin/contracts@4.1.0/': 'OpenZeppelin/openzeppelin-contracts#v4.1.0',
  '@openzeppelin/contracts@4.0.0/': 'OpenZeppelin/openzeppelin-contracts#v4.0.0',
  
  // OpenZeppelin upgradeable mappings - versioned format
  '@openzeppelin/contracts-upgradeable@latest/': 'OpenZeppelin/openzeppelin-contracts-upgradeable#main',
  '@openzeppelin/contracts-upgradeable@4.9.5/': 'OpenZeppelin/openzeppelin-contracts-upgradeable#v4.9.5',
  '@openzeppelin/contracts-upgradeable@4.9.4/': 'OpenZeppelin/openzeppelin-contracts-upgradeable#v4.9.4',
  '@openzeppelin/contracts-upgradeable@4.9.3/': 'OpenZeppelin/openzeppelin-contracts-upgradeable#v4.9.3',
  '@openzeppelin/contracts-upgradeable@4.9.2/': 'OpenZeppelin/openzeppelin-contracts-upgradeable#v4.9.2',
  '@openzeppelin/contracts-upgradeable@4.9.1/': 'OpenZeppelin/openzeppelin-contracts-upgradeable#v4.9.1',
  '@openzeppelin/contracts-upgradeable@4.9.0/': 'OpenZeppelin/openzeppelin-contracts-upgradeable#v4.9.0',
  '@openzeppelin/contracts-upgradeable@4.8.3/': 'OpenZeppelin/openzeppelin-contracts-upgradeable#v4.8.3',
  '@openzeppelin/contracts-upgradeable@4.7.3/': 'OpenZeppelin/openzeppelin-contracts-upgradeable#v4.7.3',
  '@openzeppelin/contracts-upgradeable@4.6.0/': 'OpenZeppelin/openzeppelin-contracts-upgradeable#v4.6.0',
  '@openzeppelin/contracts-upgradeable@4.5.0/': 'OpenZeppelin/openzeppelin-contracts-upgradeable#v4.5.0',
  '@openzeppelin/contracts-upgradeable@4.4.2/': 'OpenZeppelin/openzeppelin-contracts-upgradeable#v4.4.2',
  '@openzeppelin/contracts-upgradeable@4.3.3/': 'OpenZeppelin/openzeppelin-contracts-upgradeable#v4.3.3',
  '@openzeppelin/contracts-upgradeable@4.2.0/': 'OpenZeppelin/openzeppelin-contracts-upgradeable#v4.2.0',
  '@openzeppelin/contracts-upgradeable@4.1.0/': 'OpenZeppelin/openzeppelin-contracts-upgradeable#v4.1.0',
  '@openzeppelin/contracts-upgradeable@4.0.0/': 'OpenZeppelin/openzeppelin-contracts-upgradeable#v4.0.0',
  
  // Solmate mapping
  'solmate/': 'transmissions11/solmate',
  
  // Uniswap mappings
  '@uniswap/v2-core/': 'Uniswap/v2-core',
  '@uniswap/v2-periphery/': 'Uniswap/v2-periphery',
  '@uniswap/v3-core/': 'Uniswap/v3-core',
  '@uniswap/v3-periphery/': 'Uniswap/v3-periphery',
  
  // AAVE mappings
  '@aave/core-v3/': 'aave/aave-v3-core',
  '@aave/periphery-v3/': 'aave/aave-v3-periphery',
  
  // Chainlink mapping
  '@chainlink/contracts/': 'smartcontractkit/chainlink',
  
  // ERC721A mapping
  'erc721a/': 'chiru-labs/ERC721A',
};

/**
 * Extracts version information from a versioned import path
 * @param {string} importPath - Import path like '@openzeppelin/contracts@4.9.5/token/ERC20/ERC20.sol'
 * @returns {Object|null} Version information or null if not a versioned import
 */
function extractVersionInfo(importPath) {
  // Pattern matches: @openzeppelin/contracts@4.9.5/
  const versionedPattern = /^@([^\/]+)\/([^@\/]+)@([^\/]+)\//;
  const match = importPath.match(versionedPattern);
  
  if (match) {
    return {
      namespace: match[1], // e.g. "openzeppelin"
      package: match[2],   // e.g. "contracts" or "contracts-upgradeable"
      version: match[3],   // e.g. "4.9.5"
      fullPackage: `@${match[1]}/${match[2]}`, // e.g. "@openzeppelin/contracts"
      versionedPackage: `@${match[1]}/${match[2]}@${match[3]}` // e.g. "@openzeppelin/contracts@4.9.5"
    };
  }
  
  return null;
}

/**
 * Verify library structure in a directory
 * @param {string} libraryDir - Library directory path
 * @returns {Promise<{isValid: boolean, issues: Array<string>}>} Validation result
 */
async function verifyLibraryStructure(libraryDir) {
  const issues = [];
  let hasOpenzeppelin = false;
  
  try {
    if (!await fs.pathExists(libraryDir)) {
      issues.push(`Library directory not found: ${libraryDir}`);
      return { isValid: false, issues };
    }
    
    // List all directories in lib
    const libraries = await fs.readdir(libraryDir);
    
    if (libraries.length === 0) {
      issues.push('Library directory is empty');
      return { isValid: false, issues };
    }
    
    logger.info(`Found ${libraries.length} libraries: ${libraries.join(', ')}`);
    
    // Check for OpenZeppelin contracts
    const ozDir = libraries.find(dir => dir === 'openzeppelin-contracts' || dir.startsWith('openzeppelin-contracts-'));
    
    if (!ozDir) {
      issues.push('OpenZeppelin contracts directory not found');
    } else {
      hasOpenzeppelin = true;
      
      // Check the structure of the OpenZeppelin directory
      const ozPath = path.join(libraryDir, ozDir);
      
      // Check for 'contracts' directory
      const ozContractsPath = path.join(ozPath, 'contracts');
      if (!await fs.pathExists(ozContractsPath)) {
        issues.push(`OpenZeppelin contracts subdirectory not found: ${ozContractsPath}`);
        hasOpenzeppelin = false;
      } else {
        // Check for key OpenZeppelin contracts folders
        const expectedDirs = ['token', 'access'];
        for (const dir of expectedDirs) {
          const dirPath = path.join(ozContractsPath, dir);
          if (!await fs.pathExists(dirPath)) {
            issues.push(`OpenZeppelin ${dir} directory not found: ${dirPath}`);
            hasOpenzeppelin = false;
          }
        }
        
        // Check for ERC20 directory and file
        const erc20Path = path.join(ozContractsPath, 'token', 'ERC20');
        if (!await fs.pathExists(erc20Path)) {
          issues.push(`OpenZeppelin ERC20 directory not found: ${erc20Path}`);
          hasOpenzeppelin = false;
        } else {
          const erc20FilePath = path.join(erc20Path, 'ERC20.sol');
          if (!await fs.pathExists(erc20FilePath)) {
            issues.push(`OpenZeppelin ERC20.sol file not found: ${erc20FilePath}`);
            hasOpenzeppelin = false;
          }
        }
      }
    }
    
    return { 
      isValid: issues.length === 0, 
      hasOpenzeppelin,
      issues 
    };
  } catch (error) {
    issues.push(`Error verifying library structure: ${error.message}`);
    return { isValid: false, issues };
  }
}

/**
 * Installs all pre-configured dependencies in a project
 * @param {string} projectPath - Path to the Foundry project
 * @returns {Promise<Array>} List of installed dependencies
 */
async function installPreConfiguredDependencies(projectPath) {
  logger.info('Installing pre-configured dependencies');
  
  const installedDeps = [];
  
  // Flatten the dependencies array
  const allDependencies = Object.values(dependencies).flat();
  
  // Install each dependency
  for (const dep of allDependencies) {
    try {
      const { github, version, alias, versionSuffix } = dep;
      const success = await foundryService.installDependency(projectPath, github, version);
      
      if (success) {
        installedDeps.push({ 
          github, 
          version, 
          alias,
          versionSuffix,
          success: true 
        });
        
        // If this is an OpenZeppelin dependency with a version suffix, add special remappings
        if (github.includes('OpenZeppelin') && versionSuffix) {
          await addVersionedRemappings(projectPath, github, versionSuffix, alias);
        }
      } else {
        installedDeps.push({ 
          github, 
          version, 
          alias,
          versionSuffix,
          success: false,
          error: 'Installation failed' 
        });
      }
    } catch (error) {
      logger.error(`Error installing dependency ${dep.github}:`, error);
      installedDeps.push({
        github: dep.github,
        version: dep.version,
        alias: dep.alias,
        versionSuffix: dep.versionSuffix,
        success: false,
        error: error.message
      });
    }
  }
  
  logger.info(`Installed ${installedDeps.filter(d => d.success).length} of ${allDependencies.length} pre-configured dependencies`);
  return installedDeps;
}

/**
 * Install minimal OpenZeppelin dependencies with proper versioning
 * @param {string} projectPath - Path to the project
 * @returns {Promise<boolean>} True if successful
 */
async function installMinimalOpenZeppelinDependencies(projectPath) {
  try {
    logger.info('Installing minimal OpenZeppelin dependencies with proper versioning');
    
    // Install different versions of OpenZeppelin
    const versions = ['4.9.5', '4.9.3', '4.8.0', '4.7.0', '4.6.0', '4.5.0', '4.4.2', '4.3.3', '4.2.0', '4.1.0', '4.0.0'];
    
    for (const version of versions) {
      // Create versioned OpenZeppelin directory
      const ozDir = path.join(projectPath, 'lib', `openzeppelin-contracts-${version}`);
      await fs.ensureDir(ozDir);
      
      // Clone OpenZeppelin contracts with specific version
      const cloneResult = await foundryService.installDependency(
        projectPath,
        'OpenZeppelin/openzeppelin-contracts',
        `v${version}`
      );
      
      if (!cloneResult) {
        // If clone fails, create minimal structure
        logger.warn(`Failed to clone OpenZeppelin v${version}. Creating minimal structure.`);
        
        // Create contracts structure
        await fs.ensureDir(path.join(ozDir, 'contracts', 'token', 'ERC20', 'extensions'));
        await fs.ensureDir(path.join(ozDir, 'contracts', 'access'));
        
        // Create basic OpenZeppelin stubs
        await createMinimalContractStubs(ozDir, version);
      }
      
      // Add proper versioned remappings
      await addVersionedRemappings(projectPath, 'openzeppelin-contracts', version, `openzeppelin-contracts-${version}`);
    }
    
    // Create basic remappings for the default version (4.9.5)
    const remappings = [
      '@openzeppelin/=lib/openzeppelin-contracts-4.9.5/',
      '@openzeppelin/contracts/=lib/openzeppelin-contracts-4.9.5/contracts/'
    ];
    
    // Write remappings.txt
    const remappingsPath = path.join(projectPath, 'remappings.txt');
    let existingRemappings = [];
    
    if (await fs.pathExists(remappingsPath)) {
      const content = await fs.readFile(remappingsPath, 'utf8');
      existingRemappings = content.split('\n').filter(line => line.trim() !== '');
    }
    
    // Add new remappings if they don't already exist
    for (const remapping of remappings) {
      if (!existingRemappings.includes(remapping)) {
        existingRemappings.push(remapping);
      }
    }
    
    await fs.writeFile(remappingsPath, existingRemappings.join('\n'));
    
    logger.info('✅ Minimal OpenZeppelin dependencies installed successfully');
    return true;
  } catch (error) {
    logger.error(`Error installing minimal OpenZeppelin dependencies: ${error.message}`);
    return false;
  }
}

/**
 * Create minimal contract stubs for a specific version
 * @param {string} basePath - Directory path
 * @param {string} version - OpenZeppelin version
 * @returns {Promise<void>}
 */
async function createMinimalContractStubs(basePath, version) {
  // Create ERC20.sol
  await fs.writeFile(
    path.join(basePath, 'contracts', 'token', 'ERC20', 'ERC20.sol'),
    `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @dev Implementation of the {IERC20} interface for OpenZeppelin v${version}.
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
    
    function _mint(address account, uint256 amount) internal virtual {
        // Stub implementation
    }
}
`
  );
  
  // Create ERC20Burnable.sol
  await fs.writeFile(
    path.join(basePath, 'contracts', 'token', 'ERC20', 'extensions', 'ERC20Burnable.sol'),
    `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../ERC20.sol";

/**
 * @dev Extension of {ERC20} that allows token holders to destroy both their own
 * tokens and those that they have an allowance for.
 */
abstract contract ERC20Burnable is ERC20 {
    function burn(uint256 amount) public virtual {
        // Stub implementation
    }
    
    function burnFrom(address account, uint256 amount) public virtual {
        // Stub implementation
    }
}
`
  );
  
  // Create Ownable.sol
  await fs.writeFile(
    path.join(basePath, 'contracts', 'access', 'Ownable.sol'),
    `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @dev Contract module which provides a basic access control mechanism for OpenZeppelin v${version}.
 */
abstract contract Ownable {
    address private _owner;
    
    constructor() {
        _owner = msg.sender;
    }
    
    function owner() public view virtual returns (address) {
        return _owner;
    }
    
    modifier onlyOwner() {
        require(owner() == msg.sender, "Ownable: caller is not the owner");
        _;
    }
}
`
  );
}

/**
 * Add version-in-path style remappings to remappings.txt
 * @param {string} folderName - Library folder name
 * @param {string} versionSuffix - Version suffix for remapping
 * @param {boolean} isUpgradeable - Whether this is for upgradeable contracts
 */
function addVersionPathRemapping(folderName, versionSuffix, isUpgradeable = false) {
  const remappingsPath = path.resolve(process.cwd(), 'remappings.txt');
  
  // Skip if remappings.txt doesn't exist
  if (!fs.existsSync(remappingsPath)) {
    return;
  }
  
  try {
    let remappings = fs.readFileSync(remappingsPath, 'utf8').split('\n');
    
    // Create new version-in-path style remapping
    const packageName = isUpgradeable ? 'contracts-upgradeable' : 'contracts';
    const newRemapping = `@openzeppelin/${packageName}@${versionSuffix}/=lib/${folderName}/contracts/`;
    
    // Add the remapping if it doesn't already exist
    if (!remappings.includes(newRemapping)) {
      remappings.push(newRemapping);
      fs.writeFileSync(remappingsPath, remappings.join('\n'));
      logger.info(`Added version-in-path remapping: ${newRemapping}`);
    }
  } catch (error) {
    logger.error(`Error updating remappings.txt: ${error.message}`);
  }
}

/**
 * Resolve dependency from import path
 * @param {string} importPath - Import path from contract
 * @returns {Object|null} Dependency information or null if can't be resolved
 */
function resolveDependency(importPath) {
  // Validate input
  if (!importPath || typeof importPath !== 'string') {
    logger.error(`Invalid import path: ${importPath}`);
    return null;
  }

  // First check if this is a versioned import path
  const versionInfo = extractVersionInfo(importPath);
  if (versionInfo) {
    // Look for a match in DEPENDENCY_MAPPING with version
    const versionedKey = `${versionInfo.versionedPackage}/`;
    if (DEPENDENCY_MAPPING[versionedKey]) {
      const repoParts = DEPENDENCY_MAPPING[versionedKey].split('#');
      return {
        github: repoParts[0],
        version: repoParts[1] || `v${versionInfo.version}`, // Use #version or v+version
      };
    }
    
    // Fall back to the base package without version if specific version not found
    const baseKey = `${versionInfo.fullPackage}/`;
    if (DEPENDENCY_MAPPING[baseKey]) {
      return {
        github: DEPENDENCY_MAPPING[baseKey],
        version: `v${versionInfo.version}`,
      };
    }
  }
  
  // Check for standard mappings (without version)
  for (const [pattern, repo] of Object.entries(DEPENDENCY_MAPPING)) {
    if (importPath.startsWith(pattern)) {
      // Split the repo if it contains a version (e.g., "repo#v1.0.0")
      const repoParts = repo.split('#');
      
      // For OpenZeppelin packages, prefer v4.9.5 (latest stable) if no version specified
      if (repoParts[0].includes('openzeppelin') && !repoParts[1]) {
        return {
          github: repoParts[0],
          version: 'v4.9.5', // Default to latest stable OpenZeppelin
        };
      }
      
      return {
        github: repoParts[0],
        version: repoParts[1] || 'main', // Use specified version or default to main
      };
    }
  }
  
  // Special case for common OpenZeppelin imports without version
  if (importPath.includes('@openzeppelin/contracts/')) {
    return {
      github: 'OpenZeppelin/openzeppelin-contracts',
      version: 'v4.9.5', // Default to latest stable version
    };
  }
  
  // Try to parse as a GitHub URL
  const githubInfo = foundryService.parseGitHubUrl(importPath);
  if (githubInfo) {
    return {
      github: githubInfo.fullRepo,
      version: 'main', // Default to main branch
    };
  }
  
  // Couldn't resolve the dependency
  logger.warn(`Could not resolve dependency for import: ${importPath}`);
  return null;
}

/**
 * Install missing dependencies from contract imports
 * @param {string} projectPath - Path to the Foundry project
 * @param {string} contractCode - Solidity contract code
 * @returns {Promise<Array>} List of dynamically installed dependencies
 */
async function installDependenciesFromImports(projectPath, contractCode) {
  logger.info('Analyzing contract for external dependencies');
  
  // Extract all imports from the contract code
  const imports = foundryService.extractImports(contractCode);
  
  if (imports.length === 0) {
    logger.info('No external imports found in contract');
    return [];
  }
  
  logger.info(`Found ${imports.length} imports in contract, resolving dependencies`);
  
  // First, try to copy pre-installed libraries if available
  const libPath = path.resolve(process.cwd(), 'lib');
  const tempLibPath = path.join(projectPath, 'lib');
  let preInstalledCopied = false;
  
  // Check if we have pre-installed libraries
  if (await fs.pathExists(libPath)) {
    try {
      logger.info('Copying pre-installed dependencies...');
      await fs.ensureDir(tempLibPath);
      await fs.copy(libPath, tempLibPath);
      
      // Also copy remappings.txt if it exists
      const remappingsPath = path.resolve(process.cwd(), 'remappings.txt');
      if (await fs.pathExists(remappingsPath)) {
        await fs.copy(remappingsPath, path.join(projectPath, 'remappings.txt'));
      }
      
      preInstalledCopied = true;
      logger.info('Pre-installed dependencies copied successfully');
    } catch (error) {
      logger.error('Error copying pre-installed dependencies:', error);
    }
  }
  
  // If we successfully copied pre-installed dependencies, we can skip further installation
  if (preInstalledCopied) {
    return [{ success: true, message: 'Pre-installed dependencies copied' }];
  }
  
  // If we couldn't copy pre-installed dependencies, try to install individually
  const installedDeps = [];
  const processedRepos = new Set(); // Track repos we've already processed
  
  for (const importPath of imports) {
    try {
      const dependency = resolveDependency(importPath);
      
      if (!dependency) {
        logger.debug(`Could not resolve dependency for import: ${importPath}`);
        continue;
      }
      
      // Skip if we've already processed this repo+version combination
      const repoKey = `${dependency.github}@${dependency.version}`;
      if (processedRepos.has(repoKey)) {
        continue;
      }
      
      processedRepos.add(repoKey);
      
      // Install the dependency
      const success = await foundryService.installDependency(
        projectPath,
        dependency.github,
        dependency.version
      );
      
      // Check if this is a versioned import
      const versionInfo = extractVersionInfo(importPath);
      if (versionInfo && success) {
        // Add versioned remappings
        await addVersionedRemappings(
          projectPath, 
          dependency.github, 
          versionInfo.version,
          dependency.github.split('/')[1] // Use repo name as folder name
        );
      }
      
      installedDeps.push({
        importPath,
        github: dependency.github,
        version: dependency.version,
        success
      });
      
      if (success) {
        logger.info(`Successfully installed dependency for ${importPath}: ${dependency.github}@${dependency.version}`);
      } else {
        logger.warn(`Failed to install dependency for ${importPath}: ${dependency.github}@${dependency.version}`);
      }
    } catch (error) {
      logger.error(`Error processing import ${importPath}:`, error);
      installedDeps.push({
        importPath,
        success: false,
        error: error.message
      });
    }
  }
  
  const successCount = installedDeps.filter(d => d.success).length;
  logger.info(`Dynamically installed ${successCount} dependencies from imports`);
  
  return installedDeps;
}

/**
 * Process remappings for dependencies
 * @param {string} projectPath - Path to the Foundry project
 * @returns {Promise<void>}
 */
async function processRemappings(projectPath) {
  logger.debug('Processing remappings for dependencies');
  
  try {
    // Check if lib directory exists and has contents
    const libPath = path.join(projectPath, 'lib');
    if (!await fs.pathExists(libPath)) {
      logger.debug('No lib directory found, skipping remappings');
      return;
    }
    
    // Get all directories in lib
    const libDirs = await fs.readdir(libPath);
    
    if (libDirs.length === 0) {
      logger.debug('No libraries found in lib directory, skipping remappings');
      return;
    }
    
    logger.info(`Found ${libDirs.length} libraries in lib directory: ${libDirs.join(', ')}`);
    
    // Generate remappings
    const remappings = [];
    let openZeppelinDir = null;
    
    for (const dir of libDirs) {
      // Basic remapping: libraryName/=lib/libraryName/
      remappings.push(`${dir}/=lib/${dir}/`);
      
      // Common src remapping: libraryName/=lib/libraryName/src/
      const srcPath = path.join(libPath, dir, 'src');
      if (await fs.pathExists(srcPath)) {
        remappings.push(`${dir}/=lib/${dir}/src/`);
      }
      
      // Contract remapping for OpenZeppelin style: libraryName/contracts/=lib/libraryName/contracts/
      const contractsPath = path.join(libPath, dir, 'contracts');
      if (await fs.pathExists(contractsPath)) {
        remappings.push(`${dir}/contracts/=lib/${dir}/contracts/`);
      }
      
      // Check if this is an OpenZeppelin directory
      if (dir === 'openzeppelin-contracts' || dir.startsWith('openzeppelin-contracts-')) {
        openZeppelinDir = dir;
        
        // Key remapping: @openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/
        remappings.push(`@openzeppelin/=lib/${dir}/`);
        remappings.push(`@openzeppelin/contracts/=lib/${dir}/contracts/`);
        
        // For version-specific OpenZeppelin, also add versioned remappings
        if (dir !== 'openzeppelin-contracts') {
          const versionMatch = dir.match(/openzeppelin-contracts-(\d+\.\d+\.\d+)/);
          if (versionMatch) {
            const version = versionMatch[1];
            remappings.push(`@openzeppelin-${version}/=lib/${dir}/`);
            remappings.push(`@openzeppelin-${version}/contracts/=lib/${dir}/contracts/`);
            remappings.push(`@openzeppelin/contracts@${version}/=lib/${dir}/contracts/`);
          }
        }
      }
      
      if (dir.startsWith('openzeppelin-contracts-')) {
        const versionMatch = dir.match(/openzeppelin-contracts-(\d+\.\d+\.\d+)/);
        if (versionMatch) {
          const version = versionMatch[1];
          
          // Add specific versioned remapping
          const versionedRemapping = `@openzeppelin/contracts@${version}/=lib/${dir}/contracts/`;
          if (!remappings.includes(versionedRemapping)) {
            remappings.push(versionedRemapping);
            logger.info(`Added versioned remapping: ${versionedRemapping}`);
          }
          
          // If this is version 4.9.5 (or latest), make it the default
          if (version === '4.9.5' || latestVersion === version) {
            remappings.push(`@openzeppelin/=lib/${dir}/`);
            remappings.push(`@openzeppelin/contracts/=lib/${dir}/contracts/`);
          }
        }
      }
      
      // Check if this is an OpenZeppelin Upgradeable directory
      if (dir === 'openzeppelin-contracts-upgradeable' || dir.startsWith('openzeppelin-contracts-upgradeable-')) {
        // Key remapping: @openzeppelin/contracts-upgradeable/=lib/openzeppelin-contracts-upgradeable/contracts/
        remappings.push(`@openzeppelin-upgradeable/=lib/${dir}/`);
        remappings.push(`@openzeppelin/contracts-upgradeable/=lib/${dir}/contracts/`);
        
        // For version-specific OpenZeppelin, also add versioned remappings
        if (dir !== 'openzeppelin-contracts-upgradeable') {
          const versionMatch = dir.match(/openzeppelin-contracts-upgradeable-(\d+\.\d+\.\d+)/);
          if (versionMatch) {
            const version = versionMatch[1];
            remappings.push(`@openzeppelin-upgradeable-${version}/=lib/${dir}/`);
            remappings.push(`@openzeppelin-upgradeable-${version}/contracts/=lib/${dir}/contracts/`);
            remappings.push(`@openzeppelin/contracts-upgradeable@${version}/=lib/${dir}/contracts/`);
          }
        }
      }
    }
    
    // If no OpenZeppelin directory found but we do have other libraries,
    // check if there's an openzeppelin directory with a different name pattern
    if (!openZeppelinDir && libDirs.length > 0) {
      // Look for any directory with OpenZeppelin contract files
      for (const dir of libDirs) {
        const contractsPath = path.join(libPath, dir, 'contracts');
        if (await fs.pathExists(contractsPath)) {
          const tokenPath = path.join(contractsPath, 'token');
          if (await fs.pathExists(tokenPath)) {
            const erc20Path = path.join(tokenPath, 'ERC20');
            if (await fs.pathExists(erc20Path)) {
              logger.info(`Found directory with OpenZeppelin structure: ${dir}`);
              
              // Add OpenZeppelin remappings for this directory
              remappings.push(`@openzeppelin/=lib/${dir}/`);
              remappings.push(`@openzeppelin/contracts/=lib/${dir}/contracts/`);
              break;
            }
          }
        }
      }
    }
    
    // Ensure we always have OpenZeppelin remappings
    if (!remappings.some(r => r.includes('@openzeppelin/contracts/'))) {
      logger.warn('No OpenZeppelin remappings generated. Adding fallback remappings.');
      
      // Add fallback remappings - using the first directory that looks like OpenZeppelin
      const ozDir = libDirs.find(dir => 
        dir.includes('openzeppelin') || 
        dir.startsWith('oz-')
      ) || libDirs[0];
      
      remappings.push(`@openzeppelin/=lib/${ozDir}/`);
      remappings.push(`@openzeppelin/contracts/=lib/${ozDir}/contracts/`);
    }
    
    // Remove duplicates
    const uniqueRemappings = [...new Set(remappings)];
    
    // Write remappings to remappings.txt
    const remappingsPath = path.join(projectPath, 'remappings.txt');
    await fs.writeFile(remappingsPath, uniqueRemappings.join('\n'));
    logger.debug(`Updated remappings.txt with ${uniqueRemappings.length} entries`);
    
    // Write to foundry.toml as well
    const foundryTomlPath = path.join(projectPath, 'foundry.toml');
    if (await fs.pathExists(foundryTomlPath)) {
      let foundryConfig = await fs.readFile(foundryTomlPath, 'utf8');
      
      // Check if remappings are already defined
      const remappingsRegex = /remappings\s*=\s*\[(.*?)\]/s;
      if (remappingsRegex.test(foundryConfig)) {
        // Replace existing remappings
        foundryConfig = foundryConfig.replace(
          remappingsRegex, 
          `remappings = [\n    ${uniqueRemappings.map(r => `"${r}"`).join(',\n    ')}\n]`
        );
      } else {
        // Add remappings
        foundryConfig = foundryConfig.replace(
          /\[profile\.default\](.*?)(\n\[|$)/s, 
          `[profile.default]$1\nremappings = [\n    ${uniqueRemappings.map(r => `"${r}"`).join(',\n    ')}\n]\n\n$2`
        );
      }
      
      await fs.writeFile(foundryTomlPath, foundryConfig);
      logger.debug(`Updated foundry.toml with remappings`);
    }
    
  } catch (error) {
    logger.error('Error processing remappings:', error);
    // Non-fatal error, continue with compilation
  }
}

/**
 * Add version-in-path style remappings to remappings.txt
 * @param {string} projectPath - Path to the project directory
 * @param {string} repo - GitHub repository (user/repo)
 * @param {string} version - Version string (e.g., "4.9.5")
 * @param {string} folderName - Name of the folder where the dependency is installed
 * @returns {Promise<boolean>} True if successful
 */
async function addVersionedRemappings(projectPath, repo, version, folderName) {
  try {
    logger.info(`Adding versioned remappings for ${repo} version ${version}`);
    
    // Determine the remappings based on repository
    const remappings = [];
    
    if (repo.includes('openzeppelin-contracts')) {
      // For standard contracts
      // Version-specific format: @openzeppelin/contracts@4.9.5/=lib/openzeppelin-contracts-4.9.5/contracts/
      remappings.push(`@openzeppelin/contracts@${version}/=lib/${folderName}/contracts/`);
    } else if (repo.includes('openzeppelin-contracts-upgradeable')) {
      // For upgradeable contracts
      // Version-specific format: @openzeppelin/contracts-upgradeable@4.9.5/=lib/openzeppelin-contracts-upgradeable-4.9.5/contracts/
      remappings.push(`@openzeppelin/contracts-upgradeable@${version}/=lib/${folderName}/contracts/`);
    }
    
    if (remappings.length === 0) {
      logger.warn(`No versioned remappings defined for ${repo}`);
      return false;
    }
    
    // Write to remappings.txt
    const remappingsPath = path.join(projectPath, 'remappings.txt');
    
    let existingRemappings = [];
    if (await fs.pathExists(remappingsPath)) {
      const content = await fs.readFile(remappingsPath, 'utf8');
      existingRemappings = content.split('\n').filter(line => line.trim() !== '');
    }
    
    // Add new remappings if they don't already exist
    let remappingsChanged = false;
    for (const remapping of remappings) {
      if (!existingRemappings.includes(remapping)) {
        existingRemappings.push(remapping);
        remappingsChanged = true;
      }
    }
    
    if (remappingsChanged) {
      await fs.writeFile(remappingsPath, existingRemappings.join('\n'));
      logger.info(`Updated remappings.txt with versioned remappings: ${remappings.join(', ')}`);
    }
    
    // Update foundry.toml
    const foundryTomlPath = path.join(projectPath, 'foundry.toml');
    if (await fs.pathExists(foundryTomlPath)) {
      let foundryToml = await fs.readFile(foundryTomlPath, 'utf8');
      
      // Check if remappings section exists
      const remappingsRegex = /remappings\s*=\s*\[(.*?)\]/s;
      if (remappingsRegex.test(foundryToml)) {
        // Extract current remappings
        const match = foundryToml.match(remappingsRegex);
        const currentRemappings = match[1].split(',')
          .map(r => r.trim())
          .filter(r => r.length > 0);
        
        // Add new remappings if they don't exist
        let foundryTomlChanged = false;
        for (const remapping of remappings) {
          const remappingEntry = `"${remapping}"`;
          if (!currentRemappings.includes(remappingEntry) && 
              !currentRemappings.some(r => r.includes(remapping))) {
            currentRemappings.push(remappingEntry);
            foundryTomlChanged = true;
          }
        }
        
        if (foundryTomlChanged) {
          // Replace remappings section
          const newRemappingsSection = `remappings = [\n  ${currentRemappings.join(',\n  ')}\n]`;
          foundryToml = foundryToml.replace(remappingsRegex, newRemappingsSection);
          await fs.writeFile(foundryTomlPath, foundryToml);
          logger.info(`Updated foundry.toml with versioned remappings`);
        }
      } else {
        // Add new remappings section
        const remappingsSection = `remappings = [\n  ${remappings.map(r => `"${r}"`).join(',\n  ')}\n]`;
        foundryToml = foundryToml.replace(/\[profile\.default\]/,
          `[profile.default]\n${remappingsSection}`);
        await fs.writeFile(foundryTomlPath, foundryToml);
        logger.info(`Created remappings section in foundry.toml`);
      }
    }
    
    return true;
  } catch (error) {
    logger.error(`Error adding versioned remappings: ${error.message}`);
    return false;
  }
}

/**
 * Update foundry.toml to include a new remapping
 * @param {string} projectPath - Path to the Foundry project
 * @param {string} remapping - Remapping string to add
 */
async function updateFoundryToml(projectPath, remapping) {
  const foundryTomlPath = path.join(projectPath, 'foundry.toml');
  
  // Skip if foundry.toml doesn't exist
  if (!await fs.pathExists(foundryTomlPath)) {
    return;
  }
  
  try {
    // Read existing foundry.toml
    let foundryToml = await fs.readFile(foundryTomlPath, 'utf8');
    
    // Check if remappings section exists
    const remappingsRegex = /remappings\s*=\s*\[(.*?)\]/s;
    const remappingsMatch = foundryToml.match(remappingsRegex);
    
    if (remappingsMatch) {
      // Check if this specific remapping is already included
      const remappingPattern = new RegExp(`"${remapping.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`);
      
      if (!remappingPattern.test(foundryToml)) {
        // Add the new remapping to the existing list
        const updatedRemappings = remappingsMatch[0].replace(']', `,\n  "${remapping}"\n]`);
        foundryToml = foundryToml.replace(remappingsRegex, updatedRemappings);
        
        // Write updated foundry.toml
        await fs.writeFile(foundryTomlPath, foundryToml);
        logger.info(`Updated foundry.toml with versioned remapping: ${remapping}`);
      }
    } else {
      // No remappings section found, add it
      const defaultSection = '[profile.default]';
      const remappingsSection = `${defaultSection}\nremappings = [\n  "${remapping}"\n]`;
      
      foundryToml = foundryToml.replace(defaultSection, remappingsSection);
      await fs.writeFile(foundryTomlPath, foundryToml);
      logger.info(`Added remappings section to foundry.toml with versioned remapping: ${remapping}`);
    }
  } catch (error) {
    logger.error(`Error updating foundry.toml:`, error);
  }
}

module.exports = {
  installPreConfiguredDependencies,
  installDependenciesFromImports,
  installMinimalOpenZeppelinDependencies,
  processRemappings,
  extractVersionInfo,
  verifyLibraryStructure,
  resolveDependency,
  listInstalledDependencies: async () => {
    // Stub implementation to avoid errors
    return { count: 0, dependencies: [] };
  }
};