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

  logger.info(`Looking for contract: ${targetContractName} in compilation results`);
  logger.info(`Available contracts: ${Object.keys(result.contracts).join(', ')}`);

  // Approach 1: Look for full path that ends with ":TargetContractName"
  // This matches the format "src/SimpleToken.sol:SimpleToken"
  for (const [contractPath, contractData] of Object.entries(result.contracts)) {
    if (contractPath.endsWith(`:${targetContractName}`)) {
      logger.info(`Found target contract at path: ${contractPath} (exact path match)`);
      return {
        abi: contractData.abi,
        bytecode: contractData.bytecode,
        deployedBytecode: contractData.deployedBytecode,
        gasEstimates: contractData.gasEstimates
      };
    }
  }
  
  // Approach 2: Look for exact match on just the contract name
  // Extract contract names from paths and check for matches
  for (const [contractPath, contractData] of Object.entries(result.contracts)) {
    // Extract contract name from path
    const contractName = contractPath.split(':').pop();
    
    if (contractName === targetContractName) {
      logger.info(`Found target contract at path: ${contractPath} (contract name match)`);
      return {
        abi: contractData.abi,
        bytecode: contractData.bytecode,
        deployedBytecode: contractData.deployedBytecode,
        gasEstimates: contractData.gasEstimates
      };
    }
  }
  
  // Approach 3: Check each contract key for the target name (case-insensitive)
  // This is a more flexible approach for finding the contract
  for (const [contractPath, contractData] of Object.entries(result.contracts)) {
    const contractPathLower = contractPath.toLowerCase();
    const targetNameLower = targetContractName.toLowerCase();
    
    // Check if the contract path contains the target name
    if (contractPathLower.includes(targetNameLower)) {
      // Additional check to ensure we're not matching a substring of another contract name
      // For example, "Token" should not match "TokenManager" unless necessary
      const pathParts = contractPath.split(/[:\/]/);
      
      // Check if any part exactly matches the target name (case-insensitive)
      if (pathParts.some(part => part.toLowerCase() === targetNameLower)) {
        logger.info(`Found target contract at path: ${contractPath} (partial match)`);
        return {
          abi: contractData.abi,
          bytecode: contractData.bytecode,
          deployedBytecode: contractData.deployedBytecode,
          gasEstimates: contractData.gasEstimates
        };
      }
    }
  }
  
  // Approach 4: Last resort - just check all contracts and return the first one
  // Only do this if targetContractName was explicitly provided in the request
  // This avoids returning random contracts when the default "Contract" name is used
  if (result.contracts && Object.keys(result.contracts).length === 1) {
    // If there's only one contract, return it
    const contractPath = Object.keys(result.contracts)[0];
    const contractData = result.contracts[contractPath];
    
    logger.info(`Only one contract found: ${contractPath}, returning it as fallback`);
    return {
      abi: contractData.abi,
      bytecode: contractData.bytecode,
      deployedBytecode: contractData.deployedBytecode,
      gasEstimates: contractData.gasEstimates
    };
  }
  
  // If no match, return null
  logger.warn(`Could not find contract matching "${targetContractName}" in compilation results`);
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
      // If the specific contract is not found, check if we have any contracts at all
      if (result.contracts && Object.keys(result.contracts).length > 0) {
        logger.warn(`Target contract "${targetContractName}" not found in compilation output, searching with broader criteria`);
        
        // Look for any contract path that contains the target name
        for (const [contractPath, contractData] of Object.entries(result.contracts)) {
          if (contractPath.includes(targetContractName)) {
            logger.info(`Found contract with similar name: ${contractPath}`);
            return res.status(200).json({
              success: true,
              message: `Found similar contract: ${contractPath}`,
              contract: {
                abi: contractData.abi,
                bytecode: contractData.bytecode,
                deployedBytecode: contractData.deployedBytecode,
                gasEstimates: contractData.gasEstimates
              },
              // Include all contracts if includeAll=true is specified
              ...(req.query.includeAll === 'true' && { allContracts: result.contracts }),
              // Include full result only if detailed flag is provided
              ...(req.query.detailed === 'true' && { fullResult: result })
            });
          }
        }
        
        // If we reach here, include all compiled contracts
        const contractsMap = {};
        
        for (const [contractPath, contractData] of Object.entries(result.contracts)) {
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
      } else {
        // No contracts compiled successfully
        return res.status(400).json({
          success: false,
          message: `Compilation did not produce any valid contracts. The contract "${targetContractName}" may have syntax errors.`,
          ...(req.query.detailed === 'true' && { fullResult: result })
        });
      }
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
 * @route POST /api/v1/compile/debug
 * @description Debug compilation output
 * @access Public
 */
router.post('/debug', getCompilationValidationRules(), validate, async (req, res, next) => {
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
    logger.info(`Received debug compilation request: ${targetContractName} (${contractCode.length} chars)`);
    
    // Compile the contract
    const result = await compilationService.compileContract({
      contractCode,
      solidityVersion,
      evmVersion,
      optimize: optimize !== undefined ? optimize : true,
      optimizeRuns: optimizeRuns || 200,
      contractName: targetContractName
    });
    
    // Return the raw compilation result
    return res.status(200).json({
      success: true,
      message: 'Debug compilation successful',
      resultKeys: Object.keys(result),
      contractKeys: result.contracts ? Object.keys(result.contracts) : [],
      outputKeys: result.output ? Object.keys(result.output) : [],
      outputContractsKeys: result.output && result.output.contracts ? Object.keys(result.output.contracts) : [],
      fullResult: result
    });
  } catch (error) {
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