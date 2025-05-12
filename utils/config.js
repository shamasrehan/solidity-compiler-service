// utils/config.js
const path = require('path');
const os = require('os');
const dotenv = require('dotenv');
const fs = require('fs-extra');

// Load environment variables
dotenv.config();

/**
 * Configuration loader for Solidity Compiler API
 * Centralizes all configuration with validation and defaults
 */
class Config {
  constructor() {
    // Server configuration
    this.PORT = this._getNumberEnv('PORT', 9000);
    this.NODE_ENV = process.env.NODE_ENV || 'development';
    
    // Directories
    this.TEMP_DIR = process.env.TEMP_DIR || path.join(os.tmpdir(), 'solc-compiler-api');
    this.ARTIFACTS_DIR = process.env.ARTIFACTS_DIR || path.join(process.cwd(), 'artifacts');
    this.CACHE_DIR = process.env.CACHE_DIR || path.join(process.cwd(), 'cache');
    this.SOLC_CACHE_DIR = process.env.SOLC_CACHE_DIR || path.join(process.cwd(), 'solc-cache');
    
    // Compiler settings
    this.MAX_COMPILATION_TIME_MS = this._getNumberEnv('MAX_COMPILATION_TIME_MS', 30000);
    this.MAX_CONTRACT_SIZE_BYTES = this._getNumberEnv('MAX_CONTRACT_SIZE_BYTES', 1024 * 1024);
    this.DEFAULT_COMPILER_VERSION = process.env.DEFAULT_COMPILER_VERSION || '0.8.19';
    this.DOCKER_TIMEOUT_MS = this._getNumberEnv('DOCKER_TIMEOUT_MS', 60000);
    this.SOLC_SELECT_TIMEOUT_MS = this._getNumberEnv('SOLC_SELECT_TIMEOUT_MS', 30000);
    this.CLEANUP_TEMP_FILES = process.env.CLEANUP_TEMP_FILES !== 'false';
    
    // Cache settings
    this.CACHE_EXPIRATION_MS = this._getNumberEnv('CACHE_EXPIRATION_MS', 3600000); // 1 hour
    this.SOLC_VERSION_CACHE_TIME_MS = this._getNumberEnv('SOLC_VERSION_CACHE_TIME_MS', 86400000); // 24 hours
    this.MAX_CACHE_ENTRIES = this._getNumberEnv('MAX_CACHE_ENTRIES', 1000);
    
    // API limits
    this.RATE_LIMIT_WINDOW_MS = this._getNumberEnv('RATE_LIMIT_WINDOW_MS', 60000); // 1 minute
    this.RATE_LIMIT_MAX_REQUESTS = this._getNumberEnv('RATE_LIMIT_MAX_REQUESTS', 30);
    this.MAX_HISTORY_ENTRIES = this._getNumberEnv('MAX_HISTORY_ENTRIES', 1000);
    
    // Logging
    this.LOG_LEVEL = process.env.LOG_LEVEL || 'info';
    this.ENABLE_REQUEST_LOGGING = process.env.ENABLE_REQUEST_LOGGING === 'true';
    
    // Security
    this.ENABLE_CORS = process.env.ENABLE_CORS !== 'false';
    this.ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS || '*';
    this.TRUST_PROXY = process.env.TRUST_PROXY === 'true';
    
    // API Documentation
    this.SWAGGER_ENABLED = process.env.SWAGGER_ENABLED !== 'false';
    this.SWAGGER_PATH = process.env.SWAGGER_PATH || '/api-docs';
    
    // Initialize directories
    this._initializeDirectories();
    
    // Validate configuration
    this._validateConfig();
  }
  
  /**
   * Get a numeric environment variable with fallback
   * @param {string} name - Environment variable name
   * @param {number} defaultValue - Default value if not set or invalid
   * @returns {number} Parsed value or default
   */
  _getNumberEnv(name, defaultValue) {
    const value = process.env[name];
    if (value === undefined || value === '') {
      return defaultValue;
    }
    
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
  }
  
  /**
   * Create required directories if they don't exist
   */
  _initializeDirectories() {
    const dirs = [
      this.TEMP_DIR,
      this.ARTIFACTS_DIR,
      this.CACHE_DIR,
      this.SOLC_CACHE_DIR
    ];
    
    for (const dir of dirs) {
      try {
        fs.ensureDirSync(dir);
      } catch (error) {
        console.error(`Failed to create directory ${dir}:`, error.message);
        // Fall back to temp directory if we can't create the specified one
        if (dir !== this.TEMP_DIR) {
          const fallbackDir = path.join(os.tmpdir(), path.basename(dir));
          console.warn(`Falling back to ${fallbackDir}`);
          fs.ensureDirSync(fallbackDir);
          
          // Update the config property to the fallback
          const key = Object.keys(this).find(k => this[k] === dir);
          if (key) {
            this[key] = fallbackDir;
          }
        }
      }
    }
  }
  
