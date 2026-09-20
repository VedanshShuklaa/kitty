// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

import { Script } from "forge-std/Script.sol";
import { console } from "forge-std/console.sol";
import { MessageHashUtils } from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { CircleFactory } from "../src/CircleFactory.sol";
import { StakeVault } from "../src/StakeVault.sol";
import { Circle } from "../src/Circle.sol";
import { Rules } from "../src/interfaces/ICircleFactory.sol";

/// @notice FR-OPS-01: runs a whole rehearsal circle -- three scripted
/// members, ten-minute rounds -- against an already-deployed factory, for
/// testing and video practice. Reads addresses from ../deployments/10143.json.
/// Usage:
///   forge script script/Rehearsal.s.sol --rpc-url monad_testnet \
///     --account kitty-deployer --broadcast
contract Rehearsal is Script {
    bytes32 constant JOIN_TYPEHASH = keccak256("kitty.join.v1");

    function run() external {
        string memory json = vm.readFile("../deployments/10143.json");
        address ausd = vm.parseJsonAddress(json, ".ausd");
        address factoryAddr = vm.parseJsonAddress(json, ".circleFactory");
        CircleFactory factory = CircleFactory(factoryAddr);

        uint256 organizerKey = vm.envUint("REHEARSAL_ORGANIZER_KEY");
        uint256[] memory memberKeys = new uint256[](3);
        memberKeys[0] = organizerKey;
        memberKeys[1] = vm.envUint("REHEARSAL_MEMBER1_KEY");
        memberKeys[2] = vm.envUint("REHEARSAL_MEMBER2_KEY");

        address organizer = vm.addr(organizerKey);
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
            firstDue: uint64(block.timestamp) + 600,
            period: 600, // rehearsal cadence, SRS section 7.2
            commitWindow: 240,
            revealWindow: 120,
            grace: 120,
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

        for (uint32 round = 1; round <= 3; round++) {
            uint64 due = r.firstDue + uint64(round - 1) * r.period;
            uint256 wait = due > block.timestamp ? due - block.timestamp : 0;
            console.log("waiting seconds for round", round, wait);
            // In a live run against real block times this script is invoked
            // once per round via cron/CI, not looped in-process, since it
            // cannot warp real chain time. The loop body below is the
            // per-round action for that invocation.
            for (uint8 i = 0; i < 3; i++) {
                address m = vm.addr(memberKeys[i]);
                vm.broadcast(memberKeys[i]);
                try Circle(circle).contribute(round) { } catch { }
            }
            vm.broadcast(organizerKey);
            try Circle(circle).closeRound(round) { } catch { }
        }

        console.log("rehearsal circle state", uint8(Circle(circle).state()));
    }
}
