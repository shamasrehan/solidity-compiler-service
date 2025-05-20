/**
 * Remapping utilities for dependency installation
 * Generates and manages remappings for Solidity imports
 */

const fs = require('fs-extra');
const path = require('path');
const logger = console;

/**
 * Generate remappings for a dependency
 * @param {Object} dependency - Dependency object with type, subtype, and other properties
 * @returns {Array<string>} List of remapping strings
 */
function generateRemappingsForDependency(dependency) {
  const remappings = [];
  
  if (!dependency || !dependency.type) {
    return remappings;
  }
  
  switch (dependency.type) {
    case 'openzeppelin':
      if (dependency.subtype === 'contracts') {
        // Traditional version-specific remappings
        remappings.push(`@openzeppelin-${dependency.versionSuffix}/=lib/${dependency.folderName}/`);
        remappings.push(`@openzeppelin-${dependency.versionSuffix}/contracts/=lib/${dependency.folderName}/contracts/`);
        
        // New version-in-path style remappings
        remappings.push(`@openzeppelin/contracts@${dependency.versionSuffix}/=lib/${dependency.folderName}/contracts/`);
        
        // If this is marked as latest, also add standard remappings without version
        if (dependency.isLatest) {
          remappings.push(`@openzeppelin/=lib/${dependency.folderName}/`);
          remappings.push(`@openzeppelin/contracts/=lib/${dependency.folderName}/contracts/`);
        }
      } else if (dependency.subtype === 'contracts-upgradeable') {
        // Traditional version-specific remappings
        remappings.push(`@openzeppelin-upgradeable-${dependency.versionSuffix}/=lib/${dependency.folderName}/`);
        remappings.push(`@openzeppelin-upgradeable-${dependency.versionSuffix}/contracts/=lib/${dependency.folderName}/contracts/`);
        
        // New version-in-path style remappings
        remappings.push(`@openzeppelin/contracts-upgradeable@${dependency.versionSuffix}/=lib/${dependency.folderName}/contracts/`);
        
        // If this is marked as latest, also add standard remappings without version
        if (dependency.isLatest) {
          remappings.push(`@openzeppelin-upgradeable/=lib/${dependency.folderName}/`);
          remappings.push(`@openzeppelin/contracts-upgradeable/=lib/${dependency.folderName}/contracts/`);
        }
      }
      break;
      
    case 'solmate':
      remappings.push(`solmate/=lib/${dependency.folderName}/src/`);
      break;
      
    case 'solady':
      remappings.push(`solady/=lib/${dependency.folderName}/src/`);
      break;
      
    case 'uniswap':
      if (dependency.subtype) {
        remappings.push(`@uniswap/${dependency.subtype}/=lib/${dependency.folderName}/`);
      }
      break;
      
    case 'aave':
      if (dependency.subtype === 'v3-core') {
        remappings.push(`@aave/core-v3/=lib/${dependency.folderName}/`);
      } else if (dependency.subtype === 'v3-periphery') {
        remappings.push(`@aave/periphery-v3/=lib/${dependency.folderName}/`);
      }
      break;
      
    case 'chainlink':
      remappings.push(`@chainlink/=lib/${dependency.folderName}/contracts/`);
      remappings.push(`@chainlink/contracts/=lib/${dependency.folderName}/contracts/src/`);
      break;
      
    case 'erc721a':
      remappings.push(`erc721a/=lib/${dependency.folderName}/contracts/`);
      break;
      
    case 'compound':
      if (dependency.subtype === 'v2') {
        remappings.push(`@compound-protocol/=lib/${dependency.folderName}/`);
      } else if (dependency.subtype === 'v3') {
        remappings.push(`@compound-v3/=lib/${dependency.folderName}/`);
      }
      break;
      
    default:
      // Default remapping if type is unknown
      if (dependency.folderName) {
        remappings.push(`${dependency.folderName}/=lib/${dependency.folderName}/`);
      }
  }
  
  return remappings;
}

/**
 * Generate remappings for a list of dependencies
 * @param {Array<Object>} dependencies - List of dependency objects
 * @returns {Array<string>} List of unique remapping strings
 */
