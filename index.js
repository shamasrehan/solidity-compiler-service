const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const morgan = require('morgan');
const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');
require('dotenv').config();

// Define global paths
const TEMP_DIR = path.join(__dirname, 'temp');
const ARTIFACTS_DIR = path.join(__dirname, 'artifacts');

// Ensure directories exist
fs.ensureDirSync(TEMP_DIR);
fs.ensureDirSync(ARTIFACTS_DIR);

// Import controllers and utilities
const { compileContract } = require('./controllers/compileController');
const { checkFoundryInstallation } = require('./utils/foundryUtils');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(morgan('dev'));
app.use(bodyParser.json({ limit: '10mb' }));

// Routes
app.post('/solidity/compile', compileContract);

// Error handler
app.use((err, req, res, next) => {
  console.error('Internal server error:', err.stack);
  res.status(500).json({
    status: 'error',
    message: 'Internal server error'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Solidity Compiler API running on port ${PORT}`);
  
  // Check if Foundry is properly installed
  checkFoundryInstallation();
  
  // Check PATH for solc-select
  try {
    execSync('solc-select versions', { stdio: 'pipe' });
    console.log('solc-select is available in PATH');
  } catch (error) {
    console.warn('solc-select might not be in PATH. Make sure it\'s installed and available.');
    console.warn('You may need to run: pipx ensurepath');
  }
});

// Export constants
module.exports = { TEMP_DIR, ARTIFACTS_DIR };