// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Smoke test proving the toolchain is wired: solc version, forge-std,
/// OpenZeppelin remapping and fuzzing all work before any Kitty contract exists.
contract EnvironmentTest is Test {
    function test_forgeStdIsUsable() public pure {
        assertEq(uint256(1 + 1), 2);
    }

    function test_openZeppelinRemappingResolves() public pure {
        // Compiling this file at all proves the @openzeppelin/ remapping works.
        assertTrue(type(IERC20).interfaceId != bytes4(0));
    }

    function testFuzz_additionIsCommutative(uint128 a, uint128 b) public pure {
        assertEq(uint256(a) + uint256(b), uint256(b) + uint256(a));
    }
}
