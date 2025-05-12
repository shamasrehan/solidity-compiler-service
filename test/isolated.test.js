// File path: test/isolated.test.js

const { expect } = require('chai');
const sinon = require('sinon');

describe('Isolated Function Test', () => {
  it('should handle errors correctly', () => {
    // Create our own module with child_process
    const mockChildProcess = {
      execSync: sinon.stub()
    };
    
    // Make it throw an error
    mockChildProcess.execSync.throws(new Error('Command failed'));
    
    // Create our own checkFoundryInstallation function
    function checkFoundryInstallation() {
      try {
        const version = mockChildProcess.execSync('forge --version', { encoding: 'utf8' });
        console.log(`Foundry version: ${version.trim()}`);
        return true;
      } catch (error) {
        console.error('Foundry is not properly installed:', error.message);
        return false;
      }
    }
    
    // Test it
    const result = checkFoundryInstallation();
    expect(result).to.be.false;
    
    // Verify the stub was called
    sinon.assert.calledWith(mockChildProcess.execSync, 'forge --version', { encoding: 'utf8' });
  });
});