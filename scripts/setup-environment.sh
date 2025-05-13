#!/bin/bash
# Script to set up and prepare the testing environment

echo "Setting up Solidity Compiler API Test Environment"
echo "================================================"

# Directory for test artifacts
TEST_DIR="solidity-compiler-api-tests"
mkdir -p $TEST_DIR
cd $TEST_DIR

# Install jq if not already installed
if ! command -v jq &> /dev/null; then
    echo "Installing jq (JSON processor)..."
    if command -v apt-get &> /dev/null; then
        sudo apt-get update && sudo apt-get install -y jq
    elif command -v yum &> /dev/null; then
        sudo yum install -y jq
    elif command -v brew &> /dev/null; then
        brew install jq
    else
        echo "Error: Could not install jq. Please install it manually."
        exit 1
    fi
fi

# Check if solc is installed
if ! command -v solc &> /dev/null; then
    echo "Solidity compiler (solc) not found. Please install it manually."
    echo "Visit: https://docs.soliditylang.org/en/latest/installing-solidity.html"
    echo ""
fi

# Check if solc-select is installed
if ! command -v solc-select &> /dev/null; then
    echo "solc-select not found. Installing..."
    pip3 install solc-select
    echo "Installing a few Solidity versions..."
    solc-select install 0.8.19
    solc-select install 0.8.20
    solc-select install 0.7.6
    solc-select use 0.8.19
fi

# Check if Foundry is installed
if ! command -v forge &> /dev/null; then
    echo "Foundry not found. Installing..."
    curl -L https://foundry.paradigm.xyz | bash
    source $HOME/.bashrc
    foundryup
fi

# Create a temporary file to verify write access
TEMP_FILE="write-test-$RANDOM.txt"
if ! touch $TEMP_FILE 2>/dev/null; then
    echo "Error: Cannot write to current directory."
    exit 1
fi
rm $TEMP_FILE

# Download test scripts to the directory
echo "Downloading test scripts..."
for script in health-test.sh versions-test.sh compile-test.sh compile-dependencies-test.sh history-test.sh version-support-test.sh complex-contract-test.sh invalid-inputs-test.sh caching-test.sh run-all-tests.sh; do
    echo "Creating $script..."
    # Note: In a real scenario, you would download the scripts from a repository
    # For this exercise, the scripts should be copied manually
done

# Make all scripts executable
chmod +x *.sh

echo ""
echo "Environment setup complete! You can now run the tests."
echo "To run all tests: ./run-all-tests.sh"
echo "Or run individual tests, e.g.: ./health-test.sh"