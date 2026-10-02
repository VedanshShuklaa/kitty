// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

import { Circle } from "../src/Circle.sol";
import { StakeVault } from "../src/StakeVault.sol";
import { KittyEarnVault } from "../src/KittyEarnVault.sol";
import { ICircle } from "../src/interfaces/ICircle.sol";
import { ICircleFactory, Rules } from "../src/interfaces/ICircleFactory.sol";
import { IStakeVault } from "../src/interfaces/IStakeVault.sol";
import { CircleTestBase } from "./utils/CircleTestBase.sol";

/// @notice Regression tests for defects found in the 2026-09-25 proofread.
/// Each one failed against the code as it stood before its fix.
contract HardeningTest is CircleTestBase {
    // One address holding two seats would pay one contribution per round
    // while the circle expects one per seat, and would receive only once.
    function test_join_sameAddressCannotTakeTwoSeats() public {
        address circle = _create(_rules(3));
        _fund(organizer, circle);
        vm.startPrank(organizer);
        Circle(circle).join(0, "");
        // the organizer made every invite link, so they can sign seat 1 for themselves
        bytes memory sig = _joinSig(1, circle, organizer);
        vm.expectRevert(ICircle.SeatTaken.selector);
        Circle(circle).join(1, sig);
        vm.stopPrank();
    }

    // SRS 7.7's holdback formula assumes the pot can pay it. With minimum
    // stakes, most members missing and a winning bid, gross - discount falls
    // below contribution * (N - r) * holdbackBps and closeRound underflowed,
    // leaving the round (and the circle) permanently unclosable.
    function test_closeRound_holdbackCappedWhenPotIsShort() public {
        Rules memory r = _rules(12);
        r.stakeBps = 5_000;
        r.holdbackBps = 5_000;
        (address circle, address[] memory m) = _createAndFill(r);

        uint64 due = Circle(circle).dueTime(1);
        vm.warp(due - COMMIT);
        _commit(circle, m[1], 1, 3_000, keccak256("s"));
        _pay(circle, m[1], 1);
        vm.warp(due);
        _reveal(circle, m[1], 1, 3_000, keccak256("s"));

        _close(circle, 1); // 11 misses, each only half-covered by stake

        uint256 gross = CONTRIBUTION + 11 * (uint256(CONTRIBUTION) / 2); // 650 AUSD
        uint256 discount = (gross * 3_000) / 10_000;
        assertEq(vault.balanceOf(circle, m[1], IStakeVault.Kind.Holdback), gross - discount);
        assertEq(Circle(circle).currentRound(), 2);
        (, bool received,,) = Circle(circle).standingOf(m[1]);
        assertTrue(received);
    }

    // After completion the pool has been split and zeroed; a pool-bound
    // arrears repayment would be stranded in the circle forever.
    function test_payArrears_revertsOnceCompleted() public {
        Rules memory r = _rules(4);
        r.stakeBps = 5_000;
        r.holdbackBps = 5_000;
        r.maxBidBps = 0;
        (address circle, address[] memory m) = _createAndFill(r);

        // rounds 1-2: only the organizer pays, so seats 1-3 fall Behind and
        // seat 1 wins round 2 from a pot too small to repay its arrears
        for (uint32 round = 1; round <= 2; round++) {
            vm.warp(Circle(circle).dueTime(round) - 1);
            _pay(circle, m[0], round);
            _close(circle, round);
        }
        _payAllAndClose(circle, m, 3);
        _payAllAndClose(circle, m, 4);
        assertEq(uint8(Circle(circle).state()), uint8(ICircle.State.Completed));

        (ICircle.Standing st, bool received, uint256 arrears,) = Circle(circle).standingOf(m[1]);
        assertEq(uint8(st), uint8(ICircle.Standing.Behind));
        assertTrue(received);
        assertGt(arrears, 0);

        vm.prank(m[1]);
        vm.expectRevert(ICircle.WrongState.selector);
        Circle(circle).payArrears();
    }

    // The shared implementation is never used as a circle, but nobody but
    // the factory should be able to initialize anything.
    function test_initialize_onlyFactory() public {
        Circle impl = Circle(factory.circleImplementation());
        Rules memory r = _rules(3);
        address[] memory signers = _signers(3);
        vm.expectRevert(ICircle.NotEligible.selector);
        impl.initialize(r, signers, address(this));
    }

    function test_reissueInvite_rejectsOrganizerSeatAndOutOfRange() public {
        address circle = _create(_rules(3));
        vm.startPrank(organizer);
        vm.expectRevert(ICircle.BadInvite.selector);
        Circle(circle).reissueInvite(0, address(0xBEEF));
        vm.expectRevert(ICircle.BadInvite.selector);
        Circle(circle).reissueInvite(3, address(0xBEEF));
        vm.expectRevert(ICircle.BadInvite.selector);
        Circle(circle).reissueInvite(1, address(0));
        Circle(circle).reissueInvite(2, address(0xBEEF));
        vm.stopPrank();
        assertEq(Circle(circle).inviteSignerAt(2), address(0xBEEF));
    }

    // withdrawable() is what the app shows before the first withdraw settles
    // the circle, so it has to include the pool share and credit forfeits
    // that settlement is about to apply.
    function test_withdrawable_matchesWithdrawBeforeSettlement() public {
        (address circle, address[] memory m) = _createAndFill(_rules(3));
        uint64 due = Circle(circle).dueTime(1);
        vm.warp(due - COMMIT);
        _commit(circle, m[1], 1, 1_000, keccak256("s"));
        vm.warp(due - 1);
        for (uint256 i = 0; i < 3; i++) {
            _pay(circle, m[i], 1);
        }
        vm.warp(due);
        _reveal(circle, m[1], 1, 1_000, keccak256("s"));
        _close(circle, 1);
        _payAllAndClose(circle, m, 2);
        _payAllAndClose(circle, m, 3);
        assertGt(Circle(circle).pool(), 0);

        uint256[] memory shown = new uint256[](3);
        for (uint256 i = 0; i < 3; i++) {
            shown[i] = Circle(circle).withdrawable(m[i]);
        }
        for (uint256 i = 0; i < 3; i++) {
            uint256 before = ausd.balanceOf(m[i]);
            vm.prank(m[i]);
            Circle(circle).withdraw();
            assertEq(ausd.balanceOf(m[i]) - before, shown[i]);
            assertEq(Circle(circle).withdrawable(m[i]), 0);
        }
        assertEq(ausd.balanceOf(circle), 0);
    }

    // setFactory is one-time wiring. A re-pointable factory would let the
    // vault owner register an arbitrary "circle" whose deposit() books
    // balances it never paid and whose take() drains every real circle.
    function test_stakeVault_setFactoryIsOneTime() public {
        vm.prank(owner);
        vm.expectRevert(StakeVault.FactoryAlreadySet.selector);
        vault.setFactory(address(0xBAD));
    }

    // SRS 14.3: maxBidBps capped at 3,000 (the Chit Funds Act's 30% ceiling).
    function test_factory_maxBidBpsCappedAt3000() public {
        Rules memory r = _rules(3);
        r.maxBidBps = 3_001;
        address[] memory signers = _signers(3);
        vm.prank(organizer);
        vm.expectRevert(ICircleFactory.BadRules.selector);
        factory.createCircle(r, signers);

        r.maxBidBps = 3_000;
        vm.prank(organizer);
        factory.createCircle(r, signers);
    }
}

