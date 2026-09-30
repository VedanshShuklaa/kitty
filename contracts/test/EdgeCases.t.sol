// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

import { Circle } from "../src/Circle.sol";
import { ICircle } from "../src/interfaces/ICircle.sol";
import { Rules } from "../src/interfaces/ICircleFactory.sol";
import { IStakeVault } from "../src/interfaces/IStakeVault.sol";
import { CircleTestBase } from "./utils/CircleTestBase.sol";

/// @notice The contract-side C3 and C4 unit tests (SRS section 11) that the
/// earlier suites did not cover. Yield-dependent parts are out: no adapter is
/// wired (NFR-COMP-02), so TC-3-11 and TC-3-12 run in their no-yield form.
contract EdgeCasesTest is CircleTestBase {
    // ---- TC-3-11: a pot never enters the vault; only the holdback does ----
    function test_TC3_11_potNeverEntersVault() public {
        (address circle, address[] memory m) = _createAndFill(_rules(4));
        uint256 vaultBefore = ausd.balanceOf(address(vault));
        _payAllAndClose(circle, m, 1);
        uint256 holdback = vault.balanceOf(circle, m[0], IStakeVault.Kind.Holdback);
        assertEq(holdback, (uint256(CONTRIBUTION) * 3 * 2_000) / 10_000);
        assertEq(ausd.balanceOf(address(vault)), vaultBefore + holdback);
    }

    // ---- TC-3-12 (no yield): pool splits equally among non-defaulted
    // members, defaulted credits are forfeited into it, the remainder lands on
    // the lowest non-defaulted seat, and everything reaches zero ----
    function test_TC3_12_completionSplitAndZero() public {
        Rules memory r = _rules(4);
        r.contribution = 33_333333; // odd amounts so every division leaves dust
        (address circle, address[] memory m) = _createAndFill(r);

        // round 1: seat 2 wins with a bid
        _bidRound(circle, m, 1, m[2], 1_001);
        // round 2: seat 1 wins with a bid, so seat 2 earns a credit
        _bidRound(circle, m, 2, m[1], 1_234);
        (,,, uint256 forfeited) = Circle(circle).standingOf(m[2]);
        assertGt(forfeited, 0);

        // round 3: seat 2 walks away before spending it and defaults
        for (uint32 round = 3; round <= 4; round++) {
            vm.warp(Circle(circle).dueTime(round) - 1);
            _pay(circle, m[0], round);
            _pay(circle, m[1], round);
            _pay(circle, m[3], round);
            _close(circle, round);
        }
        (ICircle.Standing st,,,) = Circle(circle).standingOf(m[2]);
        assertEq(uint8(st), uint8(ICircle.Standing.Defaulted));
        assertEq(uint8(Circle(circle).state()), uint8(ICircle.State.Completed));

        uint256 total = Circle(circle).pool() + forfeited;
        uint256 per = total / 3;
        uint256 rem = total % 3;
        assertGt(rem, 0, "vector should leave a remainder");

        for (uint256 i = 0; i < 4; i++) {
            uint256 ledger = vault.balanceOf(circle, m[i], IStakeVault.Kind.Stake)
                + vault.balanceOf(circle, m[i], IStakeVault.Kind.Holdback);
            (,,, uint256 credit) = Circle(circle).standingOf(m[i]);
            if (i == 2 && ledger == 0) {
                // the default used all of seat 2's collateral; the credit is forfeited
                assertEq(Circle(circle).withdrawable(m[i]), 0);
                continue;
            }
            uint256 before = ausd.balanceOf(m[i]);
            vm.prank(m[i]);
            Circle(circle).withdraw();
            uint256 got = ausd.balanceOf(m[i]) - before;
            if (i == 2) {
                assertEq(got, ledger, "defaulted member recovers only unused collateral");
            } else {
                assertEq(got, ledger + credit + per + (i == 0 ? rem : 0));
            }
        }
        _assertEmpty(circle, m);
    }

    // ---- TC-4-02: a late reveal, no reveal, and a reveal after close ----
    function test_TC4_02_badRevealsFallBackToSeatOrder() public {
        (address circle, address[] memory m) = _createAndFill(_rules(4));
        uint64 due = Circle(circle).dueTime(1);
        vm.warp(due - COMMIT);
        _commit(circle, m[2], 1, 2_000, keccak256("a")); // never reveals
        _commit(circle, m[3], 1, 2_500, keccak256("b")); // reveals too late
        vm.warp(due - 1);
        for (uint256 i = 0; i < 4; i++) {
            _pay(circle, m[i], 1);
        }
        vm.warp(due + REVEAL + 1);
        vm.prank(m[3]);
        vm.expectRevert(ICircle.TooLate.selector);
        Circle(circle).revealBid(1, 2_500, keccak256("b"));

        _close(circle, 1);
        (, bool received,,) = Circle(circle).standingOf(m[0]);
        assertTrue(received, "seat order: organizer");
        assertEq(Circle(circle).pool(), 0, "no discount taken");

        // a reveal after the round closed is refused, even while the reveal
        // window is technically still open (grace == revealWindow here)
        vm.prank(m[2]);
        vm.expectRevert(ICircle.WrongRound.selector);
        Circle(circle).revealBid(1, 2_000, keccak256("a"));
    }

    // ---- TC-4-03: a second close in the same block, and a close of an
    // old round, both fail without changing state ----
    function test_TC4_03_repeatAndStaleCloseRevert() public {
        (address circle, address[] memory m) = _createAndFill(_rules(3));
        _payAllAndClose(circle, m, 1);
        bytes32 snap = _snapshot(circle, m);

        vm.expectRevert(ICircle.WrongRound.selector);
        Circle(circle).closeRound(1);
        assertEq(_snapshot(circle, m), snap);

        _payAllAndClose(circle, m, 2);
        snap = _snapshot(circle, m);
        vm.expectRevert(ICircle.WrongRound.selector);
        Circle(circle).closeRound(1);
        vm.expectRevert(ICircle.WrongRound.selector);
        Circle(circle).closeRound(4);
        assertEq(_snapshot(circle, m), snap);
    }

    // ---- TC-4-04: remainders in every division create or destroy nothing,
    // and the dust lands in the pool ----
    function testFuzz_TC4_04_remaindersConserved(uint8 nSeed, uint64 contribution, uint16 bps, uint8 bidderSeed)
        public
    {
        uint8 n = uint8(bound(nSeed, 3, 12));
        Rules memory r = _rules(n);
        r.contribution = uint64(bound(contribution, 1_000000, 10_000_000000));
        bps = uint16(bound(bps, 1, 3_000));
        (address circle, address[] memory m) = _createAndFill(r);
        address bidder = m[1 + (bidderSeed % (n - 1))];

        uint64 due = Circle(circle).dueTime(1);
        vm.warp(due - COMMIT);
        _commit(circle, bidder, 1, bps, keccak256("f"));
        vm.warp(due - 1);
        for (uint256 i = 0; i < n; i++) {
            _pay(circle, m[i], 1);
        }
        vm.warp(due);
        _reveal(circle, bidder, 1, bps, keccak256("f"));

        uint256 bidderBefore = ausd.balanceOf(bidder);
        _close(circle, 1);

        uint256 gross = uint256(r.contribution) * n;
        uint256 discount = (gross * bps) / 10_000;
        uint256 toPool = (discount * r.poolShareBps) / 10_000;
        uint256 creditPool = discount - toPool;
        uint256 k = n - 1;
        uint256 holdback = (uint256(r.contribution) * (n - 1) * r.holdbackBps) / 10_000;

        assertEq(ausd.balanceOf(bidder) - bidderBefore, gross - discount - holdback, "paid");
        assertEq(vault.balanceOf(circle, bidder, IStakeVault.Kind.Holdback), holdback, "holdback");
        assertEq(Circle(circle).pool(), toPool + creditPool % k, "pool gets its share plus dust");
        uint256 credits = 0;
        for (uint256 i = 0; i < n; i++) {
            (,,, uint256 c) = Circle(circle).standingOf(m[i]);
            if (m[i] != bidder) assertEq(c, creditPool / k);
            credits += c;
        }
        assertEq(ausd.balanceOf(circle), Circle(circle).pool() + credits, "circle holds exactly the discount");
    }

    // ---- TC-4-05: every member defaults in turn; the circle still
    // completes and everything left is withdrawable ----
    function test_TC4_05_everyoneDefaultsInSequence() public {
        (address circle, address[] memory m) = _createAndFill(_rules(4));
        for (uint32 round = 1; round <= 4; round++) {
            vm.warp(Circle(circle).dueTime(round) - 1);
            for (uint256 i = 0; i < 4; i++) {
                (ICircle.Standing st, bool received,,) = Circle(circle).standingOf(m[i]);
                if (!received && st != ICircle.Standing.Defaulted) _pay(circle, m[i], round);
            }
            _close(circle, round);
        }
        assertEq(uint8(Circle(circle).state()), uint8(ICircle.State.Completed));
        for (uint256 i = 0; i < 3; i++) {
            (ICircle.Standing st,,,) = Circle(circle).standingOf(m[i]);
            assertEq(uint8(st), uint8(ICircle.Standing.Defaulted));
        }
        for (uint256 i = 0; i < 4; i++) {
            if (Circle(circle).withdrawable(m[i]) == 0) continue;
            vm.prank(m[i]);
            Circle(circle).withdraw();
        }
        _assertEmpty(circle, m);
    }

    // ---- TC-4-06: a circle that never fills is cancelled and refunds
    // everyone; a second refund attempt reverts ----
    function test_TC4_06_unfilledCircleCancelsAndRefundsOnce() public {
        Rules memory r = _rules(4);
        address circle = _create(r);
        _fund(organizer, circle);
        vm.prank(organizer);
        Circle(circle).join(0, "");
        address m1 = _memberAddr(1);
        _fund(m1, circle);
        vm.prank(m1);
        Circle(circle).join(1, _joinSig(1, circle, m1));

        vm.expectRevert(ICircle.TooEarly.selector);
        vm.prank(m1);
        Circle(circle).cancel();

        vm.warp(r.joinDeadline);
        Circle(circle).cancel(); // anyone, once the deadline passes

        address[2] memory who = [organizer, m1];
        for (uint256 i = 0; i < 2; i++) {
            uint256 before = ausd.balanceOf(who[i]);
            vm.prank(who[i]);
            Circle(circle).withdraw();
            assertEq(ausd.balanceOf(who[i]) - before, CONTRIBUTION);
            vm.prank(who[i]);
            vm.expectRevert(ICircle.NothingToWithdraw.selector);
            Circle(circle).withdraw();
        }
        assertEq(ausd.balanceOf(address(vault)), 0);
    }

    // ---------------------------------------------------------- helpers

    function _bidRound(address circle, address[] memory m, uint32 round, address bidder, uint16 bps) internal {
        uint64 due = Circle(circle).dueTime(round);
        vm.warp(due - COMMIT);
        _commit(circle, bidder, round, bps, keccak256("x"));
        vm.warp(due - 1);
        for (uint256 i = 0; i < m.length; i++) {
            _pay(circle, m[i], round);
        }
        vm.warp(due);
        _reveal(circle, bidder, round, bps, keccak256("x"));
        _close(circle, round);
    }

    function _snapshot(address circle, address[] memory m) internal view returns (bytes32 h) {
        h = keccak256(
            abi.encode(
                Circle(circle).currentRound(),
                Circle(circle).pot(),
                Circle(circle).pool(),
                Circle(circle).defaultReserve(),
                ausd.balanceOf(circle),
                ausd.balanceOf(address(vault))
            )
        );
        for (uint256 i = 0; i < m.length; i++) {
            (ICircle.Standing st, bool rec, uint256 arr, uint256 cr) = Circle(circle).standingOf(m[i]);
            h = keccak256(abi.encode(h, st, rec, arr, cr));
        }
    }

    function _assertEmpty(address circle, address[] memory m) internal view {
        assertEq(ausd.balanceOf(circle), 0, "circle balance");
        for (uint256 i = 0; i < m.length; i++) {
            assertEq(vault.balanceOf(circle, m[i], IStakeVault.Kind.Stake), 0, "stake ledger");
            assertEq(vault.balanceOf(circle, m[i], IStakeVault.Kind.Holdback), 0, "holdback ledger");
            assertEq(Circle(circle).withdrawable(m[i]), 0, "withdrawable");
        }
    }
}
