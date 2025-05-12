// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract ContractA {
    uint256 private valueA;
    
    function setValueA(uint256 _value) public {
        valueA = _value;
    }
    
    function getValueA() public view returns (uint256) {
        return valueA;
    }
}

contract ContractB {
    uint256 private valueB;
    
    function setValueB(uint256 _value) public {
        valueB = _value;
    }
    
    function getValueB() public view returns (uint256) {
        return valueB;
    }
}