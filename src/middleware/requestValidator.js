/**
 * Compilation request validator middleware
 * Validates incoming compilation requests
 */

const { body, validationResult } = require('express-validator');
const config = require('../config/config');

/**
 * Validation rules for contract compilation requests
 */
const validationRules = [
  body('contractCode')
    .isString()
    .withMessage('Contract code must be a string')
    .notEmpty()
    .withMessage('Contract code is required')
    .isLength({ max: config?.limits?.maxContractSize || 500000 })
    .withMessage(`Contract code exceeds maximum size`),
  
  body('solidityVersion')
    .optional()
    .isString()
    .withMessage('Solidity version must be a string')
    .matches(/^(\d+\.\d+\.\d+|latest)$/)
    .withMessage('Invalid Solidity version format (e.g., "0.8.20" or "latest")'),
  
  body('evmVersion')
    .optional()
    .isString()
    .withMessage('EVM version must be a string')
    .isIn(['homestead', 'tangerineWhistle', 'spuriousDragon', 'byzantium', 
           'constantinople', 'petersburg', 'istanbul', 'berlin', 'london', 
           'paris', 'shanghai', 'cancun'])
    .withMessage('Invalid EVM version'),
  
  body('contractName')
    .optional()
    .isString()
    .withMessage('Contract name must be a string')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Contract name must contain only alphanumeric characters and underscores'),
  
  body('optimize')
    .optional()
    .isBoolean()
    .withMessage('Optimize flag must be a boolean'),
  
  body('optimizeRuns')
    .optional()
    .isInt({ min: 1, max: 1000000 })
    .withMessage('Optimize runs must be an integer between 1 and 1000000')
];

/**
 * Validate request middleware
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: errors.array().map(err => ({
        field: err.path,
        message: err.msg
      }))
    });
  }
  next();
};

module.exports = {
  validationRules,
  validate
};