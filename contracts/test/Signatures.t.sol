// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { MessageHashUtils } from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import { Circle } from "../src/Circle.sol";
import { Rules } from "../src/interfaces/ICircleFactory.sol";
import { CircleTestBase } from "./utils/CircleTestBase.sol";

/// @notice TC-1-12: every digest, hash and the invite signature in
/// test-vectors/crypto.json reproduces exactly in Solidity (SRS 7.6). The
/// HKDF vectors are app-side derivations; they are recomputed here too so a
/// drift in the JSON is caught on both sides.
contract SignaturesTest is CircleTestBase {
    // Anvil / Hardhat test account #1, the vector's labelled example invite key
    uint256 constant ANVIL_KEY_1 = 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d;

    string json;

    function setUp() public override {
        super.setUp();
        json = vm.readFile("../test-vectors/crypto.json");
    }

    function test_TC1_12_typehashes() public view {
        assertEq(keccak256("kitty.join.v1"), vm.parseJsonBytes32(json, ".joinTypehash.expected"));
        assertEq(keccak256("kitty.sponsor.v1"), vm.parseJsonBytes32(json, ".sponsorTypehash.expected"));
    }

    function test_TC1_12_prfInput() public view {
        assertEq(sha256("kitty/prf/v1"), vm.parseJsonBytes32(json, ".prfInput.sha256"));
    }

    function test_TC1_12_joinDigestAndSignature() public view {
        bytes32 digest = keccak256(
            abi.encode(
                keccak256("kitty.join.v1"),
                vm.parseJsonUint(json, ".joinDigest.chainId"),
                vm.parseJsonAddress(json, ".joinDigest.circle"),
                uint8(vm.parseJsonUint(json, ".joinDigest.seat")),
                vm.parseJsonAddress(json, ".joinDigest.joiner")
            )
        );
        assertEq(digest, vm.parseJsonBytes32(json, ".joinDigest.expected"));

        bytes memory sig = vm.parseJsonBytes(json, ".inviteSignature.expected");
        address signer = vm.parseJsonAddress(json, ".inviteSignature.signerAddress");
        assertEq(ECDSA.recover(MessageHashUtils.toEthSignedMessageHash(digest), sig), signer);

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ANVIL_KEY_1, MessageHashUtils.toEthSignedMessageHash(digest));
        assertEq(abi.encodePacked(r, s, v), sig);
    }

    /// The vector's circle address is 0x1111...1111, so put a real clone of
    /// the implementation there and join it with the vector's own signature:
    /// proves Circle.join builds the same digest, not just this test.
    function test_TC1_12_circleAcceptsVectorSignature() public {
        address circle = vm.parseJsonAddress(json, ".joinDigest.circle");
        address joiner = vm.parseJsonAddress(json, ".joinDigest.joiner");
        uint8 seat = uint8(vm.parseJsonUint(json, ".joinDigest.seat"));
        assertEq(block.chainid, vm.parseJsonUint(json, ".joinDigest.chainId"));

        vm.etch(
            circle,
            abi.encodePacked(
                hex"363d3d373d3d3d363d73", factory.circleImplementation(), hex"5af43d82803e903d91602b57fd5bf3"
            )
        );
        Rules memory r = _rules(4);
        address[] memory signers = _signers(4);
        signers[seat] = vm.parseJsonAddress(json, ".inviteSignature.signerAddress");
        vm.startPrank(address(factory));
        Circle(circle).initialize(r, signers, organizer);
        vault.registerCircle(circle);
        vm.stopPrank();

        _fund(joiner, circle);
        vm.prank(joiner);
        Circle(circle).join(seat, vm.parseJsonBytes(json, ".inviteSignature.expected"));
        assertEq(Circle(circle).memberAt(seat), joiner);
    }

    function test_TC1_12_bidCommitment() public view {
        bytes32 c = keccak256(
            abi.encode(
                vm.parseJsonUint(json, ".bidCommitment.chainId"),
                vm.parseJsonAddress(json, ".bidCommitment.circle"),
                uint32(vm.parseJsonUint(json, ".bidCommitment.round")),
                vm.parseJsonAddress(json, ".bidCommitment.member"),
                uint16(vm.parseJsonUint(json, ".bidCommitment.discountBps")),
                vm.parseJsonBytes32(json, ".bidCommitment.salt")
            )
        );
        assertEq(c, vm.parseJsonBytes32(json, ".bidCommitment.expected"));
    }

    function test_TC1_12_hkdfBidSaltAndRosterKey() public view {
        bytes memory prf = vm.parseJsonBytes(json, ".bidSalt.prfOutput");
        bytes memory bidInfo = abi.encodePacked(
            "bid",
            uint64(vm.parseJsonUint(json, ".bidSalt.chainId")),
            vm.parseJsonAddress(json, ".bidSalt.circle"),
            uint32(vm.parseJsonUint(json, ".bidSalt.round"))
        );
        assertEq(_hkdf32(prf, bidInfo), vm.parseJsonBytes32(json, ".bidSalt.expected"));

        bytes memory prf2 = vm.parseJsonBytes(json, ".rosterWrapKey.prfOutput");
        assertEq(
            _hkdf32(prf2, bytes(vm.parseJsonString(json, ".rosterWrapKey.info"))),
            vm.parseJsonBytes32(json, ".rosterWrapKey.expected")
        );
    }

    // HKDF-SHA256 (RFC 5869), salt "kitty/v1", one 32-byte output block
    function _hkdf32(bytes memory ikm, bytes memory info) internal pure returns (bytes32) {
        bytes32 prk = _hmac(bytes("kitty/v1"), ikm);
        return _hmac(abi.encodePacked(prk), abi.encodePacked(info, uint8(1)));
    }

    function _hmac(bytes memory key, bytes memory message) internal pure returns (bytes32) {
        bytes memory k = new bytes(64);
        if (key.length > 64) key = abi.encodePacked(sha256(key));
        for (uint256 i = 0; i < key.length; i++) {
            k[i] = key[i];
        }
        bytes memory ipad = new bytes(64);
        bytes memory opad = new bytes(64);
        for (uint256 i = 0; i < 64; i++) {
            ipad[i] = k[i] ^ 0x36;
            opad[i] = k[i] ^ 0x5c;
        }
        return sha256(abi.encodePacked(opad, sha256(abi.encodePacked(ipad, message))));
    }
}
