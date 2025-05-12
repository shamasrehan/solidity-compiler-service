// File path: test/foundryUtils.test.js

const path = require('path');
const fs = require('fs-extra');
const { expect } = require('chai');
const sinon = require('sinon');
const rewire = require('rewire');

// Import the module using rewire
const foundryUtils = rewire('../utils/foundryUtils');

// Also import the original module for functions that don't need rewiring
const originalFoundryUtils = require('../utils/foundryUtils');

describe('Foundry Utils', () => {
  const TEST_DIR = path.join(__dirname, 'foundry_test');
  
  beforeEach(() => {
    // Create test directory
    fs.ensureDirSync(TEST_DIR);
  });
  
  after(() => {
    // Clean up test directory
    fs.removeSync(TEST_DIR);
  });
  
  describe('checkFoundryInstallation', () => {
    it('should return true when Foundry is installed', () => {
      // Create a stub that returns a successful result
      const execSyncStub = sinon.stub().returns('forge 0.2.0');
      
      // Replace execSync in the module
      const revert = foundryUtils.__set__({
        execSync: execSyncStub
      });
      
      const result = foundryUtils.checkFoundryInstallation();
      
      // Restore original
      revert();
      
      expect(result).to.be.true;
      sinon.assert.calledWith(execSyncStub, 'forge --version', { encoding: 'utf8' });
    });
    
    it('should return false when Foundry is not installed', () => {
      // Create a stub that throws an error
      const execSyncStub = sinon.stub().throws(new Error('Command not found'));
      
      // Replace execSync in the module
      const revert = foundryUtils.__set__({
        execSync: execSyncStub
      });
      
      const result = foundryUtils.checkFoundryInstallation();
      
      // Restore original
      revert();
      
      expect(result).to.be.false;
      sinon.assert.calledWith(execSyncStub, 'forge --version', { encoding: 'utf8' });
    });
  });
  
  describe('checkDependencyInstalled', () => {
    beforeEach(() => {
      // Create lib directory structure for tests
      const libDir = path.join(TEST_DIR, 'lib');
      fs.ensureDirSync(libDir);
      fs.ensureDirSync(path.join(libDir, 'openzeppelin-contracts'));
    });
    
    afterEach(() => {
      // Clean up lib directory
      fs.removeSync(path.join(TEST_DIR, 'lib'));
    });
    
    it('should return true when dependency is installed', () => {
      const result = originalFoundryUtils.checkDependencyInstalled(TEST_DIR, 'OpenZeppelin/openzeppelin-contracts');
      expect(result).to.be.true;
    });
    
    it('should return false when dependency is not installed', () => {
      const result = originalFoundryUtils.checkDependencyInstalled(TEST_DIR, 'Uniswap/v2-core');
      expect(result).to.be.false;
    });
    
    it('should handle dependencies with version specifiers', () => {
      const result = originalFoundryUtils.checkDependencyInstalled(TEST_DIR, 'OpenZeppelin/openzeppelin-contracts@4.9.0');
      expect(result).to.be.true;
    });
  });
  
  describe('createFoundryConfig', () => {
    it('should create a valid foundry.toml configuration file', () => {
      const dependencies = ['OpenZeppelin/openzeppelin-contracts', 'Uniswap/v2-periphery'];
      const evmVersion = 'london';
      const compilerVersion = '0.8.19';
      
      originalFoundryUtils.createFoundryConfig(TEST_DIR, dependencies, evmVersion, compilerVersion);
      
      const configPath = path.join(TEST_DIR, 'foundry.toml');
      expect(fs.existsSync(configPath)).to.be.true;
      
      const config = fs.readFileSync(configPath, 'utf8');
      expect(config).to.include('src = \'src\'');
      expect(config).to.include('libs = [\'lib\']');
      expect(config).to.include('evm_version = "london"');
      expect(config).to.include('solc_version = "0.8.19"');
      expect(config).to.include('@openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/');
      expect(config).to.include('@uniswap/v2-periphery/=lib/v2-periphery/');
    });
  });
  
  describe('createRemappingsFile', () => {
    it('should create a valid remappings.txt file', () => {
      // Create a stub for execSync
      const execSyncStub = sinon.stub().returns('openzeppelin-contracts/=lib/openzeppelin-contracts/\n');
      
      // Replace execSync in the module
      const revert = foundryUtils.__set__({
        execSync: execSyncStub
      });
      
      const dependencies = ['OpenZeppelin/openzeppelin-contracts', 'Uniswap/v2-core'];
      
      foundryUtils.createRemappingsFile(TEST_DIR, dependencies);
      
      // Restore original
      revert();
      
      const remappingsPath = path.join(TEST_DIR, 'remappings.txt');
      expect(fs.existsSync(remappingsPath)).to.be.true;
      
      const remappings = fs.readFileSync(remappingsPath, 'utf8');
      expect(remappings).to.include('@openzeppelin/=lib/openzeppelin-contracts/');
      expect(remappings).to.include('@openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/');
      expect(remappings).to.include('@uniswap/v2-core/=lib/v2-core/');
    });
  });
});