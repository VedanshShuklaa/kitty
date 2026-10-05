// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

import { Script } from "forge-std/Script.sol";
import { console } from "forge-std/console.sol";
import { MessageHashUtils } from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { CircleFactory } from "../src/CircleFactory.sol";
import { Circle } from "../src/Circle.sol";
import { Rules } from "../src/interfaces/ICircleFactory.sol";

/// @notice FR-OPS-01: runs a rehearsal circle -- three scripted members,
/// ten-minute rounds -- against an already-deployed factory, for testing and
/// video practice. Reads addresses from ../deployments/10143.json.
///
/// Invoked once per real-time phase (create+join, then one contribute pass
/// and one close pass per round, then withdrawals): forge script --broadcast
/// aborts its whole run if ANY broadcasted call would revert on-chain, even
/// one wrapped in try/catch, so each invocation does at most one phase,
/// gated by on-chain state and the real clock, never a call whose precondition
/// isn't already known true. State (circle address, firstDue) persists in
/// ../deployments/rehearsal-10143.json across invocations.
/// Usage:
///   forge script script/Rehearsal.s.sol --rpc-url monad_testnet --broadcast
contract Rehearsal is Script {
    bytes32 constant JOIN_TYPEHASH = keccak256("kitty.join.v1");
    uint32 constant PERIOD = 600; // rehearsal cadence, SRS section 7.2
    uint32 constant GRACE = 120;

    function run() external {
        string memory json = vm.readFile("../deployments/10143.json");
        address ausd = vm.parseJsonAddress(json, ".ausd");
        CircleFactory factory = CircleFactory(vm.parseJsonAddress(json, ".circleFactory"));

        uint256 organizerKey = vm.envUint("REHEARSAL_ORGANIZER_KEY");
        uint256[] memory memberKeys = new uint256[](3);
        memberKeys[0] = organizerKey;
        memberKeys[1] = vm.envUint("REHEARSAL_MEMBER1_KEY");
        memberKeys[2] = vm.envUint("REHEARSAL_MEMBER2_KEY");

        string memory statePath = "../deployments/rehearsal-10143.json";

        if (!vm.exists(statePath)) {
            _createAndJoin(factory, ausd, organizerKey, memberKeys, statePath);
            return;
        }

        string memory saved = vm.readFile(statePath);
        address circle = vm.parseJsonAddress(saved, ".circle");
        uint64 firstDue = uint64(vm.parseJsonUint(saved, ".firstDue"));

        uint8 st = uint8(Circle(circle).state());
        if (st == 2) {
            // Completed: pay out whoever still has something to withdraw
            for (uint8 i = 0; i < 3; i++) {
                address m = vm.addr(memberKeys[i]);
                if (Circle(circle).withdrawable(m) > 0) {
                    vm.broadcast(memberKeys[i]);
                    Circle(circle).withdraw();
                }
            }
            console.log("rehearsal circle completed and settled", circle);
            return;
        }
        if (st != 1) {
            console.log("rehearsal circle not active, state", st);
            return;
        }

        uint32 round = Circle(circle).currentRound();
        uint64 due = firstDue + uint64(round - 1) * PERIOD;
        uint64 graceEnd = due + GRACE;

        if (block.timestamp < due) {
            console.log("round", round, "not due yet, wait seconds", due - block.timestamp);
            return;
        }
        if (block.timestamp <= graceEnd) {
            for (uint8 i = 0; i < 3; i++) {
                // member 1 deliberately skips round 2 so closeRound exercises
                // the covered-miss path (TC-1-17: "one miss covered")
                if (round == 2 && i == 1) {
                    console.log("member1 deliberately skipping round 2");
                    continue;
                }
                vm.broadcast(memberKeys[i]);
                Circle(circle).contribute(round);
            }
            console.log("round", round, "contributions sent; close after", graceEnd);
            return;
        }

        vm.broadcast(organizerKey);
        Circle(circle).closeRound(round);
        console.log("round", round, "closed");
    }

    function _createAndJoin(
        CircleFactory factory,
        address ausd,
        uint256 organizerKey,
        uint256[] memory memberKeys,
        string memory statePath
    ) internal {
        address[] memory inviteSigners = new address[](3);
        inviteSigners[0] = address(0);
        inviteSigners[1] = vm.addr(uint256(keccak256("rehearsal-invite-1")));
        inviteSigners[2] = vm.addr(uint256(keccak256("rehearsal-invite-2")));
        uint256[] memory inviteKeys = new uint256[](3);
        inviteKeys[1] = uint256(keccak256("rehearsal-invite-1"));
        inviteKeys[2] = uint256(keccak256("rehearsal-invite-2"));

        Rules memory r = Rules({
            memberCount: 3,
            stakeBps: 10_000,
            maxBidBps: 0,
            poolShareBps: 1_000,
            holdbackBps: 2_000,
            yieldOn: false,
            contribution: 1_000000, // 1 AUSD, rehearsal amounts
            firstDue: uint64(block.timestamp) + PERIOD,
            period: PERIOD,
            commitWindow: 240,
            revealWindow: 120,
            grace: GRACE,
            joinDeadline: uint64(block.timestamp) + 300
        });

        vm.broadcast(organizerKey);
        address circle = factory.createCircle(r, inviteSigners);
        console.log("rehearsal circle", circle);

        vm.startBroadcast(organizerKey);
        IERC20(ausd).approve(circle, type(uint256).max);
        Circle(circle).join(0, "");
        vm.stopBroadcast();

        for (uint8 i = 1; i < 3; i++) {
            address m = vm.addr(memberKeys[i]);
            bytes32 digest = keccak256(abi.encode(JOIN_TYPEHASH, block.chainid, circle, i, m));
            (uint8 v, bytes32 s, bytes32 ss) = vm.sign(inviteKeys[i], MessageHashUtils.toEthSignedMessageHash(digest));
            vm.startBroadcast(memberKeys[i]);
            IERC20(ausd).approve(circle, type(uint256).max);
            Circle(circle).join(i, abi.encodePacked(s, ss, v));
            vm.stopBroadcast();
        }

        string memory out = "rehearsal-state";
        vm.serializeAddress(out, "circle", circle);
        string memory finalOut = vm.serializeUint(out, "firstDue", r.firstDue);
        vm.writeJson(finalOut, statePath);
        console.log("created and joined; round 1 due in", r.firstDue - uint64(block.timestamp));
    }
}
