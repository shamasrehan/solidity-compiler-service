/**
 * Dependencies configuration
 * List of common smart contract dependencies to pre-install
 */

module.exports = {
    // OpenZeppelin contracts
    openzeppelin: [
      {
        name: 'OpenZeppelin Contracts 4.9.3',
        github: 'OpenZeppelin/openzeppelin-contracts',
        version: 'v4.9.3',
        alias: 'openzeppelin-4.9.3'
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
    ]
    
    // Add more dependencies here as needed
    // For startup, we're just including the essentials to avoid long installation times
  };