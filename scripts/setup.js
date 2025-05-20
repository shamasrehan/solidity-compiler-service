#!/usr/bin/env node

/**
 * Setup script to help users get started with the Smart Contract Compiler API
 * Updated to use the improved dependency management system
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const readline = require('readline');
const { checkFoundryInstallation, findForgePath } = require('./utils/installUtils');

// Create readline interface
let rl;
try {
  rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
} catch (error) {
  console.error('Error creating readline interface:', error.message);
  console.log('Using alternative prompt method...');
  // If we can't create readline interface, use an alternative
  rl = {
    question: (query, callback) => {
      process.stdout.write(query);
      const stdin = process.openStdin();
      stdin.once('data', (data) => {
        callback(data.toString().trim());
        stdin.pause();
      });
    },
    close: () => {}
  };
}

console.log('Smart Contract Compiler API - Setup Script');
console.log('=========================================');
console.log('This script will help you set up the API service.');

// Check if Foundry is installed
checkFoundryInstallation()
  .then(foundryInstalled => {
    if (!foundryInstalled) {
      console.log('\n❌ Foundry is not installed!');
      console.log('Please install Foundry before continuing:');
      console.log('  1. Run: curl -L https://foundry.paradigm.xyz | bash');
      console.log('  2. Then run: foundryup');
      console.log('  3. Restart this setup script after installing Foundry');
      console.log('\nAlternatively, we can continue without Foundry and use HTTP-based dependencies.');
      
      return promptForContinueWithoutFoundry();
    }
    
    console.log('\n✅ Foundry is installed');
    return findForgePath().then(forgePath => {
      if (forgePath) {
        console.log(`\n✅ Found forge binary at: ${forgePath}`);
        console.log(`   Will use FOUNDRY_BIN_PATH=${path.dirname(forgePath)}`);
        return promptForConfiguration(path.dirname(forgePath));
      } else {
        console.log('\n⚠️ Could not locate forge binary automatically.');
        console.log('   You will need to specify the path manually.');
        return promptForConfiguration(null);
      }
    });
  })
  .then(config => {
    return createEnvFile(config);
  })
  .then(() => {
    console.log('\nInstalling dependencies...');
    const npmInstall = spawnSync('npm', ['install'], { stdio: 'inherit' });
    
    if (npmInstall.status !== 0) {
      throw new Error('Failed to install dependencies');
    }
    
    console.log('\n✅ Dependencies installed');
    
    return installSolidityDependencies();
  })
  .then(() => {
    console.log('\n🎉 Setup complete! You can now start the server:');
    console.log('   npm start');
    
    if (rl && typeof rl.close === 'function') {
      rl.close();
    }
  })
  .catch(error => {
    console.error(`\n❌ Setup failed: ${error.message}`);
    if (rl && typeof rl.close === 'function') {
      rl.close();
    }
    process.exit(1);
  });

/**
 * Prompt user if they want to continue without Foundry
 * @returns {Promise<boolean>} True if continue, false if not
 */
function promptForContinueWithoutFoundry() {
  return new Promise((resolve) => {
    rl.question('Continue without Foundry? (y/N): ', (answer) => {
      if (answer.toLowerCase() === 'y') {
        console.log('\nContinuing without Foundry, will use HTTP-based dependencies...');
        resolve(promptForConfiguration(null));
      } else {
        console.log('Please install Foundry and restart the setup script.');
        process.exit(0);
      }
    });
  });
}

/**
 * Prompt user for configuration options
 * @param {string|null} forgeBinPath - Path to forge binary directory if found
 * @returns {Promise<Object>} Configuration object
 */
