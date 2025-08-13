// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/utils/introspection/ERC165.sol";
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
contract ValidReceiver is IFlashLoanReceiver, IMultiFlashLoanReceiver, ERC165 {
    
    function executeOperation(
        address token,
        uint256 amount,
        uint256 totalOwed,
        bytes calldata data
    ) external override returns (bool) {      
        require(token != address(0), "Invalid token");
        require(totalOwed > 0, "Invalid total owed");
        
        // transfer the flash loan contract to take back the tokens + fees
        // This works with any ERC20 token, not just MockERC20
        IERC20(token).transfer(msg.sender, totalOwed);
        return true;
    }

    function executeMultiOperation(
        address[] calldata tokens,
        uint256[] calldata amounts,
        uint256[] calldata totalOwed,
        bytes calldata
    ) external override returns (bool) {
        // For interface validation calls (with empty arrays), just return false
        if (tokens.length == 0) {
            return false;
        }
        
        require(tokens.length == amounts.length, "Array length mismatch");
        require(tokens.length == totalOwed.length, "Array length mismatch");
        
        // Repay all loans
        for (uint256 i = 0; i < tokens.length; i++) {
            require(tokens[i] != address(0), "Invalid token");
            require(totalOwed[i] > 0, "Invalid total owed");
            
            // Transfer back the borrowed amount + fees for each token
            IERC20(tokens[i]).transfer(msg.sender, totalOwed[i]);
        }
        
        return true;
    }

    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
    return
        interfaceId == type(IFlashLoanReceiver).interfaceId ||
        interfaceId == type(IMultiFlashLoanReceiver).interfaceId ||
        super.supportsInterface(interfaceId);
    }
}

/**
 * @title MaliciousReceiver
 * @notice A flash loan receiver that tries to only repay the fee, not the principal
 * @dev This contract is used to test that the flash loan repayment check works correctly
 */
contract MaliciousReceiver is IFlashLoanReceiver, ERC165 {
    
    function executeOperation(
        address token, 
        uint256 amount, 
        uint256 totalOwed, 
        bytes calldata
    ) external override returns (bool) {
        // For interface validation calls (with zero values), just return false
        if (token == address(0) && amount == 0 && totalOwed == 0) {
            return false;
        }
        
        require(token != address(0), "Invalid token");
        require(totalOwed > 0, "Invalid total owed");
        
        // Calculate just the fee (totalOwed - amount = fee)
        uint256 feeOnly = totalOwed - amount;
        
        // MALICIOUS: Only repay the fee, not the principal
        // This should cause the flash loan to fail with our fix
        IERC20(token).transfer(msg.sender, feeOnly);
        
        return true;
    }

    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
    return
        interfaceId == type(IFlashLoanReceiver).interfaceId ||
        super.supportsInterface(interfaceId);
    }
}