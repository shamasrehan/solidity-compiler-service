#!/bin/bash
# Test script for invalid inputs to the /api/compile endpoint

API_URL="http://localhost:9000"

echo "Testing /api/compile endpoint with invalid inputs..."
echo "---------------------------------------------------"

# Test case 1: Missing source code
echo "Test case 1: Missing source code"
read -r -d '' PAYLOAD_1 << EOT
{
  "version": "0.8.19",
  "settings": {
    "optimizer": {
      "enabled": true,
      "runs": 200
    }
  }
}
EOT

response_1=$(curl -s -X POST -H "Content-Type: application/json" -d "$PAYLOAD_1" $API_URL/api/compile)

if [[ $(echo $response_1 | jq '.success') == "false" ]]; then
  echo "✓ Correctly rejected missing source code"
  echo "Error: $(echo $response_1 | jq -r '.error')"
else
  echo "✗ Failed to reject missing source code"
fi

echo "---------------------------------"

# Test case 2: Missing compiler version
echo "Test case 2: Missing compiler version"
read -r -d '' PAYLOAD_2 << EOT
{
  "source": "pragma solidity ^0.8.19; contract Test {}",
  "settings": {
    "optimizer": {
      "enabled": true,
      "runs": 200
    }
  }
}
EOT

response_2=$(curl -s -X POST -H "Content-Type: application/json" -d "$PAYLOAD_2" $API_URL/api/compile)

if [[ $(echo $response_2 | jq '.success') == "false" ]]; then
  echo "✓ Correctly rejected missing compiler version"
  echo "Error: $(echo $response_2 | jq -r '.error')"
else
  echo "✗ Failed to reject missing compiler version"
fi

echo "---------------------------------"

# Test case 3: Invalid compiler version format
echo "Test case 3: Invalid compiler version format"
read -r -d '' PAYLOAD_3 << EOT
{
  "source": "pragma solidity ^0.8.19; contract Test {}",
  "version": "invalid_version",
  "settings": {
    "optimizer": {
      "enabled": true,
      "runs": 200
    }
  }
}
EOT

response_3=$(curl -s -X POST -H "Content-Type: application/json" -d "$PAYLOAD_3" $API_URL/api/compile)

if [[ $(echo $response_3 | jq '.success') == "false" ]]; then
  echo "✓ Correctly rejected invalid compiler version format"
  echo "Error: $(echo $response_3 | jq -r '.error')"
else
  echo "✗ Failed to reject invalid compiler version format"
fi

echo "---------------------------------"

# Test case 4: Contract with syntax error
echo "Test case 4: Contract with syntax error"
read -r -d '' PAYLOAD_4 << EOT
{
  "source": "pragma solidity ^0.8.19; contract Test { function brokenFunction() public { missing_semicolon } }",
  "version": "0.8.19",
  "settings": {
    "optimizer": {
      "enabled": true,
      "runs": 200
    }
  }
}
EOT

response_4=$(curl -s -X POST -H "Content-Type: application/json" -d "$PAYLOAD_4" $API_URL/api/compile)

if [[ $(echo $response_4 | jq '.success') == "false" ]]; then
  echo "✓ Correctly rejected contract with syntax error"
  echo "Error type: $(echo $response_4 | jq -r '.errorType // "Not specified"')"
else
  echo "✗ Failed to reject contract with syntax error"
fi

echo "---------------------------------"

# Test case 5: Mismatch between pragma and specified version
echo "Test case 5: Mismatch between pragma and specified version"
read -r -d '' PAYLOAD_5 << EOT
{
  "source": "pragma solidity ^0.7.0; contract Test { function test() public {} }",
  "version": "0.8.19",
  "settings": {
    "optimizer": {
      "enabled": true,
      "runs": 200
    }
  }
}
EOT

response_5=$(curl -s -X POST -H "Content-Type: application/json" -d "$PAYLOAD_5" $API_URL/api/compile)

# Note: This might actually compile successfully depending on compatibility settings
echo "Response: $(echo $response_5 | jq -r '.success')"
if [[ $(echo $response_5 | jq '.success') == "false" ]]; then
  echo "Version mismatch detected"
  echo "Error: $(echo $response_5 | jq -r '.error')"
else
  echo "Contract compiled despite version mismatch (this may be expected behavior)"
fi

echo "---------------------------------"

# Summary
echo "Invalid inputs test summary:"
echo "Test case 1 (Missing source): $(if [[ $(echo $response_1 | jq '.success') == "false" ]]; then echo "Passed"; else echo "Failed"; fi)"
echo "Test case 2 (Missing version): $(if [[ $(echo $response_2 | jq '.success') == "false" ]]; then echo "Passed"; else echo "Failed"; fi)"
echo "Test case 3 (Invalid version format): $(if [[ $(echo $response_3 | jq '.success') == "false" ]]; then echo "Passed"; else echo "Failed"; fi)"
echo "Test case 4 (Syntax error): $(if [[ $(echo $response_4 | jq '.success') == "false" ]]; then echo "Passed"; else echo "Failed"; fi)"
echo "Test case 5 (Version mismatch): $(if [[ $(echo $response_5 | jq '.success') == "false" ]]; then echo "Version check enforced"; else echo "Version check not enforced"; fi)"

echo "---------------------------------"
echo "Invalid inputs test completed."