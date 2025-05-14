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
  '@openzeppelin/contracts@4.9.5/': 'OpenZeppelin/openzeppelin-contracts#v4.9.5',
  '@openzeppelin/contracts@4.9.4/': 'OpenZeppelin/openzeppelin-contracts#v4.9.4',
  '@openzeppelin/contracts@4.9.3/': 'OpenZeppelin/openzeppelin-contracts#v4.9.3',
  '@openzeppelin/contracts@4.9.2/': 'OpenZeppelin/openzeppelin-contracts#v4.9.2',
  '@openzeppelin/contracts@4.9.1/': 'OpenZeppelin/openzeppelin-contracts#v4.9.1',
  '@openzeppelin/contracts@4.9.0/': 'OpenZeppelin/openzeppelin-contracts#v4.9.0',
  '@openzeppelin/contracts@4.8.3/': 'OpenZeppelin/openzeppelin-contracts#v4.8.3',
  '@openzeppelin/contracts@4.7.3/': 'OpenZeppelin/openzeppelin-contracts#v4.7.3',
  
  // OpenZeppelin upgradeable mappings - versioned format
  '@openzeppelin/contracts-upgradeable@4.9.5/': 'OpenZeppelin/openzeppelin-contracts-upgradeable#v4.9.5',
  '@openzeppelin/contracts-upgradeable@4.9.4/': 'OpenZeppelin/openzeppelin-contracts-upgradeable#v4.9.4',
  '@openzeppelin/contracts-upgradeable@4.9.3/': 'OpenZeppelin/openzeppelin-contracts-upgradeable#v4.9.3',
  
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
 * Add version-specific remappings to a project's foundry.toml
 * @param {string} projectPath - Path to the Foundry project
 * @param {string} repo - GitHub repository (e.g., "OpenZeppelin/openzeppelin-contracts")
 * @param {string} versionSuffix - Version number (e.g., "4.9.5")
 * @param {string} folderName - Name of the folder where the dependency is installed
 */