function generateRemappings(dependencies) {
  if (!Array.isArray(dependencies) || dependencies.length === 0) {
    return [];
  }
  
  // Generate remappings for each dependency
  const allRemappings = dependencies.flatMap(dep => generateRemappingsForDependency(dep));
  
  // Remove duplicates and return
  return [...new Set(allRemappings)];
}

/**
 * Write remappings to remappings.txt file
 * @param {string} projectPath - Path to project directory
 * @param {Array<string>} remappings - List of remapping strings
 * @returns {Promise<boolean>} True if successful
 */
async function writeRemappingsFile(projectPath, remappings) {
  try {
    const remappingsPath = path.join(projectPath, 'remappings.txt');
    await fs.writeFile(remappingsPath, remappings.join('\n'));
    logger.log(`✅ Created remappings.txt with ${remappings.length} entries`);
    return true;
  } catch (error) {
    logger.error(`❌ Failed to write remappings.txt: ${error.message}`);
    return false;
  }
}

/**
 * Update foundry.toml file with remappings
 * @param {string} projectPath - Path to project directory
 * @param {Array<string>} remappings - List of remapping strings
 * @returns {Promise<boolean>} True if successful
 */
async function updateFoundryToml(projectPath, remappings) {
  try {
    const foundryTomlPath = path.join(projectPath, 'foundry.toml');
    
    // Create formatted remappings for foundry.toml
    const formattedRemappings = remappings.map(r => `  "${r}"`).join(',\n');
    
    if (await fs.pathExists(foundryTomlPath)) {
      // Update existing foundry.toml
      let foundryConfig = await fs.readFile(foundryTomlPath, 'utf8');
      
      // Check if remappings are already defined
      const remappingsRegex = /remappings\s*=\s*\[(.*?)\]/s;
      if (remappingsRegex.test(foundryConfig)) {
        // Replace existing remappings
        foundryConfig = foundryConfig.replace(
          remappingsRegex, 
          `remappings = [\n${formattedRemappings}\n]`
        );
      } else {
        // Add remappings
        foundryConfig = foundryConfig.replace(
          /\[profile\.default\](.*?)(\n\[|$)/s, 
          `[profile.default]$1\nremappings = [\n${formattedRemappings}\n]\n\n$2`
        );
      }
      
      await fs.writeFile(foundryTomlPath, foundryConfig);
      logger.log('✅ Updated remappings in foundry.toml');
    } else {
      // Create new foundry.toml
      const foundryConfig = `
[profile.default]
src = 'src'
out = 'out'
libs = ['lib']
remappings = [
${formattedRemappings}
]

[rpc_endpoints]
`;
      
      await fs.writeFile(foundryTomlPath, foundryConfig);
      logger.log('✅ Created foundry.toml with remappings');
    }
    
    return true;
  } catch (error) {
    logger.error(`❌ Failed to update foundry.toml: ${error.message}`);
    return false;
  }
}

/**
 * Apply remappings to a project
 * @param {string} projectPath - Path to project directory
 * @param {Array<Object>} dependencies - List of dependency objects
 * @returns {Promise<{remappings: Array<string>, success: boolean}>} Result with remappings and success flag
 */
async function applyRemappings(projectPath, dependencies) {
  try {
    // Generate remappings
    const remappings = generateRemappings(dependencies);
    
    if (remappings.length === 0) {
      logger.warn('No remappings generated');
      return { remappings: [], success: false };
    }
    
    // Write to remappings.txt
    const remappingsFileSuccess = await writeRemappingsFile(projectPath, remappings);
    
    // Update foundry.toml
    const foundryTomlSuccess = await updateFoundryToml(projectPath, remappings);
    
    return {
      remappings,
      success: remappingsFileSuccess && foundryTomlSuccess
    };
  } catch (error) {
    logger.error(`❌ Failed to apply remappings: ${error.message}`);
    return {
      remappings: [],
      success: false
    };
  }
}

module.exports = {
  generateRemappingsForDependency,
  generateRemappings,
  writeRemappingsFile,
  updateFoundryToml,
  applyRemappings
};