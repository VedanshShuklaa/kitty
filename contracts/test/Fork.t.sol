// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC20Permit } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import { MessageHashUtils } from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import { CircleFactory } from "../src/CircleFactory.sol";
import { IKittyRecord } from "../src/interfaces/IKittyRecord.sol";
import { OpenRecord } from "./mocks/OpenRecord.sol";
import { StakeVault } from "../src/StakeVault.sol";
import { Circle } from "../src/Circle.sol";
import { ICircle } from "../src/interfaces/ICircle.sol";
import { ICircleFactory, Rules } from "../src/interfaces/ICircleFactory.sol";

interface IAusdFaucet {
    function requestFunds(address to) external;
}

/// @notice TC-1-15 (SRS 11, FR-JOIN-03): against real testnet AUSD, join and
/// contribute work both through permit and through a plain approval, at real
/// 6-decimal amounts. Run with:
///   forge test --match-contract ForkTest --fork-url monad_testnet
contract ForkTest is Test {
    bytes32 private constant JOIN_TYPEHASH = keccak256("kitty.join.v1");
    bytes32 private constant PERMIT_TYPEHASH =
        keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");

    IERC20 constant AUSD = IERC20(0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC);
    address constant AUSD_FAUCET = 0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C;

    StakeVault vault;
    CircleFactory factory;
    IKittyRecord record;
    address owner = makeAddr("owner");

    function setUp() public {
        // this suite only makes sense against a real fork of Monad testnet
        // (`forge test --match-contract ForkTest --fork-url monad_testnet`):
        // AUSD is a hardcoded live address with no code on a plain local EVM.
        // foundry.toml pins chain_id to 10143 even locally (signature
        // domains need it), so check for real code at the address instead.
        // Skip cleanly rather than fail when run as part of the plain suite.
        if (address(AUSD).code.length == 0) {
            vm.skip(true);
            return;
        }
        vault = new StakeVault(AUSD, owner);
        vm.prank(owner);
        record = new OpenRecord();
        factory = new CircleFactory(AUSD, vault, record, 300, owner);
        vm.prank(owner);
        vault.setFactory(address(factory));
        vm.prank(owner);
        record.addFactory(address(factory));
    }

    function test_TC1_15_realAusdJoinAndContribute_permitAndPlainApproval() public {
        (address organizer, uint256 organizerKey) = makeAddrAndKey("fork-organizer");
        (address inviteSigner, uint256 inviteKey) = makeAddrAndKey("fork-invite-signer");
        address member1 = makeAddr("fork-member1");

        // fund both accounts from the real faucet first -- it rate-limits
        // per caller, so give it a gap between the two claims -- before the
        // circle's own join/round deadlines start counting down
        vm.prank(organizer);
        IAusdFaucet(AUSD_FAUCET).requestFunds(organizer);
        vm.warp(block.timestamp + 1 days);
        vm.roll(block.number + 100);
        vm.prank(member1);
        IAusdFaucet(AUSD_FAUCET).requestFunds(member1);
        assertGt(AUSD.balanceOf(organizer), 0, "faucet funded organizer");
        assertGt(AUSD.balanceOf(member1), 0, "faucet funded member1");

        Rules memory r = Rules({
            memberCount: 2,
            stakeBps: 10_000,
            maxBidBps: 0,
            poolShareBps: 1_000,
            holdbackBps: 2_000,
            yieldOn: false,
            contribution: 1_000000, // 1 AUSD, real 6-decimal amount
            firstDue: uint64(block.timestamp) + 1 hours,
            period: 600,
            commitWindow: 240,
            revealWindow: 120,
            grace: 120,
            joinDeadline: uint64(block.timestamp) + 30 minutes
        });
        address[] memory signers = new address[](2);
        signers[1] = inviteSigner;
        vm.prank(organizer);
        address circle = factory.createCircle(r, signers);

        // organizer: join and contribute through an EIP-2612 permit, sized to
        // cover the whole circle (stake + every contribution) per FR-JOIN-03
        uint256 nonce = IERC20Permit(address(AUSD)).nonces(organizer);
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 structHash =
            keccak256(abi.encode(PERMIT_TYPEHASH, organizer, circle, type(uint256).max, nonce, deadline));
        bytes32 digest = MessageHashUtils.toTypedDataHash(IERC20Permit(address(AUSD)).DOMAIN_SEPARATOR(), structHash);
        (uint8 v, bytes32 rr, bytes32 s) = vm.sign(organizerKey, digest);
        IERC20Permit(address(AUSD)).permit(organizer, circle, type(uint256).max, deadline, v, rr, s);
        assertEq(AUSD.allowance(organizer, circle), type(uint256).max, "permit sets allowance");

        vm.prank(organizer);
        Circle(circle).join(0, "");
        assertEq(Circle(circle).memberAt(0), organizer);

        // member1: join and contribute through a plain approval
        bytes32 joinDigest = keccak256(abi.encode(JOIN_TYPEHASH, block.chainid, circle, uint8(1), member1));
        (uint8 iv, bytes32 ir, bytes32 is_) = vm.sign(inviteKey, MessageHashUtils.toEthSignedMessageHash(joinDigest));
        vm.startPrank(member1);
        AUSD.approve(circle, type(uint256).max);
        Circle(circle).join(1, abi.encodePacked(ir, is_, iv));
        vm.stopPrank();
        assertEq(Circle(circle).memberAt(1), member1);
        assertEq(uint8(Circle(circle).state()), uint8(ICircle.State.Active));

        // round 1: both contribute -- organizer via the permit allowance,
        // member1 via the plain approval, no second approval needed for either
        vm.warp(r.firstDue - 1);
        vm.prank(organizer);
        Circle(circle).contribute(1);
        vm.prank(member1);
        Circle(circle).contribute(1);
        assertEq(Circle(circle).pot(), uint256(r.contribution) * 2, "both contributions landed");
    }
}
