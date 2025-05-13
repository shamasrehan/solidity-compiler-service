/**
 * Default configuration
 * Will be overridden by .env values
 */

require('dotenv').config();
const path = require('path');

// Default configuration with fallbacks for missing environment variables
module.exports = {
  // Server configuration
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
    environment: process.env.NODE_ENV || 'development',
  },
  
  // Foundry configuration
  foundry: {
    binPath: process.env.FOUNDRY_BIN_PATH || '/usr/local/bin',
    defaultSolidityVersion: process.env.DEFAULT_SOLIDITY_VERSION || '0.8.20',
    defaultEvmVersion: process.env.DEFAULT_EVM_VERSION || 'paris',
    tempDir: process.env.TEMP_DIR || path.join(process.cwd(), 'tmp'),
    timeout: parseInt(process.env.COMPILATION_TIMEOUT || '60000', 10), // 60 seconds
  },
  
  // Dependencies configuration
  dependencies: {
    preInstalled: process.env.PRE_INSTALLED !== 'false',
    libPath: process.env.LIB_PATH || path.join(process.cwd(), 'lib'),
  },
  
  // API limitations
  limits: {
    maxConcurrentCompilations: parseInt(process.env.MAX_CONCURRENT_COMPILATIONS || '10', 10),
    maxContractSize: parseInt(process.env.MAX_CONTRACT_SIZE || '500000', 10),
  },
  
  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
};