  /**
   * Validate configuration values and ensure they're reasonable
   */
  _validateConfig() {
    // Ensure timeouts are within reasonable bounds
    if (this.MAX_COMPILATION_TIME_MS < 1000 || this.MAX_COMPILATION_TIME_MS > 300000) {
      console.warn(`Invalid MAX_COMPILATION_TIME_MS: ${this.MAX_COMPILATION_TIME_MS}, using default 30000ms`);
      this.MAX_COMPILATION_TIME_MS = 30000;
    }
    
    if (this.DOCKER_TIMEOUT_MS < 1000 || this.DOCKER_TIMEOUT_MS > 300000) {
      console.warn(`Invalid DOCKER_TIMEOUT_MS: ${this.DOCKER_TIMEOUT_MS}, using default 60000ms`);
      this.DOCKER_TIMEOUT_MS = 60000;
    }
    
    // Ensure cache settings are reasonable
    if (this.CACHE_EXPIRATION_MS < 60000 || this.CACHE_EXPIRATION_MS > 86400000 * 7) {
      console.warn(`Invalid CACHE_EXPIRATION_MS: ${this.CACHE_EXPIRATION_MS}, using default 3600000ms`);
      this.CACHE_EXPIRATION_MS = 3600000;
    }
    
    // Ensure contract size limit is reasonable
    if (this.MAX_CONTRACT_SIZE_BYTES < 1024 || this.MAX_CONTRACT_SIZE_BYTES > 10 * 1024 * 1024) {
      console.warn(`Invalid MAX_CONTRACT_SIZE_BYTES: ${this.MAX_CONTRACT_SIZE_BYTES}, using default 1MB`);
      this.MAX_CONTRACT_SIZE_BYTES = 1024 * 1024;
    }
    
    // Validate Solidity version format
    const versionRegex = /^\d+\.\d+\.\d+$/;
    if (!versionRegex.test(this.DEFAULT_COMPILER_VERSION)) {
      console.warn(`Invalid DEFAULT_COMPILER_VERSION: ${this.DEFAULT_COMPILER_VERSION}, using 0.8.19`);
      this.DEFAULT_COMPILER_VERSION = '0.8.19';
    }
    
    // Validate log level
    const validLogLevels = ['error', 'warn', 'info', 'debug', 'trace'];
    if (!validLogLevels.includes(this.LOG_LEVEL.toLowerCase())) {
      console.warn(`Invalid LOG_LEVEL: ${this.LOG_LEVEL}, using 'info'`);
      this.LOG_LEVEL = 'info';
    }
  }
  
  /**
   * Get configuration as JSON
   * @param {boolean} includeSecure - Whether to include sensitive settings
   * @returns {Object} Configuration as JSON
   */
  toJSON(includeSecure = false) {
    const config = { ...this };
    
    // Remove any sensitive information if needed
    if (!includeSecure) {
      // No sensitive data currently, but could filter here in the future
    }
    
    return config;
  }
  
  /**
   * Log current configuration
   */
  logConfig() {
    console.log('=== Solidity Compiler API Configuration ===');
    console.log('Server:');
    console.log(`  Port: ${this.PORT}`);
    console.log(`  Environment: ${this.NODE_ENV}`);
    console.log('Directories:');
    console.log(`  Temp: ${this.TEMP_DIR}`);
    console.log(`  Artifacts: ${this.ARTIFACTS_DIR}`);
    console.log(`  Cache: ${this.CACHE_DIR}`);
    console.log(`  Solc Cache: ${this.SOLC_CACHE_DIR}`);
    console.log('Compiler Settings:');
    console.log(`  Max Compilation Time: ${this.MAX_COMPILATION_TIME_MS}ms`);
    console.log(`  Max Contract Size: ${Math.round(this.MAX_CONTRACT_SIZE_BYTES / 1024)}KB`);
    console.log(`  Default Compiler Version: ${this.DEFAULT_COMPILER_VERSION}`);
    console.log(`  Clean Up Temp Files: ${this.CLEANUP_TEMP_FILES}`);
    console.log('Cache Settings:');
    console.log(`  Cache Expiration: ${this.CACHE_EXPIRATION_MS / 1000}s`);
    console.log(`  Version Cache Time: ${this.SOLC_VERSION_CACHE_TIME_MS / 1000 / 60}min`);
    console.log('API Limits:');
    console.log(`  Rate Limit: ${this.RATE_LIMIT_MAX_REQUESTS} requests per ${this.RATE_LIMIT_WINDOW_MS / 1000}s`);
    console.log(`  Max History Entries: ${this.MAX_HISTORY_ENTRIES}`);
    console.log('===========================================');
  }
}

// Create and export a singleton instance
const config = new Config();
module.exports = config;