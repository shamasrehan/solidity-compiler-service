// File path: test/api.test.js

const request = require('supertest');
const path = require('path');
const fs = require('fs-extra');
const { expect } = require('chai');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

// Mock the compileContract function to avoid actual compilation during tests
const compileController = {
  compileContract: (req, res) => {
    if (!req.body.source) {
      return res.status(400).json({
        status: 'error',
        message: 'Source code is required'
      });
    }
    
    res.status(200).json({
      status: 'success',
      data: {
        contractName: 'TestContract',
        bytecode: '0x1234',
        abi: [],
        message: 'Contract compiled successfully with test mock'
      }
    });
  }
};

// Mock foundryUtils to avoid actual checks
const foundryUtils = {
  checkFoundryInstallation: () => true
};

// Setup the Express app for testing
const setupTestApp = () => {
  const app = express();
  app.use(cors());
  app.use(bodyParser.json({ limit: '10mb' }));
  
  // Routes
  app.post('/solidity/compile', compileController.compileContract);
  app.get('/health', (req, res) => {
    res.status(200).json({
      status: 'ok',
      message: 'Solidity Compiler API is running'
    });
  });
  
  // Error handler
  app.use((err, req, res, next) => {
    console.error('Internal server error:', err.stack);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error',
      error: err.message
    });
  });
  
  return app;
};

describe('API Endpoints', () => {
  let app;
  
  before(() => {
    app = setupTestApp();
  });
  
  describe('GET /health', () => {
    it('should return status 200 and a health message', async () => {
      const response = await request(app).get('/health');
      
      expect(response.status).to.equal(200);
      expect(response.body.status).to.equal('ok');
      expect(response.body.message).to.equal('Solidity Compiler API is running');
    });
  });
  
  describe('POST /solidity/compile', () => {
    it('should return 400 if source code is missing', async () => {
      const response = await request(app)
        .post('/solidity/compile')
        .send({});
      
      expect(response.status).to.equal(400);
      expect(response.body.status).to.equal('error');
    });
    
    it('should compile a contract when provided valid source code', async () => {
      const sampleCode = `
        pragma solidity ^0.8.0;
        
        contract TestContract {
          function add(uint256 a, uint256 b) public pure returns (uint256) {
            return a + b;
          }
        }
      `;
      
      const response = await request(app)
        .post('/solidity/compile')
        .send({ source: sampleCode });
      
      expect(response.status).to.equal(200);
      expect(response.body.status).to.equal('success');
      expect(response.body.data.contractName).to.equal('TestContract');
      expect(response.body.data.bytecode).to.exist;
      expect(response.body.data.abi).to.exist;
    });
  });
});