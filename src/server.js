/**
 * Server entry point
 * Initializes and starts the Express server
 */

require('dotenv').config();
const app = require('./app');
const logger = require('./utils/logger');
const fs = require('fs-extra');
const path = require('path');

// Ensure required directories exist
ensureDirectories();

const PORT = process.env.PORT || 3000;

// Start the server
let server;
try {
  server = app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
  });
} catch (error) {
  logger.fatal('Failed to start server:', { error: error.message, stack: error.stack });
  process.exit(1);
}

// Handle unexpected errors
process.on('uncaughtException', (error) => {
  logger.fatal('Uncaught Exception:', { 
    error: error.message, 
    stack: error.stack,
    name: error.name,
    code: error.code
  });
  
  // Create a crash log file
  const crashLog = path.join(process.cwd(), 'crash.log');
  const crashInfo = `
==== CRASH REPORT ====
Time: ${new Date().toISOString()}
Error: ${error.name} - ${error.message}
Stack: ${error.stack}
Node version: ${process.version}
Platform: ${process.platform}
====== END ======
  `;
  
  try {
    fs.appendFileSync(crashLog, crashInfo);
    logger.info(`Crash report written to ${crashLog}`);
  } catch (err) {
    logger.error('Failed to write crash report:', err);
  }
  
  // Allow the process to exit after writing logs
  if (server) {
    server.close(() => {
      process.exit(1);
    });
    
    // Force exit if server doesn't close in 5 seconds
    setTimeout(() => {
      process.exit(1);
    }, 5000);
  } else {
    process.exit(1);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  logger.fatal('Unhandled Rejection:', { 
    reason: reason?.message || String(reason), 
    stack: reason?.stack,
    promise: String(promise)
  });
  // Not exiting process, but logging for awareness
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  if (server) {
    server.close(() => {
      logger.info('Process terminated');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
});

/**
 * Ensure required directories exist
 */
function ensureDirectories() {
  const dirs = [
    path.join(process.cwd(), 'src'),
    path.join(process.cwd(), 'src/config'),
    path.join(process.cwd(), 'src/controllers'),
    path.join(process.cwd(), 'src/services'),
    path.join(process.cwd(), 'src/utils'),
    path.join(process.cwd(), 'src/middleware'),
    path.join(process.cwd(), 'lib'),
    path.join(process.cwd(), 'tmp')
  ];
  
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
        logger.info(`Created directory: ${dir}`);
      } catch (error) {
        logger.error(`Failed to create directory ${dir}:`, error);
      }
    }
  }
}

module.exports = server;