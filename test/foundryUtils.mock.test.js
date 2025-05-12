// File path: test/foundryUtils.mock.test.js

const { expect } = require('chai');
const sinon = require('sinon');
const childProcess = require('child_process');

// Import the mock module instead
const foundryUtils = require('./mocks/foundryUtils.mock');

describe.skip('Mock Foundry Utils Test', () => {
  let execSyncStub;
  
  beforeEach(() => {
    // Create a fresh stub
    execSyncStub = sinon.stub(childProcess, 'execSync');
  });
  
  afterEach(() => {
    // Restore original
    execSyncStub.restore();
  });
  
  it('should return false when Foundry is not installed', () => {
    // Configure the stub to throw
    execSyncStub.throws(new Error('Command not found'));
    
    // Call the function and check result
    const result = foundryUtils.checkFoundryInstallation();
    expect(result).to.be.false;
  });
});