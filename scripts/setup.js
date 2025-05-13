#!/usr/bin/env node

/**
 * Setup script to help users get started with the Smart Contract Compiler API
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const readline = require('readline');

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
      process.exit(1);
    }
    
    console.log('\n✅ Foundry is installed');
    return findForgePath();
  })
  .then(forgePath => {
    if (forgePath) {
      console.log(`\n✅ Found forge binary at: ${forgePath}`);
      console.log(`   Will use FOUNDRY_BIN_PATH=${path.dirname(forgePath)}`);
    } else {
      console.log('\n⚠️ Could not locate forge binary automatically.');
      console.log('   You will need to specify the path manually.');
    }
    
    return promptForConfiguration(forgePath ? path.dirname(forgePath) : null);
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
    
    console.log('\nPre-installing Solidity dependencies...');
    return new Promise((resolve, reject) => {
      const preinstallDeps = spawnSync('node', ['preinstall-dependencies.js'], { stdio: 'inherit' });
      
      if (preinstallDeps.status !== 0) {
        console.warn('\n⚠️ Warning: Failed to pre-install Solidity dependencies.');
        console.warn('   You may need to run: npm run preinstall-deps');
        resolve();
      } else {
        console.log('\n✅ Solidity dependencies pre-installed');
        resolve();
      }
    });
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
 * Check if Foundry is installed
 * @returns {Promise<boolean>} True if installed
 */
async function checkFoundryInstallation() {
  return new Promise(resolve => {
    const forgeCmd = process.platform === 'win32' ? 'forge.exe' : 'forge';
    const result = spawnSync(forgeCmd, ['--version'], { shell: true });
    resolve(result.status === 0);
  });
}

/**
 * Find the forge binary path
 * @returns {Promise<string|null>} Path to forge binary or null if not found
 */
async function findForgePath() {
  const isWindows = process.platform === 'win32';
  const forgeCmd = isWindows ? 'forge.exe' : 'forge';
  
  // Try to locate forge binary using 'which' or 'where' command
  try {
    const result = spawnSync(isWindows ? 'where' : 'which', ['forge'], { shell: true });
    if (result.status === 0) {
      const forgePathFromEnv = result.stdout.toString().trim().split('\n')[0];
      if (forgePathFromEnv && fs.existsSync(forgePathFromEnv)) {
        return forgePathFromEnv;
      }
    }
  } catch (error) {
    // Command failed, continue with other methods
  }
  
  // Common installation paths to check
  const possiblePaths = [
    path.join(require('os').homedir(), '.foundry', 'bin', forgeCmd),
    path.join(require('os').homedir(), '.cargo', 'bin', forgeCmd),
    '/usr/local/bin/forge',
    '/usr/bin/forge',
  ];
  
  // Add Windows-specific paths
  if (isWindows) {
    possiblePaths.push(
      path.join(process.env.USERPROFILE, '.foundry', 'bin', forgeCmd)
    );
  }
  
  // Check each path
  for (const forgePath of possiblePaths) {
    try {
      if (fs.existsSync(forgePath)) {
        return forgePath;
      }
    } catch (error) {
      // Ignore errors checking paths
    }
  }
  
  return null;
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
#!/usr/bin/env node

/**
 * Setup script to help users get started with the Smart Contract Compiler API
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

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
      process.exit(1);
    }
    
    console.log('\n✅ Foundry is installed');
    return promptForConfiguration();
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
    console.log('\n🎉 Setup complete! You can now start the server:');
    console.log('   npm start');
    
    rl.close();
  })
  .catch(error => {
    console.error(`\n❌ Setup failed: ${error.message}`);
    rl.close();
    process.exit(1);
  });

/**
 * Check if Foundry is installed
 * @returns {Promise<boolean>} True if installed
 */
async function checkFoundryInstallation() {
  return new Promise(resolve => {
    const forgeCmd = process.platform === 'win32' ? 'forge.exe' : 'forge';
    const result = spawnSync(forgeCmd, ['--version'], { shell: true });
    resolve(result.status === 0);
  });
}

/**
 * Prompt user for configuration options
 * @returns {Promise<Object>} Configuration object
 */
async function promptForConfiguration() {
  return new Promise(resolve => {
    const defaultConfig = {
      port: 3000,
      solidityVersion: '0.8.20',
      evmVersion: 'paris',
      maxConcurrentCompilations: 10,
      logLevel: 'info'
    };
    
    console.log('\nPlease configure the service (press Enter to use defaults):');
    
    rl.question(`Port number [${defaultConfig.port}]: `, port => {
      defaultConfig.port = port || defaultConfig.port;
      
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
FOUNDRY_BIN_PATH=/usr/local/bin
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