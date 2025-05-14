/**
 * Install Dependencies Script
 * Runs during npm install to pre-install common Solidity dependencies
 * Updated to support version-in-path import pattern: @openzeppelin/contracts@4.9.5/token/ERC20/ERC20.sol
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('Running post-install script to set up Foundry dependencies...');

// Ensure src directories exist
ensureDirectories();

// Skip when CI=true or when running as a dependency
if (process.env.CI === 'true' || process.env.SKIP_DEPS === 'true') {
  console.log('Skipping Foundry dependency installation in CI environment');
  process.exit(0);
}

// Load dependencies config after ensuring directories exist
const dependencies = require('../src/config/dependencies');

// Check if Foundry is installed
checkFoundryInstallation()
  .then(installed => {
    if (!installed) {
      console.warn('Foundry is not installed. Please install it before using this package.');
      console.warn('Visit https://book.getfoundry.sh/getting-started/installation for installation instructions.');
      process.exit(0);
    }
    
    return setupLibraryDirectory();
  })
  .then(() => {
    return installDependencies();
  })
  .then(() => {
    console.log('Successfully installed Foundry dependencies!');
  })
  .catch(error => {
    console.error('Error installing dependencies:', error);
    // Exit with success to not break npm install
    process.exit(0);
  });

/**
 * Ensure required directories exist
 */
function ensureDirectories() {
  const dirs = [
    path.resolve(process.cwd(), 'src'),
    path.resolve(process.cwd(), 'src/config'),
    path.resolve(process.cwd(), 'src/controllers'),
    path.resolve(process.cwd(), 'src/services'),
    path.resolve(process.cwd(), 'src/utils'),
    path.resolve(process.cwd(), 'src/middleware'),
    path.resolve(process.cwd(), 'test'),
    path.resolve(process.cwd(), 'test/unit'),
    path.resolve(process.cwd(), 'test/integration'),
    path.resolve(process.cwd(), 'tmp')
  ];
  
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      console.log(`Creating directory: ${dir}`);
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

/**
 * Check if Foundry is installed
 * @returns {Promise<boolean>} True if installed
 */
async function checkFoundryInstallation() {
  return new Promise(resolve => {
    const forgeCmd = process.platform === 'win32' ? 'forge.exe' : 'forge';
    
    const command = spawn(forgeCmd, ['--version'], {
      shell: true,
      stdio: 'pipe'
    });
    
    command.on('close', code => {
      resolve(code === 0);
    });
    
    command.on('error', () => {
      resolve(false);
    });
  });
}

/**
 * Set up library directory
 * @returns {Promise<void>}
 */
async function setupLibraryDirectory() {
  const libPath = path.resolve(process.cwd(), 'lib');
  
  if (!fs.existsSync(libPath)) {
    console.log('Creating lib directory...');
    fs.mkdirSync(libPath, { recursive: true });
  }
  
  return Promise.resolve();
}

/**
 * Install all dependencies from configuration
 * @returns {Promise<void>}
 */
async function installDependencies() {
  console.log('Installing pre-configured dependencies...');
  
  // Flatten all dependencies
  const allDependencies = Object.values(dependencies).flat();
  
  // Install each dependency
  for (const dep of allDependencies) {
    try {
      await installDependency(dep.github, dep.version, dep.alias, dep.versionSuffix);
      console.log(`✓ Installed ${dep.name} (${dep.github}@${dep.version})`);
    } catch (error) {
      console.error(`× Failed to install ${dep.name} (${dep.github}@${dep.version}): ${error.message}`);
    }
  }
}

/**
 * Install a single dependency
 * @param {string} repo - GitHub repository
 * @param {string} version - Version to install
 * @param {string} alias - Alias for the dependency
 * @param {string} versionSuffix - Version suffix for remappings
 * @returns {Promise<void>}
 */
function installDependency(repo, version, alias, versionSuffix) {
  return new Promise((resolve, reject) => {
    // If alias directory already exists, skip
    const aliasPath = path.resolve(process.cwd(), 'lib', alias || repo.split('/')[1]);
    if (fs.existsSync(aliasPath)) {
      return resolve();
    }
    
    console.log(`Installing ${repo}@${version}...`);
    
    const args = ['install', `${repo}@${version}`];
    
    // Add alias if provided
    // if (alias) {
    //   args.push('--alias');
    //   args.push(alias);
    // }
    
    const command = spawn('forge', args, {
      shell: true,
      cwd: process.cwd(),
      stdio: 'pipe'
    });
    
    let stderr = '';
    
    command.stderr.on('data', data => {
      stderr += data.toString();
    });
    
    command.on('close', code => {
      if (code === 0) {
        // After successful installation, update remappings.txt to include version-in-path style
        if (repo === 'OpenZeppelin/openzeppelin-contracts' && versionSuffix) {
          addVersionPathRemapping(alias || repo.split('/')[1], versionSuffix);
        } else if (repo === 'OpenZeppelin/openzeppelin-contracts-upgradeable' && versionSuffix) {
          addVersionPathRemapping(alias || repo.split('/')[1], versionSuffix, true);
        }
        resolve();
      } else {
        reject(new Error(`Forge install failed with code ${code}: ${stderr}`));
      }
    });
    
    command.on('error', error => {
      reject(new Error(`Failed to run forge install: ${error.message}`));
    });
  });
}

/**
 * Add version-in-path style remappings to remappings.txt
 * @param {string} folderName - Library folder name
 * @param {string} versionSuffix - Version suffix for remapping
 * @param {boolean} isUpgradeable - Whether this is for upgradeable contracts
 */
function addVersionPathRemapping(folderName, versionSuffix, isUpgradeable = false) {
  const remappingsPath = path.resolve(process.cwd(), 'remappings.txt');
  
  // Skip if remappings.txt doesn't exist
  if (!fs.existsSync(remappingsPath)) {
    return;
  }
  
  try {
    let remappings = fs.readFileSync(remappingsPath, 'utf8').split('\n');
    
    // Create new version-in-path style remapping
    const packageName = isUpgradeable ? 'contracts-upgradeable' : 'contracts';
    const newRemapping = `@openzeppelin/${packageName}@${versionSuffix}/=lib/${folderName}/contracts/`;
    
    // Add the remapping if it doesn't already exist
    if (!remappings.includes(newRemapping)) {
      remappings.push(newRemapping);
      fs.writeFileSync(remappingsPath, remappings.join('\n'));
      console.log(`Added version-in-path remapping: ${newRemapping}`);
    }
  } catch (error) {
    console.error(`Error updating remappings.txt: ${error.message}`);
  }
}