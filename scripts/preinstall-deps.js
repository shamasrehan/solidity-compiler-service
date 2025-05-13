const { execSync } = require('child_process');
const fs = require('fs-extra');
const path = require('path');

// Create lib directory if it doesn't exist
const libDir = path.join(__dirname, '..', 'lib');
fs.ensureDirSync(libDir);

// Initialize git repository if not already initialized
if (!fs.existsSync(path.join(__dirname, '..', '.git'))) {
  execSync('git init', { stdio: 'pipe' });
}

// Dependencies to install
const dependencies = [
  'OpenZeppelin/openzeppelin-contracts',
  'OpenZeppelin/openzeppelin-contracts-upgradeable',
  'transmissions11/solmate',
  'vectorized/solady',
  'foundry-rs/forge-std',
  'Uniswap/v2-core',
  'Uniswap/v2-periphery',
  'Uniswap/v3-core',
  'Uniswap/v3-periphery',
  'Uniswap/solidity-lib',
  'aave/aave-v3-core',
  'aave/aave-v3-periphery',
  'compound-finance/compound-protocol',
  'smartcontractkit/chainlink'
];

console.log('Installing dependencies...');

// Install each dependency
for (const dep of dependencies) {
  try {
    console.log(`Installing ${dep}...`);
    execSync(`forge install ${dep} --no-commit`, { 
      cwd: path.join(__dirname, '..'),
      stdio: 'pipe'
    });
    console.log(`Successfully installed ${dep}`);
  } catch (error) {
    console.error(`Failed to install ${dep}:`, error.message);
  }
}

// Create remappings.txt
const remappings = [
  '@openzeppelin/contracts=lib/openzeppelin-contracts/contracts',
  '@openzeppelin/contracts-upgradeable=lib/openzeppelin-contracts-upgradeable/contracts',
  'solmate/=lib/solmate/src/',
  'solady/=lib/solady/src/',
  'forge-std/=lib/forge-std/src/',
  '@uniswap/v2-core=lib/v2-core/contracts',
  '@uniswap/v2-periphery=lib/v2-periphery/contracts',
  '@uniswap/v3-core=lib/v3-core/contracts',
  '@uniswap/v3-periphery=lib/v3-periphery/contracts',
  '@uniswap/lib=lib/solidity-lib/contracts',
  '@aave/core-v3=lib/aave-v3-core/contracts',
  '@aave/periphery-v3=lib/aave-v3-periphery/contracts',
  '@compound-finance/contracts=lib/compound-protocol/contracts',
  '@chainlink/contracts=lib/chainlink/contracts'
];

fs.writeFileSync(
  path.join(__dirname, '..', 'remappings.txt'),
  remappings.join('\n')
);

console.log('Dependencies installation completed.'); 