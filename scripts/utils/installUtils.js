/**
 * Installation utilities for dependency management
 * Provides common functions for installation scripts
 */

const fs = require('fs-extra');
const path = require('path');
const { spawn, execSync } = require('child_process');
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);
const logger = console;

/**
 * Ensure required directories exist
 * @param {string} projectPath - Path to project directory
 * @returns {Promise<void>}
 */
async function ensureDirectories(projectPath = process.cwd()) {
  const dirs = [
    path.resolve(projectPath, 'src'),
    path.resolve(projectPath, 'src/config'),
    path.resolve(projectPath, 'lib'),
    path.resolve(projectPath, 'out'),
    path.resolve(projectPath, 'tmp')
  ];
  
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      logger.log(`Creating directory: ${dir}`);
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

/**
 * Check if Foundry is installed
 * @returns {Promise<boolean>} True if installed
 */
async function checkFoundryInstallation() {
  try {
    const forgeCmd = process.platform === 'win32' ? 'forge.exe' : 'forge';
    
    const result = await exec(`${forgeCmd} --version`);
    logger.log(`Foundry is installed: ${result.stdout.trim()}`);
    return true;
  } catch (error) {
    logger.warn(`Foundry is not installed: ${error.message}`);
    return false;
  }
}

/**
 * Find the forge binary path
 * @returns {Promise<string|null>} Path to forge binary or null if not found
 */
async function findForgePath() {
  const isWindows = process.platform === 'win32';
  const forgeCmd = isWindows ? 'forge.exe' : 'forge';
  
  try {
    // Try using which/where command
    const command = isWindows ? 'where' : 'which';
    const { stdout } = await exec(`${command} ${forgeCmd}`);
    const forgePathFromEnv = stdout.toString().trim().split('\n')[0];
    
    if (forgePathFromEnv && fs.existsSync(forgePathFromEnv)) {
      return forgePathFromEnv;
    }
  } catch (error) {
    // Ignore error and try other methods
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
 * Install a dependency using Foundry (forge install)
 * @param {string} projectPath - Path to project directory
 * @param {string} repo - GitHub repository (user/repo)
 * @param {string} version - Version or branch name
 * @param {string} alias - Optional alias for the dependency
 * @returns {Promise<boolean>} True if successful
 */
async function installDependencyWithForge(projectPath, repo, version = 'main', alias = null) {
  return new Promise((resolve) => {
    logger.log(`Installing ${repo}@${version}${alias ? ` as ${alias}` : ''}...`);
    
    // Build the command arguments
    const args = ['install', `${repo}@${version}`];
    if (alias) {
      args.push('--alias', alias);
    }
    
    // Run the forge command
    const command = spawn('forge', args, {
      shell: true,
      cwd: projectPath,
      stdio: 'pipe'
    });
    
    let stdout = '';
    let stderr = '';
    
    command.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    command.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    command.on('close', (code) => {
      if (code === 0) {
        logger.log(`✅ Successfully installed ${repo}@${version}`);
        resolve(true);
      } else {
        logger.error(`❌ Failed to install ${repo}@${version}: ${stderr.trim()}`);
        resolve(false);
      }
    });
    
    command.on('error', (error) => {
      logger.error(`❌ Error running forge command: ${error.message}`);
      resolve(false);
    });
  });
}

/**
 * Clone a dependency using git
 * @param {string} projectPath - Path to project directory
 * @param {string} repo - GitHub repository (user/repo)
 * @param {string} version - Version or branch name
 * @param {string} targetDir - Target directory name
 * @returns {Promise<boolean>} True if successful
 */
async function cloneDependencyWithGit(projectPath, repo, version = 'main', targetDir = null) {
  const depPath = path.join(projectPath, 'lib', targetDir || repo.split('/')[1]);
  
  try {
    // Remove existing directory if it exists
    if (fs.existsSync(depPath)) {
      logger.log(`Removing existing directory: ${depPath}`);
      await fs.remove(depPath);
    }
    
    logger.log(`Cloning ${repo}@${version} to ${depPath}...`);
    
    // Try shallow clone with specific branch/tag first
    const cloneCmd = `git clone --depth 1 https://github.com/${repo}.git "${depPath}" --branch ${version} || git clone --depth 1 https://github.com/${repo}.git "${depPath}"`;
    
    await exec(cloneCmd);
    logger.log(`✅ Successfully cloned ${repo}@${version}`);
    return true;
  } catch (error) {
    logger.error(`❌ Failed to clone ${repo}@${version}: ${error.message}`);
    return false;
  }
}

/**
 * Create a foundation directory with essential OpenZeppelin stubs
 * @param {string} projectPath - Path to project directory
 * @returns {Promise<boolean>} True if successful
 */
async function createFoundationStubs(projectPath) {
    try {
      const stubUtils = require('./stubUtils');
      const libPath = path.join(projectPath, 'lib');
      await fs.ensureDir(libPath);
      
      logger.log('Creating foundation stubs for common dependencies...');
      
      // Create OpenZeppelin stubs
      const ozPath = path.join(libPath, 'openzeppelin-contracts');
      await fs.ensureDir(ozPath);
      await stubUtils.createOpenZeppelinStub(ozPath);
      
      // Create remappings
      const remappings = [
        '@openzeppelin/=lib/openzeppelin-contracts/',
        '@openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/'
      ];
      
      // Write to remappings.txt
      const remappingsPath = path.join(projectPath, 'remappings.txt');
      await fs.writeFile(remappingsPath, remappings.join('\n'));
      
      logger.log('✅ Created foundation stubs and remappings');
      return true;
    } catch (error) {
      logger.error('Failed to create foundation stubs:', error);
      return false;
    }
  }

/**
 * Run a script from the scripts directory
 * @param {string} scriptName - Name of the script to run
 * @returns {Promise<boolean>} True if successful
 */
async function runScript(scriptName) {
  const scriptPath = path.join(process.cwd(), 'scripts', scriptName);
  
  if (!fs.existsSync(scriptPath)) {
    logger.error(`Script not found: ${scriptPath}`);
    return false;
  }
  
  logger.log(`Running script: ${scriptName}`);
  
  try {
    execSync(`node "${scriptPath}"`, { stdio: 'inherit' });
    logger.log(`Script ${scriptName} completed successfully`);
    return true;
  } catch (error) {
    logger.error(`Script ${scriptName} failed: ${error.message}`);
    return false;
  }
}

module.exports = {
  ensureDirectories,
  checkFoundryInstallation,
  findForgePath,
  installDependencyWithForge,
  cloneDependencyWithGit,
  runScript
};