// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title SimpleTarget
 * @notice Simple contract for testing flash loan executor operations
 */
contract SimpleTarget {
    uint256 public value;
    
    event ValueSet(uint256 newValue);
    event Incremented(uint256 newValue);
    
    function setValue(uint256 _value) external {
        value = _value;
        emit ValueSet(_value);
    }
    
    function increment() external {
        value++;
        emit Incremented(value);
    }
    
    function getValue() external view returns (uint256) {
        return value;
    }
    
    function sendTokens(address token, uint256 amount) external {       
        // Send tokens back to the caller (usually the executor)
        IERC20(token).transfer(msg.sender, amount);
    }
    
    function sendTokensTo(address token, address recipient, uint256 amount) external {
        // Send tokens directly to a specific recipient (for gas-optimized flash loan repayment)
        IERC20(token).transfer(recipient, amount);
    }
}
