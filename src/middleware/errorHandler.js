/**
 * Error handler middleware
 * Ensures all errors are caught and formatted properly
 */

const logger = require('../utils/logger');

/**
 * Custom API Error class for operational errors
 */
class ApiError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Global error handler middleware
 * @param {Error} err - Error object
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Express next function
 */
const errorHandler = (err, req, res, next) => {
  logger.error({
    message: `Error processing request: ${err.message}`,
    path: req.path,
    method: req.method,
    statusCode: err.statusCode || 500,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });

  // Default to 500 if no status code is set
  const statusCode = err.statusCode || 500;
  
  // For operational errors, use the error message
  // For programming errors, use a generic message in production
  const message = err.isOperational || process.env.NODE_ENV === 'development' 
    ? err.message 
    : 'Internal server error';

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && {
      stack: err.stack,
      path: req.path,
      method: req.method
    })
  });
};

module.exports = {
  ApiError,
  errorHandler
};