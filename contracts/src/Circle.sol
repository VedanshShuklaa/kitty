// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { MessageHashUtils } from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { ICircle } from "./interfaces/ICircle.sol";
import { Rules } from "./interfaces/ICircleFactory.sol";
import { IStakeVault } from "./interfaces/IStakeVault.sol";
import { IKittyRecord } from "./interfaces/IKittyRecord.sol";

/// @notice One rotating-savings circle, deployed as an EIP-1167 clone by
/// CircleFactory. Implements SRS section 7.7 in full: contributions, sealed
/// bids, ordered payouts, holdback release, covers and defaults. No
/// privileged power moves a member's money outside these rules (NFR-SEC-01).
contract Circle is ICircle, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 private constant JOIN_TYPEHASH = keccak256("kitty.join.v1");

    uint256 private constant MAX_DEBT_CIRCLES = 4;

    bool private _initialized;
    // Every clone of a given CircleFactory shares the same factory, AUSD and
    // vault addresses, so these live in the shared implementation's runtime
    // bytecode as immutables instead of a per-clone SSTORE in initialize()
    // (TC-1-16, SRS 7.10's createCircle gas budget).
    address public immutable factory;
    IERC20 public immutable ausd;
    IStakeVault public immutable vault;
    // Standing ("Feed the Kitty"): read at join, written on every miss,
    // default, repayment and finished circle
    IKittyRecord public immutable record;
    address public organizer;

    Rules private _rules;
    State private _state;
    uint32 private _currentRound;
    // when the current round opened (activation, or the previous close);
    // shares the slot above, so keeping it costs next to nothing
    uint64 private _openedAt;
    uint256 public pot;
    uint256 public pool;
    uint256 public defaultReserve;
    bool private _settled;

    mapping(uint8 => address) private _memberAt;
    mapping(address => uint8) private _seatIndexPlusOne;
    mapping(uint8 => address) private _inviteSignerAt;
    uint8 public filledSeats;

    mapping(address => Standing) private _standingOf;
    mapping(address => bool) private _receivedOf;
    mapping(address => uint256) private _arrearsOf;
    mapping(address => uint256) private _arrearsPoolPortion;
    mapping(address => uint256) private _creditOf;
    mapping(address => bool) private _autopayOf;
    mapping(address => uint256) private _holdbackRemaining;
    mapping(address => uint256) private _holdbackPerPayment;
    mapping(address => uint256) private _finalPoolShare;

    mapping(uint32 => mapping(address => bool)) private _paidRound;
    mapping(uint32 => mapping(address => bytes32)) private _commitmentOf;
    mapping(uint32 => mapping(address => bool)) private _hasRevealed;
    mapping(uint32 => mapping(address => uint16)) private _revealedBps;
    mapping(uint32 => address) private _recipientOf;

    mapping(address => uint256) private _fillPerRound;
    mapping(address => uint256) private _fillRemainder;
    mapping(address => bool) private _defaultFillPending;

    // A member's terms from the record, fixed at join, and their tally here
    struct Seat {
        IKittyRecord.Stage stage;
        uint8 limitMonths; // 255: the circle's own holdback only
        uint8 offerFrom; // 0 any round, 1 second half, 2 never
        uint8 late;
        uint8 missed;
        bool recorded; // the finished circle is in the record
    }

    mapping(address => Seat) private _seat;
    // FR-TRU-17: the part of a missed round nobody covered, by round, owed to
    // that round's recipient
    mapping(address => mapping(uint32 => uint256)) private _shortIn;
    mapping(address => uint256) private _arrearsShortPortion;
    // what a member's default (or unpaid arrears at the end) cost the others
    mapping(address => uint256) private _owed;
    mapping(address => uint32) private _defaultRound;

    modifier onlyMember() {
        if (_seatIndexPlusOne[msg.sender] == 0) revert NotMember();
        _;
    }

    constructor(IERC20 ausd_, IStakeVault vault_, address factory_, IKittyRecord record_) {
        ausd = ausd_;
        vault = vault_;
        factory = factory_;
        record = record_;
    }

    function initialize(Rules calldata r, address[] calldata inviteSigners_, address organizer_) external {
        if (msg.sender != factory) revert NotEligible();
        if (_initialized) revert WrongState();
        _initialized = true;
        _rules = r;
        organizer = organizer_;
        for (uint8 i = 1; i < r.memberCount; i++) {
            _inviteSignerAt[i] = inviteSigners_[i];
        }
    }

    // ---------------------------------------------------------------- join

    function join(uint8 seat, bytes calldata inviteSig) external nonReentrant {
        if (_state != State.Forming) revert WrongState();
        if (block.timestamp >= _rules.joinDeadline) revert JoinClosed();
        if (seat >= _rules.memberCount) revert BadInvite();
        if (_memberAt[seat] != address(0)) revert SeatTaken();
        // one seat per address: the organizer holds every invite link and
        // could otherwise sign a second seat for themselves
        if (_seatIndexPlusOne[msg.sender] != 0) revert SeatTaken();

        if (seat == 0) {
            if (msg.sender != organizer) revert BadInvite();
        } else {
            bytes32 digest = keccak256(abi.encode(JOIN_TYPEHASH, block.chainid, address(this), seat, msg.sender));
            address signer = ECDSA.recover(MessageHashUtils.toEthSignedMessageHash(digest), inviteSig);
            if (signer != _inviteSignerAt[seat]) revert BadInvite();
        }

        // FR-TRU-13/14: the deposit, limit and offer window come from standing
        IKittyRecord.Terms memory t = record.termsOf(msg.sender, _rules.contribution);
        if (t.stage == IKittyRecord.Stage.Away) revert Owing();
        if (t.open >= t.maxOpen) revert TooManyCircles();
        _seat[msg.sender] = Seat(t.stage, t.limitMonths, t.offerFrom, 0, 0, false);

        uint256 stake = (uint256(_rules.contribution) * _rules.stakeBps * t.depositX100) / 1_000_000;
        _memberAt[seat] = msg.sender;
        _seatIndexPlusOne[msg.sender] = seat + 1;
        filledSeats += 1;
        _standingOf[msg.sender] = Standing.Good;

        if (stake > 0) {
            ausd.safeTransferFrom(msg.sender, address(vault), stake);
            vault.deposit(msg.sender, IStakeVault.Kind.Stake, stake);
        }
        record.joined(msg.sender);
        emit Joined(msg.sender, seat, stake);
        emit Placed(msg.sender, t.stage);

        if (filledSeats == _rules.memberCount) {
            _state = State.Active;
            _currentRound = 1;
            _openedAt = uint64(block.timestamp);
            emit Activated(_rules.firstDue);
        }
    }

    function reissueInvite(uint8 seat, address signer) external {
        if (msg.sender != organizer) revert NotEligible();
        if (_state != State.Forming) revert WrongState();
        if (seat == 0 || seat >= _rules.memberCount || signer == address(0)) revert BadInvite();
        if (_memberAt[seat] != address(0)) revert SeatTaken();
        _inviteSignerAt[seat] = signer;
        emit InviteReissued(seat, signer);
    }

    function cancel() external {
        if (_state != State.Forming) revert WrongState();
        if (msg.sender != organizer && block.timestamp < _rules.joinDeadline) revert TooEarly();
        _state = State.Cancelled;
        for (uint8 s = 0; s < _rules.memberCount; s++) {
            address m = _memberAt[s];
            if (m != address(0)) record.left(m);
        }
        emit Cancelled(uint64(block.timestamp));
    }

    // --------------------------------------------------------- contribute

    function contribute(uint32 round) external nonReentrant {
        _pay(msg.sender, round, false);
    }

    function setAutopay(bool on) external onlyMember {
        _autopayOf[msg.sender] = on;
        emit AutopaySet(msg.sender, on);
    }

    function collect(address member, uint32 round) external nonReentrant {
        if (!_autopayOf[member]) revert AutopayOff();
        uint64 due_ = dueTime(round);
        uint32 window = _rules.commitWindow < 1 days ? _rules.commitWindow : uint32(1 days);
        if (block.timestamp < due_ - window) revert TooEarly();
        if (block.timestamp > due_) revert TooLate();
        _pay(member, round, true);
    }

    function _pay(address member, uint32 round, bool autopay) internal {
        if (_state != State.Active) revert WrongState();
        if (round != _currentRound) revert WrongRound();
        if (_seatIndexPlusOne[member] == 0) revert NotMember();
        if (_paidRound[round][member]) revert AlreadyPaid();
        if (_standingOf[member] == Standing.Defaulted) revert NotEligible();

        uint64 due_ = dueTime(round);
        // ends the second closeRound opens, so the two never overlap
        if (block.timestamp >= due_ + _rules.grace) revert TooLate();
        bool late = block.timestamp > due_;
        if (late) _seat[member].late += 1;

        (uint256 pay, uint256 creditUsed, uint256 holdbackReleased) = _amountDue(member, late);
        _paidRound[round][member] = true;
        if (creditUsed > 0) _creditOf[member] -= creditUsed;
        if (holdbackReleased > 0) {
            // whatever fees ate of the holdback, the member pays in instead
            uint256 got = _take(member, IStakeVault.Kind.Holdback, holdbackReleased);
            _holdbackRemaining[member] -= holdbackReleased;
            pay += holdbackReleased - got;
            holdbackReleased = got;
        }
        if (pay > 0) ausd.safeTransferFrom(member, address(this), pay);
        pot += _rules.contribution;

        emit Contributed(member, round, pay, creditUsed, holdbackReleased, late, autopay);
    }

    function _amountDue(address member, bool late)
        internal
        view
        returns (uint256 pay, uint256 creditUsed, uint256 holdbackReleased)
    {
        creditUsed = _creditOf[member] < _rules.contribution ? _creditOf[member] : _rules.contribution;
        if (_receivedOf[member] && _holdbackRemaining[member] > 0 && !late) {
            uint256 remainder = _rules.contribution - creditUsed;
            uint256 cap = _holdbackPerPayment[member] < _holdbackRemaining[member]
                ? _holdbackPerPayment[member]
                : _holdbackRemaining[member];
            holdbackReleased = cap < remainder ? cap : remainder;
        }
        pay = _rules.contribution - creditUsed - holdbackReleased;
    }

    function payArrears() external nonReentrant onlyMember {
        // once Completed the pool has been split, so a pool-bound repayment
        // would have nowhere to go
        if (_state != State.Active) revert WrongState();
        uint256 amt = _arrearsOf[msg.sender];
        if (amt == 0) revert NothingToWithdraw();
        (uint256 stakeRestore, uint256 poolRestore) = _restoreArrears(msg.sender, amt);
        ausd.safeTransferFrom(msg.sender, address(this), amt);
        if (stakeRestore > 0) {
            ausd.safeTransfer(address(vault), stakeRestore);
            vault.deposit(msg.sender, IStakeVault.Kind.Stake, stakeRestore);
        }
        if (poolRestore > 0) pool += poolRestore;
        if (_standingOf[msg.sender] == Standing.Behind) _standingOf[msg.sender] = Standing.Good;
        record.arrearsCleared(msg.sender);
        emit ArrearsPaid(msg.sender, amt);
    }

    /// @dev FR-TRU-17: a repayment goes first to the members whose pots were
    /// short, then back to the shared pool, and last restores the member's
    /// own stake: other people's money before their own.
    function _restoreArrears(address m, uint256 repayAmt) internal returns (uint256 stakeRestore, uint256 poolRestore) {
        uint256 toShort = repayAmt < _arrearsShortPortion[m] ? repayAmt : _arrearsShortPortion[m];
        if (toShort > 0) {
            _arrearsShortPortion[m] -= toShort;
            pool += _payShort(m, toShort);
        }
        uint256 rest = repayAmt - toShort;
        poolRestore = rest < _arrearsPoolPortion[m] ? rest : _arrearsPoolPortion[m];
        stakeRestore = rest - poolRestore;
        _arrearsOf[m] -= repayAmt;
        _arrearsPoolPortion[m] -= poolRestore;
    }

    /// @dev Credits each round's recipient with what `m`'s miss kept from their
    /// pot, earliest round first; a round with no recipient to pay feeds the pool.
    function _payShort(address m, uint256 amt) internal returns (uint256 unplaced) {
        for (uint32 r = 1; r <= _currentRound && amt > 0; r++) {
            uint256 x = _shortIn[m][r];
            if (x == 0) continue;
            uint256 part = x < amt ? x : amt;
            _shortIn[m][r] = x - part;
            amt -= part;
            address to = _recipientOf[r];
            if (to == address(0) || to == m || _standingOf[to] == Standing.Defaulted) {
                unplaced += part;
            } else {
                _creditOf[to] += part;
                emit ArrearsCredited(m, to, part);
            }
        }
        unplaced += amt;
    }

    // --------------------------------------------------------------- bids

    function commitBid(uint32 round, bytes32 commitment) external onlyMember {
        if (_state != State.Active || round != _currentRound) revert WrongRound();
        if (_rules.maxBidBps == 0) revert BiddingOff();
        if (!_canOffer(msg.sender, round)) revert NotEligible();
        if (_eligibleBidderCount(round) < 2) revert NotEligible();
        uint64 due_ = dueTime(round);
        if (block.timestamp < due_ - _rules.commitWindow) revert TooEarly();
        if (block.timestamp >= due_) revert TooLate();
        _commitmentOf[round][msg.sender] = commitment;
        emit BidCommitted(msg.sender, round, commitment);
    }

    /// @dev FR-BID-07: with one eligible bidder left, bidding is pointless --
    /// the no-bid fallback already picks them.
    function _eligibleBidderCount(uint32 round) internal view returns (uint8 count) {
        uint8 n = _rules.memberCount;
        for (uint8 s = 0; s < n; s++) {
            if (_canOffer(_memberAt[s], round)) count++;
        }
    }

    /// @dev Good standing, no pot yet, and inside their stage's offer window:
    /// Friendly and above any round, Shy from the second half, Wary never.
    function _canOffer(address m, uint32 round) internal view returns (bool) {
        if (_standingOf[m] != Standing.Good || _receivedOf[m]) return false;
        uint8 from = _seat[m].offerFrom;
        if (from != 0 && (from != 1 || round <= _rules.memberCount / 2)) return false;
        return !_owesElsewhere(m);
    }

    /// @dev Payout order: stage first, best first, then seat. A member who
    /// owes another circle goes behind everyone (FR-TRU-18).
    function _rank(address m, uint8 seat) internal view returns (uint256) {
        uint256 stage = _owesElsewhere(m) ? 0 : uint256(_seat[m].stage);
        return stage * 16 + (15 - seat);
    }

    /// @dev FR-TRU-18: a debt anywhere, read live, so a default in another
    /// circle reaches this one at its next round.
    function _owesElsewhere(address m) internal view returns (bool) {
        return record.debtOf(m) > 0;
    }

    function revealBid(uint32 round, uint16 discountBps, bytes32 salt) external onlyMember {
        if (_state != State.Active || round != _currentRound) revert WrongRound();
        uint64 due_ = dueTime(round);
        if (block.timestamp < due_) revert TooEarly();
        if (block.timestamp > due_ + _rules.revealWindow || block.timestamp >= due_ + _rules.grace) revert TooLate();
        if (discountBps > _rules.maxBidBps) revert BidTooHigh();
        bytes32 commitment = keccak256(abi.encode(block.chainid, address(this), round, msg.sender, discountBps, salt));
        if (commitment != _commitmentOf[round][msg.sender] || commitment == bytes32(0)) revert BadReveal();
        _hasRevealed[round][msg.sender] = true;
        _revealedBps[round][msg.sender] = discountBps;
        emit BidRevealed(msg.sender, round, discountBps);
    }

    // ---------------------------------------------------------- closeRound

    function closeRound(uint32 round) external nonReentrant {
        if (_state != State.Active) revert WrongState();
        if (round != _currentRound) revert WrongRound();
        uint64 due_ = dueTime(round);
        if (block.timestamp < due_ + _rules.grace) revert TooEarly();

        uint8 n = _rules.memberCount;

        // step 2: fill earlier defaults
        for (uint8 s = 0; s < n; s++) {
            address m = _memberAt[s];
            if (_defaultFillPending[m]) {
                uint256 amt = _fillPerRound[m];
                if (round == n) amt += _fillRemainder[m];
                if (amt > 0) {
                    defaultReserve -= amt;
                    pot += amt;
                    emit DefaultFilled(m, round, amt, 0);
                }
            }
        }

        // step 3: handle misses in seat order
        for (uint8 s = 0; s < n; s++) {
            address m = _memberAt[s];
            if (_standingOf[m] == Standing.Defaulted || _paidRound[round][m]) continue;

            if (!_receivedOf[m]) {
                uint256 stakeBal = vault.balanceOf(address(this), m, IStakeVault.Kind.Stake);
                uint256 fromStake = stakeBal < _rules.contribution ? stakeBal : _rules.contribution;
                if (fromStake > 0) fromStake = _take(m, IStakeVault.Kind.Stake, fromStake);
                uint256 remaining = _rules.contribution - fromStake;
                uint256 fromPool = pool < remaining ? pool : remaining;
                pool -= fromPool;
                uint256 shortfall = remaining - fromPool;
                pot += fromStake + fromPool;
                // FR-TRU-17: the whole round is owed, covered or not
                _arrearsOf[m] += _rules.contribution;
                _arrearsPoolPortion[m] += fromPool;
                if (shortfall > 0) {
                    _arrearsShortPortion[m] += shortfall;
                    _shortIn[m][round] += shortfall;
                }
                _standingOf[m] = Standing.Behind;
                _paidRound[round][m] = true;
                _seat[m].missed += 1;
                record.missed(m);
                emit Covered(m, round, fromStake, fromPool, shortfall);
            } else {
                uint256 left = n - round + 1;
                uint256 obligation = uint256(_rules.contribution) * left;

                uint256 stakeBal = vault.balanceOf(address(this), m, IStakeVault.Kind.Stake);
                uint256 fromStake = stakeBal < obligation ? stakeBal : obligation;
                if (fromStake > 0) fromStake = _take(m, IStakeVault.Kind.Stake, fromStake);
                uint256 rem = obligation - fromStake;

                uint256 hbBal = _holdbackRemaining[m];
                uint256 fromHoldback = hbBal < rem ? hbBal : rem;
                if (fromHoldback > 0) {
                    _holdbackRemaining[m] -= fromHoldback;
                    fromHoldback = _take(m, IStakeVault.Kind.Holdback, fromHoldback);
                }
                rem -= fromHoldback;

                uint256 fromPool = pool < rem ? pool : rem;
                pool -= fromPool;
                rem -= fromPool;

                uint256 filled = fromStake + fromHoldback + fromPool;
                _fillPerRound[m] = filled / left;
                _fillRemainder[m] = filled % left;
                _defaultFillPending[m] = true;
                defaultReserve += filled;
                _standingOf[m] = Standing.Defaulted;
                _paidRound[round][m] = true;
                _seat[m].missed += 1;
                _defaultRound[m] = round;
                _seat[m].recorded = true;
                record.defaulted(m, rem + _foldArrears(m, rem));
                emit Defaulted(m, round, obligation, fromStake, fromHoldback, fromPool, rem);

                uint256 immediateFill = _fillPerRound[m];
                if (round == n) immediateFill += _fillRemainder[m];
                if (immediateFill > 0) {
                    defaultReserve -= immediateFill;
                    pot += immediateFill;
                    emit DefaultFilled(m, round, immediateFill, rem);
                }
            }
        }

        // step 4: pick the recipient
        address winner = address(0);
        uint16 bestBps = 0;
        bool foundBid = false;
        for (uint8 s = 0; s < n; s++) {
            address m = _memberAt[s];
            if (_standingOf[m] != Standing.Good || _receivedOf[m] || !_paidRound[round][m]) continue;
            if (_hasRevealed[round][m] && !_owesElsewhere(m)) {
                uint16 bps = _revealedBps[round][m];
                if (!foundBid || bps > bestBps) {
                    winner = m;
                    bestBps = bps;
                    foundBid = true;
                }
            }
        }
        if (!foundBid) winner = _firstInOrder(round, Standing.Good);
        if (winner == address(0)) winner = _firstInOrder(round, Standing.Behind);

        // step 5: pay
        uint256 gross = pot;
        pot = 0;
        uint256 discount = (winner != address(0) && bestBps > 0) ? (gross * bestBps) / 10_000 : 0;
        uint256 toPool = (discount * _rules.poolShareBps) / 10_000;
        uint256 creditPoolAmt = discount - toPool;

        uint256 k = 0;
        for (uint8 s = 0; s < n; s++) {
            address m = _memberAt[s];
            if (m != winner && _standingOf[m] != Standing.Defaulted) k++;
        }
        uint256 perMember = k > 0 ? creditPoolAmt / k : 0;
        uint256 dust = k > 0 ? creditPoolAmt % k : creditPoolAmt;
        if (perMember > 0) {
            for (uint8 s = 0; s < n; s++) {
                address m = _memberAt[s];
                if (m != winner && _standingOf[m] != Standing.Defaulted) _creditOf[m] += perMember;
            }
        }
        pool += toPool + dust;
        // k counts other members, at most 11
        // forge-lint: disable-next-line(unsafe-typecast)
        emit CreditsIssued(round, perMember, uint8(k), toPool + dust);

        // FR-TRU-17: a Behind winner's own pot repays what they owe first
        uint256 arrearsRepaid = 0;
        if (winner != address(0) && _standingOf[winner] == Standing.Behind) {
            // what their miss kept from this very pot was only ever their own
            uint256 self = _shortIn[winner][round];
            if (self > 0) {
                _shortIn[winner][round] = 0;
                _arrearsShortPortion[winner] -= self;
                _arrearsOf[winner] -= self;
            }
            uint256 available = gross - discount;
            arrearsRepaid = _arrearsOf[winner] < available ? _arrearsOf[winner] : available;
            if (arrearsRepaid > 0) {
                (uint256 stakeRestore, uint256 poolRestore) = _restoreArrears(winner, arrearsRepaid);
                if (stakeRestore > 0) {
                    ausd.safeTransfer(address(vault), stakeRestore);
                    vault.deposit(winner, IStakeVault.Kind.Stake, stakeRestore);
                }
                if (poolRestore > 0) pool += poolRestore;
            }
            if (_arrearsOf[winner] == 0) {
                _standingOf[winner] = Standing.Good;
                record.arrearsCleared(winner);
            }
        }

        // FR-TRU-18: a debt in another circle is paid from this pot next,
        // straight to the circle that lost the money
        if (winner != address(0) && _owesElsewhere(winner)) {
            arrearsRepaid += _payDebtsElsewhere(winner, gross - discount - arrearsRepaid);
        }

        uint256 holdbackAmt = 0;
        if (winner != address(0) && round < n) {
            holdbackAmt = _holdbackFor(winner, round, gross - discount - arrearsRepaid);
            if (holdbackAmt > 0) {
                ausd.safeTransfer(address(vault), holdbackAmt);
                vault.deposit(winner, IStakeVault.Kind.Holdback, holdbackAmt);
            }
        }

        if (winner != address(0)) {
            uint256 paid = gross - discount - holdbackAmt - arrearsRepaid;
            _receivedOf[winner] = true;
            _recipientOf[round] = winner;
            // a frozen recipient (AUSD's issuer can freeze an address) must not
            // stop the round for everyone: their pot waits as credit, which
            // pays their next rounds and is collected at the end
            if (paid > 0 && !ausd.trySafeTransfer(winner, paid)) _creditOf[winner] += paid;
            emit PotPaid(winner, round, gross, paid, discount, holdbackAmt, arrearsRepaid);
        }

        emit RoundClosed(round, msg.sender);
        // with yield on, collateral above the buffer starts earning here, not
        // at the activating join, which has no gas left for it (SRS 7.10)
        vault.rebalance();
        if (round == n) {
            _state = State.Completed;
            emit Completed(uint64(block.timestamp));
        } else {
            _currentRound = round + 1;
            _openedAt = uint64(block.timestamp);
        }
    }

    // ------------------------------------------------------------ withdraw

    function withdraw() external nonReentrant {
        if (_seatIndexPlusOne[msg.sender] == 0) revert NotMember();
        if (_state == State.Cancelled) {
            uint256 stakeBal = vault.balanceOf(address(this), msg.sender, IStakeVault.Kind.Stake);
            if (stakeBal == 0) revert NothingToWithdraw();
            emit Withdrawn(msg.sender, vault.take(msg.sender, IStakeVault.Kind.Stake, stakeBal, msg.sender));
            return;
        }
        if (_state != State.Completed) revert WrongState();
        if (!_seat[msg.sender].recorded) _recordFinish(msg.sender);

        if (!_settled) {
            (uint256 assets, uint256 principal) = vault.settle();
            uint8 n = _rules.memberCount;
            uint256 numGood = 0;
            for (uint8 s = 0; s < n; s++) {
                address m = _memberAt[s];
                if (_standingOf[m] == Standing.Defaulted) {
                    pool += _creditOf[m];
                    _creditOf[m] = 0;
                } else {
                    numGood++;
                }
            }
            if (assets > principal) {
                // yield, pro rata to remaining stakes (SRS 7.7)
                uint256[] memory y = _yieldSplit(assets - principal);
                for (uint8 s = 0; s < n; s++) {
                    if (y[s] > 0) vault.allocate(_memberAt[s], IStakeVault.Kind.Pool, y[s]);
                }
            } else if (assets < principal) {
                // redemption fees outran yield: the pool absorbs the
                // difference first, then stakes pro rata
                uint256 d = principal - assets;
                uint256 fromPool = pool < d ? pool : d;
                if (fromPool > 0) {
                    pool -= fromPool;
                    ausd.safeTransfer(address(vault), fromPool);
                    vault.topUp(fromPool);
                }
                if (d > fromPool) {
                    (uint256[] memory st, uint256[] memory hb) = _writeDownSplit(d - fromPool);
                    for (uint8 s = 0; s < n; s++) {
                        address m = _memberAt[s];
                        if (st[s] > 0) vault.writeDown(m, IStakeVault.Kind.Stake, st[s]);
                        if (hb[s] > 0) {
                            vault.writeDown(m, IStakeVault.Kind.Holdback, hb[s]);
                            _holdbackRemaining[m] -= hb[s];
                        }
                    }
                }
            }
            if (numGood > 0) {
                uint256 per = pool / numGood;
                uint256 rem = pool % numGood;
                bool first = true;
                for (uint8 s = 0; s < n; s++) {
                    address m = _memberAt[s];
                    if (_standingOf[m] == Standing.Defaulted) continue;
                    _finalPoolShare[m] = per + (first ? rem : 0);
                    first = false;
                }
            }
            pool = 0;
            _settled = true;
        }

        uint256 stakeBal_ = vault.balanceOf(address(this), msg.sender, IStakeVault.Kind.Stake);
        uint256 hbBal = vault.balanceOf(address(this), msg.sender, IStakeVault.Kind.Holdback);
        uint256 yieldBal = vault.balanceOf(address(this), msg.sender, IStakeVault.Kind.Pool);
        uint256 creditAmt = _creditOf[msg.sender];
        uint256 poolShare = _finalPoolShare[msg.sender];

        if (stakeBal_ + hbBal + yieldBal + creditAmt + poolShare == 0) revert NothingToWithdraw();

        // the event reports what actually moved: settlement leaves the vault
        // liquid, but a take pays only what it holds
        uint256 total = creditAmt + poolShare;
        if (stakeBal_ > 0) total += vault.take(msg.sender, IStakeVault.Kind.Stake, stakeBal_, msg.sender);
        if (yieldBal > 0) total += vault.take(msg.sender, IStakeVault.Kind.Pool, yieldBal, msg.sender);
        if (hbBal > 0) {
            total += vault.take(msg.sender, IStakeVault.Kind.Holdback, hbBal, msg.sender);
            _holdbackRemaining[msg.sender] = 0;
        }
        if (creditAmt > 0) {
            _creditOf[msg.sender] = 0;
            ausd.safeTransfer(msg.sender, creditAmt);
        }
        if (poolShare > 0) {
            _finalPoolShare[msg.sender] = 0;
            ausd.safeTransfer(msg.sender, poolShare);
        }
        emit Withdrawn(msg.sender, total);
    }

    // -------------------------------------------------------- the record

    /// @notice Writes a member's finished circle into the record. Their own
    /// first withdraw does it; anyone can for a member who never withdraws.
    function recordFinish(address member) external nonReentrant {
        if (_state != State.Completed) revert WrongState();
        if (_seatIndexPlusOne[member] == 0) revert NotMember();
        if (_seat[member].recorded) revert AlreadyPaid();
        _recordFinish(member);
    }

    function _recordFinish(address m) internal {
        Seat storage st = _seat[m];
        st.recorded = true; // a default recorded itself when it happened
        // arrears still unpaid at the end are money the others never got back
        if (_arrearsOf[m] > 0) {
            uint256 owed = _foldArrears(m, 0);
            if (owed > 0) {
                record.defaulted(m, owed);
                return;
            }
        }
        uint8 n = _rules.memberCount;
        address[] memory others = new address[](n - 1);
        IKittyRecord.Stage[] memory stages = new IKittyRecord.Stage[](n - 1);
        uint256 k = 0;
        for (uint8 s = 0; s < n; s++) {
            address o = _memberAt[s];
            if (o == m) continue;
            others[k] = o;
            stages[k++] = _seat[o].stage;
        }
        uint8 onTime = n - st.late - st.missed;
        record.finished(m, _rules.contribution, st.missed == 0, onTime, n, others, stages);
    }

    /// @dev Moves what a member's arrears owe other people (the short and pool
    /// parts) into `_owed`, with `extra` on top. Their own stake's part is
    /// theirs, so it is simply dropped. Returns the arrears part.
    function _foldArrears(address m, uint256 extra) internal returns (uint256 fromArrears) {
        fromArrears = _arrearsShortPortion[m] + _arrearsPoolPortion[m];
        _owed[m] += extra + fromArrears;
        _arrearsOf[m] = 0;
        _arrearsPoolPortion[m] = 0;
        if (_standingOf[m] == Standing.Behind) _standingOf[m] = Standing.Good;
        // _arrearsShortPortion and _shortIn stay: repay() pays those rounds' recipients
    }

    /// @notice Pays back what this member's default or unpaid arrears cost the
    /// circle, to the members who lost it (they withdraw it as credit), and
    /// clears the debt in the record.
    function repay() external nonReentrant {
        uint256 amt = _owed[msg.sender];
        if (amt == 0) revert NothingToWithdraw();
        _repay(msg.sender, msg.sender, amt);
    }

    /// @notice Pays up to `max` of `member`'s debt here from the caller's
    /// money. Another circle uses it to pay a debtor's pot to this one first
    /// (FR-TRU-18); anyone else may too. Returns what was paid.
    function repayFor(address member, uint256 max) external nonReentrant returns (uint256 amt) {
        amt = _owed[member] < max ? _owed[member] : max;
        if (amt == 0) revert NothingToWithdraw();
        _repay(msg.sender, member, amt);
    }

    function _repay(address payer, address m, uint256 amt) internal {
        if (_state != State.Active && _state != State.Completed) revert WrongState();
        _owed[m] -= amt;
        ausd.safeTransferFrom(payer, address(this), amt);

        uint256 toShort = amt < _arrearsShortPortion[m] ? amt : _arrearsShortPortion[m];
        _arrearsShortPortion[m] -= toShort;
        uint256 rest = amt - toShort + _payShort(m, toShort);
        if (rest > 0) _creditLosers(m, rest);
        record.repaid(m, amt);
        emit Repaid(m, amt);
    }

    /// @dev Pays `m`'s debts in other circles from up to `available` of this
    /// pot, oldest first. Returns what left this circle.
    function _payDebtsElsewhere(address m, uint256 available) internal returns (uint256 paid) {
        address[] memory circles = record.owedIn(m);
        for (uint256 i = 0; i < circles.length && i < MAX_DEBT_CIRCLES && available > paid; i++) {
            address c = circles[i];
            if (c == address(this)) continue;
            (,,, uint256 owed) = ICircle(c).placeOf(m);
            uint256 left = available - paid;
            uint256 amt = owed < left ? owed : left;
            if (amt == 0) continue;
            ausd.forceApprove(c, amt);
            // a circle that can't take it must not stop this round closing
            try ICircle(c).repayFor(m, amt) returns (uint256 got) {
                paid += got;
                emit DebtPaidElsewhere(m, c, got);
            } catch { }
            ausd.forceApprove(c, 0);
        }
    }

    /// @dev A default shortens every pot from its round on, so those rounds'
    /// recipients share it; with none left to pay, every other member does.
    function _creditLosers(address m, uint256 amt) internal {
        uint8 n = _rules.memberCount;
        uint32 from = _defaultRound[m];
        address[] memory to = new address[](n);
        uint256 k = 0;
        if (from != 0) {
            for (uint32 r = from; r <= n; r++) {
                address x = _recipientOf[r];
                if (x != address(0) && x != m && _standingOf[x] != Standing.Defaulted) to[k++] = x;
            }
        }
        if (k == 0) {
            for (uint8 s = 0; s < n; s++) {
                address x = _memberAt[s];
                if (x != m && _standingOf[x] != Standing.Defaulted) to[k++] = x;
            }
        }
        if (k == 0) {
            // after settlement the pool is never split again: keep it theirs
            if (_settled) _creditOf[m] += amt;
            else pool += amt;
            return;
        }
        uint256 per = amt / k;
        for (uint256 i = 0; i < k; i++) {
            uint256 x = per + (i == 0 ? amt - per * k : 0);
            _creditOf[to[i]] += x;
            emit ArrearsCredited(m, to[i], x);
        }
    }

    /// @dev The best-placed member of `st` who hasn't had a pot (and, if Good,
    /// has paid this round): stage first, then seat.
    function _firstInOrder(uint32 round, Standing st) internal view returns (address best) {
        uint256 bestRank = 0;
        uint8 n = _rules.memberCount;
        for (uint8 s = 0; s < n; s++) {
            address m = _memberAt[s];
            if (_standingOf[m] != st || _receivedOf[m]) continue;
            if (st == Standing.Good && !_paidRound[round][m]) continue;
            uint256 r = _rank(m, s) + 1;
            if (r > bestRank) {
                bestRank = r;
                best = m;
            }
        }
    }

    /// @dev Sets the winner's holdback: the circle's own rule, or more when
    /// what they'd still owe after the pot, beyond their deposit, would pass
    /// their stage's limit (FR-TRU-13/14). Never more than the pot has left.
    function _holdbackFor(address winner, uint32 round, uint256 available) internal returns (uint256 h) {
        uint256 c = _rules.contribution;
        uint256 left = _rules.memberCount - round;
        h = (c * left * _rules.holdbackBps) / 10_000;
        uint8 lim = _seat[winner].limitMonths;
        if (lim != 255) {
            uint256 owed = c * left;
            uint256 cover = vault.balanceOf(address(this), winner, IStakeVault.Kind.Stake) + c * lim;
            if (owed > cover && owed - cover > h) h = owed - cover;
        }
        if (h > available) h = available;
        // released evenly over the rounds still to pay
        uint256 per = (c * _rules.holdbackBps) / 10_000;
        uint256 even = (h + left - 1) / left;
        if (even > per) per = even;
        if (per > c) per = c;
        _holdbackPerPayment[winner] = per;
        _holdbackRemaining[winner] = h;
    }

    /// @dev Takes collateral into the circle. If redemption fees have eaten
    /// the last of the circle's collateral, the pool covers what the vault
    /// could not pay (SRS 7.7: fees fall on yield, then the pool), and what
    /// the pool can't cover is lost to the member whose ledger it was.
    function _take(address m, IStakeVault.Kind kind, uint256 amount) internal returns (uint256 got) {
        got = vault.take(m, kind, amount, address(this));
        if (got < amount) {
            uint256 fromPool = pool < amount - got ? pool : amount - got;
            pool -= fromPool;
            got += fromPool;
        }
    }

    /// @dev Yield per seat: pro rata to remaining stake, or equally among
    /// members who did not default when no stake remains. Rounding dust goes
    /// to the lowest seat that receives any.
    function _yieldSplit(uint256 y) internal view returns (uint256[] memory out) {
        uint8 n = _rules.memberCount;
        out = new uint256[](n);
        uint256[] memory w = new uint256[](n);
        uint256 total = 0;
        for (uint8 s = 0; s < n; s++) {
            w[s] = vault.balanceOf(address(this), _memberAt[s], IStakeVault.Kind.Stake);
            total += w[s];
        }
        if (total == 0) {
            for (uint8 s = 0; s < n; s++) {
                w[s] = _standingOf[_memberAt[s]] == Standing.Defaulted ? 0 : 1;
                total += w[s];
            }
        }
        if (total == 0) return out;
        uint256 given = 0;
        uint8 first = n;
        for (uint8 s = 0; s < n; s++) {
            if (w[s] == 0) continue;
            if (first == n) first = s;
            out[s] = (y * w[s]) / total;
            given += out[s];
        }
        out[first] += y - given;
    }

    /// @dev A shortfall of `d` written down pro rata across stakes; rounding
    /// and anything stakes can't absorb come off the lowest seats first,
    /// stakes then holdbacks. `d` never exceeds the ledger, so it all lands.
    function _writeDownSplit(uint256 d) internal view returns (uint256[] memory st, uint256[] memory hb) {
        uint8 n = _rules.memberCount;
        st = new uint256[](n);
        hb = new uint256[](n);
        uint256[] memory bal = new uint256[](n);
        uint256 total = 0;
        for (uint8 s = 0; s < n; s++) {
            bal[s] = vault.balanceOf(address(this), _memberAt[s], IStakeVault.Kind.Stake);
            total += bal[s];
        }
        uint256 left = d;
        if (total > 0) {
            uint256 base = d < total ? d : total;
            for (uint8 s = 0; s < n; s++) {
                st[s] = (base * bal[s]) / total;
                left -= st[s];
            }
        }
        for (uint8 s = 0; s < n && left > 0; s++) {
            uint256 room = bal[s] - st[s];
            uint256 x = room < left ? room : left;
            st[s] += x;
            left -= x;
        }
        for (uint8 s = 0; s < n && left > 0; s++) {
            uint256 room = vault.balanceOf(address(this), _memberAt[s], IStakeVault.Kind.Holdback);
            uint256 x = room < left ? room : left;
            hb[s] = x;
            left -= x;
        }
    }

    // ------------------------------------------------------------- views

    function rules() external view returns (Rules memory) {
        return _rules;
    }

    function state() external view returns (State) {
        return _state;
    }

    function currentRound() external view returns (uint32) {
        return _currentRound;
    }

    /// @notice A round's due time. A round only opens when the one before it
    /// closes, so if that close came late, the round gets a full commit window
    /// from when it opened instead of a window that has already passed.
    function dueTime(uint32 round) public view returns (uint64) {
        uint64 scheduled = _rules.firstDue + uint64(round - 1) * _rules.period;
        if (round != _currentRound) return scheduled;
        uint64 fromOpen = _openedAt + _rules.commitWindow;
        return fromOpen > scheduled ? fromOpen : scheduled;
    }

    function amountDue(address member, uint32 round)
        external
        view
        returns (uint256 pay, uint256 creditUsed, uint256 holdbackReleased)
    {
        bool late = block.timestamp > dueTime(round);
        return _amountDue(member, late);
    }

    function standingOf(address member)
        external
        view
        returns (Standing standing, bool received, uint256 arrears, uint256 credit)
    {
        return (_standingOf[member], _receivedOf[member], _arrearsOf[member], _creditOf[member]);
    }

    function memberAt(uint8 seat) external view returns (address) {
        return _memberAt[seat];
    }

    function inviteSignerAt(uint8 seat) external view returns (address) {
        return _inviteSignerAt[seat];
    }

    function commitmentOf(uint32 round, address member) external view returns (bytes32) {
        return _commitmentOf[round][member];
    }

    function paidRound(uint32 round, address member) external view returns (bool) {
        return _paidRound[round][member];
    }

    function recipientOf(uint32 round) external view returns (address) {
        return _recipientOf[round];
    }

    function revealedBid(uint32 round, address member) external view returns (bool revealed, uint16 discountBps) {
        return (_hasRevealed[round][member], _revealedBps[round][member]);
    }

    function placeOf(address member)
        external
        view
        returns (IKittyRecord.Stage stage, uint8 limitMonths, uint8 offerFrom, uint256 owed)
    {
        Seat memory st = _seat[member];
        return (st.stage, st.limitMonths, st.offerFrom, _owed[member]);
    }

    function withdrawable(address member) external view returns (uint256) {
        if (_seatIndexPlusOne[member] == 0) return 0;
        if (_state == State.Cancelled) return vault.balanceOf(address(this), member, IStakeVault.Kind.Stake);
        if (_state != State.Completed) return 0;
        uint256 stakeBal = vault.balanceOf(address(this), member, IStakeVault.Kind.Stake);
        uint256 hbBal = vault.balanceOf(address(this), member, IStakeVault.Kind.Holdback);
        if (_settled) {
            return stakeBal + hbBal + vault.balanceOf(address(this), member, IStakeVault.Kind.Pool) + _creditOf[member]
                + _finalPoolShare[member];
        }
        // before the first withdraw settles the circle, preview what
        // settlement will do, in its order: defaulted credits forfeit into
        // the pool; then yield is split, or fees come off the pool and then
        // stakes; then the pool splits equally, remainder to the lowest
        // non-defaulted seat
        uint8 n = _rules.memberCount;
        uint256 pool_ = pool;
        uint256 numGood = 0;
        address firstGood = address(0);
        for (uint8 s = 0; s < n; s++) {
            address m = _memberAt[s];
            if (_standingOf[m] == Standing.Defaulted) {
                pool_ += _creditOf[m];
            } else {
                if (firstGood == address(0)) firstGood = m;
                numGood++;
            }
        }
        uint8 seat = _seatIndexPlusOne[member] - 1;
        (uint256 assets, uint256 principal) = vault.previewSettle(address(this));
        if (assets > principal) {
            stakeBal += _yieldSplit(assets - principal)[seat];
        } else if (assets < principal) {
            uint256 d = principal - assets;
            uint256 fromPool = pool_ < d ? pool_ : d;
            pool_ -= fromPool;
            if (d > fromPool) {
                (uint256[] memory st, uint256[] memory hb) = _writeDownSplit(d - fromPool);
                stakeBal -= st[seat];
                hbBal -= hb[seat];
            }
        }
        if (_standingOf[member] == Standing.Defaulted) return stakeBal + hbBal;
        uint256 share = pool_ / numGood + (member == firstGood ? pool_ % numGood : 0);
        return stakeBal + hbBal + _creditOf[member] + share;
    }
}
