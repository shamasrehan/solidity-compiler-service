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
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');

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
};

// Ensure required directories exist
fs.ensureDirSync(config.TEMP_DIR);
fs.ensureDirSync(config.ARTIFACTS_DIR);
fs.ensureDirSync(config.CACHE_DIR);

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
const compilationHistory = new Map();

// Setup Swagger documentation
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Solidity Compiler API',
      version: '1.0.0',
      description: 'API for compiling Solidity smart contracts with different compiler versions',
      contact: {
        name: 'API Support',
        email: 'support@example.com',
      },
    },
    servers: [
      {
        url: `http://localhost:${config.PORT}`,
        description: 'Development server',
      },
    ],
  },
  apis: ['./index.js'], // Path to the API docs
};

const swaggerDocs = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

// In-memory cache for compilation results
const compilationCache = new Map();

// Cleanup expired cache entries periodically
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  
  // Clean up expired cache entries
  for (const [key, value] of compilationCache.entries()) {
    if (now > value.expiresAt) {
      compilationCache.delete(key);
    }
  }
  
  // Clean up old history entries (keep last 100)
  if (compilationHistory.size > 100) {
    const sortedEntries = [...compilationHistory.entries()]
      .sort((a, b) => a[1].timestamp - b[1].timestamp);
    
    const entriesToRemove = sortedEntries.slice(0, sortedEntries.length - 100);
    for (const [key] of entriesToRemove) {
      compilationHistory.delete(key);
    }
  }
}, 60000); // Run every minute

// index.js - PART 2
// Graceful shutdown
process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);

// Add version constant at the top with other config
const VERSION = process.env.API_VERSION || '1.0.0';

/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: Get API health status
 *     description: Returns health information about the API service
 *     responses:
 *       200:
 *         description: Health information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 version:
 *                   type: string
 *                   example: 1.0.0
 *                 activeJobs:
 *                   type: integer
 *                   example: 0
 *                 cacheSize:
 *                   type: integer
 *                   example: 5
 *                 historySize:
 *                   type: integer
 *                   example: 10
 *                 uptime:
 *                   type: number
 *                   example: 3600
 *                 memory:
 *                   type: object
 *                   properties:
 *                     rss:
 *                       type: string
 *                       example: 50MB
 *                     heapTotal:
 *                       type: string
 *                       example: 20MB
 *                     heapUsed:
 *                       type: string
 *                       example: 15MB
 *                 services:
 *                   type: object
 *                   properties:
 *                     tempDir:
 *                       type: boolean
 *                       example: true
 *                     artifactsDir:
 *                       type: boolean
 *                       example: true
 *                     cacheDir:
 *                       type: boolean
 *                       example: true
 *                     solc:
 *                       type: boolean
 *                       example: true
 */
