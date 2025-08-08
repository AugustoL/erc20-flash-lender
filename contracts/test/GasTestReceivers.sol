// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.28;

import "../ERC20FlashLender.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title GasExhaustingReceiver
 * @notice A receiver that exhausts all gas during interface checks, causing revert
 * @dev This contract is used to test the behavior of the system when a receiver consumes too much gas
 */
contract GasExhaustingReceiver is IFlashLoanReceiver {
    // Mapping to guarantee each index write hits a fresh storage slot (20k gas each first write)
    mapping(uint256 => uint256) private slots;
    uint256 private counter;
    function executeOperation(
        address _token,
        uint256 amount,
        uint256 totalOwed,
        bytes calldata
    ) external returns (bool) {
        if (_token == address(0) && amount == 0 && totalOwed == 0) {
            // Each iteration writes to a new storage slot => ~20k gas per iteration
            // 2 iterations already exceed 30k allowance (40k+ including loop overhead)
            for (uint256 i = 0; i < 2; i++) { 
                slots[counter + i] = i; 
            }
            counter += 2; // advance base to avoid reusing slots in future probes
            return false; // Not reached (OOG) under 30k fallback gas
        }
        require(_token != address(0), "Invalid token");
        require(totalOwed > 0, "Invalid total owed");
        IERC20(_token).transfer(msg.sender, totalOwed);
        return true;
    }
}
