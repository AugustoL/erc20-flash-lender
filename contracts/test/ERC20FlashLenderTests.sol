// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.28;

import "hardhat/console.sol";
import "../ERC20FlashLender.sol";
import "./MockERC20.sol";

/**
 * @title Security Test Contracts
 * @notice Test contracts to verify protection against known attack vectors
 */

// Test contract for flash loan receiver with reentrancy attempt
contract ReentrancyAttacker is IFlashLoanReceiver {
    ERC20FlashLender public lender;
    MockERC20 public token;
    bool public attackAttempted;
    
    constructor(address _lender, address _token) {
        lender = ERC20FlashLender(_lender);
        token = MockERC20(_token);
    }
    
    function executeOperation(
        address /* _token */, 
        uint256 /* amount */, 
        uint256 totalOwed, 
        bytes calldata
    ) external returns (bool) {
        // Attempt cross-function reentrancy
        try lender.deposit(address(token), 1000) {
            attackAttempted = true;
        } catch {
            // Expected to fail due to noFlashLoanReentrancy modifier
        }
        
        // Repay the loan
        token.approve(address(lender), totalOwed);
        return true; // Indicate successful operation
    }
    
    function attemptFlashLoan(uint256 amount) external {
        lender.flashLoan(address(token), amount, address(this), "");
    }
}

// Valid flash loan receiver for testing
contract ValidReceiver is IFlashLoanReceiver {
    
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
        
        // transfer the flash loan contract to take back the tokens + fees
        // This works with any ERC20 token, not just MockERC20
        IERC20(_token).transfer(msg.sender, totalOwed);
        return true;
    }
}