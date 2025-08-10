// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.28;

import "./ERC20FlashLender.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";

/**
 * @title ERC20FlashLoanExecutor
 * @notice A reusable contract that executes flash loans with multiple operations
 * @dev This contract can be used to execute complex operations within a single flash loan
 * @dev Users must handle repayment directly to the lender in their operations for gas efficiency
 */

/**
 * @title ERC20FlashLoanExecutor
 * @notice Flash loan executor that can perform multiple operations
 * @dev Gas optimized - users handle repayment directly to lender
 */
contract ERC20FlashLoanExecutor is IFlashLoanReceiver, IMultiFlashLoanReceiver, Ownable, ERC165 {
    using SafeERC20 for IERC20;

    /// @notice The flash loan lender contract
    ERC20FlashLender public immutable flashLender;

    /// @notice Structure to define an operation to execute
    struct Operation {
        address target;     // Contract to call
        bytes data;         // Calldata for the operation
        uint256 value;      // ETH value to send (if needed)
    }

    /**
     * @notice Constructor - sets up the executor without executing flash loan
     * @param _flashLender Address of the flash loan lender
     * @param _owner Address of the owner (creator)
     */
    constructor(
        address _flashLender,
        address _owner
    ) Ownable(_owner) {
        flashLender = ERC20FlashLender(_flashLender);
    }

    /**
     * @notice Execute a flash loan with multiple operations
     * @param _token Address of the token to borrow
     * @param _amount Amount to borrow
     * @param _operations Array of operations to execute
     */
    function executeFlashLoan(
        address _token,
        uint256 _amount,
        Operation[] calldata _operations
    ) external onlyOwner {
        // Encode operations into calldata
        bytes memory data = abi.encode(_operations);
        
        // Execute flash loan
        flashLender.flashLoan(_token, _amount, address(this), data);
    }

    /**
     * @notice Execute a multi-token flash loan with multiple operations
     * @param _tokens Array of token addresses to borrow
     * @param _amounts Array of amounts to borrow (must match tokens array length)
     * @param _operations Array of operations to execute
     */
    function executeMultiFlashLoan(
        address[] calldata _tokens,
        uint256[] calldata _amounts,
        Operation[] calldata _operations
    ) external onlyOwner {
        // Encode operations into calldata
        bytes memory data = abi.encode(_operations);
        
        // Execute multi-token flash loan
        flashLender.flashLoanMultiple(_tokens, _amounts, address(this), data);
    }

    /**
     * @notice Called by the flash loan contract after transferring funds
     * @param token Address of the borrowed token
     * @param amount Amount of tokens borrowed
     * @param totalOwed Total amount that must be repaid (principal + fees)
     * @param data Encoded operations to execute
     */
    function executeOperation(
        address token,
        uint256 amount,
        uint256 totalOwed,
        bytes calldata data
    ) external override returns (bool) {
        require(msg.sender == address(flashLender), "Only flash lender can call");
        
        // Decode operations from data
        Operation[] memory operations = abi.decode(data, (Operation[]));
        
        // Execute all operations
        for (uint256 i = 0; i < operations.length; i++) {
            _executeOperation(operations[i]);
        }

        // User is responsible for repaying the flash loan directly to the lender
        // in their operations for maximum gas efficiency. The flash lender will
        // validate repayment and revert if insufficient funds were transferred.

        return true;
    }

    /**
     * @notice Called by the flash loan contract after transferring multiple tokens
     * @param tokens Array of addresses of the borrowed tokens
     * @param amounts Array of amounts of tokens borrowed (matches tokens array)
     * @param totalOwed Array of total amounts that must be repaid (principal + fees for each token)
     * @param data Encoded operations to execute
     */
    function executeMultiOperation(
        address[] calldata tokens,
        uint256[] calldata amounts,
        uint256[] calldata totalOwed,
        bytes calldata data
    ) external override returns (bool) {
        require(msg.sender == address(flashLender), "Only flash lender can call");
        
        // Decode operations from data
        Operation[] memory operations = abi.decode(data, (Operation[]));
        
        // Execute all operations
        for (uint256 i = 0; i < operations.length; i++) {
            _executeOperation(operations[i]);
        }

        // User is responsible for repaying all flash loans directly to the lender
        // in their operations for maximum gas efficiency. The flash lender will
        // validate repayment and revert if insufficient funds were transferred.

        return true;
    }

    /**
     * @notice Execute a single operation
     * @param operation The operation to execute
     */
    function _executeOperation(Operation memory operation) internal {       
        (bool success, bytes memory result) = operation.target.call{value: operation.value}(operation.data);
        require(success, string(abi.encodePacked("Operation failed: ", result)));
    }

    /**
     * @notice Execute arbitrary call as owner
     * @param target Address to call
     * @param data Calldata for the call
     * @param value ETH value to send
     * @return success Whether the call succeeded
     * @return result Return data from the call
     */
    function executeCall(
        address target,
        bytes calldata data,
        uint256 value
    ) external onlyOwner returns (bool success, bytes memory result) {
        (success, result) = target.call{value: value}(data);
    }

    /**
     * @notice Get the flash lender address for direct repayment in operations
     * @return Address of the flash lender contract
     * @dev Users can call this to get the lender address for direct repayment
     */
    function getFlashLender() external view returns (address) {
        return address(flashLender);
    }

    /**
     * @notice Allow contract to receive ETH
     */
    receive() external payable {}

    /**
     * @notice Check if the contract supports the IFlashLoanReceiver interface
     * @param interfaceId The interface identifier
     */
    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
        return
            interfaceId == type(IFlashLoanReceiver).interfaceId ||
            interfaceId == type(IMultiFlashLoanReceiver).interfaceId ||
            super.supportsInterface(interfaceId);
    }
}