/// @notice TC-0-07 in unit form, plus a regression: assets owed to a queued
/// redemption were still counted in totalAssets(), so everyone else's shares
/// were overvalued and the queue could be left unpayable.
contract KittyEarnVaultTest is CircleTestBase {
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    function setUp() public override {
        super.setUp();
        earn = new KittyEarnVault(ausd, owner);
        address[3] memory who = [alice, bob, owner];
        for (uint256 i = 0; i < 3; i++) {
            ausd.mint(who[i], 1_000_000000);
            vm.prank(who[i]);
            ausd.approve(address(earn), type(uint256).max);
        }
    }

    function test_instantRedeemCharges20bps() public {
        vm.prank(alice);
        uint256 shares = earn.deposit(address(ausd), 100_000000, alice);
        vm.prank(alice);
        uint256 out = earn.instantRedeem(shares, alice);
        assertEq(out, 100_000000 - 200000);
    }

    function test_queuedRedeemHonoursLagAndPaysInFull() public {
        vm.startPrank(alice);
        uint256 shares = earn.deposit(address(ausd), 100_000000, alice);
        (uint256 epoch,,,) = earn.requestRedeem(shares, alice);
        vm.expectRevert(bytes("still queued"));
        earn.claim(epoch, 0, 0, alice);
        vm.warp(block.timestamp + earn.LAG_DURATION());
        (, uint256 out) = earn.claim(epoch, 0, 0, alice);
        vm.stopPrank();
        assertEq(out, 100_000000);
    }

    function test_yieldAccruesProRata() public {
        vm.prank(alice);
        earn.deposit(address(ausd), 100_000000, alice);
        vm.prank(bob);
        earn.deposit(address(ausd), 300_000000, bob);
        vm.prank(owner);
        earn.fundReserve(100_000000);
        vm.prank(owner);
        earn.setRate(10_000, 1); // 100% a year
        vm.warp(block.timestamp + 365 days / 10);
        assertEq(earn.totalAssetsOf(alice), 110_000000);
        assertEq(earn.totalAssetsOf(bob), 330_000000);
    }

    function test_yieldStopsWhenReserveRunsOut() public {
        vm.prank(alice);
        earn.deposit(address(ausd), 100_000000, alice);
        vm.prank(owner);
        earn.fundReserve(5_000000);
        vm.prank(owner);
        earn.setRate(10_000, 1);
        vm.warp(block.timestamp + 365 days);
        assertEq(earn.totalAssetsOf(alice), 105_000000);
        // crediting the reserve leaves nothing behind it
        vm.prank(alice);
        earn.deposit(address(ausd), 1_000000, alice);
        assertEq(earn.reserve(), 0);
        assertEq(earn.totalAssets(), 106_000000);
    }

    function test_speedUpCompressesTime() public {
        vm.prank(alice);
        earn.deposit(address(ausd), 100_000000, alice);
        vm.prank(owner);
        earn.fundReserve(100_000000);
        vm.prank(owner);
        earn.setRate(1_200, 365); // 12% a year, a year per day
        vm.warp(block.timestamp + 1 days);
        assertEq(earn.totalAssetsOf(alice), 112_000000);
    }

    function test_pendingRedemptionNotCountedAsAssets() public {
        vm.prank(alice);
        uint256 aShares = earn.deposit(address(ausd), 100_000000, alice);
        vm.prank(bob);
        uint256 bShares = earn.deposit(address(ausd), 100_000000, bob);

        vm.prank(alice);
        (uint256 epoch,,,) = earn.requestRedeem(aShares, alice);
        assertEq(earn.totalAssetsOf(bob), 100_000000);

        vm.prank(bob);
        earn.instantRedeem(bShares, bob);

        vm.warp(block.timestamp + earn.LAG_DURATION());
        vm.prank(alice);
        (, uint256 out) = earn.claim(epoch, 0, 0, alice);
        assertEq(out, 100_000000);
    }

    function test_feeCannotExceed100Percent() public {
        vm.prank(owner);
        vm.expectRevert(bytes("fee too high"));
        earn.setInstantRedemptionFeeBps(10_001);
    }
}
