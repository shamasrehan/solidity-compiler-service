// File path: test/foundryUtils.rewire.test.js

const { expect } = require('chai');
const sinon = require('sinon');
const rewire = require('rewire');

// Import using rewire
const foundryUtils = rewire('../utils/foundryUtils');

describe('Rewired Foundry Utils', () => {
  it('should return false when Foundry is not installed', () => {
    // Create a stub execSync function
    const execSyncStub = sinon.stub().throws(new Error('Command not found'));
    
    // Replace the execSync inside the module with our stub
    const revert = foundryUtils.__set__({
      execSync: execSyncStub
    });
    
    // Call the function
    const result = foundryUtils.checkFoundryInstallation();
    
    // Restore the original
    revert();
    
    // Check the result
    expect(result).to.be.false;
  });
});