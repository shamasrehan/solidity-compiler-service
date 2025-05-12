// SPDX-License-Identifier: MIT
pragma solidity ^0.6.0;

contract LegacyContract {
    uint256 private value;
    
    function setValue(uint256 _value) public {
        value = _value;
    }
    
    function getValue() public view returns (uint256) {
        return value;
    }
}