/**
 * Fallback dependencies configuration
 * Used when the main dependencies.js file cannot be loaded
 */

// OpenZeppelin versions - most commonly used stable versions, prioritizing 4.9.5 onward
const OZ_VERSIONS = [
    { version: 'v4.9.5', folderSuffix: '4.9.5' },  // Most widely used stable version
    { version: 'v4.9.4', folderSuffix: '4.9.4' },
    { version: 'v4.9.3', folderSuffix: '4.9.3' },
    { version: 'v4.9.2', folderSuffix: '4.9.2' },
    { version: 'v4.9.1', folderSuffix: '4.9.1' },
    { version: 'v4.9.0', folderSuffix: '4.9.0' },
    // Add the most recent version
    { version: 'latest', folderSuffix: 'latest' }, // Latest from main branch
    // Additional versions
    { version: 'v4.8.3', folderSuffix: '4.8.3' },
    { version: 'v4.7.3', folderSuffix: '4.7.3' }
  ];
  
  // Base dependencies (simplified list)
  const BASE_DEPENDENCIES = [
    {
      name: 'Solmate',
      repo: 'transmissions11/solmate',
      url: 'https://github.com/transmissions11/solmate/archive/refs/heads/main.zip',
      extractDir: 'solmate-main',
      version: 'main',
      folderName: 'solmate',
      type: 'solmate'
    },
    {
      name: 'Uniswap V2 Core',
      repo: 'Uniswap/v2-core',
      url: 'https://github.com/Uniswap/v2-core/archive/refs/heads/master.zip',
      extractDir: 'v2-core-master',
      version: 'master',
      folderName: 'uniswap-v2-core',
      type: 'uniswap',
      subtype: 'v2-core'
    },
    {
      name: 'Chainlink',
      repo: 'smartcontractkit/chainlink',
      url: 'https://github.com/smartcontractkit/chainlink/archive/refs/heads/develop.zip',
      extractDir: 'chainlink-develop',
      version: 'develop',
      folderName: 'chainlink',
      type: 'chainlink'
    }
  ];
  
  // Generate OpenZeppelin dependencies for each version
  const OZ_DEPENDENCIES = [];
  
  OZ_VERSIONS.forEach(ozVersion => {
    // Get the actual version tag or branch name
    const versionTag = ozVersion.version === 'latest' ? 'main' : ozVersion.version;
    const extractSuffix = ozVersion.version === 'latest' ? 'main' : ozVersion.version.substring(1);
    
    // Standard contracts
    OZ_DEPENDENCIES.push({
      name: `OpenZeppelin Contracts ${ozVersion.version}`,
      repo: 'OpenZeppelin/openzeppelin-contracts',
      url: `https://github.com/OpenZeppelin/openzeppelin-contracts/archive/refs/${ozVersion.version === 'latest' ? 'heads/main' : 'tags/' + ozVersion.version}.zip`,
      extractDir: `openzeppelin-contracts-${extractSuffix}`,
      version: versionTag,
      folderName: `openzeppelin-contracts-${ozVersion.folderSuffix}`,
      versionSuffix: ozVersion.folderSuffix,
      type: 'openzeppelin',
      subtype: 'contracts',
      isLatest: ozVersion.version === 'latest' || ozVersion.version === 'v4.9.5' // Mark both latest and 4.9.5 as latest for remappings
    });
    
    // Upgradeable contracts
    OZ_DEPENDENCIES.push({
      name: `OpenZeppelin Upgradeable Contracts ${ozVersion.version}`,
      repo: 'OpenZeppelin/openzeppelin-contracts-upgradeable',
      url: `https://github.com/OpenZeppelin/openzeppelin-contracts-upgradeable/archive/refs/${ozVersion.version === 'latest' ? 'heads/main' : 'tags/' + ozVersion.version}.zip`,
      extractDir: `openzeppelin-contracts-upgradeable-${extractSuffix}`,
      version: versionTag,
      folderName: `openzeppelin-contracts-upgradeable-${ozVersion.folderSuffix}`,
      versionSuffix: ozVersion.folderSuffix,
      type: 'openzeppelin',
      subtype: 'contracts-upgradeable',
      isLatest: ozVersion.version === 'latest' || ozVersion.version === 'v4.9.5' // Mark both latest and 4.9.5 as latest for remappings
    });
  });
  
  // All dependencies combined
  const ALL_DEPENDENCIES = [...BASE_DEPENDENCIES, ...OZ_DEPENDENCIES];
  
  // Export everything
  module.exports = {
    versions: {
      openzeppelin: OZ_VERSIONS
    },
    dependencies: {
      base: BASE_DEPENDENCIES,
      openzeppelin: OZ_DEPENDENCIES,
      all: ALL_DEPENDENCIES
    },
    default: ALL_DEPENDENCIES
  };