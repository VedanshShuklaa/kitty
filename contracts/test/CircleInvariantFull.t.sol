// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";
import { Vm } from "forge-std/Vm.sol";
import { MessageHashUtils } from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import { CircleFactory } from "../src/CircleFactory.sol";
import { StakeVault } from "../src/StakeVault.sol";
import { Circle } from "../src/Circle.sol";
import { KittyEarnVault } from "../src/KittyEarnVault.sol";
import { ICircle } from "../src/interfaces/ICircle.sol";
import { Rules } from "../src/interfaces/ICircleFactory.sol";
import { IStakeVault } from "../src/interfaces/IStakeVault.sol";
import { MockAUSD } from "./mocks/MockAUSD.sol";

/// @notice Drives three circles that share one vault and overlapping members:
/// A (5 seats, SRS defaults), B (4 seats, minimum stake, maximum holdback and
/// pool share, so covers fall short and holdbacks get capped) and C (never
/// fills, so it gets cancelled). Each call is one of: play a whole round with
/// a random mix of on-time, late, autopay and missed payments and up to two
/// sealed bids; pay arrears; cancel C; withdraw. Checks that need the round's
/// events (INV-04, INV-08, INV-10) are made here and counted as violations.
contract FullInvariantHandler is Test {
    bytes32 private constant JOIN_TYPEHASH = keccak256("kitty.join.v1");
    uint64 public constant CONTRIBUTION = 50_000000;

    MockAUSD public ausd;
    StakeVault public vault;
    CircleFactory public factory;
    KittyEarnVault public earn;

    address[] public actors; // actor 0 is the organizer of every circle
    Circle[] public circles;
    mapping(Circle => address[]) internal _members;
    mapping(Circle => bytes32) public rulesHash;
    mapping(Circle => bool) public settled;

    // ghosts
    mapping(Circle => mapping(address => bool)) public everDefaulted;
    mapping(Circle => mapping(address => uint256)) public timesReceived;
    mapping(Circle => uint256) public creditsIssued;
    mapping(Circle => uint256) public creditsUsed;
    mapping(Circle => uint256) public creditsExited; // withdrawn or forfeited at settlement
    uint256 public violations;
    string public lastViolation;
    uint256 public closeReverts;
    uint256 public roundsClosed;
    uint256 public bidsWon;
    uint256 public defaults;
    uint256 public withdrawals;

    constructor() {
        ausd = new MockAUSD();
        vault = new StakeVault(ausd, address(this));
        factory = new CircleFactory(ausd, vault, 300, address(this));
        earn = new KittyEarnVault(ausd, address(this));
        vault.setAdapter(earn);
        vault.setFactory(address(factory));
        // a reserve big enough to pay yield for the whole run
        ausd.mint(address(this), 1_000_000_000000);
        ausd.approve(address(earn), type(uint256).max);
        earn.fundReserve(1_000_000_000000);
        earn.setRate(450, 4_320);

        for (uint256 i = 0; i < 6; i++) {
            address actor = vm.addr(uint256(keccak256(abi.encode("actor", i))));
            actors.push(actor);
            ausd.mint(actor, uint256(CONTRIBUTION) * 10_000);
        }

        Rules memory a = _baseRules(5);
        a.yieldOn = true;
        uint256[] memory seatsA = new uint256[](5);
        (seatsA[0], seatsA[1], seatsA[2], seatsA[3], seatsA[4]) = (0, 1, 2, 3, 4);
        _open(a, seatsA, 5);

        Rules memory b = _baseRules(4);
        b.yieldOn = true;
        b.stakeBps = 5_000;
        b.holdbackBps = 5_000;
        b.poolShareBps = 5_000;
        uint256[] memory seatsB = new uint256[](4);
        (seatsB[0], seatsB[1], seatsB[2], seatsB[3]) = (0, 2, 3, 5);
        _open(b, seatsB, 4);

        Rules memory c = _baseRules(3);
        uint256[] memory seatsC = new uint256[](3);
        (seatsC[0], seatsC[1], seatsC[2]) = (0, 1, 4);
        _open(c, seatsC, 2); // only two of three seats ever join
    }

    function _baseRules(uint8 n) internal view returns (Rules memory) {
        return Rules({
            memberCount: n,
            stakeBps: 10_000,
            maxBidBps: 3_000,
            poolShareBps: 1_000,
            holdbackBps: 2_000,
            yieldOn: false,
            contribution: CONTRIBUTION,
            firstDue: uint64(block.timestamp) + 1 days,
            period: 600,
            commitWindow: 240,
            revealWindow: 120,
            grace: 120,
            joinDeadline: uint64(block.timestamp) + 1 hours
        });
    }

    function _open(Rules memory r, uint256[] memory actorOfSeat, uint256 joiners) internal {
        uint256 ci = circles.length;
        address[] memory signers = new address[](r.memberCount);
        for (uint8 s = 1; s < r.memberCount; s++) {
            signers[s] = vm.addr(_inviteKey(ci, s));
        }
        vm.prank(actors[0]);
        Circle c = Circle(factory.createCircle(r, signers));
        circles.push(c);
        rulesHash[c] = keccak256(abi.encode(c.rules()));

        for (uint8 s = 0; s < joiners; s++) {
            address m = actors[actorOfSeat[s]];
            vm.startPrank(m);
            ausd.approve(address(c), type(uint256).max);
            if (s == 0) {
                c.join(0, "");
            } else {
                bytes32 digest = keccak256(abi.encode(JOIN_TYPEHASH, block.chainid, address(c), s, m));
                (uint8 v, bytes32 rr, bytes32 ss) =
                    vm.sign(_inviteKey(ci, s), MessageHashUtils.toEthSignedMessageHash(digest));
                c.join(s, abi.encodePacked(rr, ss, v));
            }
            vm.stopPrank();
            _members[c].push(m);
        }
    }

    function _inviteKey(uint256 ci, uint8 seat) internal pure returns (uint256) {
        return uint256(keccak256(abi.encode("inv", ci, seat)));
    }

    function membersOf(Circle c) external view returns (address[] memory) {
        return _members[c];
    }

    function circleCount() external view returns (uint256) {
        return circles.length;
    }

    function actorCount() external view returns (uint256) {
        return actors.length;
    }

    /// Each circle only compares the clock with its own schedule, so every
    /// phase warps to that circle's exact time, even if another circle's round
    /// left the clock later. A circle still sees its own time only move
    /// forward. Lateness and misses come from the payment modes instead.
    function _warpTo(uint256 t) internal {
        vm.warp(t);
    }

    function _violate(string memory why) internal {
        violations++;
        lastViolation = why;
    }

    // ------------------------------------------------------------ actions

    /// @param modes two bits per seat: 0 miss, 1 pay on time, 2 pay late, 3 autopay collect
    function playRound(uint256 which, uint256 modes, uint256 bidSeed, uint16 bpsA, uint16 bpsB) external {
        Circle c = circles[which % 2]; // C never activates
        if (c.state() != ICircle.State.Active) return;
        Rules memory r = c.rules();
        uint32 round = c.currentRound();
        uint64 due = c.dueTime(round);
        address[] memory ms = _members[c];
        uint256 n = ms.length;

        vm.recordLogs();

        // up to two sealed bids
        address[2] memory bidder = [ms[bidSeed % n], ms[(bidSeed >> 8) % n]];
        uint16[2] memory bps = [uint16(bound(bpsA, 0, r.maxBidBps)), uint16(bound(bpsB, 0, r.maxBidBps))];
        bool[2] memory committed;
        _warpTo(due - r.commitWindow);
        for (uint256 i = 0; i < 2; i++) {
            if (block.timestamp >= due) break;
            bytes32 h = keccak256(abi.encode(block.chainid, address(c), round, bidder[i], bps[i], bytes32(bidSeed)));
            (ICircle.Standing st, bool rec,,) = c.standingOf(bidder[i]);
            vm.prank(bidder[i]);
            try c.commitBid(round, h) {
                committed[i] = true;
                if (st != ICircle.Standing.Good || rec) _violate("ineligible member committed a bid");
            } catch { }
        }

        // on-time payments and autopay
        _warpTo(due - 1);
        for (uint256 i = 0; i < n; i++) {
            uint256 mode = (modes >> (2 * i)) & 3;
            if (mode == 1) {
                vm.prank(ms[i]);
                try c.contribute(round) { } catch { }
            } else if (mode == 3) {
                vm.prank(ms[i]);
                c.setAutopay(true);
                vm.prank(actors[5]);
                try c.collect(ms[i], round) { } catch { }
            }
        }

        // reveals
        _warpTo(due);
        for (uint256 i = 0; i < 2; i++) {
            if (!committed[i]) continue;
            vm.prank(bidder[i]);
            try c.revealBid(round, bps[i], bytes32(bidSeed)) { } catch { }
        }

        // late payments
        _warpTo(due + 1);
        for (uint256 i = 0; i < n; i++) {
            if ((modes >> (2 * i)) & 3 == 2) {
                vm.prank(ms[i]);
                try c.contribute(round) { } catch { }
            }
        }

        _scanLogs(c);

        // recorded logs include those of a reverted call, so a failed close
        // gets its own recording and is thrown away
        _warpTo(due + r.grace);
        vm.recordLogs();
        try c.closeRound(round) {
            roundsClosed++;
            if (c.currentRound() < round) _violate("round went backwards");
            _scanLogs(c);
        } catch {
            // with the clock past due + grace, nothing may block a close
            vm.getRecordedLogs();
            closeReverts++;
            _violate("closeRound reverted");
        }
    }

    function payArrears(uint256 which, uint256 memberSeed) external {
        Circle c = circles[which % 2];
        address[] memory ms = _members[c];
        address m = ms[memberSeed % ms.length];
        vm.recordLogs();
        vm.prank(m);
        try c.payArrears() {
            if (everDefaulted[c][m] && _standing(c, m) == ICircle.Standing.Good) {
                _violate("defaulted member became Good");
            }
        } catch { }
        _scanLogs(c);
    }

    /// Yield on or off at any moment, from nothing (so redemption fees
    /// outrun it and the pool or stakes absorb them) to 50% a year
    function tuneYield(uint256 seed) external {
        uint32[3] memory apr = [uint32(0), 450, 5_000];
        earn.setRate(apr[seed % 3], 4_320);
    }

    function cancelUnfilled() external {
        Circle c = circles[2];
        _warpTo(c.rules().joinDeadline);
        try c.cancel() { } catch { }
    }

    function withdraw(uint256 which, uint256 memberSeed) external {
        Circle c = circles[which % 3];
        address[] memory ms = _members[c];
        address m = ms[memberSeed % ms.length];
        uint256 creditsBefore = _outstandingCredits(c);
        uint256 shown = c.withdrawable(m);
        uint256 balBefore = ausd.balanceOf(m);
        vm.prank(m);
        try c.withdraw() {
            withdrawals++;
            if (c.state() == ICircle.State.Completed) settled[c] = true;
            if (ausd.balanceOf(m) - balBefore != shown) _violate("withdraw paid a different amount than withdrawable");
        } catch {
            if (shown != 0) _violate("withdraw reverted with a positive withdrawable");
        }
        creditsExited[c] += creditsBefore - _outstandingCredits(c);
    }

    // ------------------------------------------------------------ helpers

    function _standing(Circle c, address m) internal view returns (ICircle.Standing st) {
        (st,,,) = c.standingOf(m);
    }

    function _outstandingCredits(Circle c) internal view returns (uint256 total) {
        address[] memory ms = _members[c];
        for (uint256 i = 0; i < ms.length; i++) {
            (,,, uint256 credit) = c.standingOf(ms[i]);
            total += credit;
        }
    }

    function _scanLogs(Circle c) internal {
        Vm.Log[] memory logs = vm.getRecordedLogs();
        uint256 pots = 0;
        uint256 closes = 0;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].emitter != address(c)) continue;
            bytes32 t0 = logs[i].topics[0];
            if (t0 == ICircle.PotPaid.selector) {
                pots++;
                address recipient = address(uint160(uint256(logs[i].topics[1])));
                (uint256 gross, uint256 paid, uint256 discount, uint256 holdback, uint256 arrearsRepaid) =
                    abi.decode(logs[i].data, (uint256, uint256, uint256, uint256, uint256));
                if (gross != paid + discount + holdback + arrearsRepaid) _violate("INV-08 gross split");
                if (++timesReceived[c][recipient] > 1) _violate("INV-04 member received twice");
                if (everDefaulted[c][recipient]) _violate("INV-10 defaulted member received");
                if (discount > 0) bidsWon++;
            } else if (t0 == ICircle.Defaulted.selector) {
                everDefaulted[c][address(uint160(uint256(logs[i].topics[1])))] = true;
                defaults++;
            } else if (t0 == ICircle.CreditsIssued.selector) {
                (uint256 perMember, uint8 k,) = abi.decode(logs[i].data, (uint256, uint8, uint256));
                creditsIssued[c] += perMember * k;
            } else if (t0 == ICircle.Contributed.selector) {
                (, uint256 creditUsed,,,) = abi.decode(logs[i].data, (uint256, uint256, uint256, bool, bool));
                creditsUsed[c] += creditUsed;
            } else if (t0 == ICircle.RoundClosed.selector) {
                closes++;
            }
        }
        if (closes > 0 && pots != closes) _violate("INV-04 closed round without exactly one recipient");
    }
}

