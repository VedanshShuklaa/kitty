// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { MessageHashUtils } from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import { Circle } from "../src/Circle.sol";
import { ICircle } from "../src/interfaces/ICircle.sol";
import { ICircleFactory, Rules } from "../src/interfaces/ICircleFactory.sol";
import { IStakeVault } from "../src/interfaces/IStakeVault.sol";
import { CircleTestBase } from "./utils/CircleTestBase.sol";

/// @notice SRS 7.11 tier attestations (FR-TRU-03/04/05): a signed, expiring
/// share of the circle's own stake, presented at join. It can only lower a
/// stake, never below the factory's 50% floor, and only where the organizer
/// turned discounts on.
contract TierTest is CircleTestBase {
    bytes32 constant TIER_TYPEHASH = keccak256("kitty.tier.v1");
    uint256 constant ATTESTOR_KEY = 0xA77E57;

    address attestor;

    event StakeDiscounted(address indexed member, uint16 stakeBps);
    event TierAttestorSet(address attestor);

    function setUp() public override {
        super.setUp();
        attestor = vm.addr(ATTESTOR_KEY);
        vm.prank(owner);
        factory.setTierAttestor(attestor);
    }

    function _attest(uint256 key, address member, uint16 tierBps, uint64 expiry) internal view returns (bytes memory) {
        bytes32 digest = keccak256(abi.encode(TIER_TYPEHASH, block.chainid, address(factory), member, tierBps, expiry));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, MessageHashUtils.toEthSignedMessageHash(digest));
        return abi.encode(tierBps, expiry, abi.encodePacked(r, s, v));
    }

    function _good(address member, uint16 tierBps) internal view returns (bytes memory) {
        return _attest(ATTESTOR_KEY, member, tierBps, uint64(block.timestamp) + 1 hours);
    }

    function _discountRules(uint8 n) internal view returns (Rules memory r) {
        r = _rules(n);
        r.tierDiscountOn = true;
    }

    /// Organizer seated, returns the circle; seat 1 is left for the test.
    function _open(Rules memory r) internal returns (address circle, address m) {
        circle = _create(r);
        _fund(organizer, circle);
        vm.prank(organizer);
        Circle(circle).join(0, "");
        m = _memberAddr(1);
        _fund(m, circle);
    }

    function _stakeOf(address circle, address m) internal view returns (uint256) {
        return vault.balanceOf(circle, m, IStakeVault.Kind.Stake);
    }

    function test_factory_publishesAttestor_ownerOnly() public {
        assertEq(factory.tierAttestor(), attestor);
        vm.prank(organizer);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, organizer));
        factory.setTierAttestor(organizer);

        vm.expectEmit(address(factory));
        emit TierAttestorSet(address(0));
        vm.prank(owner);
        factory.setTierAttestor(address(0));
    }

    function test_noAttestation_fullStake() public {
        (address circle, address m) = _open(_discountRules(2));
        vm.prank(m);
        Circle(circle).join(1, _joinSig(1, circle, m), "");
        assertEq(_stakeOf(circle, m), CONTRIBUTION);
    }

    function test_steady_posts85PercentOfTheCirclesStake() public {
        Rules memory r = _discountRules(2);
        r.stakeBps = 12_000;
        (address circle, address m) = _open(r);
        vm.expectEmit(circle);
        emit StakeDiscounted(m, 10_200);
        vm.prank(m);
        Circle(circle).join(1, _joinSig(1, circle, m), _good(m, 8_500));
        assertEq(_stakeOf(circle, m), (uint256(CONTRIBUTION) * 10_200) / 10_000);
    }

    function test_discountNeverGoesBelowTheFactoryFloor() public {
        Rules memory r = _discountRules(2);
        r.stakeBps = 6_000; // an Anchor's 50% would be 3,000; the floor holds it at 5,000
        (address circle, address m) = _open(r);
        vm.prank(m);
        Circle(circle).join(1, _joinSig(1, circle, m), _good(m, 5_000));
        assertEq(_stakeOf(circle, m), uint256(CONTRIBUTION) / 2);
    }

    function test_circleWithDiscountsOff_rejectsAttestation() public {
        (address circle, address m) = _open(_rules(2));
        bytes memory sig = _joinSig(1, circle, m);
        bytes memory a = _good(m, 8_500);
        vm.prank(m);
        vm.expectRevert(ICircle.BadAttestation.selector);
        Circle(circle).join(1, sig, a);
    }

    function test_expiredAttestation_reverts() public {
        (address circle, address m) = _open(_discountRules(2));
        bytes memory sig = _joinSig(1, circle, m);
        bytes memory a = _attest(ATTESTOR_KEY, m, 8_500, uint64(block.timestamp));
        vm.prank(m);
        vm.expectRevert(ICircle.BadAttestation.selector);
        Circle(circle).join(1, sig, a);
    }

    function test_wrongSigner_reverts() public {
        (address circle, address m) = _open(_discountRules(2));
        bytes memory sig = _joinSig(1, circle, m);
        bytes memory a = _attest(0xBAD, m, 5_000, uint64(block.timestamp) + 1 hours);
        vm.prank(m);
        vm.expectRevert(ICircle.BadAttestation.selector);
        Circle(circle).join(1, sig, a);
    }

    function test_someoneElsesAttestation_reverts() public {
        (address circle, address m) = _open(_discountRules(2));
        bytes memory sig = _joinSig(1, circle, m);
        bytes memory a = _good(organizer, 5_000);
        vm.prank(m);
        vm.expectRevert(ICircle.BadAttestation.selector);
        Circle(circle).join(1, sig, a);
    }

    function test_attestationCanNeverRaiseOrZeroAStake() public {
        (address circle, address m) = _open(_discountRules(2));
        bytes memory sig = _joinSig(1, circle, m);
        bytes memory high = _good(m, 10_001);
        bytes memory low = _good(m, 4_999);
        vm.startPrank(m);
        vm.expectRevert(ICircle.BadAttestation.selector);
        Circle(circle).join(1, sig, high);
        vm.expectRevert(ICircle.BadAttestation.selector);
        Circle(circle).join(1, sig, low);
        vm.stopPrank();
    }

    function test_attestorUnset_everyAttestationFails_fullStakeStillWorks() public {
        vm.prank(owner);
        factory.setTierAttestor(address(0));
        (address circle, address m) = _open(_discountRules(2));
        bytes memory sig = _joinSig(1, circle, m);
        bytes memory a = _good(m, 8_500);
        vm.startPrank(m);
        vm.expectRevert(ICircle.BadAttestation.selector);
        Circle(circle).join(1, sig, a);
        Circle(circle).join(1, sig, "");
        vm.stopPrank();
        assertEq(_stakeOf(circle, m), CONTRIBUTION);
    }

    /// A thinner stake changes coverage, not conservation: a full circle with
    /// one Anchor runs to the end and everyone collects what they are owed.
    function test_discountedCircle_runsToCompletion_andSettles() public {
        Rules memory r = _discountRules(3);
        address circle = _create(r);
        address[] memory members = new address[](3);
        members[0] = organizer;
        _fund(organizer, circle);
        vm.prank(organizer);
        Circle(circle).join(0, "");
        for (uint8 i = 1; i < 3; i++) {
            address m = _memberAddr(i);
            members[i] = m;
            _fund(m, circle);
            vm.prank(m);
            Circle(circle).join(i, _joinSig(i, circle, m), i == 1 ? _good(m, 5_000) : bytes(""));
        }
        assertEq(_stakeOf(circle, members[1]), uint256(CONTRIBUTION) / 2);
        for (uint32 round = 1; round <= 3; round++) {
            _payAllAndClose(circle, members, round);
        }
        assertEq(uint8(Circle(circle).state()), uint8(ICircle.State.Completed));
        uint256 before = ausd.balanceOf(members[1]);
        vm.prank(members[1]);
        Circle(circle).withdraw();
        assertEq(ausd.balanceOf(members[1]) - before, uint256(CONTRIBUTION) / 2);
        for (uint256 i = 0; i < 3; i++) {
            if (i == 1) continue;
            vm.prank(members[i]);
            Circle(circle).withdraw();
        }
        assertEq(ausd.balanceOf(circle), 0);
        assertEq(Circle(circle).withdrawable(members[1]), 0);
    }

    function test_rulesCarryTheOrganizersChoice() public {
        address circle = _create(_discountRules(2));
        assertTrue(Circle(circle).rules().tierDiscountOn);
        // ICircleFactory exposes the attestor so circles can read it
        assertEq(ICircleFactory(address(factory)).tierAttestor(), attestor);
    }
}
