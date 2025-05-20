/**
 * Centralized dependency configuration
 * Contains all dependencies that can be installed by any of the installation scripts
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
  { version: 'v4.8.3', folderSuffix: '4.8.3' },  // Latest 4.8.x
  { version: 'v4.7.3', folderSuffix: '4.7.3' },  // Latest 4.7.x
  { version: 'v4.6.0', folderSuffix: '4.6.0' },  // Latest 4.6.x
  { version: 'v4.5.0', folderSuffix: '4.5.0' },  // Latest 4.5.x
  { version: 'v4.4.2', folderSuffix: '4.4.2' },  // Latest 4.4.x
  { version: 'v4.3.3', folderSuffix: '4.3.3' },  // Latest 4.3.x
  { version: 'v4.2.0', folderSuffix: '4.2.0' },  // Latest 4.2.x
  { version: 'v4.1.0', folderSuffix: '4.1.0' },  // Latest 4.1.x
  { version: 'v4.0.0', folderSuffix: '4.0.0' },  // First 4.x release
];

// Base dependencies (non-OpenZeppelin)
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
    name: 'Solady',
    repo: 'Vectorized/solady',
    url: 'https://github.com/Vectorized/solady/archive/refs/heads/main.zip',
    extractDir: 'solady-main',
    version: 'main',
    folderName: 'solady',
    type: 'solady'
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
    name: 'Uniswap V2 Periphery',
    repo: 'Uniswap/v2-periphery',
    url: 'https://github.com/Uniswap/v2-periphery/archive/refs/heads/master.zip',
    extractDir: 'v2-periphery-master',
    version: 'master',
    folderName: 'uniswap-v2-periphery',
    type: 'uniswap',
    subtype: 'v2-periphery'
  },
  {
    name: 'Uniswap V3 Core',
    repo: 'Uniswap/v3-core',
    url: 'https://github.com/Uniswap/v3-core/archive/refs/heads/main.zip',
    extractDir: 'v3-core-main',
    version: 'main',
    folderName: 'uniswap-v3-core',
    type: 'uniswap',
    subtype: 'v3-core'
  },
  {
    name: 'Uniswap V3 Periphery',
    repo: 'Uniswap/v3-periphery',
    url: 'https://github.com/Uniswap/v3-periphery/archive/refs/heads/main.zip',
    extractDir: 'v3-periphery-main',
    version: 'main',
    folderName: 'uniswap-v3-periphery',
    type: 'uniswap',
    subtype: 'v3-periphery'
  },
  {
    name: 'Aave Protocol V3 Core',
    repo: 'aave/aave-v3-core',
    url: 'https://github.com/aave/aave-v3-core/archive/refs/heads/master.zip',
    extractDir: 'aave-v3-core-master',
    version: 'master',
    folderName: 'aave-v3-core',
    type: 'aave',
    subtype: 'v3-core'
  },
  {
    name: 'Aave Protocol V3 Periphery',
    repo: 'aave/aave-v3-periphery',
    url: 'https://github.com/aave/aave-v3-periphery/archive/refs/heads/master.zip',
    extractDir: 'aave-v3-periphery-master',
    version: 'master',
    folderName: 'aave-v3-periphery',
    type: 'aave',
    subtype: 'v3-periphery'
  },
  {
    name: 'Chainlink Contracts',
    repo: 'smartcontractkit/chainlink',
    url: 'https://github.com/smartcontractkit/chainlink/archive/refs/heads/develop.zip',
    extractDir: 'chainlink-develop',
    version: 'develop',
    folderName: 'chainlink',
    type: 'chainlink'
  },
  {
    name: 'ERC721A',
    repo: 'chiru-labs/ERC721A',
    url: 'https://github.com/chiru-labs/ERC721A/archive/refs/heads/main.zip',
    extractDir: 'ERC721A-main',
    version: 'main',
    folderName: 'erc721a',
    type: 'erc721a'
  },
  {
    name: 'Compound V2',
    repo: 'compound-finance/compound-protocol',
    url: 'https://github.com/compound-finance/compound-protocol/archive/refs/heads/master.zip',
    extractDir: 'compound-protocol-master',
    version: 'master',
    folderName: 'compound-v2',
    type: 'compound',
    subtype: 'v2'
  },
  {
    name: 'Compound V3',
    repo: 'compound-finance/comet',
    url: 'https://github.com/compound-finance/comet/archive/refs/heads/main.zip',
    extractDir: 'comet-main',
    version: 'main',
    folderName: 'compound-v3',
    type: 'compound',
    subtype: 'v3'
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