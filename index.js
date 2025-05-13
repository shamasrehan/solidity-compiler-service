// index.js - PART 1
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);
const fs = require('fs-extra');
const crypto = require('crypto');
const os = require('os');
const morgan = require('morgan');
const cors = require('cors');
const dotenv = require('dotenv');
const solcUtils = require('./utils/solcUtils');
const { extractDependenciesFromCode, installDependencies } = require('./utils/dependencyUtils');

// Load environment variables from .env file
dotenv.config();

// Configuration settings with defaults
const config = {
  PORT: process.env.PORT || 9000,
  MAX_COMPILATION_TIME_MS: parseInt(process.env.MAX_COMPILATION_TIME_MS) || 30000,
  TEMP_DIR: process.env.TEMP_DIR || path.join(os.tmpdir(), 'solc-compiler-api'),
  ARTIFACTS_DIR: process.env.ARTIFACTS_DIR || path.join(__dirname, 'artifacts'),
  CACHE_DIR: process.env.CACHE_DIR || path.join(__dirname, 'cache'),
  CACHE_EXPIRATION_MS: parseInt(process.env.CACHE_EXPIRATION_MS) || 3600000, // 1 hour
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000, // 1 minute
  RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 30, // 30 requests per minute
  ENABLE_REQUEST_LOGGING: process.env.ENABLE_REQUEST_LOGGING === 'true' || false,
  MAX_CONTRACT_SIZE_BYTES: parseInt(process.env.MAX_CONTRACT_SIZE_BYTES) || 1024 * 1024, // 1MB
  NODE_MODULES_DIR: process.env.NODE_MODULES_DIR || path.join(__dirname, 'node_modules')
};

// Ensure required directories exist
fs.ensureDirSync(config.TEMP_DIR);
fs.ensureDirSync(config.ARTIFACTS_DIR);
fs.ensureDirSync(config.CACHE_DIR);
fs.ensureDirSync(config.NODE_MODULES_DIR);

// Create the Express app
const app = express();

// Set up logging
if (config.ENABLE_REQUEST_LOGGING) {
  app.use(morgan('combined'));
}

// Enable CORS
app.use(cors());

// Middleware for parsing requests
app.use(bodyParser.json({ limit: `${Math.ceil(config.MAX_CONTRACT_SIZE_BYTES / 1024)}kb` }));

// Track active compilation jobs and resource cleanup
const activeCompilations = new Map();
const compilationCache = new Map();

// Add version constant
const VERSION = process.env.API_VERSION || '1.0.0';

