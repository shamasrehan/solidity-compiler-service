/**
 * Compilation Controller
 * Handles API routes for smart contract compilation
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const compilationService = require('../services/compilationService');
const { getCompilationValidationRules, validate } = require('../utils/validators');
const { ApiError } = require('../middleware/errorHandler');

/**
 * @route POST /api/v1/compile
 * @description Compile a smart contract
 * @access Public
 */
router.post('/', getCompilationValidationRules(), validate, async (req, res, next) => {
  try {
    const {
      contractCode,
      solidityVersion,
      evmVersion,
      optimize,
      optimizeRuns,
      contractName
    } = req.body;
    
    logger.info(`Received compilation request: ${contractName || 'Contract'} (${contractCode.length} chars)`);
    
    // Validate request size
    if (contractCode.length > 1000000) { // Additional check beyond validator
      throw new ApiError('Contract code is too large', 400);
    }
    
    // Compile the contract
    const result = await compilationService.compileContract({
      contractCode,
      solidityVersion,
      evmVersion,
      optimize: optimize !== undefined ? optimize : true,
      optimizeRuns: optimizeRuns || 200,
      contractName: contractName || 'Contract'
    });
    
    // Return the compilation result
    return res.status(200).json({
      success: true,
      message: 'Compilation successful',
      result
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/v1/compile/check
 * @description Check if a contract compiles without returning full output
 * @access Public
 */
router.post('/check', getCompilationValidationRules(), validate, async (req, res, next) => {
  try {
    const {
      contractCode,
      solidityVersion,
      evmVersion,
      optimize,
      optimizeRuns,
      contractName
    } = req.body;
    
    logger.info(`Received compilation check request: ${contractName || 'Contract'} (${contractCode.length} chars)`);
    
    // Validate request size
    if (contractCode.length > 1000000) {
      throw new ApiError('Contract code is too large', 400);
    }
    
    // Compile the contract
    await compilationService.compileContract({
      contractCode,
      solidityVersion,
      evmVersion,
      optimize: optimize !== undefined ? optimize : true,
      optimizeRuns: optimizeRuns || 200,
      contractName: contractName || 'Contract'
    });
    
    // Return simplified result
    return res.status(200).json({
      success: true,
      message: 'Contract compiles successfully'
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return res.status(error.statusCode || 400).json({
        success: false,
        message: error.message
      });
    }
    next(error);
  }
});

/**
 * @route GET /api/v1/compile/status
 * @description Get the status of the compilation service
 * @access Public
 */
router.get('/status', async (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      status: 'Compilation service is running',
      defaultSolidityVersion: require('../config/config').foundry.defaultSolidityVersion,
      defaultEvmVersion: require('../config/config').foundry.defaultEvmVersion,
      maxConcurrentCompilations: require('../config/config').limits.maxConcurrentCompilations
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Error retrieving service status'
    });
  }
});

module.exports = router;