async function promptForConfiguration(forgeBinPath) {
  return new Promise(resolve => {
    const defaultConfig = {
      port: 3000,
      foundryBinPath: forgeBinPath || '~/.foundry/bin',
      solidityVersion: '0.8.20',
      evmVersion: 'paris',
      maxConcurrentCompilations: 10,
      logLevel: 'info'
    };
    
    // If we don't have a proper readline interface or are in non-interactive mode,
    // just use defaults
    if (!rl || !rl.question || process.env.CI === 'true' || process.env.NON_INTERACTIVE === 'true') {
      console.log('\nUsing default configuration:');
      console.log(JSON.stringify(defaultConfig, null, 2));
      return resolve(defaultConfig);
    }
    
    console.log('\nPlease configure the service (press Enter to use defaults):');
    
    rl.question(`Port number [${defaultConfig.port}]: `, port => {
      defaultConfig.port = port || defaultConfig.port;
      
      rl.question(`Foundry bin path [${defaultConfig.foundryBinPath}]: `, foundryBinPath => {
        defaultConfig.foundryBinPath = foundryBinPath || defaultConfig.foundryBinPath;
        
        rl.question(`Default Solidity version [${defaultConfig.solidityVersion}]: `, solidityVersion => {
          defaultConfig.solidityVersion = solidityVersion || defaultConfig.solidityVersion;
          
          rl.question(`Default EVM version [${defaultConfig.evmVersion}]: `, evmVersion => {
            defaultConfig.evmVersion = evmVersion || defaultConfig.evmVersion;
            
            rl.question(`Max concurrent compilations [${defaultConfig.maxConcurrentCompilations}]: `, maxConcurrentCompilations => {
              defaultConfig.maxConcurrentCompilations = maxConcurrentCompilations || defaultConfig.maxConcurrentCompilations;
              
              rl.question(`Log level (debug, info, warn, error) [${defaultConfig.logLevel}]: `, logLevel => {
                defaultConfig.logLevel = logLevel || defaultConfig.logLevel;
                
                console.log('\nConfiguration:');
                console.log(JSON.stringify(defaultConfig, null, 2));
                
                rl.question('Is this configuration correct? (Y/n): ', answer => {
                  if (answer.toLowerCase() === 'n') {
                    console.log('Please restart the setup script to reconfigure.');
                    process.exit(0);
                  }
                  
                  resolve(defaultConfig);
                });
              });
            });
          });
        });
      });
    });
  });
}

/**
 * Create .env file with configuration
 * @param {Object} config - Configuration object
 * @returns {Promise<void>}
 */
async function createEnvFile(config) {
  return new Promise((resolve, reject) => {
    try {
      const envContent = `# Server Configuration
PORT=${config.port}
NODE_ENV=development

# Foundry Configuration
FOUNDRY_BIN_PATH=${config.foundryBinPath}
DEFAULT_SOLIDITY_VERSION=${config.solidityVersion}
DEFAULT_EVM_VERSION=${config.evmVersion}
TEMP_DIR=./tmp
COMPILATION_TIMEOUT=60000

# Dependencies Configuration
PRE_INSTALLED=true
LIB_PATH=./lib

# API Limitations
MAX_CONCURRENT_COMPILATIONS=${config.maxConcurrentCompilations}
MAX_CONTRACT_SIZE=500000

# Logging Configuration
LOG_LEVEL=${config.logLevel}
`;
      
      fs.writeFileSync(path.join(process.cwd(), '.env'), envContent);
      console.log('\n✅ Created .env file with your configuration');
      resolve();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Install Solidity dependencies
 * @returns {Promise<void>}
 */
async function installSolidityDependencies() {
  console.log('\nInstalling Solidity dependencies...');
  
  // Use our preinstall-dependencies.js script
  const preinstallDeps = spawnSync('node', ['scripts/preinstall-dependencies.js'], { 
    stdio: 'inherit',
    shell: true
  });
  
  if (preinstallDeps.status !== 0) {
    console.warn('\n⚠️ Warning: Preinstall dependencies script encountered issues.');
    console.warn('   Trying fallback HTTP method...');
    
    const downloadDeps = spawnSync('node', ['scripts/download-dependencies.js'], {
      stdio: 'inherit',
      shell: true
    });
    
    if (downloadDeps.status !== 0) {
      console.warn('\n⚠️ Warning: Failed to install Solidity dependencies.');
      console.warn('   You may need to run: npm run preinstall-deps');
      return Promise.resolve();
    }
  }
  
  console.log('\n✅ Solidity dependencies installed');
  return Promise.resolve();
}