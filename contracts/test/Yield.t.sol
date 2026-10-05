// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

import { Vm } from "forge-std/Vm.sol";
import { Circle } from "../src/Circle.sol";
import { StakeVault } from "../src/StakeVault.sol";
import { Rules } from "../src/interfaces/ICircleFactory.sol";
import { IStakeVault } from "../src/interfaces/IStakeVault.sol";
import { IYieldAdapter } from "../src/interfaces/IYieldAdapter.sol";
import { CircleTestBase } from "./utils/CircleTestBase.sol";

/// @notice SRS 15.7 yield on testnet: TC-3-10, the yield halves of TC-3-11
/// and TC-3-12, the fee-shortfall path of SRS 7.7, and the gas budgets in
/// 7.10 with yield on.
contract YieldTest is CircleTestBase {
    function _yieldRules(uint8 n) internal view returns (Rules memory r) {
        r = _rules(n);
        r.yieldOn = true;
    }

    /// 4.5% a year, a month of yield every ten minutes
    function _startYield() internal {
        ausd.mint(owner, 10_000_000000);
        vm.startPrank(owner);
        ausd.approve(address(earn), type(uint256).max);
        earn.fundReserve(10_000_000000);
        earn.setRate(450, 4_320);
        vm.stopPrank();
    }

    function _ledgerAll(address circle, address m) internal view returns (uint256) {
        return vault.balanceOf(circle, m, IStakeVault.Kind.Stake)
            + vault.balanceOf(circle, m, IStakeVault.Kind.Holdback) + vault.balanceOf(circle, m, IStakeVault.Kind.Pool);
    }

    function _withdrawAll(address circle, address[] memory m) internal returns (uint256 paidOut) {
        for (uint256 i = 0; i < m.length; i++) {
            uint256 shown = Circle(circle).withdrawable(m[i]);
            if (shown == 0) continue;
            uint256 before = ausd.balanceOf(m[i]);
            vm.prank(m[i]);
            Circle(circle).withdraw();
            uint256 got = ausd.balanceOf(m[i]) - before;
            assertEq(got, shown, "withdraw pays what withdrawable showed");
            paidOut += got;
        }
    }

    function _assertDone(address circle, address[] memory m) internal view {
        assertEq(ausd.balanceOf(circle), 0, "circle balance");
        for (uint256 i = 0; i < m.length; i++) {
            assertEq(_ledgerAll(circle, m[i]), 0, "ledger");
            assertEq(Circle(circle).withdrawable(m[i]), 0, "withdrawable");
        }
        (uint256 principal, uint256 liquid, uint256 invested,) = vault.positionOf(circle);
        assertEq(principal, 0, "principal");
        assertEq(liquid, 0, "liquid");
        assertEq(invested, 0, "invested");
        assertEq(ausd.balanceOf(address(vault)), 0, "vault balance");
        assertEq(earn.sharesOf(address(vault)), 0, "adapter shares");
    }

    // ---- TC-3-10: collateral above the buffer goes to the adapter ----
    function test_TC3_10_bufferKeptAndRestInvested() public {
        (address circle, address[] memory m) = _createAndFill(_yieldRules(4));
        (,, uint256 investedAtStart,) = vault.positionOf(circle);
        assertEq(investedAtStart, 0, "nothing moves until the first close");
        // seat 0 receives round 1; its holdback joins the collateral
        _payAllAndClose(circle, m, 1);
        (uint256 principal, uint256 liquid, uint256 invested, bool earning) = vault.positionOf(circle);
        assertTrue(earning);
        assertEq(principal, 4 * uint256(CONTRIBUTION) + (uint256(CONTRIBUTION) * 3 * 2_000) / 10_000);
        assertEq(liquid, (principal * 3_000) / 10_000);
        assertEq(ausd.balanceOf(address(vault)), liquid);
        assertEq(ausd.balanceOf(address(earn)), principal - liquid);
        // previewInstantRedeem is net of the 20 bps fee
        assertEq(invested, ((principal - liquid) * 9_980) / 10_000);
    }

    // ---- TC-3-10: a cover bigger than the buffer redeems instantly, and
    // the pot is paid in the same transaction ----
    function test_TC3_10_coverBeyondBufferRedeemsAndPotPays() public {
        (address circle, address[] memory m) = _createAndFill(_yieldRules(4));
        _payAllAndClose(circle, m, 1); // seat 0 receives; collateral now invested
        uint32 round = 2;
        vm.warp(Circle(circle).dueTime(round) - 1);
        _pay(circle, m[0], round);
        _pay(circle, m[1], round);
        // seats 2 and 3 miss: 200 AUSD of covers against a ~138 AUSD buffer
        uint256 before = ausd.balanceOf(m[1]);
        vm.expectEmit(true, false, false, false, address(vault));
        emit IStakeVault.Redeemed(circle, 0, 0);
        _close(circle, round);
        uint256 holdback = (uint256(CONTRIBUTION) * 2 * 2_000) / 10_000;
        assertEq(ausd.balanceOf(m[1]) - before, 4 * uint256(CONTRIBUTION) - holdback, "pot paid in full");
    }

    // ---- TC-3-11 (yield on): a pot never enters the adapter ----
    function test_TC3_11_potNeverEntersAdapter() public {
        (address circle, address[] memory m) = _createAndFill(_yieldRules(4));
        _payAllAndClose(circle, m, 1); // stakes go in at the first close
        uint256 adapterBefore = ausd.balanceOf(address(earn));
        vm.warp(Circle(circle).dueTime(2) - 1);
        for (uint256 i = 0; i < 4; i++) {
            _pay(circle, m[i], 2);
        }
        assertEq(ausd.balanceOf(address(earn)), adapterBefore, "contributions stay out");
        _close(circle, 2);
        // only collateral moved in: part of the new holdback, nothing of the pot
        uint256 holdback = (uint256(CONTRIBUTION) * 2 * 2_000) / 10_000;
        assertLe(ausd.balanceOf(address(earn)) - adapterBefore, holdback);
        assertEq(ausd.balanceOf(circle), 0, "pot left the circle to the winner");
    }

    // ---- TC-3-12 (yield half): yield splits pro rata to remaining stakes,
    // dust to the lowest seat, everything reaches zero ----
    function test_TC3_12_yieldSplitsProRataAndEmpties() public {
        _startYield();
        Rules memory r = _yieldRules(3);
        r.contribution = 33_333333;
        (address circle, address[] memory m) = _createAndFill(r);
        for (uint32 round = 1; round <= 3; round++) {
            _payAllAndClose(circle, m, round);
        }
        (uint256 assets, uint256 principal) = vault.previewSettle(circle);
        assertGt(assets, principal, "yield beat the redemption fee");
        uint256 y = assets - principal;
        uint256 stakeEach = vault.balanceOf(circle, m[1], IStakeVault.Kind.Stake);
        assertEq(stakeEach, r.contribution);

        uint256[] memory shown = new uint256[](3);
        for (uint256 i = 0; i < 3; i++) {
            shown[i] = Circle(circle).withdrawable(m[i]);
        }
        // holdback rounding can leave a unit behind, so compare with each ledger
        assertEq(shown[1], _ledgerAll(circle, m[1]) + y / 3);
        assertEq(shown[2], _ledgerAll(circle, m[2]) + y / 3);
        assertEq(shown[0], _ledgerAll(circle, m[0]) + y / 3 + y % 3, "dust to seat 0");

        uint256 paid = _withdrawAll(circle, m);
        assertEq(paid, assets);
        _assertDone(circle, m);
    }

    // ---- SRS 7.7: fees beyond yield come out of the pool first ----
    function test_feeShortfallComesFromPoolFirst() public {
        (address circle, address[] memory m) = _createAndFill(_yieldRules(4));
        // a winning bid seeds the pool
        uint64 due = Circle(circle).dueTime(1);
        vm.warp(due - COMMIT);
        _commit(circle, m[2], 1, 2_000, "s");
        vm.warp(due - 1);
        for (uint256 i = 0; i < 4; i++) {
            _pay(circle, m[i], 1);
        }
        vm.warp(due);
        _reveal(circle, m[2], 1, 2_000, "s");
        _close(circle, 1);
        for (uint32 round = 2; round <= 4; round++) {
            _payAllAndClose(circle, m, round);
        }
        uint256 poolBefore = Circle(circle).pool();
        (uint256 assets, uint256 principal) = vault.previewSettle(circle);
        assertLt(assets, principal, "no yield: the fee leaves a shortfall");
        assertGt(poolBefore, principal - assets, "pool can absorb it");
        uint256 stakeEach = vault.balanceOf(circle, m[1], IStakeVault.Kind.Stake);

        vm.prank(m[1]);
        Circle(circle).withdraw();
        // stakes are untouched; the pool paid the fee
        assertEq(vault.balanceOf(circle, m[0], IStakeVault.Kind.Stake), stakeEach);
        _withdrawAll(circle, m);
        _assertDone(circle, m);
    }

    // ---- SRS 7.7: with no pool, stakes absorb the shortfall pro rata ----
    function test_feeShortfallWritesDownStakesWhenNoPool() public {
        Rules memory r = _yieldRules(3);
        r.contribution = 10_000001;
        (address circle, address[] memory m) = _createAndFill(r);
        for (uint32 round = 1; round <= 3; round++) {
            _payAllAndClose(circle, m, round);
        }
        assertEq(Circle(circle).pool(), 0);
        (uint256 assets, uint256 principal) = vault.previewSettle(circle);
        uint256 d = principal - assets;
        assertGt(d, 0);
        uint256 total = 0;
        for (uint256 i = 0; i < 3; i++) {
            uint256 w = Circle(circle).withdrawable(m[i]);
            assertLe(w, r.contribution);
            assertGe(w + d, r.contribution, "each loses at most the whole shortfall");
            total += w;
        }
        assertEq(total, assets, "members split exactly what is left");
        _withdrawAll(circle, m);
        _assertDone(circle, m);
    }

    // ---- defaults pull collateral through the adapter mid-circle ----
    function test_defaultDrawsThroughAdapterAndEmpties() public {
        _startYield();
        (address circle, address[] memory m) = _createAndFill(_yieldRules(4));
        _payAllAndClose(circle, m, 1); // seat 0 receives
        // seat 0 stops paying and defaults; seat 3 misses once
        for (uint32 round = 2; round <= 4; round++) {
            vm.warp(Circle(circle).dueTime(round) - 1);
            _pay(circle, m[1], round);
            _pay(circle, m[2], round);
            if (round != 3) _pay(circle, m[3], round);
            _close(circle, round);
        }
        _withdrawAll(circle, m);
        _assertDone(circle, m);
    }

    // ---- regression: once misses and a default draw every unit of
    // collateral, the redemption fee left the vault short and closeRound
    // reverted forever. Now the vault pays what it holds and the circle
    // covers the gap from its pool. ----
    function test_fullDrainDoesNotBrickClose() public {
        Rules memory r = _yieldRules(3);
        (address circle, address[] memory m) = _createAndFill(r);
        _payAllAndClose(circle, m, 1); // seat 0 receives; collateral invested
        // round 2: nobody pays. Seat 0 defaults, seats 1 and 2 are covered;
        // together that draws every unit of collateral, and the fee on the
        // redemption leaves the vault short of the last take
        vm.recordLogs();
        _close(circle, 2);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bool shortTake = false;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].emitter == address(vault) && logs[i].topics[0] == IStakeVault.Taken.selector) {
                (, uint256 paid,) = abi.decode(logs[i].data, (uint8, uint256, address));
                // a take that came up short pays less than the obligation draws
                if (paid > 0 && paid % 1_000000 != 0) shortTake = true;
            }
        }
        assertTrue(shortTake, "the drain hit the fee");
        // the circle still finishes and empties
        vm.warp(Circle(circle).dueTime(3) - 1);
        _pay(circle, m[1], 3);
        _pay(circle, m[2], 3);
        _close(circle, 3);
        _withdrawAll(circle, m);
        assertEq(ausd.balanceOf(circle), 0, "circle balance");
        (uint256 p3, uint256 l3, uint256 i3,) = vault.positionOf(circle);
        assertEq(p3 + l3 + i3, 0, "vault position");
    }

    // ---- a circle without yieldOn never touches the adapter ----
    function test_yieldOffStaysLiquid() public {
        (address circle, address[] memory m) = _createAndFill(_rules(4));
        _payAllAndClose(circle, m, 1);
        (,, uint256 invested, bool earning) = vault.positionOf(circle);
        assertFalse(earning);
        assertEq(invested, 0);
        assertEq(ausd.balanceOf(address(earn)), 0);
    }

    // ---- wiring and permissions ----
    function test_adapterIsOneTimeAndBeforeFactory() public {
        vm.prank(owner);
        vm.expectRevert(StakeVault.FactoryAlreadySet.selector);
        vault.setAdapter(IYieldAdapter(address(1)));
    }

    function test_settlementCallsNeedASettledRegisteredCircle() public {
        (address circle,) = _createAndFill(_yieldRules(2));
        vm.startPrank(circle);
        vm.expectRevert(StakeVault.NotSettled.selector);
        vault.topUp(1);
        vm.expectRevert(StakeVault.NotSettled.selector);
        vault.allocate(organizer, IStakeVault.Kind.Pool, 1);
        vm.expectRevert(StakeVault.NotSettled.selector);
        vault.writeDown(organizer, IStakeVault.Kind.Stake, 1);
        vm.stopPrank();
        vm.expectRevert(IStakeVault.NotRegisteredCircle.selector);
        vault.rebalance();
    }

    function test_allocateCannotExceedSurplus() public {
        (address circle, address[] memory m) = _createAndFill(_yieldRules(2));
        for (uint32 round = 1; round <= 2; round++) {
            _payAllAndClose(circle, m, round);
        }
        vm.startPrank(circle);
        vault.settle();
        vm.expectRevert(StakeVault.InsufficientBalance.selector);
        vault.allocate(organizer, IStakeVault.Kind.Pool, 1);
        vm.stopPrank();
    }

    // ---- SRS 7.10 budgets, re-checked with yield on at 12 members ----
    function test_gas_withYieldOn() public {
        _startYield();
        Rules memory r = _yieldRules(12);
        address circle = _create(r);
        address[] memory m = new address[](12);
        m[0] = organizer;
        _fund(organizer, circle);
        vm.prank(organizer);
        Circle(circle).join(0, "");
        for (uint8 i = 1; i < 12; i++) {
            m[i] = _memberAddr(i);
            _fund(m[i], circle);
            bytes memory sig = _joinSig(i, circle, m[i]);
            vm.prank(m[i]);
            uint256 g = gasleft();
            Circle(circle).join(i, sig);
            if (i == 11) assertLt(g - gasleft(), 220_000, "activating join");
        }
        for (uint32 round = 1; round <= 12; round++) {
            vm.warp(Circle(circle).dueTime(round) - 1);
            for (uint256 i = 0; i < 12; i++) {
                // seat 11 misses round 1
                if (round == 1 && i == 11) continue;
                _pay(circle, m[i], round);
            }
            vm.warp(Circle(circle).dueTime(round) + GRACE);
            uint256 g = gasleft();
            Circle(circle).closeRound(round);
            assertLt(g - gasleft(), 1_200_000, "closeRound");
            if (round == 1) {
                vm.prank(m[11]);
                Circle(circle).payArrears();
            }
        }
        vm.prank(m[5]);
        uint256 g0 = gasleft();
        Circle(circle).withdraw();
        assertLt(g0 - gasleft(), 600_000, "first withdraw settles");
    }
}
