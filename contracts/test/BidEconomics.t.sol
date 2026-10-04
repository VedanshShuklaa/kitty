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

/// @notice C3 gate: bid economics against SRS 7.8's TV-1..TV-4, plus the
/// bid-eligibility and default-fill rules in 7.7. test-vectors/math.json
/// carries the same TV-1..TV-4 numbers for the TS side.
contract BidEconomicsTest is Test {
    bytes32 private constant JOIN_TYPEHASH = keccak256("kitty.join.v1");

    MockAUSD ausd;
    StakeVault vault;
    CircleFactory factory;

    address owner = makeAddr("owner");
    address organizer = makeAddr("organizer");

    uint32 constant PERIOD = 600;
    uint32 constant COMMIT = 240;
    uint32 constant REVEAL = 120;
    uint32 constant GRACE = 120;

    function setUp() public {
        ausd = new MockAUSD();
        vault = new StakeVault(ausd, owner);
        vm.prank(owner);
        factory = new CircleFactory(ausd, vault, 300, owner);
        vm.prank(owner);
        vault.setFactory(address(factory));
    }

    function _rulesFor(uint8 memberCount, uint64 contribution) internal view returns (Rules memory r) {
        r = Rules({
            memberCount: memberCount,
            stakeBps: 10_000,
            maxBidBps: 3_000,
            poolShareBps: 1_000,
            holdbackBps: 2_000,
            yieldOn: false,
            tierDiscountOn: false,
            contribution: contribution,
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

    function _createAndFill(uint8 n, uint64 contribution) internal returns (address circle, address[] memory members) {
        Rules memory r = _rulesFor(n, contribution);
        (address[] memory signers, uint256[] memory k) = _signers(n);
        vm.prank(organizer);
        circle = factory.createCircle(r, signers);

        members = new address[](n);
        members[0] = organizer;
        ausd.mint(organizer, uint256(contribution) * 1000);
        vm.startPrank(organizer);
        ausd.approve(address(vault), type(uint256).max);
        ausd.approve(circle, type(uint256).max);
        Circle(circle).join(0, "");
        vm.stopPrank();

        for (uint8 i = 1; i < n; i++) {
            address m = vm.addr(uint256(keccak256(abi.encode("member", i))));
            members[i] = m;
            ausd.mint(m, uint256(contribution) * 1000);
            vm.startPrank(m);
            ausd.approve(address(vault), type(uint256).max);
            ausd.approve(circle, type(uint256).max);
            Circle(circle).join(i, _joinSig(k[i], circle, i, m));
            vm.stopPrank();
        }
    }

    function _payAll(address circle, address[] memory members, uint32 round) internal {
        for (uint256 i = 0; i < members.length; i++) {
            vm.prank(members[i]);
            Circle(circle).contribute(round);
        }
    }

    function _commitReveal(address circle, address bidder, uint32 round, uint16 bps, bytes32 salt, uint64 due)
        internal
    {
        bytes32 commitment = keccak256(abi.encode(block.chainid, circle, round, bidder, bps, salt));
        vm.warp(due - COMMIT);
        vm.prank(bidder);
        Circle(circle).commitBid(round, commitment);
        vm.warp(due);
        vm.prank(bidder);
        Circle(circle).revealBid(round, bps, salt);
    }

    // ---- TC-3-01: TV-1 exactly ----
    function test_TC3_01_TV1_bidRoundExact() public {
        (address circle, address[] memory members) = _createAndFill(8, 100_000000);
        Rules memory r = Circle(circle).rules();
        address ada = members[1];

        // round 1: no bids, organizer (seat 0) wins by seat order
        vm.warp(r.firstDue - 1);
        _payAll(circle, members, 1);
        vm.warp(r.firstDue + r.grace);
        Circle(circle).closeRound(1);

        // round 2: Ada bids 800 bps, everyone pays, no misses
        uint64 due2 = Circle(circle).dueTime(2);
        _commitReveal(circle, ada, 2, 800, keccak256("salt-ada"), due2);
        for (uint256 i = 0; i < members.length; i++) {
            vm.prank(members[i]);
            Circle(circle).contribute(2);
        }
        assertEq(Circle(circle).pot(), 800_000000, "gross");

        uint256 adaBalBefore = ausd.balanceOf(ada);
        vm.warp(due2 + r.grace);
        Circle(circle).closeRound(2);

        assertEq(ausd.balanceOf(ada) - adaBalBefore, 616_000000, "paid to Ada");
        assertEq(Circle(circle).pool(), 6_400003, "pool gets toPool + dust");
        assertEq(vault.balanceOf(circle, ada, IStakeVault.Kind.Holdback), 120_000000, "holdback");

        for (uint256 i = 0; i < members.length; i++) {
            if (members[i] == ada) continue;
            (,,, uint256 credit) = Circle(circle).standingOf(members[i]);
            assertEq(credit, 8_228571, "credit per member");
        }
    }

    // ---- TC-3-06: TV-2, round 3 amounts due after TV-1 ----
    function test_TC3_06_TV2_nextRoundAmountsDue() public {
        (address circle, address[] memory members) = _createAndFill(8, 100_000000);
        Rules memory r = Circle(circle).rules();
        address ada = members[1];

        vm.warp(r.firstDue - 1);
        _payAll(circle, members, 1);
        vm.warp(r.firstDue + r.grace);
        Circle(circle).closeRound(1);

        uint64 due2 = Circle(circle).dueTime(2);
        _commitReveal(circle, ada, 2, 800, keccak256("salt-ada"), due2);
        _payAll(circle, members, 2);
        vm.warp(due2 + r.grace);
        Circle(circle).closeRound(2);

        (uint256 adaPay, uint256 adaCredit, uint256 adaHoldbackRelease) = Circle(circle).amountDue(ada, 3);
        assertEq(adaPay, 80_000000);
        assertEq(adaCredit, 0);
        assertEq(adaHoldbackRelease, 20_000000);

        address other = members[3]; // neither Ada (winner) nor organizer (round-1 winner)
        (uint256 otherPay, uint256 otherCredit, uint256 otherHoldbackRelease) = Circle(circle).amountDue(other, 3);
        assertEq(otherPay, 91_771429);
        assertEq(otherCredit, 8_228571);
        assertEq(otherHoldbackRelease, 0);
        assertEq(otherPay + otherCredit + otherHoldbackRelease, r.contribution, "still a full contribution");
    }

    // ---- TC-3-08: TV-3, Ada defaults in round 3 (take-and-run) ----
    function test_TC3_08_TV3_takeAndRun() public {
        (address circle, address[] memory members) = _createAndFill(8, 100_000000);
        Rules memory r = Circle(circle).rules();
        address ada = members[1];
        address round3Winner = members[2]; // next lowest Good, not-received seat

        vm.warp(r.firstDue - 1);
        _payAll(circle, members, 1);
        vm.warp(r.firstDue + r.grace);
        Circle(circle).closeRound(1);

        uint64 due2 = Circle(circle).dueTime(2);
        _commitReveal(circle, ada, 2, 800, keccak256("salt-ada"), due2);
        _payAll(circle, members, 2);
        vm.warp(due2 + r.grace);
        Circle(circle).closeRound(2);

        // round 3: everyone but Ada pays; Ada (already received) misses -> defaults
        uint64 due3 = Circle(circle).dueTime(3);
        vm.warp(due3 - 1);
        for (uint256 i = 0; i < members.length; i++) {
            if (members[i] == ada) continue;
            vm.prank(members[i]);
            Circle(circle).contribute(3);
        }
        uint256 winnerBalBefore = ausd.balanceOf(round3Winner);
        vm.warp(due3 + r.grace);
        Circle(circle).closeRound(3);

        (ICircle.Standing st,,,) = Circle(circle).standingOf(ada);
        assertEq(uint8(st), uint8(ICircle.Standing.Defaulted));
        assertEq(vault.balanceOf(circle, ada, IStakeVault.Kind.Stake), 0, "stake fully drawn");
        assertEq(vault.balanceOf(circle, ada, IStakeVault.Kind.Holdback), 0, "holdback fully drawn");
        assertEq(Circle(circle).pool(), 0, "pool fully drawn");
        assertEq(Circle(circle).defaultReserve(), 188_666670, "filled minus this round's immediate fill");
        assertEq(ausd.balanceOf(round3Winner) - winnerBalBefore, 637_733333, "round 3 payout");
    }

    // ---- TC-3-03: commit/reveal window and salt checks ----
    function test_TC3_03_commitRevealReverts() public {
        (address circle, address[] memory members) = _createAndFill(3, 100_000000);
        Rules memory r = Circle(circle).rules();
        address m = members[1];
        uint64 due = Circle(circle).dueTime(1);
        bytes32 commitment = keccak256(abi.encode(block.chainid, circle, uint32(1), m, uint16(500), keccak256("s")));

        // too early to commit
        vm.warp(due - r.commitWindow - 1);
        vm.prank(m);
        vm.expectRevert(ICircle.TooEarly.selector);
        Circle(circle).commitBid(1, commitment);

        // commit inside window
        vm.warp(due - r.commitWindow);
        vm.prank(m);
        Circle(circle).commitBid(1, commitment);

        // too early to reveal (before due)
        vm.prank(m);
        vm.expectRevert(ICircle.TooEarly.selector);
        Circle(circle).revealBid(1, 500, keccak256("s"));

        // reveal with wrong salt reverts
        vm.warp(due);
        vm.prank(m);
        vm.expectRevert(ICircle.BadReveal.selector);
        Circle(circle).revealBid(1, 500, keccak256("wrong-salt"));

        // reveal with different amount than committed reverts
        vm.prank(m);
        vm.expectRevert(ICircle.BadReveal.selector);
        Circle(circle).revealBid(1, 501, keccak256("s"));

        // too late to reveal
        vm.warp(due + r.revealWindow + 1);
        vm.prank(m);
        vm.expectRevert(ICircle.TooLate.selector);
        Circle(circle).revealBid(1, 500, keccak256("s"));
    }

    // ---- TC-3-04: an ineligible member's bid is ignored at close ----
    function test_TC3_04_ineligibleBidIgnoredAtClose() public {
        (address circle, address[] memory members) = _createAndFill(3, 100_000000);
        Rules memory r = Circle(circle).rules();
        address m1 = members[1];
        uint64 due = Circle(circle).dueTime(1);

        // m1 commits and reveals a high bid but never pays round 1
        _commitReveal(circle, m1, 1, 3000, keccak256("s"), due);
        vm.prank(organizer);
        Circle(circle).contribute(1);
        vm.prank(members[2]);
        Circle(circle).contribute(1);

        vm.warp(due + r.grace);
        Circle(circle).closeRound(1);

        // m1 never paid round 1, so despite the highest bid the pot still
        // goes to the lowest-seat Good member who paid (the organizer)
        (, bool received,,) = Circle(circle).standingOf(organizer);
        assertTrue(received);
        (, bool m1Received,,) = Circle(circle).standingOf(m1);
        assertFalse(m1Received);
    }

    // ---- TC-3-05: tie-break, no-bid seat order, bidding-off, single-eligible reverts ----
    function test_TC3_05_tieBreakLowerSeatWins() public {
        (address circle, address[] memory members) = _createAndFill(3, 100_000000);
        uint64 due = Circle(circle).dueTime(1);
        // members[1] and members[2] both bid 1000 bps: lower seat (1) wins the tie
        _commitReveal(circle, members[1], 1, 1000, keccak256("s1"), due);
        _commitReveal(circle, members[2], 1, 1000, keccak256("s2"), due);
        _payAll(circle, members, 1);

        Rules memory r = Circle(circle).rules();
        vm.warp(due + r.grace);
        Circle(circle).closeRound(1);
        (, bool m1Received,,) = Circle(circle).standingOf(members[1]);
        assertTrue(m1Received, "tie goes to the lower seat");
    }

    function test_TC3_05_biddingOffReverts() public {
        Rules memory r = _rulesFor(3, 100_000000);
        r.maxBidBps = 0;
        (address[] memory signers, uint256[] memory k) = _signers(3);
        vm.prank(organizer);
        address circle = factory.createCircle(r, signers);
        ausd.mint(organizer, 1000_000000);
        vm.startPrank(organizer);
        ausd.approve(circle, type(uint256).max);
        ausd.approve(address(vault), type(uint256).max);
        Circle(circle).join(0, "");
        vm.stopPrank();
        address m1 = vm.addr(k[1]);
        ausd.mint(m1, 1000_000000);
        vm.startPrank(m1);
        ausd.approve(circle, type(uint256).max);
        ausd.approve(address(vault), type(uint256).max);
        Circle(circle).join(1, _joinSig(k[1], circle, 1, m1));
        vm.stopPrank();
        address m2 = vm.addr(k[2]);
        ausd.mint(m2, 1000_000000);
        vm.startPrank(m2);
        ausd.approve(circle, type(uint256).max);
        ausd.approve(address(vault), type(uint256).max);
        Circle(circle).join(2, _joinSig(k[2], circle, 2, m2));
        vm.stopPrank();

        vm.prank(m1);
        vm.expectRevert(ICircle.BiddingOff.selector);
        Circle(circle).commitBid(1, keccak256("x"));
    }

    function test_TC3_05_singleEligibleMemberCommitBidReverts() public {
        (address circle, address[] memory members) = _createAndFill(3, 100_000000);
        Rules memory r = Circle(circle).rules();
        vm.warp(r.firstDue - 1);
        _payAll(circle, members, 1);
        vm.warp(r.firstDue + r.grace);
        Circle(circle).closeRound(1); // organizer receives; 2 eligible members remain

        uint64 due2 = Circle(circle).dueTime(2);
        vm.warp(due2 - Circle(circle).rules().commitWindow);
        // members[1] and members[2] are both still eligible: commit should work
        vm.prank(members[1]);
        Circle(circle).commitBid(2, keccak256("ok"));

        // now drive it down to a single eligible member: nobody bids, so the
        // seat-order fallback pays members[1] in round 2, leaving only
        // members[2] eligible for round 3
        _payAll(circle, members, 2);
        vm.warp(due2 + r.grace);
        Circle(circle).closeRound(2);

        (, bool m1Received,,) = Circle(circle).standingOf(members[1]);
        assertTrue(m1Received);

        uint64 due3 = Circle(circle).dueTime(3);
        vm.warp(due3 - Circle(circle).rules().commitWindow);
        vm.prank(members[2]);
        vm.expectRevert(ICircle.NotEligible.selector);
        Circle(circle).commitBid(3, keccak256("only-one-left"));
    }

    // ---- TC-3-07: a late payment releases no holdback ----
    function test_TC3_07_latePaymentReleasesNoHoldback() public {
        (address circle, address[] memory members) = _createAndFill(3, 100_000000);
        Rules memory r = Circle(circle).rules();
        vm.warp(r.firstDue - 1);
        _payAll(circle, members, 1);
        vm.warp(r.firstDue + r.grace);
        Circle(circle).closeRound(1); // organizer wins, holdback set for organizer

        uint64 due2 = Circle(circle).dueTime(2);
        // organizer pays round 2 late (after due, still inside grace)
        vm.warp(due2 + 1);
        vm.prank(organizer);
        Circle(circle).contribute(2);
        assertEq(vault.balanceOf(circle, organizer, IStakeVault.Kind.Holdback), 40_000000, "nothing released yet");
    }

    // ---- SRS 7.7: arrears repayment restores stake first, then the pool ----
    function test_arrearsRepaymentRestoresStakeThenPool() public {
        Rules memory r = _rulesFor(3, 100_000000);
        r.stakeBps = 5_000; // 50% stake: a full miss can't be covered by stake alone
        (address[] memory signers, uint256[] memory k) = _signers(3);
        vm.prank(organizer);
        address circle = factory.createCircle(r, signers);
        address[] memory members = new address[](3);
        members[0] = organizer;
        ausd.mint(organizer, 1000_000000);
        vm.startPrank(organizer);
        ausd.approve(circle, type(uint256).max);
        ausd.approve(address(vault), type(uint256).max);
        Circle(circle).join(0, "");
        vm.stopPrank();
        for (uint8 i = 1; i < 3; i++) {
            address m = vm.addr(k[i]);
            members[i] = m;
            ausd.mint(m, 1000_000000);
            vm.startPrank(m);
            ausd.approve(circle, type(uint256).max);
            ausd.approve(address(vault), type(uint256).max);
            Circle(circle).join(i, _joinSig(k[i], circle, i, m));
            vm.stopPrank();
        }

        // round 1: members[1] bids 1000 bps and wins, seeding the pool with a
        // toPool share (3_000000, no dust for k=2)
        uint64 due1 = Circle(circle).dueTime(1);
        _commitReveal(circle, members[1], 1, 1000, keccak256("s"), due1);
        _payAll(circle, members, 1);
        vm.warp(due1 + r.grace);
        Circle(circle).closeRound(1);
        assertEq(Circle(circle).pool(), 3_000000, "round 1 seeds the pool");

        // round 2: members[2] (hasn't received) misses entirely; their 50%
        // stake (50_000000) can't cover the 100_000000 contribution, so the
        // remaining 50_000000 draws stake(50M)+pool(3M) leaving a shortfall
        vm.prank(organizer);
        Circle(circle).contribute(2);
        vm.prank(members[1]);
        Circle(circle).contribute(2);
        uint64 due2 = Circle(circle).dueTime(2);
        vm.warp(due2 + r.grace);
        Circle(circle).closeRound(2);
        assertEq(Circle(circle).pool(), 0, "pool drained to cover the miss");
        (,, uint256 arrears,) = Circle(circle).standingOf(members[2]);
        assertEq(arrears, 53_000000, "50M from stake + 3M from pool");

        // repaying arrears in full must restore the stake portion to the
        // member's own stake, and the pool portion back to the shared pool --
        // not all 53M dumped into the member's personal stake
        vm.startPrank(members[2]);
        ausd.approve(circle, type(uint256).max);
        Circle(circle).payArrears();
        vm.stopPrank();

        assertEq(
            vault.balanceOf(circle, members[2], IStakeVault.Kind.Stake), 50_000000, "stake restored, not the pool cut"
        );
        assertEq(Circle(circle).pool(), 3_000000, "pool portion returns to the shared pool");
    }

    // ---- TC-3-09: a defaulted member cannot contribute or bid ----
    function test_TC3_09_defaultedMemberBlocked() public {
        (address circle, address[] memory members) = _createAndFill(8, 100_000000);
        Rules memory r = Circle(circle).rules();
        address ada = members[1];

        vm.warp(r.firstDue - 1);
        _payAll(circle, members, 1);
        vm.warp(r.firstDue + r.grace);
        Circle(circle).closeRound(1);

        uint64 due2 = Circle(circle).dueTime(2);
        _commitReveal(circle, ada, 2, 800, keccak256("salt-ada"), due2);
        _payAll(circle, members, 2);
        vm.warp(due2 + r.grace);
        Circle(circle).closeRound(2);

        uint64 due3 = Circle(circle).dueTime(3);
        vm.warp(due3 - 1);
        for (uint256 i = 0; i < members.length; i++) {
            if (members[i] == ada) continue;
            vm.prank(members[i]);
            Circle(circle).contribute(3);
        }
        vm.warp(due3 + r.grace);
        Circle(circle).closeRound(3); // Ada defaults here

        vm.prank(ada);
        vm.expectRevert(ICircle.NotEligible.selector);
        Circle(circle).contribute(4);

        vm.prank(ada);
        vm.expectRevert(ICircle.NotEligible.selector);
        Circle(circle).commitBid(4, keccak256("x"));
    }
}
