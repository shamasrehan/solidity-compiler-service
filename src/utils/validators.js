/**
 * Validators utility
 * Provides validation functions for request data
 */

const { body, validationResult } = require('express-validator');
let config;

try {
  config = require('../config/config');
} catch (error) {
  // Default values if config file doesn't exist yet
  config = {
    limits: {
      maxContractSize: 500000
    },
    foundry: {
      defaultSolidityVersion: '0.8.20',
      defaultEvmVersion: 'paris'
    }
  };
}

/**
 * Get validation rules for compilation request
 * @returns {Array} Array of validation rules
 */
const getCompilationValidationRules = () => {
  return [
    body('contractCode')
      .notEmpty()
      .withMessage('Contract code is required')
      .isString()
      .withMessage('Contract code must be a string')
      .isLength({ max: config.limits.maxContractSize })
      .withMessage(`Contract code exceeds maximum size of ${config.limits.maxContractSize} characters`),
    
    body('solidityVersion')
      .optional()
      .isString()
      .withMessage('Solidity version must be a string')
      .matches(/^(\d+\.\d+\.\d+|latest)$/)
      .withMessage('Invalid Solidity version format. Use format like "0.8.20" or "latest"'),
    
    body('evmVersion')
      .optional()
      .isString()
      .withMessage('EVM version must be a string')
      .isIn(['homestead', 'tangerineWhistle', 'spuriousDragon', 'byzantium', 'constantinople', 'petersburg', 'istanbul', 'berlin', 'london', 'paris', 'shanghai', 'cancun'])
      .withMessage('Invalid EVM version'),
    
    body('contractName')
      .optional()
      .isString()
      .withMessage('Contract name must be a string')
      .matches(/^[a-zA-Z0-9_]+$/)
      .withMessage('Contract name can only contain alphanumeric characters and underscores'),
    
    body('optimize')
      .optional()
      .isBoolean()
      .withMessage('Optimize must be a boolean'),
    
    body('optimizeRuns')
      .optional()
      .isInt({ min: 1, max: 1000000 })
      .withMessage('Optimize runs must be an integer between 1 and 1000000'),
  ];
};

/**
 * Validate request and return errors if any
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {void}
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      success: false,
      errors: errors.array().map(err => ({
        field: err.path,
        message: err.msg
      }))
    });
  }
  next();
};

module.exports = {
  getCompilationValidationRules,
  validate
};