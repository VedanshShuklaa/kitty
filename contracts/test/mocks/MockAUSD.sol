// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice A 6-decimal mint-on-demand stand-in for Agora's testnet AUSD, used
/// only in tests. TC-1-15 exercises real testnet AUSD via a fork instead.
contract MockAUSD is ERC20 {
    constructor() ERC20("AUSD", "AUSD") { }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /// Agora's AUSD can freeze an address: no transfer to or from it goes through.
    mapping(address => bool) public frozen;

    function setFrozen(address who, bool on) external {
        frozen[who] = on;
    }

    function _update(address from, address to, uint256 value) internal override {
        require(!frozen[from] && !frozen[to], "frozen");
        super._update(from, to, value);
    }
}
