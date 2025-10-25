// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.30;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import "../ERC20FlashLender.sol";

/**
 * @title PublicFlashLenderTester
 * @notice Contract to be used in public test networks to test flash loan functionality.
 *  It holds a reference to the deployed PublicFlashLender and can receive tokens.
 *  It can initiate flash loans and repay them to validate end-to-end functionality.
 */
contract PublicFlashLenderTester is ERC165 {
    address public flashLender;

    constructor(address _flashLender) {
        flashLender = _flashLender;
    }
    
    function sendTokensToLender(address token, uint256 amount) external {       
        IERC20(token).transfer(flashLender, amount);
    }

    function executeTestFlashLoan(
        address token,
        uint256 amount
    ) external {
        ERC20FlashLender(flashLender).flashLoan(
            token,
            amount,
            address(this),
            bytes("0x")
        );
    }

    function executeOperation(
        address token,
        uint256 amount,
        uint256 totalOwed,
        bytes calldata data
    ) external returns (bool) {
        require(msg.sender == address(flashLender), "Only flash lender can call");

        // Approve the lender to pull the owed amount
        IERC20(token).transfer(flashLender, totalOwed);
        return true;
    }

        /**
     * @notice Check if the contract supports the IFlashLoanReceiver interface
     * @param interfaceId The interface identifier
     */
    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
        return
            interfaceId == type(IFlashLoanReceiver).interfaceId ||
            super.supportsInterface(interfaceId);
    }

}