async function addVersionedRemappings(projectPath, repo, versionSuffix, folderName) {
  try {
    // Create remapping string based on the repository type
    let remapping = '';
    if (repo === 'OpenZeppelin/openzeppelin-contracts') {
      remapping = `@openzeppelin/contracts@${versionSuffix}/=lib/${folderName}/contracts/`;
    } else if (repo === 'OpenZeppelin/openzeppelin-contracts-upgradeable') {
      remapping = `@openzeppelin/contracts-upgradeable@${versionSuffix}/=lib/${folderName}/contracts/`;
    } else {
      return; // Only handle OpenZeppelin repos for now
    }
    
    // Path to remappings.txt
    const remappingsPath = path.join(projectPath, 'remappings.txt');
    
    // Check if remappings.txt exists
    if (await fs.pathExists(remappingsPath)) {
      // Read existing remappings
      let remappings = (await fs.readFile(remappingsPath, 'utf8')).split('\n');
      
      // Add the new remapping if it doesn't already exist
      if (!remappings.includes(remapping)) {
        remappings.push(remapping);
        await fs.writeFile(remappingsPath, remappings.join('\n'));
        logger.info(`Added versioned remapping: ${remapping}`);
      }
    } else {
      // Create remappings.txt with the new remapping
      await fs.writeFile(remappingsPath, remapping);
      logger.info(`Created remappings.txt with versioned remapping: ${remapping}`);
    }
    
    // Also update foundry.toml if it exists
    await updateFoundryToml(projectPath, remapping);
    
  } catch (error) {
    logger.error(`Error adding versioned remappings for ${repo} v${versionSuffix}:`, error);
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

/**
 * Resolve dependency from import path
 * @param {string} importPath - Import path from contract
 * @returns {Object|null} Dependency information or null if can't be resolved
 */
function resolveDependency(importPath) {
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
      return {
        github: repoParts[0],
        version: repoParts[1] || 'main', // Use specified version or default to main
      };
    }
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
    
    // Generate remappings
    const remappings = [];
    
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
      
      // For OpenZeppelin repo, also add version-specific remappings
      if (dir.startsWith('openzeppelin-contracts-') && await fs.pathExists(path.join(libPath, dir, 'contracts'))) {
        const versionMatch = dir.match(/openzeppelin-contracts-(\d+\.\d+\.\d+)/);
        if (versionMatch) {
          const version = versionMatch[1];
          remappings.push(`@openzeppelin/contracts@${version}/=lib/${dir}/contracts/`);
        }
      }
      
      // For OpenZeppelin upgradeable repo, also add version-specific remappings
      if (dir.startsWith('openzeppelin-contracts-upgradeable-') && await fs.pathExists(path.join(libPath, dir, 'contracts'))) {
        const versionMatch = dir.match(/openzeppelin-contracts-upgradeable-(\d+\.\d+\.\d+)/);
        if (versionMatch) {
          const version = versionMatch[1];
          remappings.push(`@openzeppelin/contracts-upgradeable@${version}/=lib/${dir}/contracts/`);
        }
      }
    }
    
    // Add special remappings for common libraries
    remappings.push('@openzeppelin/=lib/openzeppelin-contracts/');
    remappings.push('@uniswap/=lib/');
    
    // Write remappings to foundry.toml
    const foundryTomlPath = path.join(projectPath, 'foundry.toml');
    if (await fs.pathExists(foundryTomlPath)) {
      let foundryConfig = await fs.readFile(foundryTomlPath, 'utf8');
      
      // Check if remappings are already defined
      const remappingsRegex = /remappings\s*=\s*\[(.*?)\]/s;
      if (remappingsRegex.test(foundryConfig)) {
        // Replace existing remappings
        foundryConfig = foundryConfig.replace(remappingsRegex, `remappings = [\n    ${remappings.map(r => `"${r}"`).join(',\n    ')}\n]`);
      } else {
        // Add remappings
        foundryConfig = foundryConfig.replace(/\[profile\.default\](.*?)(\n\[|$)/s, `[profile.default]$1\nremappings = [\n    ${remappings.map(r => `"${r}"`).join(',\n    ')}\n]\n\n$2`);
      }
      
      await fs.writeFile(foundryTomlPath, foundryConfig);
      logger.debug(`Updated remappings in foundry.toml with ${remappings.length} entries`);
    }
    
    // Also write to remappings.txt for tools that use that
    const remappingsPath = path.join(projectPath, 'remappings.txt');
    await fs.writeFile(remappingsPath, remappings.join('\n'));
    logger.debug(`Updated remappings.txt with ${remappings.length} entries`);
    
  } catch (error) {
    logger.error('Error processing remappings:', error);
    // Non-fatal error, continue with compilation
  }
}

/**
 * List all installed dependencies with their paths and import formats
 * @param {string} projectPath - Path to the Foundry project (or root project directory)
 * @returns {Promise<Object>} Object containing dependency information
 */