/// @notice TC-3-13 and the full TC-1-14 list: SRS 7.9's INV-01..INV-10 with
/// bids, holdbacks, covers, defaults, autopay and cancellation in play, and
/// yield on for A and B (SRS 15.7) at a rate the handler changes at random,
/// so both the yield split and the fee-shortfall path get exercised.
contract FullInvariantTest is Test {
    FullInvariantHandler h;

    function setUp() public {
        h = new FullInvariantHandler();
        targetContract(address(h));
    }

    function _each(function(Circle) internal view check) internal view {
        for (uint256 i = 0; i < h.circleCount(); i++) {
            check(h.circles(i));
        }
    }

    /// INV-01: the circle holds exactly its open pot, pool, default reserve
    /// and members' unused credits (and, once Completed, their pool shares).
    function invariant_INV01_circleSolvency() public view {
        _each(_circleSolvency);
    }

    function _circleSolvency(Circle c) internal view {
        address[] memory ms = h.membersOf(c);
        uint256 expected = c.pot() + c.defaultReserve();
        if (h.settled(c)) {
            // after settlement the circle holds only credits and pool shares:
            // what each member can withdraw beyond their vault ledger
            for (uint256 i = 0; i < ms.length; i++) {
                expected += c.withdrawable(ms[i]) - _ledger(c, ms[i]);
            }
        } else {
            expected += c.pool();
            for (uint256 i = 0; i < ms.length; i++) {
                (,,, uint256 credit) = c.standingOf(ms[i]);
                expected += credit;
            }
        }
        assertEq(h.ausd().balanceOf(address(c)), expected, "INV-01");
    }

    /// INV-02: every circle's ledger is backed. The vault's AUSD is exactly
    /// the circles' liquid buffers; each position's principal is its ledger;
    /// and with yield off, or once settled, the buffer is the whole ledger.
    function invariant_INV02_vaultSolvency() public view {
        uint256 liquidSum = 0;
        for (uint256 i = 0; i < h.circleCount(); i++) {
            Circle c = h.circles(i);
            address[] memory ms = h.membersOf(c);
            uint256 ledger = 0;
            for (uint256 j = 0; j < ms.length; j++) {
                ledger += _ledger(c, ms[j]);
            }
            (uint256 principal, uint256 liquid, uint256 invested, bool earning) = h.vault().positionOf(address(c));
            assertEq(principal, ledger, "INV-02 principal");
            if (!earning || h.settled(c)) assertEq(liquid, ledger, "INV-02 liquid");
            if (h.settled(c)) assertEq(invested, 0, "INV-02 settled");
            liquidSum += liquid;
        }
        assertEq(h.ausd().balanceOf(address(h.vault())), liquidSum, "INV-02");
    }

    /// INV-03 / INV-05: no AUSD is created, destroyed or sent anywhere but
    /// members, circles and the vault.
    function invariant_INV03_INV05_conservation() public view {
        uint256 total = h.ausd().balanceOf(address(h.vault())) + h.ausd().balanceOf(address(h.earn()))
            + h.ausd().balanceOf(address(h));
        for (uint256 i = 0; i < h.actorCount(); i++) {
            total += h.ausd().balanceOf(h.actors(i));
        }
        for (uint256 i = 0; i < h.circleCount(); i++) {
            total += h.ausd().balanceOf(address(h.circles(i)));
        }
        assertEq(total, h.ausd().totalSupply(), "INV-03/05");
    }

    /// INV-06: rules never change.
    function invariant_INV06_rulesImmutable() public view {
        _each(_rulesUnchanged);
    }

    function _rulesUnchanged(Circle c) internal view {
        assertEq(keccak256(abi.encode(c.rules())), h.rulesHash(c), "INV-06");
    }

    /// INV-07: credits issued = used + outstanding + withdrawn/forfeited.
    function invariant_INV07_creditsBalance() public view {
        _each(_creditsBalance);
    }

    function _creditsBalance(Circle c) internal view {
        address[] memory ms = h.membersOf(c);
        uint256 outstanding = 0;
        for (uint256 i = 0; i < ms.length; i++) {
            (,,, uint256 credit) = c.standingOf(ms[i]);
            outstanding += credit;
        }
        assertEq(h.creditsIssued(c), h.creditsUsed(c) + outstanding + h.creditsExited(c), "INV-07");
    }

    /// INV-09: once every member of a finished circle has withdrawn, the
    /// circle and its vault ledger are both exactly zero.
    function invariant_INV09_emptyWhenDone() public view {
        _each(_emptyWhenDone);
    }

    function _emptyWhenDone(Circle c) internal view {
        ICircle.State st = c.state();
        if (st != ICircle.State.Completed && st != ICircle.State.Cancelled) return;
        address[] memory ms = h.membersOf(c);
        uint256 ledger = 0;
        for (uint256 i = 0; i < ms.length; i++) {
            if (c.withdrawable(ms[i]) != 0) return;
            ledger += _ledger(c, ms[i]);
        }
        assertEq(h.ausd().balanceOf(address(c)), 0, "INV-09 circle");
        assertEq(ledger, 0, "INV-09 ledger");
        (uint256 principal, uint256 liquid, uint256 invested,) = h.vault().positionOf(address(c));
        assertEq(principal + liquid + invested, 0, "INV-09 vault position");
    }

    /// INV-10: a defaulted member stays Defaulted.
    function invariant_INV10_defaultIsFinal() public view {
        _each(_defaultIsFinal);
    }

    function _defaultIsFinal(Circle c) internal view {
        address[] memory ms = h.membersOf(c);
        for (uint256 i = 0; i < ms.length; i++) {
            if (!h.everDefaulted(c, ms[i])) continue;
            (ICircle.Standing st, bool received,,) = c.standingOf(ms[i]);
            assertEq(uint8(st), uint8(ICircle.Standing.Defaulted), "INV-10 standing");
            assertTrue(received, "INV-10 defaulted before receiving");
        }
    }

    /// INV-04, INV-08, INV-10 (bids and pots) and "a due round always
    /// closes" are checked per call in the handler.
    function invariant_handlerChecks() public view {
        assertEq(h.violations(), 0, h.lastViolation());
        assertEq(h.closeReverts(), 0);
    }

    function _ledger(Circle c, address m) internal view returns (uint256) {
        return h.vault().balanceOf(address(c), m, IStakeVault.Kind.Stake)
            + h.vault().balanceOf(address(c), m, IStakeVault.Kind.Holdback)
            + h.vault().balanceOf(address(c), m, IStakeVault.Kind.Pool);
    }
}
