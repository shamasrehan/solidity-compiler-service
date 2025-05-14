/**
 * Dependencies configuration
 * List of common smart contract dependencies to pre-install
 * Updated to support version-in-path import pattern: @openzeppelin/contracts@4.9.5/token/ERC20/ERC20.sol
 */

module.exports = {
  // OpenZeppelin contracts
  openzeppelin: [
    {
      name: 'OpenZeppelin Contracts 4.9.5',
      github: 'OpenZeppelin/openzeppelin-contracts',
      version: 'v4.9.5',
      alias: 'openzeppelin-contracts-4.9.5',
      versionSuffix: '4.9.5'
    },
    {
      name: 'OpenZeppelin Contracts 4.9.4',
      github: 'OpenZeppelin/openzeppelin-contracts',
      version: 'v4.9.4',
      alias: 'openzeppelin-contracts-4.9.4',
      versionSuffix: '4.9.4'
    },
    {
      name: 'OpenZeppelin Contracts 4.9.3',
      github: 'OpenZeppelin/openzeppelin-contracts',
      version: 'v4.9.3',
      alias: 'openzeppelin-contracts-4.9.3',
      versionSuffix: '4.9.3'
    },
    {
      name: 'OpenZeppelin Contracts Upgradeable 4.9.5',
      github: 'OpenZeppelin/openzeppelin-contracts-upgradeable',
      version: 'v4.9.5',
      alias: 'openzeppelin-contracts-upgradeable-4.9.5',
      versionSuffix: '4.9.5'
    }
  ],
  
  // Solmate - gas optimized building blocks
  solmate: [
    {
      name: 'Solmate',
      github: 'transmissions11/solmate',
      version: 'main',
      alias: 'solmate'
    }
  ],
  
  // Uniswap
  uniswap: [
    {
      name: 'Uniswap V2 Core',
      github: 'Uniswap/v2-core',
      version: 'master',
      alias: 'uniswap-v2-core'
    },
    {
      name: 'Uniswap V2 Periphery',
      github: 'Uniswap/v2-periphery',
      version: 'master',
      alias: 'uniswap-v2-periphery'
    }
  ],
  
  // Chainlink
  chainlink: [
    {
      name: 'Chainlink',
      github: 'smartcontractkit/chainlink',
      version: 'develop',
      alias: 'chainlink'
    }
  ]
};