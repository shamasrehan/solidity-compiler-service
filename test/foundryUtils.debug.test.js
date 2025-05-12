// File path: test/foundryUtils.debug.test.js

const path = require('path');
const fs = require('fs-extra');
const { expect } = require('chai');
const sinon = require('sinon');
const childProcess = require('child_process');

// Import the foundryUtils module directly
const foundryUtils = require('../utils/foundryUtils');

describe.skip('Debug Foundry Utils', () => {
  // Before any tests, capture the original execSync
  const originalExecSync = childProcess.execSync;
  
  describe('checkFoundryInstallation debugging', () => {
    let execSyncStub;
    
    beforeEach(() => {
      // Create a fresh stub for execSync
      execSyncStub = sinon.stub(childProcess, 'execSync');
      console.log('Stub created. Original execSync replaced.');
    });
    
    afterEach(() => {
      // Restore the original execSync
      execSyncStub.restore();
      console.log('Stub restored. Original execSync restored.');
      
      // Verify that we actually restored the original
      console.log('Are they the same reference?', childProcess.execSync === originalExecSync);
    });
    
    it('should detect when Foundry is NOT installed (debug test)', function() {
      // Configure stub to throw an error
      execSyncStub.throws(new Error('Command failed: forge --version'));
      
      // Log what's happening
      console.log('Before calling checkFoundryInstallation');
      console.log('Is execSync stubbed?', childProcess.execSync !== originalExecSync);
      console.log('What does execSync return?', execSyncStub.callsFake(() => {
        console.log('Stub called!');
        throw new Error('Command failed from fake');
      }));
      
      try {
        // Try to call forge directly using our stub to verify it works
        childProcess.execSync('forge --version');
        console.log('ERROR: execSync did not throw as expected!');
      } catch (e) {
        console.log('Good: execSync threw an error as expected:', e.message);
      }
      
      // Call the function under test
      const result = foundryUtils.checkFoundryInstallation();
      
      // Log the result
      console.log('Result from checkFoundryInstallation:', result);
      
      // Check if the stub was called
      console.log('Was stub called?', execSyncStub.called);
      console.log('Call count:', execSyncStub.callCount);
      if (execSyncStub.called) {
        console.log('Call args:', execSyncStub.getCall(0).args);
      }
      
      // This should pass if everything is working correctly
      expect(result).to.be.false;
    });
  });
});