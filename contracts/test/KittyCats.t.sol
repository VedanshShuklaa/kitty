// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";
import { KittyCats, IERC5192 } from "../src/KittyCats.sol";
import { KittyRecord } from "../src/KittyRecord.sol";
import { IKittyRecord } from "../src/interfaces/IKittyRecord.sol";

contract KittyCatsTest is Test {
    KittyCats cats;
    KittyRecord rec;
    address ama = makeAddr("ama");
    address kojo = makeAddr("kojo");

    function setUp() public {
        rec = new KittyRecord(address(this), 0);
        cats = new KittyCats(rec);
    }

    function test_adopt_oneLockedCatPerAddress() public {
        vm.expectEmit(address(cats));
        emit IERC5192.Locked(uint256(uint160(ama)));
        vm.prank(ama);
        uint256 id = cats.adopt();
        assertEq(id, uint256(uint160(ama)));
        assertEq(cats.ownerOf(id), ama);
        assertTrue(cats.locked(id));
        (, bool adopted) = cats.catOf(ama);
        assertTrue(adopted);

        vm.prank(ama);
        vm.expectRevert(KittyCats.AlreadyAdopted.selector);
        cats.adopt();
    }

    function test_cats_neverMove() public {
        vm.prank(ama);
        uint256 id = cats.adopt();
        vm.startPrank(ama);
        vm.expectRevert(KittyCats.Soulbound.selector);
        cats.transferFrom(ama, kojo, id);
        vm.expectRevert(KittyCats.Soulbound.selector);
        cats.safeTransferFrom(ama, kojo, id);
        vm.expectRevert(KittyCats.Soulbound.selector);
        cats.approve(kojo, id);
        vm.expectRevert(KittyCats.Soulbound.selector);
        cats.setApprovalForAll(kojo, true);
        vm.stopPrank();
    }

    function test_stageIsTheRecords_andLookIsFromTheAddress() public view {
        assertEq(uint8(cats.stageOf(ama)), uint8(IKittyRecord.Stage.Shy));
        (uint8 coat, uint8 pattern) = cats.lookOf(ama);
        bytes32 h = keccak256(abi.encodePacked(ama));
        assertEq(coat, uint8(h[0]) % 6);
        assertEq(pattern, uint8(h[1]) % 3);
    }

    function test_tokenURI_andInterfaces() public {
        vm.prank(ama);
        uint256 id = cats.adopt();
        assertEq(
            cats.tokenURI(id),
            string.concat("https://kitty-circle.vercel.app/api/cat/", vm.toLowercase(vm.toString(ama)))
        );
        assertTrue(cats.supportsInterface(type(IERC5192).interfaceId));
        assertTrue(cats.supportsInterface(0x80ac58cd)); // ERC-721
    }

    function testFuzz_holdsNoMoney(address who) public {
        vm.assume(who != address(0) && who.code.length == 0);
        vm.prank(who);
        cats.adopt();
        assertEq(address(cats).balance, 0);
    }
}
