// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

import { CircleTestBase } from "./utils/CircleTestBase.sol";
import { Circle } from "../src/Circle.sol";
import { KittyRecord } from "../src/KittyRecord.sol";
import { ICircle } from "../src/interfaces/ICircle.sol";
import { IKittyRecord } from "../src/interfaces/IKittyRecord.sol";
import { IStakeVault } from "../src/interfaces/IStakeVault.sol";
import { Rules } from "../src/interfaces/ICircleFactory.sol";

contract FakeCircle {
    address public factory;

    constructor(address f) {
        factory = f;
    }

    function poke(IKittyRecord r, address m) external {
        r.joined(m);
    }
}

/// @notice "Feed the Kitty" standing: KittyRecord's rules (FR-TRU-13..19) and
/// how a circle applies them (deposit, queue, offer window, holdback limit,
/// every miss as arrears, paying back a default).
contract StandingTest is CircleTestBase {
    KittyRecord internal rec;

    address internal ama = makeAddr("ama");
    address internal kojo = makeAddr("kojo");
    address internal efua = makeAddr("efua");
    address internal tunde = makeAddr("tunde");
    address internal kofi = makeAddr("kofi");

    function _newRecord() internal override returns (IKittyRecord) {
        rec = new KittyRecord(owner, 0);
        return rec;
    }

    // ------------------------------------------------------------ helpers

    /// @dev Creates a circle organized by who[0] and seats everyone in order.
    function _circleWith(address[] memory who, Rules memory r) internal returns (address circle) {
        r.memberCount = uint8(who.length);
        vm.prank(who[0]);
        circle = factory.createCircle(r, _signers(r.memberCount));
        for (uint8 i = 0; i < who.length; i++) {
            _fund(who[i], circle);
            vm.prank(who[i]);
            Circle(circle).join(i, i == 0 ? bytes("") : _joinSig(i, circle, who[i]));
        }
    }

    function _three(address a, address b, address c) internal pure returns (address[] memory w) {
        w = new address[](3);
        (w[0], w[1], w[2]) = (a, b, c);
    }

    function _four(address a, address b, address c, address d) internal pure returns (address[] memory w) {
        w = new address[](4);
        (w[0], w[1], w[2], w[3]) = (a, b, c, d);
    }

    /// @dev Everyone in `who` pays every round on time, then everyone withdraws.
    function _runClean(address[] memory who) internal {
        address circle = _circleWith(who, _rules(uint8(who.length)));
        for (uint32 round = 1; round <= who.length; round++) {
            _payAllAndClose(circle, who, round);
        }
        _withdrawAll(circle, who);
    }

    function _withdrawAll(address circle, address[] memory who) internal {
        for (uint256 i = 0; i < who.length; i++) {
            if (Circle(circle).withdrawable(who[i]) == 0) continue;
            vm.prank(who[i]);
            Circle(circle).withdraw();
        }
    }

    /// @dev Round 1 is paid by everyone; `skip` misses every later round.
    function _missRound(address circle, address[] memory who, address skip, uint32 round) internal {
        vm.warp(Circle(circle).dueTime(round) - 1);
        for (uint256 i = 0; i < who.length; i++) {
            if (who[i] != skip) _pay(circle, who[i], round);
        }
        _close(circle, round);
    }

    /// @dev Three clean circles of three: 40 points each from two Shy others.
    function _makeFriendly() internal {
        address[] memory w = _three(ama, efua, tunde);
        _runClean(w);
        _runClean(w);
        _runClean(w);
    }

    /// @dev Kojo takes the first pot and stops paying. His deposit and the
    /// Shy-limit holdback cover two of the three rounds he owes.
    function _kojoDefaults() internal returns (address circle, address[] memory w) {
        w = _four(kojo, ama, efua, tunde);
        circle = _circleWith(w, _rules(4));
        _payAllAndClose(circle, w, 1);
        for (uint32 round = 2; round <= 4; round++) {
            _missRound(circle, w, kojo, round);
        }
    }

    function _points(address a) internal view returns (int256 p) {
        (p,,,,) = rec.progressOf(a);
    }

    function _open(address a) internal view returns (uint8 o) {
        (,,,, o) = rec.progressOf(a);
    }

    function _assertStage(address a, IKittyRecord.Stage s) internal view {
        assertEq(uint8(rec.stageOf(a)), uint8(s));
    }

    // ------------------------------------------------------------- record

    function test_newcomer_isShyWithNewcomerTerms() public view {
        IKittyRecord.Terms memory t = rec.termsOf(ama, CONTRIBUTION);
        assertEq(uint8(t.stage), uint8(IKittyRecord.Stage.Shy));
        assertEq(t.depositX100, 100);
        assertEq(t.limitMonths, 1);
        assertEq(t.offerFrom, 1);
        assertEq(t.maxOpen, 2);
    }

    function test_threeCleanCircles_makeFriendly() public {
        address[] memory w = _three(ama, efua, tunde);
        _runClean(w);
        assertEq(_points(ama), 40);
        _runClean(w);
        _assertStage(ama, IKittyRecord.Stage.Shy);
        _runClean(w);
        assertEq(_points(ama), 120);
        _assertStage(ama, IKittyRecord.Stage.Friendly);
        (, uint16 onTimeBps, uint16 people, uint64 biggest, uint8 open) = rec.progressOf(ama);
        assertEq(onTimeBps, 10_000);
        assertEq(people, 6);
        assertEq(biggest, CONTRIBUTION);
        assertEq(open, 0);
    }

    function test_sizeRule_biggerCircleTreatsFriendlyAsShy() public {
        _makeFriendly();
        assertEq(uint8(rec.termsOf(ama, CONTRIBUTION * 2).stage), uint8(IKittyRecord.Stage.Friendly));
        assertEq(uint8(rec.termsOf(ama, CONTRIBUTION * 2 + 1).stage), uint8(IKittyRecord.Stage.Shy));
    }

    function test_goodPointsFade_onlyWhileNoCircleIsOpen() public {
        _makeFriendly();
        vm.warp(block.timestamp + 365 days);
        assertEq(_points(ama), 60); // one half-life
        _assertStage(ama, IKittyRecord.Stage.Shy);

        _circleWith(_three(kofi, ama, kojo), _rules(3));
        vm.warp(block.timestamp + 365 days);
        assertEq(_points(ama), 60); // open circle: nothing fades
    }

    function test_onlyCirclesOfAnAddedFactoryCanWrite() public {
        vm.expectRevert();
        rec.joined(ama); // this test contract has no factory()

        FakeCircle fake = new FakeCircle(address(factory));
        vm.expectRevert(IKittyRecord.NotCircle.selector);
        fake.poke(rec, ama);
    }

    function test_newFactory_countsOnlyAfterTheDelay() public {
        KittyRecord slow = new KittyRecord(owner, 48 hours);
        vm.prank(owner);
        slow.addFactory(address(factory));
        assertFalse(slow.isFactory(address(factory)));
        vm.warp(block.timestamp + 48 hours);
        assertTrue(slow.isFactory(address(factory)));
    }

    function test_forgive_ownerOnly_andOnlyAMiss() public {
        vm.prank(owner);
        vm.expectRevert(IKittyRecord.NothingToForgive.selector);
        rec.forgive(ama);

        vm.prank(ama);
        vm.expectRevert();
        rec.forgive(ama);

        // a debt is not a miss: forgiving leaves it alone
        _kojoDefaults();
        vm.prank(owner);
        vm.expectRevert(IKittyRecord.NothingToForgive.selector);
        rec.forgive(kojo);
        assertEq(rec.debtOf(kojo), CONTRIBUTION);
    }

    // ------------------------------------------------------------- misses

    function test_newcomersFirstMiss_goesToWary() public {
        address[] memory w = _three(efua, ama, tunde);
        address circle = _circleWith(w, _rules(3));
        _missRound(circle, w, ama, 1);
        assertEq(_points(ama), -100);
        _assertStage(ama, IKittyRecord.Stage.Wary);
    }

    function test_missPaidBackWithinAWeek_isForgivenOnceAYear() public {
        address[] memory w = _three(efua, ama, tunde);
        address circle = _circleWith(w, _rules(3));
        _missRound(circle, w, ama, 1);
        vm.prank(ama);
        Circle(circle).payArrears();
        _assertStage(ama, IKittyRecord.Stage.Shy);
        assertEq(_points(ama), 0);
        _payAllAndClose(circle, w, 2);
        _payAllAndClose(circle, w, 3);
        _withdrawAll(circle, w);

        // the second this year stays
        address c2 = _circleWith(w, _rules(3));
        _missRound(c2, w, ama, 1);
        vm.prank(ama);
        Circle(c2).payArrears();
        _assertStage(ama, IKittyRecord.Stage.Wary);
    }

    function test_friendlyMiss_costsExactlyOneStage() public {
        _makeFriendly();
        address[] memory w = _three(efua, ama, tunde);
        address circle = _circleWith(w, _rules(3));
        _missRound(circle, w, ama, 1);
        assertEq(_points(ama), 0); // min(120, floor 100) - 100
        _assertStage(ama, IKittyRecord.Stage.Shy);
    }

    // ------------------------------------------------------------ defaults

    function test_shyHoldback_capsWhatTheFirstWinnerCanOwe() public {
        address[] memory w = _four(kojo, ama, efua, tunde);
        address circle = _circleWith(w, _rules(4));
        _payAllAndClose(circle, w, 1);
        // 3 rounds owed after the pot; the deposit and the Shy limit cover 2
        assertEq(vault.balanceOf(circle, kojo, IStakeVault.Kind.Holdback), CONTRIBUTION);
    }

    function test_defaultWithLoss_isAwayUntilRepaid_thenWary() public {
        (address circle, address[] memory w) = _kojoDefaults();
        (,,, uint256 owed) = Circle(circle).placeOf(kojo);
        assertEq(owed, CONTRIBUTION);
        assertEq(rec.debtOf(kojo), CONTRIBUTION);
        assertEq(_open(kojo), 0, "a default closes the circle for him");
        _assertStage(kojo, IKittyRecord.Stage.Away);

        // Away can't join a new circle
        vm.prank(kofi);
        address c2 = factory.createCircle(_rules(2), _signers(2));
        _fund(kofi, c2);
        vm.prank(kofi);
        Circle(c2).join(0, "");
        _fund(kojo, c2);
        vm.prank(kojo);
        vm.expectRevert(ICircle.Owing.selector);
        Circle(c2).join(1, _joinSig(1, c2, kojo));

        // paying back credits the members whose pots were short
        uint256 before = 0;
        for (uint256 i = 1; i < 4; i++) {
            (,,, uint256 c) = Circle(circle).standingOf(w[i]);
            before += c;
        }
        vm.prank(kojo);
        Circle(circle).repay();
        uint256 afterCredits = 0;
        for (uint256 i = 1; i < 4; i++) {
            (,,, uint256 c) = Circle(circle).standingOf(w[i]);
            afterCredits += c;
        }
        assertEq(afterCredits - before, CONTRIBUTION);
        assertEq(rec.debtOf(kojo), 0);
        assertEq(_points(kojo), -300);
        _assertStage(kojo, IKittyRecord.Stage.Wary);

        // bad points heal 10 a month once nothing is owed
        vm.warp(block.timestamp + 30 days);
        assertEq(_points(kojo), -290);

        _withdrawAll(circle, w);
        assertEq(ausd.balanceOf(circle), 0);
    }

    function test_defaultWithoutLoss_isWaryAtMinus100() public {
        Rules memory r = _rules(3);
        r.holdbackBps = 5_000; // with the deposit, covers everything owed
        address[] memory w = _three(kojo, ama, efua);
        address circle = _circleWith(w, r);
        _payAllAndClose(circle, w, 1);
        _missRound(circle, w, kojo, 2);
        (,,, uint256 owed) = Circle(circle).placeOf(kojo);
        assertEq(owed, 0);
        assertEq(rec.debtOf(kojo), 0);
        assertEq(_points(kojo), -100);
        _assertStage(kojo, IKittyRecord.Stage.Wary);
    }

    // --------------------------------------------------------- the circle

    function test_wary_paysDoubleDeposit_cannotOffer_andIsPaidLast() public {
        (address circle,) = _kojoDefaults();
        vm.prank(kojo);
        Circle(circle).repay();

        // Kojo takes seat 1, but Wary goes behind the three Shy members
        address[] memory w2 = _four(kofi, kojo, kwame(), efua);
        address c2 = _circleWith(w2, _rules(4));
        assertEq(vault.balanceOf(c2, kojo, IStakeVault.Kind.Stake), 2 * uint256(CONTRIBUTION));
        (IKittyRecord.Stage st, uint8 limit, uint8 offerFrom,) = Circle(c2).placeOf(kojo);
        assertEq(uint8(st), uint8(IKittyRecord.Stage.Wary));
        assertEq(limit, 0);
        assertEq(offerFrom, 2);

        _payAllAndClose(c2, w2, 1);
        _payAllAndClose(c2, w2, 2);
        // second half, still no offers for Wary
        vm.warp(Circle(c2).dueTime(3) - COMMIT);
        vm.prank(kojo);
        vm.expectRevert(ICircle.NotEligible.selector);
        Circle(c2).commitBid(3, bytes32(uint256(1)));
        _payAllAndClose(c2, w2, 3);
        _payAllAndClose(c2, w2, 4);
        assertEq(Circle(c2).recipientOf(4), kojo);
    }

    function kwame() internal returns (address) {
        return makeAddr("kwame");
    }

    function test_queue_friendlyIsPaidBeforeAShyOrganizer() public {
        _makeFriendly(); // ama, efua and tunde
        address[] memory w2 = _four(kofi, kojo, ama, efua);
        address c2 = _circleWith(w2, _rules(4));
        for (uint32 round = 1; round <= 4; round++) {
            _payAllAndClose(c2, w2, round);
        }
        assertEq(Circle(c2).recipientOf(1), ama);
        assertEq(Circle(c2).recipientOf(2), efua);
        assertEq(Circle(c2).recipientOf(3), kofi); // seat 0 only breaks ties
        assertEq(Circle(c2).recipientOf(4), kojo);
    }

    function test_shy_canOfferOnlyInTheSecondHalf() public {
        address[] memory w = _four(kofi, kojo, ama, efua);
        address circle = _circleWith(w, _rules(4));
        vm.warp(Circle(circle).dueTime(1) - COMMIT);
        vm.prank(ama);
        vm.expectRevert(ICircle.NotEligible.selector);
        Circle(circle).commitBid(1, bytes32(uint256(1)));
        _payAllAndClose(circle, w, 1);
        _payAllAndClose(circle, w, 2);
        vm.warp(Circle(circle).dueTime(3) - COMMIT);
        _commit(circle, ama, 3, 1_000, bytes32("s"));
    }

    function test_shy_atMostTwoCirclesAtOnce() public {
        _circleWith(_three(kofi, ama, efua), _rules(3));
        _circleWith(_three(tunde, ama, kojo), _rules(3));
        vm.prank(kofi);
        address c3 = factory.createCircle(_rules(2), _signers(2));
        _fund(ama, c3);
        vm.prank(ama);
        vm.expectRevert(ICircle.TooManyCircles.selector);
        Circle(c3).join(1, _joinSig(1, c3, ama));
    }

    function test_cancel_closesTheCircleInTheRecord() public {
        vm.prank(kofi);
        address c = factory.createCircle(_rules(3), _signers(3));
        _fund(kofi, c);
        vm.prank(kofi);
        Circle(c).join(0, "");
        assertEq(_open(kofi), 1);
        vm.prank(kofi);
        Circle(c).cancel();
        assertEq(_open(kofi), 0);
    }

    /// FR-TRU-18: a debt in one circle reaches the member's other circles at
    /// their next round. Kojo organizes circle A, so as a Shy among Shys his
    /// seat would put him first; once he owes in circle B he goes behind
    /// everyone and his offers stop counting.
    function test_debtElsewhere_sendsMemberToTheBack_andStopsOffers() public {
        Rules memory ra = _rules(4);
        ra.firstDue = uint64(block.timestamp) + 3 days;
        address[] memory wa = _four(kojo, kofi, kwame(), makeAddr("yaw"));
        address a = _circleWith(wa, ra);

        _kojoDefaults();
        assertGt(rec.debtOf(kojo), 0);

        _payAllAndClose(a, wa, 1);
        assertEq(Circle(a).recipientOf(1), kofi, "seat 0 no longer wins the tie");
        _payAllAndClose(a, wa, 2);
        vm.warp(Circle(a).dueTime(3) - COMMIT);
        vm.prank(kojo);
        vm.expectRevert(ICircle.NotEligible.selector);
        Circle(a).commitBid(3, bytes32(uint256(1)));
        _payAllAndClose(a, wa, 3);
        _payAllAndClose(a, wa, 4);
        assertEq(Circle(a).recipientOf(4), kojo);
    }

    /// FR-TRU-17, the hole the design found: a member paid last who never
    /// pays a round used to collect other people's money in the final pot.
    function test_lastSeat_cannotStopPayingAndStillCollect() public {
        address[] memory w = new address[](5);
        (w[0], w[1], w[2], w[3], w[4]) = (kofi, ama, efua, tunde, kojo);
        address circle = _circleWith(w, _rules(5));
        uint256[5] memory start;
        for (uint256 i = 0; i < 5; i++) {
            start[i] = ausd.balanceOf(w[i]); // the deposit is already in
        }
        for (uint32 round = 1; round <= 5; round++) {
            _missRound(circle, w, kojo, round);
        }
        assertEq(Circle(circle).recipientOf(5), kojo);
        _withdrawAll(circle, w);
        // kojo gets back only his own deposit; nobody else is out of pocket
        assertEq(ausd.balanceOf(kojo), start[4] + CONTRIBUTION, "no free money for the last seat");
        for (uint256 i = 0; i < 4; i++) {
            assertEq(ausd.balanceOf(w[i]), start[i] + CONTRIBUTION, "honest member made whole");
        }
        assertEq(ausd.balanceOf(circle), 0);
    }
}
