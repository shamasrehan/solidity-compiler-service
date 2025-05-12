const { execSync } = require('child_process');
const fs = require('fs-extra');
const path = require('path');
const { checkDependencyInstalled, createRemappingsFile, verifyDependencyInstallation } = require('./foundryUtils');

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
  
  // Expanded map of import patterns to actual forge install repositories
  const dependencyMap = {
    // OpenZeppelin
    '@openzeppelin/contracts': 'OpenZeppelin/openzeppelin-contracts',
    '@openzeppelin/contracts-upgradeable': 'OpenZeppelin/openzeppelin-contracts-upgradeable',
    
    // Solidity libraries
    'solmate': 'transmissions11/solmate',
    'solady': 'vectorized/solady',
    'forge-std': 'foundry-rs/forge-std',
    
    // Uniswap
    '@uniswap/v2-core': 'Uniswap/v2-core',
    '@uniswap/v2-periphery': 'Uniswap/v2-periphery',
    '@uniswap/v3-core': 'Uniswap/v3-core',
    '@uniswap/v3-periphery': 'Uniswap/v3-periphery',
    '@uniswap/lib': 'Uniswap/solidity-lib',
    
    // Aave
    '@aave/core-v3': 'aave/aave-v3-core',
    '@aave/periphery-v3': 'aave/aave-v3-periphery',
    
    // Compound
    '@compound-finance/contracts': 'compound-finance/compound-protocol',
    'compound-protocol': 'compound-finance/compound-protocol',
    
    // Chainlink
    '@chainlink/contracts': 'smartcontractkit/chainlink',
    
    // ERC standards
    '@openzeppelin/contracts/token/ERC20': 'OpenZeppelin/openzeppelin-contracts',
    '@openzeppelin/contracts/token/ERC721': 'OpenZeppelin/openzeppelin-contracts',
    '@openzeppelin/contracts/token/ERC1155': 'OpenZeppelin/openzeppelin-contracts',
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
  
  // Check for specific patterns indicating common libraries and protocols
  const patterns = [
    // OpenZeppelin
    { pattern: /@openzeppelin|OpenZeppelin/, deps: ['OpenZeppelin/openzeppelin-contracts'] },
    { pattern: /contracts-upgradeable|UpgradeableBeacon/, deps: ['OpenZeppelin/openzeppelin-contracts-upgradeable'] },
    
    // Libraries
    { pattern: /solmate|Solmate/, deps: ['transmissions11/solmate'] },
    { pattern: /solady|Solady/, deps: ['vectorized/solady'] },
    
    // Uniswap
    { pattern: /IUniswapV2Factory|IUniswapV2Pair|IUniswapV2Router/, deps: ['Uniswap/v2-core', 'Uniswap/v2-periphery'] },
    { pattern: /IUniswapV3Factory|IUniswapV3Pool|ISwapRouter/, deps: ['Uniswap/v3-core', 'Uniswap/v3-periphery'] },
    
    // Aave
    { pattern: /IPool|IAavePool|ILendingPool/, deps: ['aave/aave-v3-core'] },
    
    // Compound
    { pattern: /Comptroller|CToken|CErc20|InterestRateModel/, deps: ['compound-finance/compound-protocol'] },
    
    // Chainlink
    { pattern: /AggregatorV3Interface|VRFCoordinatorV2Interface/, deps: ['smartcontractkit/chainlink'] }
  ];
  
  // Check for each pattern in the code
  for (const { pattern, deps } of patterns) {
    if (pattern.test(code)) {
      for (const dep of deps) {
        if (!dependencies.has(dep)) {
          dependencies.add(dep);
        }
      }
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
      
      // Special handling for other common dependencies
      if (dep.includes('uniswap') || dep.includes('Uniswap')) {
        try {
          console.log(`Trying git clone for ${dep}...`);
          const version = versionedDeps.get(dep) || 'master';
          const repoName = dep.split('/')[1];
          const gitCommand = `git clone -b ${version} https://github.com/${dep}.git lib/${repoName}`;
          
          execSync(gitCommand, {
            cwd: contractDir,
            stdio: 'pipe'
          });
          
          console.log(`${dep} installed via git clone using branch/tag: ${version}`);
          installed.push(version === 'master' ? dep : `${dep}@${version}`);
          continue;
        } catch (gitError) {
          console.error(`Git clone for ${dep} failed:`, gitError.message);
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
      
      // Special handling for common repositories
      const [repo, version] = dep.split('@');
      try {
        console.log(`Trying git clone for ${repo} version ${version}...`);
        
        // For tagged versions in OpenZeppelin, use 'v' prefix if not already present
        let tagPrefix = '';
        if (repo.includes('OpenZeppelin') && version !== 'master' && !version.startsWith('v')) {
          tagPrefix = 'v';
        }
        
        const repoName = repo.split('/')[1];
        const gitCommand = `git clone -b ${tagPrefix}${version} https://github.com/${repo}.git lib/${repoName}`;
        console.log(`Running: ${gitCommand}`);
        
        execSync(gitCommand, {
          cwd: contractDir,
          stdio: 'pipe'
        });
        
        console.log(`${repo} ${version} installed via git clone`);
        installed.push(dep);
        continue;
      } catch (gitError) {
        console.error(`Git clone for version ${version} failed:`, gitError.message);
        failed.push({ dep, error: gitError.message });
      }
    }
  }
  
  // Create remappings file after installing dependencies
  createRemappingsFile(contractDir, dependencies);
  
  // Verify that dependencies are properly installed
  verifyDependencyInstallation(contractDir, dependencies);
  
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
    const tokenDir = path.join(ozContractsDir, 'token');
    const erc20Dir = path.join(tokenDir, 'ERC20');
    const erc721Dir = path.join(tokenDir, 'ERC721');
    const erc721ExtDir = path.join(erc721Dir, 'extensions');
    const accessDir = path.join(ozContractsDir, 'access');
    const utilsDir = path.join(ozContractsDir, 'utils');
    const securityDir = path.join(ozContractsDir, 'security');
    
    fs.ensureDirSync(ozContractsDir);
    fs.ensureDirSync(tokenDir);
    fs.ensureDirSync(erc20Dir);
    fs.ensureDirSync(erc721Dir);
    fs.ensureDirSync(erc721ExtDir);
    fs.ensureDirSync(accessDir);
    fs.ensureDirSync(utilsDir);
    fs.ensureDirSync(securityDir);
    
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

/**
 * Handle common protocol dependencies manually if installation fails
 * @param {string} contractDir - Contract directory
 * @param {string[]} dependencies - List of dependencies
 * @param {Object} dependencyResults - Results from installDependencies
 * @returns {string[]} Updated list of installed dependencies
 */
async function handleProtocolDependenciesManually(contractDir, dependencies, dependencyResults) {
  const installed = [...dependencyResults.installed];
  const failedDeps = dependencyResults.failed.map(f => f.dep);
  
  // Define protocols to handle manually
  const protocols = [
    {
      name: 'Uniswap V2 Core',
      pattern: dep => dep.startsWith('Uniswap/v2-core'),
      repoUrl: 'https://github.com/Uniswap/v2-core.git',
      libPath: 'lib/v2-core'
    },
    {
      name: 'Uniswap V2 Periphery',
      pattern: dep => dep.startsWith('Uniswap/v2-periphery'),
      repoUrl: 'https://github.com/Uniswap/v2-periphery.git',
      libPath: 'lib/v2-periphery'
    },
    {
      name: 'Uniswap V3 Core',
      pattern: dep => dep.startsWith('Uniswap/v3-core'),
      repoUrl: 'https://github.com/Uniswap/v3-core.git',
      libPath: 'lib/v3-core'
    },
    {
      name: 'Uniswap V3 Periphery',
      pattern: dep => dep.startsWith('Uniswap/v3-periphery'),
      repoUrl: 'https://github.com/Uniswap/v3-periphery.git',
      libPath: 'lib/v3-periphery'
    },
    {
      name: 'Aave V3 Core',
      pattern: dep => dep.startsWith('aave/aave-v3-core'),
      repoUrl: 'https://github.com/aave/aave-v3-core.git',
      libPath: 'lib/aave-v3-core'
    },
    {
      name: 'Compound Protocol',
      pattern: dep => dep.startsWith('compound-finance/compound-protocol'),
      repoUrl: 'https://github.com/compound-finance/compound-protocol.git',
      libPath: 'lib/compound-protocol'
    },
    {
      name: 'Chainlink',
      pattern: dep => dep.startsWith('smartcontractkit/chainlink'),
      repoUrl: 'https://github.com/smartcontractkit/chainlink.git',
      libPath: 'lib/chainlink'
    },
    {
      name: 'Solmate',
      pattern: dep => dep.startsWith('transmissions11/solmate'),
      repoUrl: 'https://github.com/transmissions11/solmate.git',
      libPath: 'lib/solmate'
    },
    {
      name: 'Solady',
      pattern: dep => dep.startsWith('vectorized/solady'),
      repoUrl: 'https://github.com/vectorized/solady.git',
      libPath: 'lib/solady'
    }
  ];
  
  // Process each protocol
  for (const protocol of protocols) {
    // Check if the protocol is in the dependencies and failed to install
    const protocolDeps = dependencies.filter(dep => protocol.pattern(dep));
    if (protocolDeps.length === 0) continue;
    
    const failedProtocolDeps = protocolDeps.filter(dep => failedDeps.includes(dep));
    if (failedProtocolDeps.length === 0) continue;
    
    console.log(`Manual handling for ${protocol.name} dependencies...`);
    
    // Get version if specified
    let version = 'master';
    for (const dep of protocolDeps) {
      if (dep.includes('@')) {
        version = dep.split('@')[1];
        break;
      }
    }
    
    // Try to git clone the repo
    try {
      // Create path if it doesn't exist
      fs.ensureDirSync(path.join(contractDir, path.dirname(protocol.libPath)));
      
      // Determine if we need tag prefix (common for versioned releases)
      const useTagPrefix = !version.startsWith('v') && version !== 'master';
      const tagPrefix = useTagPrefix ? 'v' : '';
      
      const cloneCmd = `git clone -b ${tagPrefix}${version} ${protocol.repoUrl} ${protocol.libPath}`;
      console.log(`Running: ${cloneCmd}`);
      
      execSync(cloneCmd, {
        cwd: contractDir,
        stdio: 'pipe'
      });
      
      console.log(`Successfully cloned ${protocol.name} with version ${version}`);
      
      // Add to installed list
      for (const dep of failedProtocolDeps) {
        if (!installed.includes(dep)) {
          installed.push(dep);
        }
      }
    } catch (cloneError) {
      console.warn(`Failed to git clone ${protocol.name} with version ${version}:`, cloneError.message);
      
      // Try without version if specific version failed
      if (version !== 'master') {
        try {
          console.log(`Trying to clone master branch of ${protocol.name}...`);
          execSync(`git clone ${protocol.repoUrl} ${protocol.libPath}`, {
            cwd: contractDir,
            stdio: 'pipe'
          });
          
          console.log(`Successfully cloned ${protocol.name} master branch`);
          
          // Add to installed list (without version)
          for (const dep of failedProtocolDeps) {
            const baseRepo = dep.split('@')[0];
            if (!installed.includes(baseRepo)) {
              installed.push(baseRepo);
            }
          }
        } catch (defaultCloneError) {
          console.error(`Failed to clone ${protocol.name} master branch:`, defaultCloneError.message);
        }
      }
    }
  }
  
  return installed;
}

/**
 * Preprocess import paths in Solidity code
 * @param {string} code - Original Solidity code
 * @returns {string} Processed code with normalized imports
 */
function preprocessImportPaths(code) {
  // Normalize OpenZeppelin imports
  let processedCode = code.replace(
    /import\s+["']@openzeppelin\/contracts@[^\/]+\/([^"']+)["']/g,
    'import "@openzeppelin/contracts/$1"'
  );
  
  // Normalize Uniswap V2 imports
  processedCode = processedCode.replace(
    /import\s+["']@uniswap\/v2-core@[^\/]+\/([^"']+)["']/g,
    'import "@uniswap/v2-core/$1"'
  );
  
  processedCode = processedCode.replace(
    /import\s+["']@uniswap\/v2-periphery@[^\/]+\/([^"']+)["']/g,
    'import "@uniswap/v2-periphery/$1"'
  );
  
  // Normalize Uniswap V3 imports
  processedCode = processedCode.replace(
    /import\s+["']@uniswap\/v3-core@[^\/]+\/([^"']+)["']/g,
    'import "@uniswap/v3-core/$1"'
  );
  
  processedCode = processedCode.replace(
    /import\s+["']@uniswap\/v3-periphery@[^\/]+\/([^"']+)["']/g,
    'import "@uniswap/v3-periphery/$1"'
  );
  
  return processedCode;
}

/**
 * Copy required files if dependency installation fails
 * @param {string} contractDir - Contract directory
 * @param {string} sourceCode - Solidity source code
 */
async function copyRequiredFiles(contractDir, sourceCode) {
  // Extract all import paths from the source code
  const importRegex = /import\s+["']([^"']+)["']/g;
  const imports = [];
  let match;
  
  while ((match = importRegex.exec(sourceCode)) !== null) {
    imports.push(match[1]);
  }
  
  // Track different types of imports
  const ozImports = imports.filter(imp => imp.startsWith('@openzeppelin/contracts/'));
  const uniswapV2Imports = imports.filter(imp => imp.startsWith('@uniswap/v2'));
  const uniswapV3Imports = imports.filter(imp => imp.startsWith('@uniswap/v3'));
  const aaveImports = imports.filter(imp => imp.startsWith('@aave/'));
  const compoundImports = imports.filter(imp => imp.includes('compound'));
  const chainlinkImports = imports.filter(imp => imp.includes('chainlink'));
  
  // Check for OpenZeppelin imports and ensure files exist
  if (ozImports.length > 0) {
    // Check if OpenZeppelin is properly installed
    const ozDir = path.join(contractDir, 'lib/openzeppelin-contracts');
    
    if (!fs.existsSync(ozDir)) {
      console.log('OpenZeppelin directory not found, creating manual structure...');
      fs.ensureDirSync(path.join(ozDir, 'contracts/utils'));
      fs.ensureDirSync(path.join(ozDir, 'contracts/token/ERC20'));
      fs.ensureDirSync(path.join(ozDir, 'contracts/token/ERC721/extensions'));
      fs.ensureDirSync(path.join(ozDir, 'contracts/access'));
      fs.ensureDirSync(path.join(ozDir, 'contracts/security'));
    }
  }
  
  // Check for Uniswap V2 imports
  if (uniswapV2Imports.length > 0) {
    const v2CoreDir = path.join(contractDir, 'lib/v2-core');
    const v2PeripheryDir = path.join(contractDir, 'lib/v2-periphery');
    
    if (!fs.existsSync(v2CoreDir)) {
      console.log('Uniswap V2 Core directory not found, creating structure...');
      fs.ensureDirSync(path.join(v2CoreDir, 'contracts'));
      fs.ensureDirSync(path.join(v2CoreDir, 'interfaces'));
    }
    
    if (!fs.existsSync(v2PeripheryDir)) {
      console.log('Uniswap V2 Periphery directory not found, creating structure...');
      fs.ensureDirSync(path.join(v2PeripheryDir, 'contracts'));
      fs.ensureDirSync(path.join(v2PeripheryDir, 'interfaces'));
    }
  }
  
  // Check for Uniswap V3 imports
  if (uniswapV3Imports.length > 0) {
    const v3CoreDir = path.join(contractDir, 'lib/v3-core');
    const v3PeripheryDir = path.join(contractDir, 'lib/v3-periphery');
    
    if (!fs.existsSync(v3CoreDir)) {
      console.log('Uniswap V3 Core directory not found, creating structure...');
      fs.ensureDirSync(path.join(v3CoreDir, 'contracts'));
      fs.ensureDirSync(path.join(v3CoreDir, 'interfaces'));
    }
    
    if (!fs.existsSync(v3PeripheryDir)) {
      console.log('Uniswap V3 Periphery directory not found, creating structure...');
      fs.ensureDirSync(path.join(v3PeripheryDir, 'contracts'));
      fs.ensureDirSync(path.join(v3PeripheryDir, 'interfaces'));
    }
  }
  
  // Check for Aave imports
  if (aaveImports.length > 0) {
    const aaveDir = path.join(contractDir, 'lib/aave-v3-core');
    
    if (!fs.existsSync(aaveDir)) {
      console.log('Aave directory not found, creating structure...');
      fs.ensureDirSync(path.join(aaveDir, 'contracts'));
      fs.ensureDirSync(path.join(aaveDir, 'interfaces'));
    }
  }
  
  // Check for Compound imports
  if (compoundImports.length > 0) {
    const compoundDir = path.join(contractDir, 'lib/compound-protocol');
    
    if (!fs.existsSync(compoundDir)) {
      console.log('Compound directory not found, creating structure...');
      fs.ensureDirSync(path.join(compoundDir, 'contracts'));
    }
  }
  
  // Check for Chainlink imports
  if (chainlinkImports.length > 0) {
    const chainlinkDir = path.join(contractDir, 'lib/chainlink');
    
    if (!fs.existsSync(chainlinkDir)) {
      console.log('Chainlink directory not found, creating structure...');
      fs.ensureDirSync(path.join(chainlinkDir, 'contracts'));
      fs.ensureDirSync(path.join(chainlinkDir, 'interfaces'));
    }
  }
}

module.exports = {
  extractDependenciesFromCode,
  installDependencies,
  handleOpenZeppelinManually,
  handleProtocolDependenciesManually,
  preprocessImportPaths,
  copyRequiredFiles
  // Add any other functions that should be exported
};