#!/bin/bash
# Comprehensive test script that runs all test scripts in sequence

echo "Running Solidity Compiler API Test Suite"
echo "========================================"
echo ""

# Make scripts executable
chmod +x ./scripts/health-test.sh
chmod +x ./scripts/versions-test.sh
chmod +x ./scripts/compile-test.sh
chmod +x ./scripts/compile-dependencies-test.sh
chmod +x ./scripts/history-test.sh
chmod +x ./scripts/version-support-test.sh
chmod +x ./scripts/complex-contract-test.sh
chmod +x ./scripts/invalid-inputs-test.sh
chmod +x ./scripts/caching-test.sh

# Run tests in sequence
echo "Running health endpoint test..."
./scripts/health-test.sh
echo ""
echo "========================================"
echo ""

echo "Running versions endpoint test..."
./scripts/versions-test.sh
echo ""
echo "========================================"
echo ""

echo "Running compile endpoint test..."
./scripts/compile-test.sh
echo ""
echo "========================================"
echo ""

echo "Running compile with dependencies test..."
./scripts/compile-dependencies-test.sh
echo ""
echo "========================================"
echo ""

echo "Running history endpoints test..."
./scripts/history-test.sh
echo ""
echo "========================================"
echo ""

echo "Running version support test..."
./scripts/version-support-test.sh
echo ""
echo "========================================"
echo ""

echo "Running complex contract test..."
./scripts/complex-contract-test.sh
echo ""
echo "========================================"
echo ""

echo "Running invalid inputs test..."
./scripts/invalid-inputs-test.sh
echo ""
echo "========================================"
echo ""

echo "Running caching test..."
./scripts/caching-test.sh
echo ""
echo "========================================"
echo ""

echo "All tests completed!"
echo "To view detailed logs, check the individual test script outputs."