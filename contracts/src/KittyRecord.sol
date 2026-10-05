// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IKittyRecord } from "./interfaces/IKittyRecord.sol";
import { ICircleFactory } from "./interfaces/ICircleFactory.sol";

interface ICircleOrigin {
    function factory() external view returns (address);
}

/// @notice Every account's standing, kept by the circles themselves ("Feed the
/// Kitty"). Circles write misses, defaults and finished circles as they
/// happen and read terms at join; nobody else can write. Holds no money and
/// calls no token. Points heal and fade with the clock, so every stage is a
/// view and nothing goes stale.
///
/// Points: up to +100 per finished circle (SRS 8.4's weight, counting only
/// people new to the member), a covered
/// miss costs one whole stage, a default sets -100 (or -300 and a debt when
/// the circle lost money) and erases earned points. Bad points heal 10 a month
/// once nothing is owed; good points fade on a 12-month half-life only while no
/// circle is open.
contract KittyRecord is IKittyRecord, Ownable {
    uint256 private constant MONTH = 30 days;
    uint256 private constant YEAR = 365 days;
    uint256 private constant GOODWILL_WINDOW = 7 days;
    uint256 private constant FAMILY_BAR = 7 * 365 days; // no default this recent

    struct Acct {
        int32 points;
        uint64 at; // points were exact at this time
        uint32 rounds; // rounds in finished circles
        uint32 onTime; // of those, paid by the due time
        uint16 people; // others met in finished circles
        uint8 open; // circles open now
        uint64 biggestClean; // largest round of a circle finished without a miss
        uint128 debt; // what circles lost, until repaid
        uint64 lastDefault;
        uint64 goodwillAt; // last forgiven miss
        int32 preMissPoints; // points before the latest miss
        uint64 missAt; // when the latest unforgiven miss landed; 0 when none
        uint256 met; // two bits per person finished with: "new to you" without a list
    }

    struct Before {
        int256 points;
        Stage stage;
        uint64 anchor; // where the next whole month of healing counts from
    }

    /// How long a newly added factory waits before its circles can write.
    uint64 public immutable factoryDelay;

    mapping(address => Acct) private _acct;
    mapping(address => uint64) private _countsFrom;
    mapping(address => address[]) private _owedIn; // circles holding this account's debt

    constructor(address owner_, uint64 factoryDelay_) Ownable(owner_) {
        factoryDelay = factoryDelay_;
    }

    // ------------------------------------------------------------ admin

    /// @notice A new factory's circles count only after `factoryDelay`, and
    /// the call is public, so a bad owner can't quietly add a fake one.
    function addFactory(address factory) external onlyOwner {
        if (_countsFrom[factory] != 0) revert AlreadyAdded();
        uint64 from = uint64(block.timestamp) + factoryDelay;
        _countsFrom[factory] = from;
        emit FactoryAdded(factory, from);
    }

    function isFactory(address factory) public view returns (bool) {
        uint64 from = _countsFrom[factory];
        return from != 0 && block.timestamp >= from;
    }

    /// @notice FR-TRU-19: undo the latest covered miss, at most once a year per
    /// member, on review. It can't add a penalty or touch a debt.
    function forgive(address m) external onlyOwner {
        if (!_forgive(m)) revert NothingToForgive();
    }

    // ----------------------------------------------------------- writes

    modifier onlyCircle() {
        address f = ICircleOrigin(msg.sender).factory();
        if (!isFactory(f) || !ICircleFactory(f).isCircle(msg.sender)) revert NotCircle();
        _;
    }

    function joined(address m) external onlyCircle {
        Acct storage a = _acct[m];
        Before memory b = _before(a);
        a.open += 1;
        _store(m, a, b, b.points, Why.Joined);
    }

    function left(address m) external onlyCircle {
        Acct storage a = _acct[m];
        Before memory b = _before(a);
        if (a.open > 0) a.open -= 1;
        _store(m, a, b, b.points, Why.Left);
    }

    /// @notice A round the deposit or pool had to cover: one whole stage down.
    function missed(address m) external onlyCircle {
        Acct storage a = _acct[m];
        Before memory b = _before(a);
        int256 floor = _floor(b.stage, b.points);
        // forge-lint: disable-next-line(unsafe-typecast)
        a.preMissPoints = int32(b.points);
        a.missAt = uint64(block.timestamp);
        _store(m, a, b, (b.points < floor ? b.points : floor) - 100, Why.Missed);
    }

    /// @notice The covered round was paid back: inside the goodwill window, the
    /// first time this year, the miss is forgiven.
    function arrearsCleared(address m) external onlyCircle {
        Acct storage a = _acct[m];
        if (a.missAt != 0 && block.timestamp <= a.missAt + GOODWILL_WINDOW) _forgive(m);
    }

    /// @notice Took the pot and stopped paying. Earned points are gone; a loss
    /// to the circle also becomes a debt that keeps the member Away. They are
    /// out of that circle, so it no longer counts as open.
    function defaulted(address m, uint256 shortfall) external onlyCircle {
        Acct storage a = _acct[m];
        Before memory b = _before(a);
        if (a.open > 0) a.open -= 1;
        int256 to = shortfall > 0 ? int256(-300) : int256(-100);
        a.lastDefault = uint64(block.timestamp);
        a.missAt = 0;
        if (shortfall > 0) {
            a.debt += uint128(shortfall);
            _noteOwedIn(m, msg.sender);
            emit DebtChanged(m, a.debt);
        }
        _store(m, a, b, b.points < to ? b.points : to, Why.Defaulted);
    }

    function repaid(address m, uint256 amount) external onlyCircle {
        Acct storage a = _acct[m];
        Before memory b = _before(a);
        a.debt -= uint128(amount < a.debt ? amount : a.debt);
        emit DebtChanged(m, a.debt);
        // healing starts when the debt is gone, not when it was made
        if (a.debt == 0) {
            b.anchor = uint64(block.timestamp);
            delete _owedIn[m];
        }
        _store(m, a, b, b.points, Why.Repaid);
    }

    /// @notice A finished circle. It earns points only for the people in it
    /// who were new to this member, each weighted by their own standing (SRS
    /// 8.4), so saving again with the same people, or a ring of your own
    /// accounts, earns nothing after the first time.
    function finished(
        address m,
        uint64 contribution,
        bool clean,
        uint8 onTime,
        uint8 rounds,
        address[] calldata others,
        Stage[] calldata stages
    ) external onlyCircle {
        Acct storage a = _acct[m];
        Before memory b = _before(a);
        uint256 met = a.met;
        uint256 sum = 0;
        uint16 fresh = 0;
        for (uint256 i = 0; i < others.length; i++) {
            uint256 bits = _bits(others[i]);
            if (met & bits == bits) continue;
            met |= bits;
            fresh += 1;
            sum += _weight(stages[i]);
        }
        a.met = met;
        a.rounds += rounds;
        a.onTime += onTime;
        a.people += fresh;
        if (a.open > 0) a.open -= 1;
        if (clean && contribution > a.biggestClean) a.biggestClean = contribution;
        uint256 pts = others.length == 0 ? 0 : sum / others.length;
        _store(m, a, b, b.points + int256(pts > 100 ? 100 : pts), Why.Finished);
    }

    // ------------------------------------------------------------ reads

    function stageOf(address who) public view returns (Stage) {
        Acct storage a = _acct[who];
        (int256 p,) = _points(a);
        return _stage(a, p);
    }

    function termsOf(address who, uint64 contribution) external view returns (Terms memory t) {
        Acct storage a = _acct[who];
        (int256 p,) = _points(a);
        Stage s = _stage(a, p);
        // FR-TRU-16: limits above Shy only up to twice the biggest clean round
        if (s > Stage.Shy && uint256(contribution) > 2 * uint256(a.biggestClean)) s = Stage.Shy;
        t = _terms(s);
        t.open = a.open;
    }

    function debtOf(address who) external view returns (uint256) {
        return _acct[who].debt;
    }

    /// @notice The circles this account's debt is owed in, so its pot in
    /// another circle can pay them first (FR-TRU-18).
    function owedIn(address who) external view returns (address[] memory) {
        return _owedIn[who];
    }

    /// @notice Whether `who` has finished a circle with `other` before. A
    /// filter, so rarely a stranger reads as met; never the other way round.
    function hasMet(address who, address other) external view returns (bool) {
        uint256 bits = _bits(other);
        return _acct[who].met & bits == bits;
    }

    function progressOf(address who)
        external
        view
        returns (int256 points, uint16 onTimeBps, uint16 people, uint64 biggestClean, uint8 open)
    {
        Acct storage a = _acct[who];
        (points,) = _points(a);
        return (points, _onTimeBps(a), a.people, a.biggestClean, a.open);
    }

    // --------------------------------------------------------- internals

    function _forgive(address m) internal returns (bool) {
        Acct storage a = _acct[m];
        if (a.missAt == 0) return false;
        if (a.goodwillAt != 0 && block.timestamp < a.goodwillAt + YEAR) return false;
        Before memory b = _before(a);
        int256 back = a.preMissPoints;
        a.goodwillAt = uint64(block.timestamp);
        a.missAt = 0;
        _store(m, a, b, b.points > back ? b.points : back, Why.Forgiven);
        return true;
    }

    function _noteOwedIn(address m, address circle) internal {
        address[] storage list = _owedIn[m];
        for (uint256 i = 0; i < list.length; i++) {
            if (list[i] == circle) return;
        }
        list.push(circle);
    }

    /// @dev Two of the 256 bits, from the address's hash.
    function _bits(address who) internal pure returns (uint256) {
        uint256 h = uint256(keccak256(abi.encodePacked(who)));
        return (uint256(1) << (h & 0xff)) | (uint256(1) << ((h >> 8) & 0xff));
    }

    /// @dev SRS 8.4's weight per new person, as points out of 100.
    function _weight(Stage s) internal pure returns (uint256) {
        if (s >= Stage.AtHome) return 100;
        if (s == Stage.Friendly) return 70;
        if (s == Stage.Away) return 0;
        return 40;
    }

    function _before(Acct storage a) internal view returns (Before memory b) {
        (b.points, b.anchor) = _points(a);
        b.stage = _stage(a, b.points);
    }

    /// @dev Writes the new points and reports a stage change. A member still
    /// healing with unchanged or better points keeps their partial month.
    function _store(address m, Acct storage a, Before memory b, int256 p, Why why) internal {
        a.at = (p < 0 && b.points < 0 && p >= b.points) ? b.anchor : uint64(block.timestamp);
        // points stay far inside int32: +100 a circle, -400 at worst a write
        // forge-lint: disable-next-line(unsafe-typecast)
        a.points = int32(p);
        Stage after_ = _stage(a, p);
        if (after_ != b.stage) emit StageChanged(m, b.stage, after_, why);
    }

    /// @dev Bad points heal 10 a month once nothing is owed; good points halve
    /// every year while no circle is open.
    function _points(Acct storage a) internal view returns (int256 p, uint64 anchor) {
        p = a.points;
        anchor = uint64(block.timestamp);
        // never negative, so a record write can't brick a circle's withdraw
        uint256 dt = block.timestamp > a.at ? block.timestamp - a.at : 0;
        if (p < 0) {
            if (a.debt > 0) return (p, anchor);
            uint256 months = dt / MONTH;
            p += int256(months * 10);
            if (p >= 0) return (0, anchor);
            anchor = a.at + uint64(months * MONTH);
        } else if (p > 0 && a.open == 0) {
            uint256 halvings = dt / YEAR;
            if (halvings >= 32) return (0, anchor);
            uint256 v = uint256(p) >> halvings;
            v -= (v * (dt % YEAR)) / (2 * YEAR); // straight line between halvings
            p = int256(v);
        }
    }

    function _onTimeBps(Acct storage a) internal view returns (uint16) {
        return a.rounds == 0 ? 0 : uint16((uint256(a.onTime) * 10_000) / a.rounds);
    }

    function _stage(Acct storage a, int256 p) internal view returns (Stage) {
        if (a.debt > 0) return Stage.Away;
        if (p < 0) return Stage.Wary;
        uint16 bps = _onTimeBps(a);
        bool noRecentDefault = a.lastDefault == 0 || block.timestamp >= a.lastDefault + FAMILY_BAR;
        if (p >= 600 && bps >= 9_800 && a.people >= 12 && noRecentDefault) return Stage.Family;
        if (p >= 300 && bps >= 9_500 && a.people >= 6) return Stage.AtHome;
        if (p >= 100 && bps >= 9_000) return Stage.Friendly;
        return Stage.Shy;
    }

    /// @dev A miss lands at the lower of your points and your stage's floor,
    /// minus 100: always exactly one stage, plus progress inside it.
    function _floor(Stage s, int256 p) internal pure returns (int256) {
        if (s == Stage.Family) return 600;
        if (s == Stage.AtHome) return 300;
        if (s == Stage.Friendly) return 100;
        if (s == Stage.Shy) return 0;
        return p;
    }

    function _terms(Stage s) internal pure returns (Terms memory t) {
        t.stage = s;
        if (s == Stage.Away) return t; // can't join: maxOpen 0
        t.depositX100 = s == Stage.Wary ? 200 : 100;
        if (s == Stage.Wary) {
            (t.limitMonths, t.offerFrom, t.maxOpen) = (0, 2, 1);
        } else if (s == Stage.Shy) {
            (t.limitMonths, t.offerFrom, t.maxOpen) = (1, 1, 2);
        } else if (s == Stage.Friendly) {
            (t.limitMonths, t.offerFrom, t.maxOpen) = (3, 0, 3);
        } else if (s == Stage.AtHome) {
            (t.limitMonths, t.offerFrom, t.maxOpen) = (6, 0, 4);
        } else {
            (t.limitMonths, t.offerFrom, t.maxOpen) = (255, 0, 6);
        }
    }
}
