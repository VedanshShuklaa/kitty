// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

import { Circle } from "../src/Circle.sol";
import { CircleTestBase } from "./utils/CircleTestBase.sol";

/// @notice The read-only views the app uses in place of event history
/// (paidRound, recipientOf, revealedBid).
contract ViewsTest is CircleTestBase {
    function test_paidRound_tracksEachMemberPerRound() public {
        (address circle, address[] memory m) = _createAndFill(_rules(3));
        vm.warp(Circle(circle).dueTime(1) - 1);
        assertFalse(Circle(circle).paidRound(1, m[1]));
        _pay(circle, m[1], 1);
        assertTrue(Circle(circle).paidRound(1, m[1]));
        assertFalse(Circle(circle).paidRound(1, m[2]));
        assertFalse(Circle(circle).paidRound(2, m[1]));
    }

    function test_recipientOf_recordsEachRoundsWinner() public {
        (address circle, address[] memory m) = _createAndFill(_rules(3));
        assertEq(Circle(circle).recipientOf(1), address(0));

        // round 1, no bids: seat order gives it to the organizer
        _payAllAndClose(circle, m, 1);
        assertEq(Circle(circle).recipientOf(1), m[0]);

        // round 2: seat 2 wins with the only bid
        bytes32 salt = keccak256("salt");
        vm.warp(Circle(circle).dueTime(2) - COMMIT);
        _commit(circle, m[2], 2, 1_000, salt);
        vm.warp(Circle(circle).dueTime(2) - 1);
        for (uint256 i = 0; i < m.length; i++) {
            _pay(circle, m[i], 2);
        }
        vm.warp(Circle(circle).dueTime(2));
        _reveal(circle, m[2], 2, 1_000, salt);
        _close(circle, 2);
        assertEq(Circle(circle).recipientOf(2), m[2]);
        assertEq(Circle(circle).recipientOf(3), address(0));
    }

    function test_revealedBid_reportsRevealAndValue() public {
        (address circle, address[] memory m) = _createAndFill(_rules(3));
        bytes32 salt = keccak256("salt");
        vm.warp(Circle(circle).dueTime(1) - COMMIT);
        _commit(circle, m[1], 1, 2_500, salt);

        (bool revealed, uint16 bps) = Circle(circle).revealedBid(1, m[1]);
        assertFalse(revealed);
        assertEq(bps, 0);

        vm.warp(Circle(circle).dueTime(1));
        _reveal(circle, m[1], 1, 2_500, salt);
        (revealed, bps) = Circle(circle).revealedBid(1, m[1]);
        assertTrue(revealed);
        assertEq(bps, 2_500);
    }
}
