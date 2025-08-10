// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MockERC20 for TEST1
 * @notice Mock ERC20 token for testing arbitrage scenarios
 */
contract TEST1Token is ERC20 {
    constructor(uint256 initialSupply) ERC20("Test Token 1", "TEST1") {
        _mint(msg.sender, initialSupply);
    }
}

/**
 * @title MockERC20 for TEST2  
 * @notice Mock ERC20 token for testing arbitrage scenarios
 */
contract TEST2Token is ERC20 {
    constructor(uint256 initialSupply) ERC20("Test Token 2", "TEST2") {
        _mint(msg.sender, initialSupply);
    }
}