app.get('/api/health', async (req, res) => {
  try {
    // Check if critical directories are accessible
    const services = {
      tempDir: await fs.pathExists(config.TEMP_DIR),
      artifactsDir: await fs.pathExists(config.ARTIFACTS_DIR),
      cacheDir: await fs.pathExists(config.CACHE_DIR)
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
    const historySize = compilationHistory ? compilationHistory.size : 0;

    res.json({
      status,
      version: VERSION,
      activeJobs,
      cacheSize,
      historySize,
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

/**
 * @swagger
 * /api/versions:
 *   get:
 *     summary: Get available Solidity compiler versions
 *     description: Returns a list of installed Solidity compiler versions
 *     responses:
 *       200:
 *         description: List of available compiler versions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 versions:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ["0.8.19", "0.8.20", "0.7.6"]
 *       500:
 *         description: Error fetching compiler versions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: Failed to fetch compiler versions
 */
app.get('/api/versions', async (req, res) => {
  try {
    // Get installed versions
    const { stdout } = await execAsync('solc-select versions');
    const versions = stdout.split('\n')
      .map(v => v.trim())
      .filter(Boolean);
    
    res.json({
      success: true,
      versions
    });
  } catch (error) {
    console.error('Error fetching compiler versions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch compiler versions',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @swagger
 * /api/compile:
 *   post:
 *     summary: Compile Solidity code
 *     description: Compiles Solidity source code with specified version and settings
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - source
 *               - version
 *             properties:
 *               source:
 *                 type: string
 *                 description: Solidity source code
 *               version:
 *                 type: string
 *                 description: Solidity compiler version
 *               settings:
 *                 type: object
 *                 properties:
 *                   optimizer:
 *                     type: object
 *                     properties:
 *                       enabled:
 *                         type: boolean
 *                       runs:
 *                         type: integer
 *                   evmVersion:
 *                     type: string
 *                   outputSelection:
 *                     type: object
 *     responses:
 *       200:
 *         description: Compilation successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 jobId:
 *                   type: string
 *                 compiled:
 *                   type: object
 *       400:
 *         description: Invalid request parameters
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *       500:
 *         description: Compilation error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 */
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
        error: 'Compiler version is requiredxx' 
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
      settings: JSON.stringify(settings).substring(0, 100) + (JSON.stringify(settings).length > 100 ? '...' : '')
    });
    
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
    
    // Store in history
    compilationHistory.set(jobId, {
      timestamp: Date.now(),
      status: 'success',
      contractName,
      version,
      settings: settings || {}
    });
    
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
 * @swagger
 * /api/history/:jobId/source:
 *   get:
 *     summary: Get source code for a specific job
 *     description: Returns the source code for a specific job
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the compilation job
 *     responses:
 *       200:
 *         description: Source code
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *       404:
 *         description: Job or source not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: Source code not found
 */
app.get('/api/history', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const history = [];
    
    // Convert the history map to an array and sort by timestamp (latest first)
    const sortedEntries = [...compilationHistory.entries()]
      .sort((a, b) => b[1].timestamp - a[1].timestamp)
      .slice(0, limit);
    
    for (const [id, data] of sortedEntries) {
      history.push({
        id,
        ...data
      });
    }
    
    res.json({
      success: true,
      history
    });
  } catch (error) {
    console.error('Error fetching history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch history',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

app.get('/api/history/:jobId', async (req, res) => {
  const { jobId } = req.params;
  
  try {
    if (!compilationHistory.has(jobId)) {
      return res.status(404).json({
        success: false,
        error: 'Job not found'
      });
    }
    
    const jobInfo = compilationHistory.get(jobId);
    
    res.json({
      success: true,
      id: jobId,
      ...jobInfo
    });
  } catch (error) {
    console.error(`Error fetching details for job ${jobId}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch job details',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Fix status endpoint
app.get('/api/status', async (req, res) => {
  try {
    const activeJobs = [];
    
    for (const [id, data] of activeCompilations.entries()) {
      activeJobs.push({
        id,
        ...data
      });
    }
    
    res.json({
      success: true,
      activeJobs,
      count: activeJobs.length
    });
  } catch (error) {
    console.error('Error fetching active jobs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch active jobs',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @swagger
 * /api/history/{jobId}/result:
 *   get:
 *     summary: Get compilation result for a specific job
 *     description: Returns the compilation result for a specific job
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the compilation job
 *     responses:
 *       200:
 *         description: Compilation result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       404:
 *         description: Job or result not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: Result not found
 */
app.get('/api/history/:jobId/result', async (req, res) => {
  const { jobId } = req.params;
  
  try {
    const resultPath = path.join(config.ARTIFACTS_DIR, jobId, 'result.json');
    
    if (!await fs.pathExists(resultPath)) {
      return res.status(404).json({
        success: false,
        error: 'Result not found'
      });
    }
    
    const result = JSON.parse(
      await fs.readFile(resultPath, 'utf8')
    );
    
    res.json({
      success: true,
      result
    });
  } catch (error) {
    console.error(`Error fetching result for ${jobId}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch compilation result',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
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
  if (jobId && compilationHistory) {
    compilationHistory.set(jobId, {
      timestamp: Date.now(),
      status: 'failed',
      error: errorMessage,
      errorType
    });
    
    // Save error information to artifacts directory
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

/**
 * Clean up resources during shutdown
 */
async function cleanup() {
  console.log('Shutting down, cleaning up resources...');
  
  // Clear the cleanup interval
  clearInterval(cleanupInterval);
  
  // Clean up all temp directories
  try {
    console.log(`Removing temporary directory: ${config.TEMP_DIR}`);
    await fs.remove(config.TEMP_DIR);
  } catch (error) {
    console.error('Error cleaning up temp directory:', error);
  }
  
  // Force exit after a delay to ensure cleanup
  setTimeout(() => {
    process.exit(0);
  }, 1000);
}

// Start the server
app.listen(config.PORT, () => {
  console.log(`Solidity compiler API server running on port ${config.PORT}`);
  console.log(`API documentation available at http://localhost:${config.PORT}/api-docs`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Temp directory: ${config.TEMP_DIR}`);
  console.log(`Artifacts directory: ${config.ARTIFACTS_DIR}`);
  console.log(`Cache directory: ${config.CACHE_DIR}`);
});

module.exports = app;