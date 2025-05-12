// File path: test/checkFoundryInstallation.test.js

const { expect } = require('chai');
const sinon = require('sinon');
const childProcess = require('child_process');
const foundryUtils = require('../utils/foundryUtils');

describe.skip('checkFoundryInstallation Function', () => {
  let execSyncStub;
  
  beforeEach(() => {
    // Create a new stub for each test
    execSyncStub = sinon.stub(childProcess, 'execSync');
  });
  
  afterEach(() => {
    // Restore the original function after each test
    execSyncStub.restore();
  });
  
  it('should return true when Foundry is installed', () => {
    // Configure the stub to return a successful result
    execSyncStub.withArgs('forge --version', { encoding: 'utf8' })
      .returns('forge 0.2.0');
    
    const result = foundryUtils.checkFoundryInstallation();
    
    // Verify the function returned true
    expect(result).to.be.true;
    
    // Verify the stub was called with the expected arguments
    sinon.assert.calledWith(execSyncStub, 'forge --version', { encoding: 'utf8' });
  });
  
  it('should return false when Foundry is not installed', () => {
    // Configure the stub to throw an error
    execSyncStub.withArgs('forge --version', { encoding: 'utf8' })
      .throws(new Error('Command not found'));
    
    const result = foundryUtils.checkFoundryInstallation();
    
    // Verify the function returned false
    expect(result).to.be.false;
    
    // Verify the stub was called with the expected arguments
    sinon.assert.calledWith(execSyncStub, 'forge --version', { encoding: 'utf8' });
  });
});