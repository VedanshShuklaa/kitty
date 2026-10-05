// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";
import { MessageHashUtils } from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import { CircleFactory } from "../src/CircleFactory.sol";
import { IKittyRecord } from "../src/interfaces/IKittyRecord.sol";
import { KittyRecord } from "../src/KittyRecord.sol";
import { StakeVault } from "../src/StakeVault.sol";
import { Circle } from "../src/Circle.sol";
import { ICircle } from "../src/interfaces/ICircle.sol";
import { ICircleFactory, Rules } from "../src/interfaces/ICircleFactory.sol";
import { IStakeVault } from "../src/interfaces/IStakeVault.sol";
import { MockAUSD } from "./mocks/MockAUSD.sol";

/// @notice TC-1-16: per-call gas against the SRS 7.10 budgets, at the
/// maximum 12-member circle size. Each budget is checked with a
/// vm.startSnapshotGas/stopSnapshotGas bracket around exactly one call, so
/// the number compared to the table is that call's own gas, not a whole
/// test's cumulative gas as `forge snapshot`'s default report would show.
contract GasBudgetTest is Test {
    bytes32 private constant JOIN_TYPEHASH = keccak256("kitty.join.v1");

    MockAUSD ausd;
    StakeVault vault;
    CircleFactory factory;
    IKittyRecord record;

    address owner = makeAddr("owner");
    address organizer = makeAddr("organizer");

    uint8 constant N = 12;
    uint32 constant PERIOD = 600;
    uint32 constant COMMIT = 240;
    uint32 constant REVEAL = 120;
    uint32 constant GRACE = 120;
    uint64 constant CONTRIBUTION = 100_000000; // 100 AUSD

    // SRS 7.10 budgets, gas used at 12 members
    uint256 constant BUDGET_CREATE_CIRCLE = 500_000;
    uint256 constant BUDGET_JOIN = 220_000;
    uint256 constant BUDGET_CONTRIBUTE_COLLECT = 160_000;
    uint256 constant BUDGET_BID_STEP = 80_000;
    uint256 constant BUDGET_CLOSE_ROUND_BID_MISS_DEFAULT = 1_200_000;
    uint256 constant BUDGET_WITHDRAW_FIRST = 600_000;

    function setUp() public {
        ausd = new MockAUSD();
        vault = new StakeVault(ausd, owner);
        vm.prank(owner);
        record = new KittyRecord(owner, 0);
        factory = new CircleFactory(ausd, vault, record, 300, owner);
        vm.prank(owner);
        vault.setFactory(address(factory));
        vm.prank(owner);
        record.addFactory(address(factory));
    }

    function _rulesN(uint8 memberCount) internal view returns (Rules memory r) {
        r = Rules({
            memberCount: memberCount,
            stakeBps: 10_000,
            maxBidBps: 3_000, // SRS 7.1 default
            poolShareBps: 1_000,
            holdbackBps: 2_000,
            yieldOn: false,
            contribution: CONTRIBUTION,
            firstDue: uint64(block.timestamp) + 1 days,
            period: PERIOD,
            commitWindow: COMMIT,
            revealWindow: REVEAL,
            grace: GRACE,
            joinDeadline: uint64(block.timestamp) + 1 hours
        });
    }

    function _signers(uint8 n) internal pure returns (address[] memory signers, uint256[] memory keys) {
        signers = new address[](n);
        keys = new uint256[](n);
        for (uint8 i = 1; i < n; i++) {
            keys[i] = uint256(keccak256(abi.encode("gas-invite-key", i)));
            signers[i] = vm.addr(keys[i]);
        }
    }

    function _joinSig(uint256 privKey, address circle, uint8 seat, address joiner)
        internal
        view
        returns (bytes memory)
    {
        bytes32 digest = keccak256(abi.encode(JOIN_TYPEHASH, block.chainid, circle, seat, joiner));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privKey, MessageHashUtils.toEthSignedMessageHash(digest));
        return abi.encodePacked(r, s, v);
    }

    function _createCircle(uint8 n) internal returns (address circle, address[] memory signers, uint256[] memory keys) {
        Rules memory r = _rulesN(n);
        (signers, keys) = _signers(n);
        vm.prank(organizer);
        circle = factory.createCircle(r, signers);
    }

    function _fund(address circle, address who) internal {
        ausd.mint(who, CONTRIBUTION * 200);
        vm.startPrank(who);
        ausd.approve(address(vault), type(uint256).max);
        ausd.approve(circle, type(uint256).max);
        vm.stopPrank();
    }

    function _joinAll(address circle, address[] memory signers, uint256[] memory keys, uint8 n)
        internal
        returns (address[] memory members)
    {
        members = new address[](n);
        members[0] = organizer;
        _fund(circle, organizer);
        vm.prank(organizer);
        Circle(circle).join(0, "");
        for (uint8 i = 1; i < n; i++) {
            address m = vm.addr(keys[i]);
            members[i] = m;
            _fund(circle, m);
            vm.prank(m);
            Circle(circle).join(i, _joinSig(keys[i], circle, i, m));
        }
        signers;
    }

    // ---- createCircle ----
    function test_gas_createCircle_budget() public {
        Rules memory r = _rulesN(N);
        (address[] memory signers,) = _signers(N);
        vm.prank(organizer);
        vm.startSnapshotGas("createCircle_12members");
        factory.createCircle(r, signers);
        uint256 gasUsed = vm.stopSnapshotGas();
        assertLe(gasUsed, BUDGET_CREATE_CIRCLE);
    }

    // ---- join, including the stake deposit ----
    function test_gas_join_budget() public {
        (address circle, address[] memory signers, uint256[] memory keys) = _createCircle(N);
        _fund(circle, organizer);
        vm.prank(organizer);
        Circle(circle).join(0, "");

        address m1 = vm.addr(keys[1]);
        _fund(circle, m1);
        bytes memory sig = _joinSig(keys[1], circle, 1, m1);
        vm.prank(m1);
        vm.startSnapshotGas("join_withStake");
        Circle(circle).join(1, sig);
        uint256 gasUsed = vm.stopSnapshotGas();
        assertLe(gasUsed, BUDGET_JOIN);
        signers;
    }

    // ---- contribute / collect ----
    function test_gas_contribute_budget() public {
        (address circle, address[] memory signers, uint256[] memory keys) = _createCircle(N);
        address[] memory members = _joinAll(circle, signers, keys, N);
        Rules memory r = Circle(circle).rules();
        vm.warp(r.firstDue - 1);

        vm.prank(members[0]);
        vm.startSnapshotGas("contribute_singleCall");
        Circle(circle).contribute(1);
        uint256 gasUsed = vm.stopSnapshotGas();
        assertLe(gasUsed, BUDGET_CONTRIBUTE_COLLECT);
    }

    function test_gas_collect_budget() public {
        (address circle, address[] memory signers, uint256[] memory keys) = _createCircle(N);
        address[] memory members = _joinAll(circle, signers, keys, N);
        Rules memory r = Circle(circle).rules();
        vm.prank(members[0]);
        Circle(circle).setAutopay(true);

        vm.warp(r.firstDue - 1);
        vm.startSnapshotGas("collect_singleCall");
        Circle(circle).collect(members[0], 1);
        uint256 gasUsed = vm.stopSnapshotGas();
        assertLe(gasUsed, BUDGET_CONTRIBUTE_COLLECT);
    }

    // ---- commitBid / revealBid ----
    function test_gas_commitBid_revealBid_budget() public {
        (address circle, address[] memory signers, uint256[] memory keys) = _createCircle(N);
        address[] memory members = _joinAll(circle, signers, keys, N);
        Rules memory r = Circle(circle).rules();

        // newcomers (Shy) may only offer in the second half: round 7 of 12
        _closeRounds(circle, members, B - 1);
        uint64 dueB = Circle(circle).dueTime(B);
        uint16 discountBps = 1_000;
        bytes32 salt = keccak256("gas-test-salt");
        bytes32 commitment = keccak256(abi.encode(block.chainid, circle, B, members[8], discountBps, salt));

        vm.warp(dueB - r.commitWindow);
        vm.prank(members[8]);
        vm.startSnapshotGas("commitBid_singleCall");
        Circle(circle).commitBid(B, commitment);
        uint256 commitGas = vm.stopSnapshotGas();
        assertLe(commitGas, BUDGET_BID_STEP);

        vm.warp(dueB);
        vm.prank(members[8]);
        vm.startSnapshotGas("revealBid_singleCall");
        Circle(circle).revealBid(B, discountBps, salt);
        uint256 revealGas = vm.stopSnapshotGas();
        assertLe(revealGas, BUDGET_BID_STEP);
    }

    // ---- closeRound with bids, a miss and a default ----
    function test_gas_closeRound_bidsMissDefault_budget() public {
        (address circle, address[] memory signers, uint256[] memory keys) = _createCircle(N);
        address[] memory members = _joinAll(circle, signers, keys, N);
        Rules memory r = Circle(circle).rules();

        // rounds 1-6: everyone pays, nobody bids -> seats 0-5 win in seat
        // order (all Shy) and hold holdbacks to draw on later
        _closeRounds(circle, members, B - 1);
        (, bool received0,,) = Circle(circle).standingOf(members[0]);
        assertTrue(received0);

        uint64 dueB = Circle(circle).dueTime(B);

        // round 7: seat 0 (already received) misses entirely -> default.
        // seat 6 (never received) misses -> covered. seats 7 and 8 bid.
        uint16 bidA = 1_500;
        uint16 bidB = 2_500; // higher bid wins
        bytes32 saltA = keccak256("gasA");
        bytes32 saltB = keccak256("gasB");
        bytes32 commitA = keccak256(abi.encode(block.chainid, circle, B, members[7], bidA, saltA));
        bytes32 commitB = keccak256(abi.encode(block.chainid, circle, B, members[8], bidB, saltB));

        vm.warp(dueB - r.commitWindow);
        vm.prank(members[7]);
        Circle(circle).commitBid(B, commitA);
        vm.prank(members[8]);
        Circle(circle).commitBid(B, commitB);

        vm.warp(dueB - 1);
        for (uint8 i = 1; i < N; i++) {
            if (i == 6) continue;
            vm.prank(members[i]);
            Circle(circle).contribute(B);
        }

        vm.warp(dueB);
        vm.prank(members[7]);
        Circle(circle).revealBid(B, bidA, saltA);
        vm.prank(members[8]);
        Circle(circle).revealBid(B, bidB, saltB);

        vm.warp(dueB + r.grace);
        vm.startSnapshotGas("closeRound_bidsMissDefault_12members");
        Circle(circle).closeRound(B);
        uint256 gasUsed = vm.stopSnapshotGas();
        assertLe(gasUsed, BUDGET_CLOSE_ROUND_BID_MISS_DEFAULT);

        (ICircle.Standing st0,,,) = Circle(circle).standingOf(members[0]);
        (ICircle.Standing st6,,,) = Circle(circle).standingOf(members[6]);
        assertEq(uint8(st0), uint8(ICircle.Standing.Defaulted));
        assertEq(uint8(st6), uint8(ICircle.Standing.Behind));
        (, bool received8,,) = Circle(circle).standingOf(members[8]);
        assertTrue(received8); // higher bid (members[8]) won
    }

    uint32 constant B = 7; // first second-half round of a 12-member circle

    function _closeRounds(address circle, address[] memory members, uint32 upTo) internal {
        for (uint32 round = 1; round <= upTo; round++) {
            uint64 due = Circle(circle).dueTime(round);
            vm.warp(due - 1);
            for (uint8 i = 0; i < members.length; i++) {
                vm.prank(members[i]);
                Circle(circle).contribute(round);
            }
            vm.warp(due + Circle(circle).rules().grace);
            Circle(circle).closeRound(round);
        }
    }

    // ---- withdraw, first call settles the vault ----
    function test_gas_withdraw_first_budget() public {
        (address circle, address[] memory signers, uint256[] memory keys) = _createCircle(N);
        address[] memory members = _joinAll(circle, signers, keys, N);
        Rules memory r = Circle(circle).rules();

        for (uint32 round = 1; round <= N; round++) {
            uint64 due = r.firstDue + uint64(round - 1) * r.period;
            vm.warp(due - 1);
            for (uint8 i = 0; i < N; i++) {
                vm.prank(members[i]);
                try Circle(circle).contribute(round) { } catch { }
            }
            vm.warp(due + r.grace);
            Circle(circle).closeRound(round);
        }
        assertEq(uint8(Circle(circle).state()), uint8(ICircle.State.Completed));

        vm.prank(members[0]);
        vm.startSnapshotGas("withdraw_firstCallSettles_12members");
        Circle(circle).withdraw();
        uint256 gasUsed = vm.stopSnapshotGas();
        assertLe(gasUsed, BUDGET_WITHDRAW_FIRST);
    }
}
