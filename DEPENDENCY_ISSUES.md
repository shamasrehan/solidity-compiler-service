# Fixing Dependency Issues

This guide will help you resolve dependency issues when compiling contracts that use external libraries like OpenZeppelin.

## Understanding the Issue

When you see errors like:

```
Source "@openzeppelin/contracts/token/ERC20/ERC20.sol" not found: File not found. 
```

This occurs because:
1. The Foundry compiler can't locate the imported dependencies
2. The forge command is failing to install dependencies from GitHub

## Solution 1: Pre-install Dependencies Manually (Git-based)

We've created a script that will pre-install common dependencies directly from GitHub, without relying on Foundry's dependency resolution:

```bash
# Run this to pre-install OpenZeppelin and other common libraries
npm run preinstall-deps
```

This script:
1. Clones repositories directly using Git
2. Creates proper remappings for imports
3. Puts everything in the right place for Foundry to find

After running this, your service will be able to compile contracts with imports like:
```solidity
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
```

## Solution 2: Download Dependencies via HTTP (No Git Required)

If you're having issues with Git (permission problems, network issues, etc.), use our HTTP-based downloader:

```bash
# Install dependencies using direct HTTP downloads (no Git required)
npm run download-deps
```

This approach:
1. Downloads dependency ZIP files directly from GitHub
2. Extracts them to the proper locations
3. Creates the necessary remappings
4. Works in environments where Git might be restricted

## Solution 3: Configure Git for Foundry

If you prefer letting Foundry handle dependencies, ensure your Git is properly configured:

1. Check that Git is installed and accessible:
   ```bash
   git --version
   ```

2. Make sure GitHub access works (especially important if you're behind a firewall):
   ```bash
   git ls-remote https://github.com/OpenZeppelin/openzeppelin-contracts.git
   ```

3. Configure Git to use HTTPS instead of SSH if you're having issues:
   ```bash
   git config --global url."https://github.com/".insteadOf git@github.com:
   ```

## Solution 4: Manual Dependency Installation

You can also manually install dependencies:

1. Create lib directory if it doesn't exist:
   ```bash
   mkdir -p lib
   ```

2. Download and extract OpenZeppelin contracts:
   ```bash
   # Download from GitHub
   curl -L https://github.com/OpenZeppelin/openzeppelin-contracts/archive/refs/tags/v4.9.3.zip -o openzeppelin.zip
   
   # Extract
   unzip openzeppelin.zip -d lib/
   
   # Rename directory
   mv lib/openzeppelin-contracts-4.9.3 lib/openzeppelin-contracts
   ```

3. Create remappings.txt file:
   ```bash
   echo "@openzeppelin/=lib/openzeppelin-contracts/" > remappings.txt
   echo "@openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/" >> remappings.txt
   ```

## Testing Your Setup

To test if dependencies are working correctly:

1. Create a test contract in a file (e.g., `test-contract.txt`):
   ```solidity
   // SPDX-License-Identifier: MIT
   pragma solidity ^0.8.20;
   
   import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
   
   contract MyToken is ERC20 {
       constructor(uint256 initialSupply) ERC20("MyToken", "MTK") {
           _mint(msg.sender, initialSupply);
       }
   }
   ```

2. Try compiling through the API:
   ```bash
   curl -X POST http://localhost:3000/api/v1/compile \
     -H "Content-Type: application/json" \
     -d @test-contract.txt
   ```

## Troubleshooting

If you're still having issues:

1. **Try the HTTP downloader first:**
   The `npm run download-deps` command bypasses Git entirely and is the most reliable option.

2. **Check for directory permission issues:**
   Make sure you have write access to the lib directory and other project folders.

3. **Look for network restrictions:**
   Some corporate networks block Git or GitHub. The HTTP downloader can help bypass this.

4. **Verify the remappings:**
   Check that remappings.txt exists and has the correct paths:
   ```
   @openzeppelin/=lib/openzeppelin-contracts/
   @openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/
   ```

5. **Check dependency structure:**
   The OpenZeppelin contracts should have this structure:
   ```
   lib/openzeppelin-contracts/contracts/token/ERC20/ERC20.sol
   ```

6. **Try a simpler contract first:**
   Test with a basic contract that doesn't have dependencies to verify the compiler works.

7. **Clean and rebuild:**
   Sometimes clearing everything and starting fresh helps:
   ```bash
   rm -rf lib node_modules
   npm install
   npm run download-deps
   ```

If none of these solutions work, please provide more detailed error logs from both the API service and the preinstall-deps/download-deps scripts.

 this to pre-install OpenZeppelin and other common libraries
npm run preinstall-deps
```

This script:
1. Clones repositories directly using Git
2. Creates proper remappings for imports
3. Puts everything in the right place for Foundry to find

After running this, your service will be able to compile contracts with imports like:
```solidity
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
```

## Solution 2: Configure Git for Foundry

If you prefer letting Foundry handle dependencies, ensure your Git is properly configured:

1. Check that Git is installed and accessible:
   ```bash
   git --version
   ```

2. Make sure GitHub access works (especially important if you're behind a firewall):
   ```bash
   git ls-remote https://github.com/OpenZeppelin/openzeppelin-contracts.git
   ```

3. Configure Git to use HTTPS instead of SSH if you're having issues:
   ```bash
   git config --global url."https://github.com/".insteadOf git@github.com:
   ```

## Solution 3: Manual Dependency Installation

You can also manually install dependencies:

1. Create lib directory if it doesn't exist:
   ```bash
   mkdir -p lib
   ```

2. Clone OpenZeppelin repository:
   ```bash
   git clone https://github.com/OpenZeppelin/openzeppelin-contracts.git lib/openzeppelin-contracts
   cd lib/openzeppelin-contracts
   git checkout v4.9.3
   cd ../..
   ```

3. Create remappings.txt file:
   ```bash
   echo "@openzeppelin/=lib/openzeppelin-contracts/" > remappings.txt
   echo "@openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/" >> remappings.txt
   ```

## Testing Your Setup

To test if dependencies are working correctly:

1. Create a test contract in a file (e.g., `test-contract.txt`):
   ```solidity
   // SPDX-License-Identifier: MIT
   pragma solidity ^0.8.20;
   
   import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
   
   contract MyToken is ERC20 {
       constructor(uint256 initialSupply) ERC20("MyToken", "MTK") {
           _mint(msg.sender, initialSupply);
       }
   }
   ```

2. Try compiling through the API:
   ```bash
   curl -X POST http://localhost:3000/api/v1/compile \
     -H "Content-Type: application/json" \
     -d @test-contract.txt
   ```

## Troubleshooting

If you're still having issues:

1. **Check logs for specific errors:**
   Look closely at the logs to identify exactly which dependency is failing to install.

2. **Verify permissions:**
   Make sure your user has write access to the lib directory.

3. **Try a simpler contract first:**
   Test with a basic contract that doesn't have dependencies to verify the compiler works.

4. **Check for firewall/proxy issues:**
   If you're behind a corporate firewall, it might be blocking Git connections.

5. **Clean and rebuild:**
   Sometimes clearing everything and starting fresh helps:
   ```bash
   rm -rf lib node_modules
   npm install
   npm run preinstall-deps
   ```

If none of these solutions work, please provide more detailed error logs from both the API service and the preinstall-deps script.