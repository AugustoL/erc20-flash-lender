// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20 {
    uint8 private _decimals;

    constructor(
        uint256 initialSupply, 
        string memory _name, 
        string memory _symbol, 
        uint8 _customDecimals
    ) ERC20(_name, _symbol) {
        _decimals = _customDecimals;
        _mint(msg.sender, initialSupply);
    }

    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }
}
