// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20 {
    constructor(uint256 initialSupply) ERC20("MockToken", "MOCK") {
        _mint(msg.sender, initialSupply);
    }
}
