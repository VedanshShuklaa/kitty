// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";
import { MessageHashUtils } from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import { CircleFactory } from "../src/CircleFactory.sol";
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
        factory = new CircleFactory(ausd, vault, 300, owner);
        vm.prank(owner);
        vault.setFactory(address(factory));
    }

    function _rulesN(uint8 memberCount) internal view returns (Rules memory r) {
        r = Rules({
            memberCount: memberCount,
            stakeBps: 10_000,
            maxBidBps: 3_000, // SRS 7.1 default
            poolShareBps: 1_000,
            holdbackBps: 2_000,
            yieldOn: false,
            tierDiscountOn: false,
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

    /// SRS 7.11: a tier attestation costs one extra ecrecover and a factory read.
    function test_gas_joinWithTierAttestation_budget() public {
        uint256 attestorKey = 0xA77E57;
        vm.prank(owner);
        factory.setTierAttestor(vm.addr(attestorKey));
        Rules memory r = _rulesN(N);
        r.tierDiscountOn = true;
        (address[] memory signers, uint256[] memory keys) = _signers(N);
        vm.prank(organizer);
        address circle = factory.createCircle(r, signers);
        _fund(circle, organizer);
        vm.prank(organizer);
        Circle(circle).join(0, "");

        address m1 = vm.addr(keys[1]);
        _fund(circle, m1);
        bytes memory sig = _joinSig(keys[1], circle, 1, m1);
        uint64 expiry = uint64(block.timestamp) + 1 hours;
        bytes32 digest =
            keccak256(abi.encode(keccak256("kitty.tier.v1"), block.chainid, address(factory), m1, uint16(8_500), expiry));
        (uint8 v, bytes32 rr, bytes32 ss) = vm.sign(attestorKey, MessageHashUtils.toEthSignedMessageHash(digest));
        bytes memory attestation = abi.encode(uint16(8_500), expiry, abi.encodePacked(rr, ss, v));
        vm.prank(m1);
        vm.startSnapshotGas("join_withTierAttestation");
        Circle(circle).join(1, sig, attestation);
        uint256 gasUsed = vm.stopSnapshotGas();
        assertLe(gasUsed, BUDGET_JOIN);
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

        uint16 discountBps = 1_000;
        bytes32 salt = keccak256("gas-test-salt");
        bytes32 commitment = keccak256(abi.encode(block.chainid, circle, uint32(1), members[2], discountBps, salt));

        vm.warp(r.firstDue - r.commitWindow);
        vm.prank(members[2]);
        vm.startSnapshotGas("commitBid_singleCall");
        Circle(circle).commitBid(1, commitment);
        uint256 commitGas = vm.stopSnapshotGas();
        assertLe(commitGas, BUDGET_BID_STEP);

        vm.warp(r.firstDue);
        vm.prank(members[2]);
        vm.startSnapshotGas("revealBid_singleCall");
        Circle(circle).revealBid(1, discountBps, salt);
        uint256 revealGas = vm.stopSnapshotGas();
        assertLe(revealGas, BUDGET_BID_STEP);
    }

    // ---- closeRound with bids, a miss and a default ----
    function test_gas_closeRound_bidsMissDefault_budget() public {
        (address circle, address[] memory signers, uint256[] memory keys) = _createCircle(N);
        address[] memory members = _joinAll(circle, signers, keys, N);
        Rules memory r = Circle(circle).rules();

        // round 1: everyone pays, nobody bids -> seat 0 (organizer) wins and
        // gets a holdback balance to draw on later.
        vm.warp(r.firstDue - 1);
        for (uint8 i = 0; i < N; i++) {
            vm.prank(members[i]);
            Circle(circle).contribute(1);
        }
        vm.warp(r.firstDue + r.grace);
        Circle(circle).closeRound(1);
        (, bool received0,,) = Circle(circle).standingOf(members[0]);
        assertTrue(received0);

        uint64 due2 = Circle(circle).dueTime(2);

        // round 2: seat 0 (already received) misses entirely -> default.
        // seat 1 (never received) misses -> covered. seats 2 and 3 bid.
        uint16 bidA = 1_500;
        uint16 bidB = 2_500; // higher bid wins
        bytes32 saltA = keccak256("gasA");
        bytes32 saltB = keccak256("gasB");
        bytes32 commitA = keccak256(abi.encode(block.chainid, circle, uint32(2), members[2], bidA, saltA));
        bytes32 commitB = keccak256(abi.encode(block.chainid, circle, uint32(2), members[3], bidB, saltB));

        vm.warp(due2 - r.commitWindow);
        vm.prank(members[2]);
        Circle(circle).commitBid(2, commitA);
        vm.prank(members[3]);
        Circle(circle).commitBid(2, commitB);

        vm.warp(due2 - 1);
        for (uint8 i = 2; i < N; i++) {
            vm.prank(members[i]);
            Circle(circle).contribute(2);
        }

        vm.warp(due2);
        vm.prank(members[2]);
        Circle(circle).revealBid(2, bidA, saltA);
        vm.prank(members[3]);
        Circle(circle).revealBid(2, bidB, saltB);

        vm.warp(due2 + r.grace);
        vm.startSnapshotGas("closeRound_bidsMissDefault_12members");
        Circle(circle).closeRound(2);
        uint256 gasUsed = vm.stopSnapshotGas();
        assertLe(gasUsed, BUDGET_CLOSE_ROUND_BID_MISS_DEFAULT);

        (ICircle.Standing st0,,,) = Circle(circle).standingOf(members[0]);
        (ICircle.Standing st1,,,) = Circle(circle).standingOf(members[1]);
        assertEq(uint8(st0), uint8(ICircle.Standing.Defaulted));
        assertEq(uint8(st1), uint8(ICircle.Standing.Behind));
        (, bool received3,,) = Circle(circle).standingOf(members[3]);
        assertTrue(received3); // higher bid (members[3]) won
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
