/**
 * Compilation Controller
 * Handles API routes for smart contract compilation
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const compilationService = require('../services/compilationService');
const { getCompilationValidationRules, validate } = require('../utils/validators');

/**
 * Extract specific contract details from compilation result
 * @param {Object} result - Compilation result
 * @param {string} targetContractName - Name of the contract to extract
 * @returns {Object} Contract details or null if not found
 */
function extractSpecificContract(result, targetContractName) {
  // If result is not in expected format, return null
  if (!result.contracts || Object.keys(result.contracts).length === 0) {
    return null;
  }

  // First look for exact match on contract path ending with the target name
  for (const [contractPath, contractData] of Object.entries(result.contracts)) {
    const contractName = contractPath.split(':').pop();
    
    if (contractName === targetContractName) {
      return {
        abi: contractData.abi,
        bytecode: contractData.bytecode,
        deployedBytecode: contractData.deployedBytecode,
        gasEstimates: contractData.gasEstimates
      };
    }
  }
  
  // If no exact match, return null
  return null;
}

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
    
    const targetContractName = contractName || 'Contract';
    logger.info(`Received compilation request: ${targetContractName} (${contractCode.length} chars)`);
    
    // Validate request size
    if (contractCode.length > 1000000) { // Additional check beyond validator
      throw new Error('Contract code is too large');
    }
    
    // Compile the contract
    const result = await compilationService.compileContract({
      contractCode,
      solidityVersion,
      evmVersion,
      optimize: optimize !== undefined ? optimize : true,
      optimizeRuns: optimizeRuns || 200,
      contractName: targetContractName
    });
    
    // Extract the targeted contract
    const specificContract = extractSpecificContract(result, targetContractName);
    
    if (specificContract) {
      // Return just the specific contract requested
      return res.status(200).json({
        success: true,
        message: 'Compilation successful',
        contract: specificContract,
        // Include all contracts if includeAll=true is specified
        ...(req.query.includeAll === 'true' && { allContracts: result.contracts }),
        // Include full result only if detailed flag is provided
        ...(req.query.detailed === 'true' && { fullResult: result })
      });
    } else {
      // If the specific contract is not found, include all compiled contracts
      // This handles cases where the contract name might be different than expected
      const contractsMap = {};
      
      for (const [contractPath, contractData] of Object.entries(result.contracts || {})) {
        const name = contractPath.split(':').pop();
        contractsMap[name] = {
          abi: contractData.abi,
          bytecode: contractData.bytecode,
          deployedBytecode: contractData.deployedBytecode,
          gasEstimates: contractData.gasEstimates
        };
      }
      
      return res.status(200).json({
        success: true,
        message: `Target contract "${targetContractName}" not found in compilation output, returning all compiled contracts`,
        contracts: contractsMap,
        // Include full result only if detailed flag is provided
        ...(req.query.detailed === 'true' && { fullResult: result })
      });
    }
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
      throw new Error('Contract code is too large');
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
    if (error instanceof Error) {
      return res.status(400).json({
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
    // Load config with safe fallbacks if not available
    let config;
    try {
      config = require('../config/config');
    } catch (error) {
      config = {
        foundry: {
          defaultSolidityVersion: '0.8.20',
          defaultEvmVersion: 'paris',
        },
        limits: {
          maxConcurrentCompilations: 10
        }
      };
    }
    
    return res.status(200).json({
      success: true,
      status: 'Compilation service is running',
      defaultSolidityVersion: config.foundry.defaultSolidityVersion,
      defaultEvmVersion: config.foundry.defaultEvmVersion,
      maxConcurrentCompilations: config.limits.maxConcurrentCompilations
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Error retrieving service status'
    });
  }
});

module.exports = router;