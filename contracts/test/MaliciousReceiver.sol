// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.28;

import "../ERC20FlashLender.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title MaliciousReceiver
 * @notice A flash loan receiver that tries to only repay the fee, not the principal
 * @dev This contract is used to test that the flash loan repayment check works correctly
 */
contract MaliciousReceiver is IFlashLoanReceiver {
    
    function executeOperation(
        address _token, 
        uint256 amount, 
        uint256 totalOwed, 
        bytes calldata
    ) external returns (bool) {
        // For interface validation calls (with zero values), just return false
        if (_token == address(0) && amount == 0 && totalOwed == 0) {
            return false;
        }
        
        require(_token != address(0), "Invalid token");
        require(totalOwed > 0, "Invalid total owed");
        
        // Calculate just the fee (totalOwed - amount = fee)
        uint256 feeOnly = totalOwed - amount;
        
        // MALICIOUS: Only repay the fee, not the principal
        // This should cause the flash loan to fail with our fix
        IERC20(_token).transfer(msg.sender, feeOnly);
        
        return true;
    }
}
