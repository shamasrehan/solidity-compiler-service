/**
 * Logger utility
 * Provides consistent logging across the application
 */

const pino = require('pino');
const config = require('../config/config');

// Create logger with a simpler configuration that doesn't require pino-pretty
const logger = pino({
  level: config.logging.level,
  transport: process.env.NODE_ENV !== 'production' ? {
    target: 'pino/file',
    options: { destination: 1 } // stdout
  } : undefined
});

module.exports = logger;