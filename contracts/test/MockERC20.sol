// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20 {
    constructor(uint256 initialSupply, string memory _name, string memory _symbol) ERC20(_name, _symbol) {
        _mint(msg.sender, initialSupply);
    }
}