// Health endpoint
app.get('/api/health', async (req, res) => {
  try {
    // Check if critical directories are accessible
    const services = {
      tempDir: await fs.pathExists(config.TEMP_DIR),
      artifactsDir: await fs.pathExists(config.ARTIFACTS_DIR),
      cacheDir: await fs.pathExists(config.CACHE_DIR),
      nodeModules: await fs.pathExists(config.NODE_MODULES_DIR)
    };

    // Check if solc is available
    try {
      await execAsync('solc --version');
      services.solc = true;
    } catch (error) {
      services.solc = false;
    }

    // Get memory usage with error handling
    let memoryUsage;
    try {
      memoryUsage = process.memoryUsage();
    } catch (error) {
      console.error('Error getting memory usage:', error);
      memoryUsage = {
        rss: 0,
        heapTotal: 0,
        heapUsed: 0
      };
    }

    // Check if any critical service is down
    const allServicesHealthy = Object.values(services).every(status => status === true);
    const status = allServicesHealthy ? 'ok' : 'degraded';

    // Get active jobs and cache info
    const activeJobs = activeCompilations ? activeCompilations.size : 0;
    const cacheSize = compilationCache ? compilationCache.size : 0;

    res.json({
      status,
      version: VERSION,
      activeJobs,
      cacheSize,
      uptime: process.uptime(),
      memory: {
        rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`
      },
      services
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(500).json({
      status: 'error',
      version: VERSION,
      error: 'Health check failed',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Compile endpoint
app.post('/api/compile', async (req, res) => {
  let jobId = null;
  let tempDir = null;
  
  try {
    const { source, version, settings, cacheKey } = req.body;
    
    // Validate required parameters
    if (!source) {
      return res.status(400).json({ 
        success: false, 
        error: 'Source code is required' 
      });
    }
    
    if (!version) {
      return res.status(400).json({ 
        success: false, 
        error: 'Compiler version is required' 
      });
    }
    
    // Validate contract size
    if (source.length > config.MAX_CONTRACT_SIZE_BYTES) {
      return res.status(400).json({
        success: false,
        error: `Contract size exceeds maximum allowed size of ${Math.round(config.MAX_CONTRACT_SIZE_BYTES / 1024)}KB`
      });
    }
    
    // Validate Solidity version format using regex
    const versionRegex = /^\d+\.\d+\.\d+$/;
    if (!versionRegex.test(version)) {
      return res.status(400).json({
        success: false,
        error: `Invalid Solidity version format. Must be in format X.Y.Z (e.g., 0.8.19)`
      });
    }
    
    // Check for cache hit if cacheKey is provided
    const customCacheKey = cacheKey || generateCacheKey(source, version, settings);
    
    if (compilationCache.has(customCacheKey)) {
      const cachedResult = compilationCache.get(customCacheKey);
      // Check if cache is still valid
      if (Date.now() < cachedResult.expiresAt) {
        return res.json({
          success: true,
          cached: true,
          jobId: cachedResult.jobId,
          compiled: cachedResult.result
        });
      } else {
        // Cache expired, remove it
        compilationCache.delete(customCacheKey);
      }
    }
    
    // Generate a unique ID for this compilation job
    jobId = crypto.randomBytes(16).toString('hex');
    
    // Create a unique temporary directory for this job
    tempDir = path.join(config.TEMP_DIR, `compile-${jobId}`);
    await fs.ensureDir(tempDir);
    
    // Track this compilation job
    activeCompilations.set(jobId, {
      id: jobId,
      status: 'preparing',
      startTime: Date.now(),
      tempDir,
      source: source.substring(0, 100) + (source.length > 100 ? '...' : ''),
      version,
      settings: settings ? JSON.stringify(settings).substring(0, 100) + (JSON.stringify(settings).length > 100 ? '...' : '') : ''
    });
    
    // Extract dependencies from source code
    const dependencies = extractDependenciesFromCode(source);
    
    // Install dependencies if any are found
    if (dependencies.length > 0) {
      activeCompilations.set(jobId, {
        ...activeCompilations.get(jobId),
        status: 'installing_dependencies'
      });
      
      const installResult = await installDependencies(tempDir, dependencies);
      
      if (!installResult.success) {
        throw new Error(`Failed to install dependencies: ${installResult.error}`);
      }
    }
    
    // Ensure the requested compiler version is installed
    const installed = await solcUtils.installSolidityVersion(version);
    if (!installed) {
      throw new Error(`Failed to install Solidity compiler version ${version}`);
    }
    
    // Write the source to a file
    const sourcePath = path.join(tempDir, 'input.sol');
    await fs.writeFile(sourcePath, source);
    
    // Update job status
    activeCompilations.set(jobId, {
      ...activeCompilations.get(jobId),
      status: 'compiling'
    });

    // Extract contract name from source
    const contractName = solcUtils.extractContractName(source);
    
    // Compile the contract
    let compilationResult;
    try {
      compilationResult = await solcUtils.compileWithFallbackMethod(
        source,
        contractName,
        version,
        settings || {}
      );
    } catch (compileError) {
      throw new Error(`Compilation failed: ${compileError.message}`);
    }
    
    // Create a directory for the compilation artifacts
    const artifactDir = path.join(config.ARTIFACTS_DIR, jobId);
    await fs.ensureDir(artifactDir);
    
    // Save the source code and compilation result
    await fs.writeFile(path.join(artifactDir, 'source.sol'), source);
    await fs.writeJson(path.join(artifactDir, 'result.json'), compilationResult, { spaces: 2 });
    
    // Store in cache
    compilationCache.set(customCacheKey, {
      jobId,
      result: compilationResult,
      expiresAt: Date.now() + config.CACHE_EXPIRATION_MS
    });
    
    // Update job status to completed
    activeCompilations.set(jobId, {
      ...activeCompilations.get(jobId),
      status: 'completed',
      endTime: Date.now()
    });
    
    // Clean up temporary directory
    if (config.CLEANUP_TEMP_FILES) {
      try {
        await fs.remove(tempDir);
      } catch (cleanupError) {
        console.warn(`Failed to clean up temp directory for job ${jobId}:`, cleanupError.message);
      }
    }
    
    // Return the compilation result
    res.json({
      success: true,
      jobId,
      compiled: compilationResult
    });
  } catch (error) {
    handleCompilationError(jobId, error, res);
  }
});

/**
 * Generate a cache key based on source code, version, and settings
 * @param {string} source - Source code
 * @param {string} version - Compiler version
 * @param {Object} settings - Compiler settings
 * @returns {string} Cache key
 */
function generateCacheKey(source, version, settings) {
  const settingsString = JSON.stringify(settings || {});
  const hash = crypto.createHash('sha256')
    .update(`${source}|${version}|${settingsString}`)
    .digest('hex');
  
  return hash;
}

/**
 * Handle compilation errors in a standardized way
 * @param {string} jobId - ID of the compilation job
 * @param {Error} error - Error object
 * @param {Object} res - Express response object
 */
function handleCompilationError(jobId, error, res) {
  console.error('Compilation error:', error);
  
  // Determine appropriate error code
  let statusCode = 500;
  let errorMessage = error.message || 'Unknown compilation error';
  
  if (error.message && (
      error.message.includes('not found') ||
      error.message.includes('does not exist') ||
      error.message.includes('could not find')
    )) {
    statusCode = 404;
  } else if (error.message && (
      error.message.includes('invalid') ||
      error.message.includes('failed to parse') ||
      error.message.includes('syntax error')
    )) {
    statusCode = 400;
  } else if (error.message && error.message.includes('timed out')) {
    statusCode = 408; // Request Timeout
  }
  
  // Categorize the error
  let errorType = 'CompilationError';
  if (error.message && error.message.includes('timed out')) {
    errorType = 'TimeoutError';
  } else if (error.message && (
      error.message.includes('syntax') ||
      error.message.includes('parse')
    )) {
    errorType = 'SyntaxError';
  } else if (error.message && error.message.includes('version')) {
    errorType = 'VersionError';
  }
  
  // If this was a tracked job, save error information
  if (jobId) {
    try {
      const artifactDir = path.join(config.ARTIFACTS_DIR, jobId);
      fs.ensureDirSync(artifactDir);
      
      fs.writeFileSync(path.join(artifactDir, 'error.json'), JSON.stringify({
        timestamp: Date.now(),
        error: errorMessage,
        errorType,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      }, null, 2));
    } catch (saveError) {
      console.error('Error saving error information:', saveError);
    }
  }
  
  res.status(statusCode).json({
    success: false,
    error: errorMessage,
    errorType,
    jobId,
    details: process.env.NODE_ENV === 'development' ? error.stack : undefined
  });
}

// Start the server
app.listen(config.PORT, () => {
  console.log(`Solidity compiler API server running on port ${config.PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Temp directory: ${config.TEMP_DIR}`);
  console.log(`Artifacts directory: ${config.ARTIFACTS_DIR}`);
  console.log(`Cache directory: ${config.CACHE_DIR}`);
  console.log(`Node modules directory: ${config.NODE_MODULES_DIR}`);
});

module.exports = app;