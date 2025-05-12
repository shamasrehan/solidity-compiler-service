const { execSync } = require('child_process');
const fs = require('fs-extra');
const path = require('path');
const { checkDependencyInstalled, createRemappingsFile } = require('./foundryUtils');

/**
 * Analyze contract code for imports and extract dependencies
 * @param {string} code - Solidity code
 * @returns {string[]} Array of dependencies
 */
function extractDependenciesFromCode(code) {
  const dependencies = new Set();
  
  // Track dependencies with their versions
  const dependencyVersions = new Map();
  
  // Common patterns for imports in Solidity
  const importPatterns = [
    // Direct GitHub imports: import "github.com/OpenZeppelin/openzeppelin-contracts/contracts/...";
    /import\s+["']github\.com\/([^\/]+\/[^\/]+)\/.*["']/g,
    
    // OpenZeppelin style imports with version: import "@openzeppelin/contracts@4.9.5/token/ERC20/ERC20.sol";
    /import\s+["']@([^\/]+)\/([^\/]+)@([^\/]+)\/.*["']/g,
    
    // OpenZeppelin style imports without version: import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
    /import\s+["']@([^\/]+)\/([^\/]+)\/.*["']/g,
    
    // General imports that might indicate dependencies
    /import\s+["']([^\.\/][^"'@]+)(?:@([^\/]+))?\/.*["']/g
  ];
  
  // Map of import patterns to actual forge install repositories
  const dependencyMap = {
    '@openzeppelin/contracts': 'OpenZeppelin/openzeppelin-contracts',
    '@openzeppelin/contracts-upgradeable': 'OpenZeppelin/openzeppelin-contracts-upgradeable',
    'solmate': 'transmissions11/solmate',
    'solady': 'vectorized/solady',
    'forge-std': 'foundry-rs/forge-std'
  };
  
  // Process each line to find imports
  const lines = code.split('\n');
  
  for (const line of lines) {
    // Skip comment lines
    if (line.trim().startsWith('//')) continue;
    
    // First, check for versioned imports (most specific)
    const versionedMatch = line.match(/import\s+["']@([^\/]+)\/([^\/]+)@([^\/]+)\/.*["']/);
    if (versionedMatch) {
      const [_, scope, packageName, version] = versionedMatch;
      const packageId = `@${scope}/${packageName}`;
      
      // Map to GitHub repository
      if (dependencyMap[packageId]) {
        const repoWithVersion = `${dependencyMap[packageId]}@${version}`;
        dependencies.add(dependencyMap[packageId]); // Add without version as fallback
        dependencies.add(repoWithVersion); // Add with version
        dependencyVersions.set(dependencyMap[packageId], version);
      }
      continue; // Skip other patterns if we found a versioned import
    }
    
    // Check each pattern
    for (const pattern of importPatterns) {
      const matches = [...line.matchAll(pattern)];
      
      for (const match of matches) {
        if (match[1]) {
          // Handle different types of imports
          if (match[0].includes('@') && match[2]) {
            // Scoped package: @scope/package
            const packageId = `@${match[1]}/${match[2]}`;
            if (dependencyMap[packageId]) {
              dependencies.add(dependencyMap[packageId]);
            }
          } else if (match[1].includes('/')) {
            // Direct GitHub imports: owner/repo
            const repoPath = match[1];
            if (repoPath.includes('/') && !repoPath.includes('//', 2)) {
              dependencies.add(repoPath);
            }
          } else {
            // General package
            const packageName = match[1];
            const version = match[2]; // This might be undefined
            
            // If there's a version, capture it
            if (version && dependencyMap[packageName]) {
              const repoWithVersion = `${dependencyMap[packageName]}@${version}`;
              dependencies.add(dependencyMap[packageName]); // Add without version as fallback
              dependencies.add(repoWithVersion); // Add with version
              dependencyVersions.set(dependencyMap[packageName], version);
            } else if (dependencyMap[packageName]) {
              dependencies.add(dependencyMap[packageName]);
            }
          }
        }
      }
    }
  }
  
  // Look for specific patterns indicating common libraries
  if (code.includes('@openzeppelin') || code.includes('OpenZeppelin')) {
    if (!dependencies.has('OpenZeppelin/openzeppelin-contracts')) {
      dependencies.add('OpenZeppelin/openzeppelin-contracts');
    }
  }
  
  if (code.includes('contracts-upgradeable') || code.includes('UpgradeableBeacon')) {
    if (!dependencies.has('OpenZeppelin/openzeppelin-contracts-upgradeable')) {
      dependencies.add('OpenZeppelin/openzeppelin-contracts-upgradeable');
    }
  }
  
  if (code.includes('solmate') || code.includes('Solmate')) {
    if (!dependencies.has('transmissions11/solmate')) {
      dependencies.add('transmissions11/solmate');
    }
  }
  
  if (code.includes('solady') || code.includes('Solady')) {
    if (!dependencies.has('vectorized/solady')) {
      dependencies.add('vectorized/solady');
    }
  }
  
  // Extract version from pragma statement as a fallback for dependencies without explicit versions
  const pragmaMatch = code.match(/pragma\s+solidity\s+(\^|~|>=|<=|>|<)?\s*(\d+\.\d+\.\d+)/);
  const solidityVersion = pragmaMatch ? pragmaMatch[2] : null;
  
  // Filter out invalid dependency formats and prepare final result
  const result = [];
  
  for (const dep of dependencies) {
    // Skip if already contains a version
    if (dep.includes('@')) {
      // Validate format: owner/repo@version
      if (/^[^\/]+\/[^\/]+@[\w\.\-]+$/.test(dep)) {
        result.push(dep);
      }
      continue;
    }
    
    // Only keep deps that look like GitHub repos (owner/repo)
    if (/^[^\/]+\/[^\/]+$/.test(dep)) {
      // Check if we have a specific version for this dependency
      if (dependencyVersions.has(dep)) {
        result.push(`${dep}@${dependencyVersions.get(dep)}`);
      } else {
        result.push(dep);
      }
    }
  }
  
  return result;
}

/**
 * Install dependencies using forge
 * @param {string} contractDir - Directory of the contract
 * @param {string[]} dependencies - List of dependencies to install
 * @returns {Object} Object with installed and failed dependencies
 */
async function installDependencies(contractDir, dependencies) {
  if (!dependencies || dependencies.length === 0) return { installed: [], failed: [] };
  
  // Create lib directory if it doesn't exist
  const libDir = path.join(contractDir, 'lib');
  fs.ensureDirSync(libDir);
  
  const installed = [];
  const failed = [];
  
  // Track version-specific dependencies separately for special handling
  const versionedDeps = new Map();
  dependencies.forEach(dep => {
    if (dep.includes('@')) {
      const [repo, version] = dep.split('@');
      versionedDeps.set(repo, version);
    }
  });
  
  // Initialize git repository if not already initialized
  try {
    if (!fs.existsSync(path.join(contractDir, '.git'))) {
      execSync('git init', { cwd: contractDir, stdio: 'pipe' });
      console.log('Git repository initialized');
    }
  } catch (error) {
    console.warn('Failed to initialize git repository, forge install may not work correctly:', error.message);
  }
  
  // Check forge install help to see available options
  let noCommitOption = '--no-commit';
  try {
    const forgeInstallHelp = execSync('forge install --help', { 
      encoding: 'utf8',
      stdio: 'pipe'
    });
    
    // If --no-commit is not an option, don't use it
    if (!forgeInstallHelp.includes('--no-commit')) {
      noCommitOption = '';
      console.log('--no-commit option not available, using default commit behavior');
    }
  } catch (error) {
    console.warn('Failed to check forge install options:', error.message);
    noCommitOption = ''; // Default to not using the option if we can't check
  }
  
  // Process dependencies without versions first
  for (const dep of dependencies) {
    // Skip versioned deps in this loop - handle them separately below
    if (dep.includes('@')) continue;
    
    try {
      // Skip if already installed
      if (checkDependencyInstalled(contractDir, dep)) {
        console.log(`Dependency already installed: ${dep}`);
        installed.push(dep);
        continue;
      }
      
      // Check if we have a specific version for this dependency
      if (versionedDeps.has(dep)) {
        const version = versionedDeps.get(dep);
        console.log(`Installing dependency with version: ${dep}@${version}`);
        try {
          const installCommand = `forge install ${dep}@${version}${noCommitOption ? ' ' + noCommitOption : ''}`;
          console.log(`Running: ${installCommand}`);
          
          execSync(installCommand, { 
            cwd: contractDir,
            stdio: 'pipe' 
          });
          
          installed.push(`${dep}@${version}`);
          console.log(`Successfully installed dependency: ${dep}@${version}`);
          continue;
        } catch (versionError) {
          console.error(`Failed to install versioned dependency ${dep}@${version}:`, versionError.message);
          // Fall back to installing without version if versioned install fails
        }
      }
      
      console.log(`Installing dependency: ${dep}`);
      // Use a more reliable install command based on detected options
      const installCommand = `forge install ${dep}${noCommitOption ? ' ' + noCommitOption : ''}`;
      console.log(`Running: ${installCommand}`);
      
      execSync(installCommand, { 
        cwd: contractDir,
        stdio: 'pipe' 
      });
      
      installed.push(dep);
      console.log(`Successfully installed dependency: ${dep}`);
    } catch (error) {
      console.error(`Failed to install dependency ${dep}:`, error.message);
      
      // Special handling for OpenZeppelin - try alternative approaches if this fails
      if (dep === 'OpenZeppelin/openzeppelin-contracts') {
        try {
          console.log('Trying alternative installation for OpenZeppelin...');
          // Try without options
          execSync(`forge install OpenZeppelin/openzeppelin-contracts`, {
            cwd: contractDir,
            stdio: 'pipe'
          });
          
          console.log('OpenZeppelin installed via alternative method');
          installed.push(dep);
          continue;
        } catch (altError) {
          console.error('Alternative installation also failed:', altError.message);
          
          // Try with git clone as last resort
          try {
            console.log('Trying git clone for OpenZeppelin...');
            // Check if we need a specific version
            const version = versionedDeps.get(dep) || 'master';
            const gitCommand = `git clone -b ${version} https://github.com/OpenZeppelin/openzeppelin-contracts.git lib/openzeppelin-contracts`;
            console.log(`Running: ${gitCommand}`);
            
            execSync(gitCommand, {
              cwd: contractDir,
              stdio: 'pipe'
            });
            
            console.log(`OpenZeppelin installed via git clone using branch/tag: ${version}`);
            installed.push(version === 'master' ? dep : `${dep}@${version}`);
            continue;
          } catch (gitError) {
            console.error('Git clone also failed:', gitError.message);
          }
        }
      }
      
      failed.push({ dep, error: error.message });
    }
  }
  
  // Now process versioned dependencies that haven't been handled yet
  for (const dep of dependencies) {
    if (!dep.includes('@') || installed.includes(dep)) continue;
    
    try {
      const [repo, version] = dep.split('@');
      
      // Skip if we already installed this repo (with or without version)
      if (installed.includes(repo) || installed.includes(dep)) {
        console.log(`Dependency already installed: ${dep}`);
        continue;
      }
      
      console.log(`Installing versioned dependency: ${dep}`);
      const installCommand = `forge install ${dep}${noCommitOption ? ' ' + noCommitOption : ''}`;
      console.log(`Running: ${installCommand}`);
      
      execSync(installCommand, { 
        cwd: contractDir,
        stdio: 'pipe' 
      });
      
      installed.push(dep);
      console.log(`Successfully installed dependency: ${dep}`);
    } catch (error) {
      console.error(`Failed to install versioned dependency ${dep}:`, error.message);
      
      // Special handling for versioned OpenZeppelin
      if (dep.startsWith('OpenZeppelin/openzeppelin-contracts@')) {
        try {
          const [repo, version] = dep.split('@');
          console.log(`Trying git clone for OpenZeppelin version ${version}...`);
          
          // For tagged versions, OpenZeppelin uses 'v' prefix
          const tagPrefix = version !== 'master' && !version.startsWith('v') ? 'v' : '';
          const gitCommand = `git clone -b ${tagPrefix}${version} https://github.com/OpenZeppelin/openzeppelin-contracts.git lib/openzeppelin-contracts`;
          console.log(`Running: ${gitCommand}`);
          
          execSync(gitCommand, {
            cwd: contractDir,
            stdio: 'pipe'
          });
          
          console.log(`OpenZeppelin ${version} installed via git clone`);
          installed.push(dep);
          continue;
        } catch (gitError) {
          console.error(`Git clone for version ${dep.split('@')[1]} failed:`, gitError.message);
          failed.push({ dep, error: gitError.message });
        }
      } else {
        failed.push({ dep, error: error.message });
      }
    }
  }
  
  // Create remappings file after installing dependencies
  createRemappingsFile(contractDir, dependencies);
  
  return { installed, failed };
}

/**
 * Handle OpenZeppelin manually if installation failed
 * @param {string} contractDir - Contract directory
 * @param {string[]} dependencies - List of dependencies
 * @param {Object} dependencyResults - Results from installDependencies
 * @returns {string[]} Updated list of installed dependencies
 */
async function handleOpenZeppelinManually(contractDir, dependencies, dependencyResults) {
  if (!dependencyResults.failed.some(f => f.dep.startsWith('OpenZeppelin/openzeppelin-contracts'))) {
    return dependencyResults.installed;
  }
  
  console.log('Manual handling for OpenZeppelin dependencies...');
  const installed = [...dependencyResults.installed];
  
  try {
    // Create directory structure for OpenZeppelin
    const ozDir = path.join(contractDir, 'lib/openzeppelin-contracts');
    const ozContractsDir = path.join(ozDir, 'contracts');
    fs.ensureDirSync(ozContractsDir);
    
    // Get version if specified
    let version = 'master';
    for (const dep of dependencies) {
      if (dep.startsWith('OpenZeppelin/openzeppelin-contracts@')) {
        version = dep.split('@')[1];
        break;
      }
    }
    
    // Try to git clone directly with specified version
    try {
      // For tagged versions, OpenZeppelin uses 'v' prefix
      const tagPrefix = version !== 'master' && !version.startsWith('v') ? 'v' : '';
      const cloneCmd = `git clone -b ${tagPrefix}${version} https://github.com/OpenZeppelin/openzeppelin-contracts.git lib/openzeppelin-contracts`;
      
      console.log(`Running: ${cloneCmd}`);
      execSync(cloneCmd, {
        cwd: contractDir,
        stdio: 'pipe'
      });
      console.log(`Successfully cloned OpenZeppelin contracts manually with version ${version}`);
      
      // Add to installed list
      if (version === 'master') {
        if (!installed.includes('OpenZeppelin/openzeppelin-contracts')) {
          installed.push('OpenZeppelin/openzeppelin-contracts');
        }
      } else {
        if (!installed.includes(`OpenZeppelin/openzeppelin-contracts@${version}`)) {
          installed.push(`OpenZeppelin/openzeppelin-contracts@${version}`);
        }
      }
    } catch (cloneError) {
      console.warn(`Failed to git clone OpenZeppelin with version ${version}:`, cloneError.message);
      
      // Try without version if specific version failed
      try {
        console.log('Trying to clone default/master branch of OpenZeppelin...');
        execSync(`git clone https://github.com/OpenZeppelin/openzeppelin-contracts.git lib/openzeppelin-contracts`, {
          cwd: contractDir,
          stdio: 'pipe'
        });
        console.log('Successfully cloned OpenZeppelin contracts master branch');
        
        if (!installed.includes('OpenZeppelin/openzeppelin-contracts')) {
          installed.push('OpenZeppelin/openzeppelin-contracts');
        }
      } catch (defaultCloneError) {
        console.error('Failed to clone OpenZeppelin master branch:', defaultCloneError.message);
      }
    }
  } catch (manualError) {
    console.error('Manual handling for OpenZeppelin failed:', manualError.message);
  }
  
  return installed;
}

module.exports = {
  extractDependenciesFromCode,
  installDependencies,
  handleOpenZeppelinManually
};