async function listInstalledDependencies(projectPath = process.cwd()) {
  logger.info('Listing all installed dependencies');
  
  try {
    // Check lib directory
    const libPath = path.join(projectPath, 'lib');
    if (!await fs.pathExists(libPath)) {
      logger.info('No lib directory found');
      return { dependencies: [], error: 'No dependencies installed' };
    }
    
    // Read remappings.txt to get import paths
    const remappingsPath = path.join(projectPath, 'remappings.txt');
    let remappings = [];
    if (await fs.pathExists(remappingsPath)) {
      const remappingsContent = await fs.readFile(remappingsPath, 'utf8');
      remappings = remappingsContent.split('\n').filter(line => line.trim() !== '');
    }
    
    // Get all directories in lib
    const libDirs = await fs.readdir(libPath);
    const dependencies = [];
    
    for (const dir of libDirs) {
      const depPath = path.join(libPath, dir);
      
      // Skip if not a directory
      const stats = await fs.stat(depPath);
      if (!stats.isDirectory()) continue;
      
      // Basic dependency info
      const dependency = {
        name: dir,
        path: depPath,
        importFormats: []
      };
      
      // Extract version if available
      let version = null;
      if (dir.includes('-')) {
        const versionMatch = dir.match(/-(\d+\.\d+\.\d+)$/);
        if (versionMatch) {
          version = versionMatch[1];
          dependency.version = version;
        }
      }
      
      // Check for package.json or foundry.toml for additional metadata
      const packageJsonPath = path.join(depPath, 'package.json');
      if (await fs.pathExists(packageJsonPath)) {
        try {
          const packageJson = await fs.readJson(packageJsonPath);
          dependency.description = packageJson.description || null;
          dependency.repository = packageJson.repository || null;
          if (!version && packageJson.version) {
            dependency.version = packageJson.version;
          }
        } catch (error) {
          logger.warn(`Error reading package.json for ${dir}: ${error.message}`);
        }
      }
      
      // Find README to extract more info if needed
      const readmePath = await findReadme(depPath);
      if (readmePath) {
        dependency.readme = readmePath;
      }
      
      // Identify the type of dependency
      if (dir.includes('openzeppelin-contracts')) {
        dependency.type = 'OpenZeppelin';
        dependency.subtype = 'Contracts';
      } else if (dir.includes('openzeppelin-contracts-upgradeable')) {
        dependency.type = 'OpenZeppelin';
        dependency.subtype = 'Contracts Upgradeable';
      } else if (dir === 'solmate') {
        dependency.type = 'Solmate';
      } else if (dir.includes('uniswap')) {
        dependency.type = 'Uniswap';
      } else if (dir.includes('aave')) {
        dependency.type = 'Aave';
      } else if (dir.includes('chainlink')) {
        dependency.type = 'Chainlink';
      } else {
        dependency.type = 'Other';
      }
      
      // Find remappings for this dependency
      const relevantRemappings = remappings.filter(r => {
        const [importPath, targetPath] = r.split('=');
        return targetPath.includes(`lib/${dir}/`);
      });
      
      // Add import formats based on remappings
      for (const remapping of relevantRemappings) {
        const [importPath, targetPath] = remapping.split('=');
        
        // Find some example files to show import examples
        let examples = [];
        if (dependency.type === 'OpenZeppelin') {
          if (dependency.subtype === 'Contracts') {
            examples = [
              importPath + 'token/ERC20/ERC20.sol',
              importPath + 'token/ERC721/ERC721.sol',
              importPath + 'access/Ownable.sol'
            ];
          } else if (dependency.subtype === 'Contracts Upgradeable') {
            examples = [
              importPath + 'token/ERC20/ERC20Upgradeable.sol',
              importPath + 'proxy/utils/Initializable.sol',
              importPath + 'access/OwnableUpgradeable.sol'
            ];
          }
        } else if (dependency.type === 'Solmate') {
          examples = [
            importPath + 'tokens/ERC20.sol',
            importPath + 'auth/Owned.sol'
          ];
        } else if (dependency.type === 'Uniswap') {
          if (dir.includes('v2')) {
            examples = [importPath + 'interfaces/IUniswapV2Router02.sol'];
          } else if (dir.includes('v3')) {
            examples = [importPath + 'interfaces/IUniswapV3Pool.sol'];
          }
        } else if (dependency.type === 'Chainlink') {
          examples = [importPath + 'src/v0.8/interfaces/AggregatorV3Interface.sol'];
        }
        
        dependency.importFormats.push({
          importPrefix: importPath,
          targetPath: targetPath,
          examples: examples
        });
      }
      
      dependencies.push(dependency);
    }
    
    // Sort dependencies alphabetically
    dependencies.sort((a, b) => a.name.localeCompare(b.name));
    
    return {
      count: dependencies.length,
      dependencies: dependencies
    };
  } catch (error) {
    logger.error('Error listing dependencies:', error);
    return {
      count: 0,
      dependencies: [],
      error: error.message
    };
  }
}

/**
 * Find a README file in a directory (case insensitive)
 * @param {string} dirPath - Directory path to search
 * @returns {Promise<string|null>} Path to README file or null if not found
 */
async function findReadme(dirPath) {
  try {
    const files = await fs.readdir(dirPath);
    const readmeFile = files.find(file => 
      file.toLowerCase().includes('readme') && 
      (file.toLowerCase().endsWith('.md') || file.toLowerCase().endsWith('.txt'))
    );
    
    return readmeFile ? path.join(dirPath, readmeFile) : null;
  } catch (error) {
    logger.warn(`Error finding README in ${dirPath}: ${error.message}`);
    return null;
  }
}

module.exports = {
  installPreConfiguredDependencies,
  installDependenciesFromImports,
  processRemappings,
  extractVersionInfo, // Export for testing
  listInstalledDependencies
};