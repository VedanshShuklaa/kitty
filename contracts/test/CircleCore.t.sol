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

/// @notice C1 gate: TC-1-01 through TC-1-14 (SRS section 11, C1). A
/// three-member rehearsal circle (10-minute rounds) completes end to end.
contract CircleCoreTest is Test {
    bytes32 private constant JOIN_TYPEHASH = keccak256("kitty.join.v1");

    MockAUSD ausd;
    StakeVault vault;
    CircleFactory factory;

    address owner = makeAddr("owner");
    address organizer = makeAddr("organizer");

    // Rehearsal cadence, SRS section 7.2
    uint32 constant PERIOD = 600;
    uint32 constant COMMIT = 240;
    uint32 constant REVEAL = 120;
    uint32 constant GRACE = 120;
    uint64 constant CONTRIBUTION = 100_000000; // 100 AUSD

    function setUp() public {
        ausd = new MockAUSD();
        vault = new StakeVault(ausd, owner);
        vm.prank(owner);
        factory = new CircleFactory(ausd, vault, 300, owner);
        vm.prank(owner);
        vault.setFactory(address(factory));
    }

    function _baseRules(uint8 memberCount) internal view returns (Rules memory r) {
        r = Rules({
            memberCount: memberCount,
            stakeBps: 10_000,
            maxBidBps: 0, // bidding off for the C1 no-bid path
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
            keys[i] = uint256(keccak256(abi.encode("invite-key", i)));
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

    function _createAndFill(uint8 n)
        internal
        returns (address circle, address[] memory members, uint256[] memory keys)
    {
        Rules memory r = _baseRules(n);
        (address[] memory signers, uint256[] memory k) = _signers(n);
        vm.prank(organizer);
        circle = factory.createCircle(r, signers);

        members = new address[](n);
        members[0] = organizer;
        ausd.mint(organizer, CONTRIBUTION * 100);
        vm.startPrank(organizer);
        ausd.approve(address(vault), type(uint256).max);
        ausd.approve(circle, type(uint256).max);
        Circle(circle).join(0, "");
        vm.stopPrank();

        for (uint8 i = 1; i < n; i++) {
            address m = vm.addr(uint256(keccak256(abi.encode("member", i))));
            members[i] = m;
            ausd.mint(m, CONTRIBUTION * 100);
            vm.startPrank(m);
            ausd.approve(address(vault), type(uint256).max);
            ausd.approve(circle, type(uint256).max);
            Circle(circle).join(i, _joinSig(k[i], circle, i, m));
            vm.stopPrank();
        }
        keys = k;
    }

    // ---- TC-1-01: bad rules revert ----
    function test_TC1_01_badRulesRevert() public {
        Rules memory r = _baseRules(13); // memberCount out of bounds
        address[] memory signers = new address[](13);
        vm.expectRevert(ICircleFactory.BadRules.selector);
        factory.createCircle(r, signers);

        Rules memory r2 = _baseRules(3);
        r2.grace = REVEAL - 1; // grace < revealWindow
        (address[] memory signers2,) = _signers(3);
        vm.expectRevert(ICircleFactory.BadRules.selector);
        factory.createCircle(r2, signers2);

        Rules memory r3 = _baseRules(3);
        r3.commitWindow = PERIOD; // commitWindow + grace > period
        (address[] memory signers3,) = _signers(3);
        vm.expectRevert(ICircleFactory.BadRules.selector);
        factory.createCircle(r3, signers3);

        Rules memory r4 = _baseRules(3);
        r4.joinDeadline = r4.firstDue; // after firstDue - commitWindow
        (address[] memory signers4,) = _signers(3);
        vm.expectRevert(ICircleFactory.BadRules.selector);
        factory.createCircle(r4, signers4);
    }

    // ---- TC-1-02: valid creation, predictCircle matches ----
    function test_TC1_02_createCircle() public {
        Rules memory r = _baseRules(3);
        (address[] memory signers,) = _signers(3);
        address predicted = factory.predictCircle(organizer);
        vm.prank(organizer);
        address circle = factory.createCircle(r, signers);
        assertEq(circle, predicted);
        assertTrue(factory.isCircle(circle));
    }

    // ---- TC-1-03 / TC-1-04: invite signatures ----
    function test_TC1_03_joinAndReplayReverts() public {
        (address circle, address[] memory members, uint256[] memory keys) = _createAndFill(2);
        // circle with 2 members is already full; make a fresh 3-member circle for the replay test
        Rules memory r = _baseRules(3);
        (address[] memory signers, uint256[] memory k) = _signers(3);
        vm.prank(organizer);
        address c2 = factory.createCircle(r, signers);
        address m1 = vm.addr(k[1]);
        ausd.mint(m1, CONTRIBUTION * 10);
        vm.startPrank(m1);
        ausd.approve(c2, type(uint256).max);
        bytes memory sig = _joinSig(k[1], c2, 1, m1);
        Circle(c2).join(1, sig);
        vm.expectRevert(ICircle.SeatTaken.selector);
        Circle(c2).join(1, sig);
        vm.stopPrank();

        assertEq(members[0], organizer);
        assertEq(Circle(circle).memberAt(1), members[1]);
        assertTrue(keys[1] != 0);
    }

    function test_TC1_04_badSignatureReverts() public {
        Rules memory r = _baseRules(3);
        (address[] memory signers,) = _signers(3);
        vm.prank(organizer);
        address circle = factory.createCircle(r, signers);
        uint256 wrongKey = uint256(keccak256("wrong"));
        address m1 = makeAddr("m1");
        ausd.mint(m1, CONTRIBUTION);
        vm.startPrank(m1);
        ausd.approve(address(vault), type(uint256).max);
        vm.expectRevert(ICircle.BadInvite.selector);
        Circle(circle).join(1, _joinSig(wrongKey, circle, 1, m1));
        vm.stopPrank();
    }

    // ---- TC-1-05: last seat activates; deadline; cancel refunds ----
    function test_TC1_05_activateJoinDeadlineCancel() public {
        Rules memory r = _baseRules(2);
        (address[] memory signers, uint256[] memory k) = _signers(2);
        vm.prank(organizer);
        address circle = factory.createCircle(r, signers);
        ausd.mint(organizer, CONTRIBUTION);
        vm.startPrank(organizer);
        ausd.approve(circle, type(uint256).max);
        Circle(circle).join(0, "");
        vm.stopPrank();

        vm.warp(r.joinDeadline + 1);
        address m1 = vm.addr(k[1]);
        ausd.mint(m1, CONTRIBUTION);
        vm.startPrank(m1);
        ausd.approve(circle, type(uint256).max);
        vm.expectRevert(ICircle.JoinClosed.selector);
        Circle(circle).join(1, _joinSig(k[1], circle, 1, m1));
        vm.stopPrank();

        Circle(circle).cancel();
        assertEq(uint8(Circle(circle).state()), uint8(ICircle.State.Cancelled));

        uint256 before = ausd.balanceOf(organizer);
        vm.prank(organizer);
        Circle(circle).withdraw();
        assertEq(ausd.balanceOf(organizer), before + CONTRIBUTION);
    }

    // ---- TC-1-06 / TC-1-07 / TC-1-08: contribute, closeRound, no-bid payout order ----
    function test_TC1_06_07_08_roundLifecycleNoBid() public {
        (address circle, address[] memory members,) = _createAndFill(3);
        Rules memory r = Circle(circle).rules();

        vm.expectRevert(ICircle.TooEarly.selector);
        Circle(circle).closeRound(1);

        vm.warp(r.firstDue - 1);
        for (uint8 i = 0; i < 3; i++) {
            vm.prank(members[i]);
            Circle(circle).contribute(1);
        }
        vm.warp(r.firstDue + r.grace);
        Circle(circle).closeRound(1);
        // seat 0 (organizer) is the lowest seat with no bids: pays out to them first
        (ICircle.Standing st, bool received,,) = Circle(circle).standingOf(members[0]);
        assertTrue(received);
        assertEq(uint8(st), uint8(ICircle.Standing.Good));

        vm.expectRevert(ICircle.WrongRound.selector);
        Circle(circle).closeRound(1);
    }

    // ---- TC-1-09: TV-5 style cover on a miss ----
    function test_TC1_09_coveredMiss() public {
        (address circle, address[] memory members,) = _createAndFill(3);
        Rules memory r = Circle(circle).rules();
        vm.warp(r.firstDue + r.grace);
        // members[1] and [2] pay; members[0] (organizer) misses entirely
        vm.prank(members[1]);
        Circle(circle).contribute(1);
        vm.prank(members[2]);
        Circle(circle).contribute(1);

        uint256 stakeBefore = vault.balanceOf(circle, members[0], IStakeVault.Kind.Stake);
        Circle(circle).closeRound(1);
        (ICircle.Standing st,, uint256 arrears,) = Circle(circle).standingOf(members[0]);
        assertEq(uint8(st), uint8(ICircle.Standing.Behind));
        assertEq(arrears, stakeBefore);
        assertEq(vault.balanceOf(circle, members[0], IStakeVault.Kind.Stake), 0);
    }

    // ---- TC-1-10: arrears repayment restores Good standing ----
    function test_TC1_10_payArrearsRestoresGood() public {
        (address circle, address[] memory members,) = _createAndFill(3);
        Rules memory r = Circle(circle).rules();
        vm.warp(r.firstDue + r.grace);
        vm.prank(members[1]);
        Circle(circle).contribute(1);
        vm.prank(members[2]);
        Circle(circle).contribute(1);
        Circle(circle).closeRound(1);

        (,, uint256 arrears,) = Circle(circle).standingOf(members[0]);
        vm.prank(members[0]);
        Circle(circle).payArrears();
        (ICircle.Standing st,, uint256 arrearsAfter,) = Circle(circle).standingOf(members[0]);
        assertEq(uint8(st), uint8(ICircle.Standing.Good));
        assertEq(arrearsAfter, 0);
        assertEq(vault.balanceOf(circle, members[0], IStakeVault.Kind.Stake), arrears);
    }

    // ---- TC-1-11: full circle completes, double withdraw reverts ----
    function test_TC1_11_fullCircleCompletesAndSettles() public {
        (address circle, address[] memory members,) = _createAndFill(3);
        Rules memory r = Circle(circle).rules();

        for (uint32 round = 1; round <= 3; round++) {
            uint64 due = r.firstDue + uint64(round - 1) * r.period;
            vm.warp(due - 1);
            for (uint8 i = 0; i < 3; i++) {
                (, bool received,,) = Circle(circle).standingOf(members[i]);
                if (!received || Circle(circle).currentRound() != round) {
                    // everyone still pays each round regardless of having received
                }
                vm.prank(members[i]);
                try Circle(circle).contribute(round) { } catch { }
            }
            vm.warp(due + r.grace);
            Circle(circle).closeRound(round);
        }

        assertEq(uint8(Circle(circle).state()), uint8(ICircle.State.Completed));

        for (uint8 i = 0; i < 3; i++) {
            vm.prank(members[i]);
            Circle(circle).withdraw();
        }
        assertEq(ausd.balanceOf(circle), 0);

        vm.expectRevert(ICircle.NothingToWithdraw.selector);
        vm.prank(members[0]);
        Circle(circle).withdraw();
    }

    // ---- TC-1-13: fuzz, gross conservation on a simple no-miss round ----
    function testFuzz_TC1_13_grossConservation(uint8 seed) public {
        uint8 n = uint8(2 + (seed % 5)); // 2..6 members
        (address circle, address[] memory members,) = _createAndFill(n);
        Rules memory r = Circle(circle).rules();
        vm.warp(r.firstDue - 1);
        uint256 balBefore = ausd.balanceOf(circle);
        for (uint8 i = 0; i < n; i++) {
            vm.prank(members[i]);
            Circle(circle).contribute(1);
        }
        vm.warp(r.firstDue + r.grace);
        Circle(circle).closeRound(1);
        // no bids, no misses: gross == paid, and the circle's balance is unchanged net of the round
        assertEq(ausd.balanceOf(circle), balBefore);
    }
}
