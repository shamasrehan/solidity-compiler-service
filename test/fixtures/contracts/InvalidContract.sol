// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract InvalidContract {
    // Missing semicolon
    uint256 private value
    
    function setValue(uint256 _value) public {
        value = _value;
    }
}