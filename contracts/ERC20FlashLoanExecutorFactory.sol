// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.28;

import "./ERC20FlashLoanExecutor.sol";
import "./ERC20FlashLender.sol";

/**
 * @title ERC20FlashLoanExecutorFactory
 * @notice Factory contract for creating flash loan executors
 * @dev Creates flash loan executor contracts that execute immediately upon deployment
 */
contract ERC20FlashLoanExecutorFactory {
    /// @notice The flash loan lender contract
    ERC20FlashLender public immutable flashLender;

    /**
     * @notice Constructor
     * @param _flashLender Address of the flash loan lender
     */
    constructor(address _flashLender) {
        require(_flashLender != address(0), "Invalid flash lender");
        flashLender = ERC20FlashLender(_flashLender);
    }
    

    /**
     * @notice Create and execute a flash loan with multiple operations
     * @param token Address of the token to borrow
     * @param amount Amount to borrow
     * @param operations Array of operations to execute
     * @return executor Address of the created executor contract
     */
    function createAndExecuteFlashLoan(
        address token,
        uint256 amount,
        ERC20FlashLoanExecutor.Operation[] calldata operations
    ) external returns (address executor) {
        // Create executor with factory as temporary owner
        ERC20FlashLoanExecutor executorContract = new ERC20FlashLoanExecutor(
            address(flashLender),
            address(this) // Factory is temporary owner
        );
        
        executor = address(executorContract);
        
        // Execute flash loan 
        executorContract.executeFlashLoan(token, amount, operations);
        
        // Transfer ownership to the real user
        executorContract.transferOwnership(msg.sender);
        
        return executor;
    }
}
