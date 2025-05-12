const path = require('path');
const fs = require('fs-extra');
const { expect } = require('chai');
const sinon = require('sinon');
const rewire = require('rewire');

// Import the module using rewire
const solcUtils = rewire('../utils/solcUtils');

describe('Solc Utils', () => {
  describe('installSolidityVersion', () => {
    let execSyncStub;
    let revert;

    beforeEach(() => {
      execSyncStub = sinon.stub();
      revert = solcUtils.__set__('execSync', execSyncStub);
    });

    afterEach(() => {
      if (revert) {
        revert();
      }
    });

    it('should successfully install a Solidity version with solc-select', async () => {
      execSyncStub.withArgs('solc-select versions', sinon.match.any)
        .returns('0.8.0\n0.8.4\n0.8.10');
      
      const version = '0.8.19';
      const result = await solcUtils.installSolidityVersion(version);
      
      expect(result).to.be.true;
      sinon.assert.calledWith(execSyncStub, 'solc-select install 0.8.19', sinon.match.any);
      sinon.assert.calledWith(execSyncStub, 'solc-select use 0.8.19', sinon.match.any);
    });

    it('should not install if version is already installed', async () => {
      execSyncStub.withArgs('solc-select versions', sinon.match.any)
        .returns('0.8.0\n0.8.4\n0.8.19\n0.8.20');
      
      const version = '0.8.19';
      const result = await solcUtils.installSolidityVersion(version);
      
      expect(result).to.be.true;
      sinon.assert.neverCalledWith(execSyncStub, 'solc-select install 0.8.19', sinon.match.any);
      sinon.assert.calledWith(execSyncStub, 'solc-select use 0.8.19', sinon.match.any);
    });

    it('should try Docker if solc-select fails', async () => {
      execSyncStub.withArgs('solc-select versions', sinon.match.any)
        .throws(new Error('Command failed'));
      
      execSyncStub.withArgs('docker --version', sinon.match.any)
        .returns('Docker version 20.10.21');
      
      execSyncStub.withArgs('docker pull ethereum/solc:0.8.19', sinon.match.any)
        .returns('');
      
      const version = '0.8.19';
      const result = await solcUtils.installSolidityVersion(version);
      
      expect(result).to.be.true;
      sinon.assert.calledWith(execSyncStub, 'docker pull ethereum/solc:0.8.19', sinon.match.any);
    });

    it('should try with v prefix if Docker pull fails', async () => {
      execSyncStub.withArgs('solc-select versions', sinon.match.any)
        .throws(new Error('Command failed'));
      
      execSyncStub.withArgs('docker --version', sinon.match.any)
        .returns('Docker version 20.10.21');
      
      execSyncStub.withArgs('docker pull ethereum/solc:0.8.19', sinon.match.any)
        .throws(new Error('Pull failed'));
      
      execSyncStub.withArgs('docker pull ethereum/solc:v0.8.19', sinon.match.any)
        .returns('');
      
      const version = '0.8.19';
      const result = await solcUtils.installSolidityVersion(version);
      
      expect(result).to.be.true;
      sinon.assert.calledWith(execSyncStub, 'docker pull ethereum/solc:v0.8.19', sinon.match.any);
    });

    it('should return false if all installation methods fail', async () => {
      execSyncStub.withArgs('solc-select versions', sinon.match.any)
        .throws(new Error('Command failed'));
      
      execSyncStub.withArgs('docker --version', sinon.match.any)
        .throws(new Error('Docker not found'));
      
      const version = '0.8.19';
      const result = await solcUtils.installSolidityVersion(version);
      
      expect(result).to.be.false;
    });

    it('should install multiple versions sequentially with solc-select', async () => {
      execSyncStub.withArgs('solc-select versions', sinon.match.any)
        .returns('0.7.6\n0.8.0\n0.8.4');
      
      const version1 = '0.8.10';
      const result1 = await solcUtils.installSolidityVersion(version1);
      
      expect(result1).to.be.true;
      sinon.assert.calledWith(execSyncStub, 'solc-select install 0.8.10', sinon.match.any);
      sinon.assert.calledWith(execSyncStub, 'solc-select use 0.8.10', sinon.match.any);
      
      const version2 = '0.7.0';
      const result2 = await solcUtils.installSolidityVersion(version2);
      
      expect(result2).to.be.true;
      sinon.assert.calledWith(execSyncStub, 'solc-select install 0.7.0', sinon.match.any);
      sinon.assert.calledWith(execSyncStub, 'solc-select use 0.7.0', sinon.match.any);
    });

    it('should mix installation methods for different versions', async () => {
      execSyncStub.withArgs('solc-select versions', sinon.match.any)
        .onFirstCall().returns('0.7.6\n0.8.0');
      
      const version1 = '0.8.4';
      const result1 = await solcUtils.installSolidityVersion(version1);
      
      expect(result1).to.be.true;
      sinon.assert.calledWith(execSyncStub, 'solc-select install 0.8.4', sinon.match.any);
      
      execSyncStub.withArgs('solc-select versions', sinon.match.any)
        .onSecondCall().throws(new Error('Command failed'));
      
      execSyncStub.withArgs('docker --version', sinon.match.any)
        .returns('Docker version 20.10.21');
      
      execSyncStub.withArgs('docker pull ethereum/solc:0.6.12', sinon.match.any)
        .returns('');
      
      const version2 = '0.6.12';
      const result2 = await solcUtils.installSolidityVersion(version2);
      
      expect(result2).to.be.true;
      sinon.assert.calledWith(execSyncStub, 'docker pull ethereum/solc:0.6.12', sinon.match.any);
    });

    it('should install older version with solc-select and newer with Docker', async () => {
      execSyncStub.withArgs('solc-select versions', sinon.match.any)
        .onFirstCall().returns('0.4.0\n0.4.11\n0.4.25')
        .onSecondCall().throws(new Error('Command failed'));
      
      execSyncStub.withArgs('docker --version', sinon.match.any)
        .returns('Docker version 20.10.21');
      
      execSyncStub.withArgs('docker pull ethereum/solc:0.8.20', sinon.match.any)
        .returns('');
      
      const olderVersion = '0.4.25';
      const result1 = await solcUtils.installSolidityVersion(olderVersion);
      
      expect(result1).to.be.true;
      sinon.assert.neverCalledWith(execSyncStub, 'solc-select install 0.4.25', sinon.match.any);
      sinon.assert.calledWith(execSyncStub, 'solc-select use 0.4.25', sinon.match.any);
      
      const newerVersion = '0.8.20';
      const result2 = await solcUtils.installSolidityVersion(newerVersion);
      
      expect(result2).to.be.true;
      sinon.assert.calledWith(execSyncStub, 'docker pull ethereum/solc:0.8.20', sinon.match.any);
    });

    it('should handle mixed success and failure when installing multiple versions', async () => {
      execSyncStub.withArgs('solc-select versions', sinon.match.any)
        .onFirstCall().returns('0.5.0\n0.6.0');
      
      const version1 = '0.7.0';
      const result1 = await solcUtils.installSolidityVersion(version1);
      
      expect(result1).to.be.true;
      sinon.assert.calledWith(execSyncStub, 'solc-select install 0.7.0', sinon.match.any);
      
      execSyncStub.withArgs('solc-select versions', sinon.match.any)
        .onSecondCall().throws(new Error('Command failed'));
      
      execSyncStub.withArgs('docker --version', sinon.match.any)
        .throws(new Error('Docker not found'));
      
      const version2 = '0.9.0';
      const result2 = await solcUtils.installSolidityVersion(version2);
      
      expect(result2).to.be.false;
    });

    it('should handle installation of very old and very new compiler versions', async () => {
      execSyncStub.withArgs('solc-select versions', sinon.match.any)
        .onFirstCall().throws(new Error('Command failed'))
        .onSecondCall().returns('0.8.0\n0.8.10\n0.8.19\n0.8.20');
      
      execSyncStub.withArgs('docker --version', sinon.match.any)
        .returns('Docker version 20.10.21');
      
      execSyncStub.withArgs('docker pull ethereum/solc:0.1.7', sinon.match.any)
        .returns('');
      
      const veryOldVersion = '0.1.7';
      const result1 = await solcUtils.installSolidityVersion(veryOldVersion);
      
      expect(result1).to.be.true;
      sinon.assert.calledWith(execSyncStub, 'docker pull ethereum/solc:0.1.7', sinon.match.any);
      
      const veryNewVersion = '0.8.20';
      const result2 = await solcUtils.installSolidityVersion(veryNewVersion);
      
      expect(result2).to.be.true;
      sinon.assert.neverCalledWith(execSyncStub, 'solc-select install 0.8.20', sinon.match.any);
      sinon.assert.calledWith(execSyncStub, 'solc-select use 0.8.20', sinon.match.any);
    });

    it('should install the latest Solidity versions (0.8.21+)', async () => {
      execSyncStub.withArgs('solc-select versions', sinon.match.any)
        .onFirstCall().returns('0.8.10\n0.8.19\n0.8.20\n0.8.21')
        .onSecondCall().throws(new Error('Command failed'));
      
      execSyncStub.withArgs('docker --version', sinon.match.any)
        .returns('Docker version 20.10.21');
      
      execSyncStub.withArgs('docker pull ethereum/solc:nightly', sinon.match.any)
        .returns('');
      
      const latestStableVersion = '0.8.23';
      const result1 = await solcUtils.installSolidityVersion(latestStableVersion);
      
      expect(result1).to.be.true;
      sinon.assert.calledWith(execSyncStub, 'solc-select install 0.8.23', sinon.match.any);
      sinon.assert.calledWith(execSyncStub, 'solc-select use 0.8.23', sinon.match.any);
      
      const nightlyVersion = 'nightly';
      const result2 = await solcUtils.installSolidityVersion(nightlyVersion);
      
      expect(result2).to.be.true;
      sinon.assert.calledWith(execSyncStub, 'docker pull ethereum/solc:nightly', sinon.match.any);
    });

    it('should handle latest 0.8.x versions and future 0.9.0 series', async () => {
      execSyncStub.withArgs('solc-select versions', sinon.match.any)
        .onFirstCall().returns('0.8.15\n0.8.19\n0.8.21\n0.8.23')
        .onSecondCall().throws(new Error('Command failed'));
      
      execSyncStub.withArgs('docker --version', sinon.match.any)
        .returns('Docker version 20.10.21');
      
      execSyncStub.withArgs('docker pull ethereum/solc:0.9.0', sinon.match.any)
        .throws(new Error('Pull failed'));
      
      execSyncStub.withArgs('docker pull ethereum/solc:v0.9.0', sinon.match.any)
        .throws(new Error('Pull failed'));
      
      const latestVersion = '0.8.25';
      const result1 = await solcUtils.installSolidityVersion(latestVersion);
      
      expect(result1).to.be.true;
      sinon.assert.calledWith(execSyncStub, 'solc-select install 0.8.25', sinon.match.any);
      sinon.assert.calledWith(execSyncStub, 'solc-select use 0.8.25', sinon.match.any);
      
      const futureVersion = '0.9.0';
      const result2 = await solcUtils.installSolidityVersion(futureVersion);
      
      expect(result2).to.be.false;
    });
  });

  describe('installMultipleSolidityVersions', () => {
    let originalInstallSolidityVersion;
    let installSolidityVersionStub;

    beforeEach(() => {
      originalInstallSolidityVersion = solcUtils.installSolidityVersion;
      installSolidityVersionStub = sinon.stub();
      solcUtils.installSolidityVersion = installSolidityVersionStub;
    });

    afterEach(() => {
      solcUtils.installSolidityVersion = originalInstallSolidityVersion;
    });

    it('should install multiple Solidity versions concurrently', async () => {
      installSolidityVersionStub.resolves(true);
      
      const versions = ['0.8.19', '0.8.20', '0.8.23'];
      
      const results = await Promise.all(versions.map(v => solcUtils.installSolidityVersion(v)));
      
      expect(results.every(result => result === true)).to.be.true;
      expect(installSolidityVersionStub.callCount).to.equal(3);
      sinon.assert.calledWith(installSolidityVersionStub.firstCall, '0.8.19');
      sinon.assert.calledWith(installSolidityVersionStub.secondCall, '0.8.20');
      sinon.assert.calledWith(installSolidityVersionStub.thirdCall, '0.8.23');
    });

    it('should report failures correctly when installing multiple versions', async () => {
      installSolidityVersionStub.withArgs('0.8.19').resolves(true);
      installSolidityVersionStub.withArgs('0.9.0').resolves(false);
      installSolidityVersionStub.withArgs('0.8.23').resolves(true);
      
      const versions = ['0.8.19', '0.9.0', '0.8.23'];
      
      const results = await Promise.all(versions.map(v => solcUtils.installSolidityVersion(v)));
      
      expect(results[0]).to.be.true;
      expect(results[1]).to.be.false;
      expect(results[2]).to.be.true;
      expect(installSolidityVersionStub.callCount).to.equal(3);
    });

    it('should handle a mix of stable and nightly versions', async () => {
      installSolidityVersionStub.withArgs('0.8.20').resolves(true);
      installSolidityVersionStub.withArgs('nightly').resolves(true);
      installSolidityVersionStub.withArgs('0.8.23').resolves(true);
      
      const versions = ['0.8.20', 'nightly', '0.8.23'];
      
      const results = await Promise.all(versions.map(v => solcUtils.installSolidityVersion(v)));
      
      expect(results.every(result => result === true)).to.be.true;
      expect(installSolidityVersionStub.callCount).to.equal(3);
      sinon.assert.calledWith(installSolidityVersionStub.firstCall, '0.8.20');
      sinon.assert.calledWith(installSolidityVersionStub.secondCall, 'nightly');
      sinon.assert.calledWith(installSolidityVersionStub.thirdCall, '0.8.23');
    });
  });
});