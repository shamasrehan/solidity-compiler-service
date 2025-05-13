/**
 * Dependency Service
 * Manages smart contract dependencies for compilation
 */

const fs = require('fs-extra');
const path = require('path');
const logger = require('../utils/logger');
const config = require('../config/config');
const dependencies = require('../config/dependencies');
const foundryService = require('./foundryService');

/**
 * Map of common import patterns to GitHub repositories
 * Used to resolve imports that don't directly specify a GitHub repo
 */
const DEPENDENCY_MAPPING = {
  // OpenZeppelin mappings
  '@openzeppelin/contracts/': 'OpenZeppelin/openzeppelin-contracts',
  '@openzeppelin/contracts-upgradeable/': 'OpenZeppelin/openzeppelin-contracts-upgradeable',
  
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
      const { github, version, alias } = dep;
      const success = await foundryService.installDependency(projectPath, github, version);
      
      if (success) {
        installedDeps.push({ 
          github, 
          version, 
          alias,
          success: true 
        });
      } else {
        installedDeps.push({ 
          github, 
          version, 
          alias,
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
        success: false,
        error: error.message
      });
    }
  }
  
  logger.info(`Installed ${installedDeps.filter(d => d.success).length} of ${allDependencies.length} pre-configured dependencies`);
  return installedDeps;
}

/**
 * Resolve dependency from import path
 * @param {string} importPath - Import path from contract
 * @returns {Object|null} Dependency information or null if can't be resolved
 */
function resolveDependency(importPath) {
  // First check if it directly matches a known dependency pattern
  for (const [pattern, repo] of Object.entries(DEPENDENCY_MAPPING)) {
    if (importPath.startsWith(pattern)) {
      return {
        github: repo,
        version: 'main', // Default to main branch
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
      
      // Skip if we've already processed this repo
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
  } catch (error) {
    logger.error('Error processing remappings:', error);
    // Non-fatal error, continue with compilation
  }
}

module.exports = {
  installPreConfiguredDependencies,
  installDependenciesFromImports,
  processRemappings,
};