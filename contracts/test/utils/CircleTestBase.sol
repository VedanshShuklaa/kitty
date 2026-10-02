// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";
import { MessageHashUtils } from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import { CircleFactory } from "../../src/CircleFactory.sol";
import { StakeVault } from "../../src/StakeVault.sol";
import { Circle } from "../../src/Circle.sol";
import { KittyEarnVault } from "../../src/KittyEarnVault.sol";
import { Rules } from "../../src/interfaces/ICircleFactory.sol";
import { MockAUSD } from "../mocks/MockAUSD.sol";

/// @notice Shared fixture for the suites written after C3: a factory and vault
/// on MockAUSD, rehearsal-cadence rules, and helpers to fill a circle, pay a
/// round, bid and close. Older suites keep their own copies of these helpers.
abstract contract CircleTestBase is Test {
    bytes32 internal constant JOIN_TYPEHASH = keccak256("kitty.join.v1");

    uint32 internal constant PERIOD = 600;
    uint32 internal constant COMMIT = 240;
    uint32 internal constant REVEAL = 120;
    uint32 internal constant GRACE = 120;
    uint64 internal constant CONTRIBUTION = 100_000000; // 100 AUSD

    MockAUSD internal ausd;
    StakeVault internal vault;
    CircleFactory internal factory;
    KittyEarnVault internal earn;

    address internal owner = makeAddr("owner");
    address internal organizer = makeAddr("organizer");

    function setUp() public virtual {
        ausd = new MockAUSD();
        vault = new StakeVault(ausd, owner);
        factory = new CircleFactory(ausd, vault, 300, owner);
        // the adapter is wired for every suite; circles only use it with yieldOn
        earn = new KittyEarnVault(ausd, owner);
        vm.startPrank(owner);
        vault.setAdapter(earn);
        vault.setFactory(address(factory));
        vm.stopPrank();
    }

    function _rules(uint8 memberCount) internal view returns (Rules memory r) {
        r = Rules({
            memberCount: memberCount,
            stakeBps: 10_000,
            maxBidBps: 3_000,
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

    function _inviteKey(uint8 seat) internal pure returns (uint256) {
        return uint256(keccak256(abi.encode("base-invite-key", seat)));
    }

    function _memberAddr(uint8 seat) internal pure returns (address) {
        return vm.addr(uint256(keccak256(abi.encode("base-member", seat))));
    }

    function _signers(uint8 n) internal pure returns (address[] memory signers) {
        signers = new address[](n);
        for (uint8 i = 1; i < n; i++) {
            signers[i] = vm.addr(_inviteKey(i));
        }
    }

    function _joinSig(uint8 seat, address circle, address joiner) internal view returns (bytes memory) {
        bytes32 digest = keccak256(abi.encode(JOIN_TYPEHASH, block.chainid, circle, seat, joiner));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(_inviteKey(seat), MessageHashUtils.toEthSignedMessageHash(digest));
        return abi.encodePacked(r, s, v);
    }

    function _fund(address m, address circle) internal {
        ausd.mint(m, uint256(CONTRIBUTION) * 1000);
        vm.prank(m);
        ausd.approve(circle, type(uint256).max);
    }

    function _create(Rules memory r) internal returns (address circle) {
        vm.prank(organizer);
        circle = factory.createCircle(r, _signers(r.memberCount));
    }

    /// @dev Creates a circle with `r` and seats everyone; members[0] is the organizer.
    function _createAndFill(Rules memory r) internal returns (address circle, address[] memory members) {
        circle = _create(r);
        members = new address[](r.memberCount);
        members[0] = organizer;
        _fund(organizer, circle);
        vm.prank(organizer);
        Circle(circle).join(0, "");
        for (uint8 i = 1; i < r.memberCount; i++) {
            address m = _memberAddr(i);
            members[i] = m;
            _fund(m, circle);
            vm.prank(m);
            Circle(circle).join(i, _joinSig(i, circle, m));
        }
    }

    function _pay(address circle, address m, uint32 round) internal {
        vm.prank(m);
        Circle(circle).contribute(round);
    }

    function _commit(address circle, address m, uint32 round, uint16 bps, bytes32 salt) internal {
        bytes32 c = keccak256(abi.encode(block.chainid, circle, round, m, bps, salt));
        vm.prank(m);
        Circle(circle).commitBid(round, c);
    }

    function _reveal(address circle, address m, uint32 round, uint16 bps, bytes32 salt) internal {
        vm.prank(m);
        Circle(circle).revealBid(round, bps, salt);
    }

    function _close(address circle, uint32 round) internal {
        vm.warp(Circle(circle).dueTime(round) + GRACE);
        Circle(circle).closeRound(round);
    }

    /// @dev Everyone not defaulted pays `round` on time, then the round closes.
    function _payAllAndClose(address circle, address[] memory members, uint32 round) internal {
        vm.warp(Circle(circle).dueTime(round) - 1);
        for (uint256 i = 0; i < members.length; i++) {
            _pay(circle, members[i], round);
        }
        _close(circle, round);
    }
}
