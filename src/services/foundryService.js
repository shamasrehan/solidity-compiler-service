/**
 * Foundry Service
 * Handles interactions with the Foundry toolchain
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs-extra');
const logger = require('../utils/logger');
const config = require('../config/config');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Verifies that Foundry is installed and accessible
 * @returns {Promise<boolean>} True if Foundry is correctly installed
 */
async function verifyFoundryInstallation() {
  try {
    await runFoundryCommand(['--version']);
    logger.info('Foundry installation verified');
    return true;
  } catch (error) {
    logger.error('Foundry installation check failed:', error);
    throw new ApiError('Foundry is not properly installed or accessible', 500);
  }
}

/**
 * Runs a Foundry command
 * @param {Array<string>} args - Command arguments
 * @param {Object} options - Command options
 * @returns {Promise<{stdout: string, stderr: string}>} Command output
 */
async function runFoundryCommand(args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const forgeCmd = process.platform === 'win32' ? 'forge.exe' : 'forge';
    const forgePath = path.join(config.foundry.binPath, forgeCmd);
    
    const command = spawn(forgePath, args, {
      ...options,
      shell: true,
      env: { ...process.env, ...options.env },
    });
    
    const stdout = [];
    const stderr = [];
    
    command.stdout.on('data', (data) => {
      const output = data.toString();
      stdout.push(output);
      logger.debug(`Forge stdout: ${output}`);
    });
    
    command.stderr.on('data', (data) => {
      const output = data.toString();
      stderr.push(output);
      logger.debug(`Forge stderr: ${output}`);
    });
    
    command.on('close', (code) => {
      if (code === 0) {
        resolve({
          stdout: stdout.join(''),
          stderr: stderr.join('')
        });
      } else {
        const error = new Error(`Forge command failed with code ${code}`);
        error.stdout = stdout.join('');
        error.stderr = stderr.join('');
        reject(error);
      }
    });
    
    command.on('error', (error) => {
      logger.error(`Failed to spawn forge command: ${error.message}`);
      reject(error);
    });
    
    // Handle timeout
    if (options.timeout) {
      setTimeout(() => {
        command.kill();
        const error = new Error('Forge command timed out');
        error.name = 'TimeoutError';
        reject(error);
      }, options.timeout);
    }
  });
}

/**
 * Compiles a contract using Foundry
 * @param {string} projectPath - Path to the project directory
 * @param {Object} options - Compilation options
 * @returns {Promise<Object>} Compilation result
 */
async function compileContract(projectPath, options = {}) {
  const {
    solidityVersion = config.foundry.defaultSolidityVersion,
    evmVersion = config.foundry.defaultEvmVersion,
    optimize = true,
    optimizeRuns = 200,
  } = options;
  
  logger.info(`Compiling contract with Solidity v${solidityVersion}, EVM ${evmVersion}`);
  
  try {
    // Set up Foundry command arguments
    const args = ['build', '--build-info'];
    
    // Handle Solidity version
    if (solidityVersion && solidityVersion !== 'latest') {
      args.push('--use', `solc:${solidityVersion}`);
    }
    
    // Handle EVM version
    args.push('--evm-version', evmVersion);
    
    // Handle optimization settings
    if (optimize) {
      args.push('--optimize');
      args.push('--optimizer-runs', optimizeRuns.toString());
    }
    
    // Add verbosity for better debugging
    args.push('-v');
    
    // Execute forge build command
    const { stdout, stderr } = await runFoundryCommand(args, {
      cwd: projectPath,
      timeout: config.foundry.timeout,
    });
    
    // Check if build-info file was generated
    const buildInfoDir = path.join(projectPath, 'out', 'build-info');
    if (await fs.pathExists(buildInfoDir)) {
      const files = await fs.readdir(buildInfoDir);
      if (files.length > 0) {
        const buildInfoPath = path.join(buildInfoDir, files[0]);
        const buildInfo = await fs.readJson(buildInfoPath);
        return buildInfo;
      }
    }
    
    // If no build info was found but the command succeeded, return basic success
    return {
      success: true,
      output: stdout,
      warnings: stderr,
    };
  } catch (error) {
    logger.error('Contract compilation failed:', error);
    
    // Format the error message
    const errorMsg = error.stderr || error.message;
    throw new ApiError(`Compilation failed: ${errorMsg}`, 400);
  }
}

/**
 * Installs a dependency using Foundry
 * @param {string} projectPath - Path to the project directory
 * @param {string} repo - GitHub repository in format user/repo
 * @param {string} version - Version or branch/tag
 * @returns {Promise<boolean>} True if installation succeeded
 */
async function installDependency(projectPath, repo, version = 'main') {
  logger.info(`Installing dependency: ${repo}@${version} in ${projectPath}`);
  
  try {
    // Format the installation command
    const args = ['install', `${repo}@${version}`];
    
    // Execute forge install command
    const { stdout } = await runFoundryCommand(args, {
      cwd: projectPath,
      timeout: config.foundry.timeout,
    });
    
    logger.info(`Successfully installed dependency: ${repo}@${version}`);
    logger.debug(stdout);
    
    return true;
  } catch (error) {
    logger.error(`Failed to install dependency ${repo}@${version}:`, error);
    // This is not a fatal error, as we want to continue compilation even if some dependencies fail
    return false;
  }
}

/**
 * Extracts import statements from contract code
 * @param {string} contractCode - Solidity contract code
 * @returns {Array<string>} Array of import paths
 */
function extractImports(contractCode) {
  // Match different types of import statements in Solidity
  const importRegex = /import\s+(?:{[^}]*}|"[^"]*"|'[^']*'|[^;]*)\s*(?:from\s+)?["']([^"']+)["'];/g;
  const matches = [];
  let match;
  
  while ((match = importRegex.exec(contractCode)) !== null) {
    matches.push(match[1]);
  }
  
  logger.debug(`Extracted ${matches.length} imports:`, matches);
  return matches;
}

/**
 * Parses GitHub URL from an import path
 * @param {string} importPath - Import path from contract
 * @returns {Object|null} GitHub repository info or null if not a GitHub URL
 */
function parseGitHubUrl(importPath) {
  // GitHub URL patterns
  const githubPatterns = [
    // Pattern for direct GitHub imports like "github.com/user/repo/path"
    /github\.com\/([^\/]+)\/([^\/]+)(?:\/|$)/,
    // Pattern for OpenZeppelin style imports like "@openzeppelin/contracts/..."
    /@([^\/]+)\/([^\/]+)/,
  ];
  
  for (const pattern of githubPatterns) {
    const match = importPath.match(pattern);
    if (match) {
      const [, user, repo] = match;
      return {
        user,
        repo,
        fullRepo: `${user}/${repo}`,
      };
    }
  }
  
  return null;
}

module.exports = {
  verifyFoundryInstallation,
  runFoundryCommand,
  compileContract,
  installDependency,
  extractImports,
  parseGitHubUrl,
};