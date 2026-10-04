// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { MessageHashUtils } from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { ICircle } from "./interfaces/ICircle.sol";
import { ICircleFactory, Rules } from "./interfaces/ICircleFactory.sol";
import { IStakeVault } from "./interfaces/IStakeVault.sol";

/// @notice One rotating-savings circle, deployed as an EIP-1167 clone by
/// CircleFactory. Implements SRS section 7.7 in full: contributions, sealed
/// bids, ordered payouts, holdback release, covers and defaults. No
/// privileged power moves a member's money outside these rules (NFR-SEC-01).
contract Circle is ICircle, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 private constant JOIN_TYPEHASH = keccak256("kitty.join.v1");
    bytes32 private constant TIER_TYPEHASH = keccak256("kitty.tier.v1");
    uint16 private constant STAKE_FLOOR_BPS = 5_000; // the factory's own lower bound

    bool private _initialized;
    // Every clone of a given CircleFactory shares the same factory, AUSD and
    // vault addresses, so these live in the shared implementation's runtime
    // bytecode as immutables instead of a per-clone SSTORE in initialize()
    // (TC-1-16, SRS 7.10's createCircle gas budget).
    address public immutable factory;
    IERC20 public immutable ausd;
    IStakeVault public immutable vault;
    address public organizer;

    Rules private _rules;
    State private _state;
    uint32 private _currentRound;
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

    modifier onlyMember() {
        if (_seatIndexPlusOne[msg.sender] == 0) revert NotMember();
        _;
    }

    constructor(IERC20 ausd_, IStakeVault vault_, address factory_) {
        ausd = ausd_;
        vault = vault_;
        factory = factory_;
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
        _join(seat, inviteSig, _rules.stakeBps);
    }

    function join(uint8 seat, bytes calldata inviteSig, bytes calldata tierAttestation) external nonReentrant {
        if (tierAttestation.length == 0) return _join(seat, inviteSig, _rules.stakeBps);
        uint16 stakeBps = _attestedStakeBps(tierAttestation);
        _join(seat, inviteSig, stakeBps);
        emit StakeDiscounted(msg.sender, stakeBps);
    }

    /// SRS 7.11: the attestation carries a share of this circle's own stake.
    /// It can never raise a stake or take it below the factory's floor.
    function _attestedStakeBps(bytes calldata a) internal view returns (uint16) {
        if (!_rules.tierDiscountOn) revert BadAttestation();
        (uint16 tierBps, uint64 expiry, bytes memory sig) = abi.decode(a, (uint16, uint64, bytes));
        if (expiry <= block.timestamp) revert BadAttestation();
        if (tierBps < STAKE_FLOOR_BPS || tierBps > 10_000) revert BadAttestation();
        bytes32 digest = keccak256(abi.encode(TIER_TYPEHASH, block.chainid, factory, msg.sender, tierBps, expiry));
        (address signer, ECDSA.RecoverError err,) =
            ECDSA.tryRecover(MessageHashUtils.toEthSignedMessageHash(digest), sig);
        address attestor = ICircleFactory(factory).tierAttestor();
        if (err != ECDSA.RecoverError.NoError || attestor == address(0) || signer != attestor) {
            revert BadAttestation();
        }
        uint256 bps = (uint256(_rules.stakeBps) * tierBps) / 10_000;
        return bps < STAKE_FLOOR_BPS ? STAKE_FLOOR_BPS : uint16(bps);
    }

    function _join(uint8 seat, bytes calldata inviteSig, uint16 stakeBps) internal {
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

        uint256 stake = (uint256(_rules.contribution) * stakeBps) / 10_000;
        _memberAt[seat] = msg.sender;
        _seatIndexPlusOne[msg.sender] = seat + 1;
        filledSeats += 1;
        _standingOf[msg.sender] = Standing.Good;

        if (stake > 0) {
            ausd.safeTransferFrom(msg.sender, address(vault), stake);
            vault.deposit(msg.sender, IStakeVault.Kind.Stake, stake);
        }
        emit Joined(msg.sender, seat, stake);

        if (filledSeats == _rules.memberCount) {
            _state = State.Active;
            _currentRound = 1;
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
        if (block.timestamp > due_ + _rules.grace) revert TooLate();
        bool late = block.timestamp > due_;

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
        emit ArrearsPaid(msg.sender, amt);
    }

    /// @dev SRS 7.7: a repayment restores the member's own stake first (the
    /// part their miss drew from it), then whatever remains replenishes the
    /// shared pool (the part their miss drew from there).
    function _restoreArrears(address m, uint256 repayAmt) internal returns (uint256 stakeRestore, uint256 poolRestore) {
        uint256 poolOutstanding = _arrearsPoolPortion[m];
        uint256 stakeOutstanding = _arrearsOf[m] - poolOutstanding;
        stakeRestore = repayAmt < stakeOutstanding ? repayAmt : stakeOutstanding;
        poolRestore = repayAmt - stakeRestore;
        _arrearsOf[m] -= repayAmt;
        _arrearsPoolPortion[m] -= poolRestore;
    }

    // --------------------------------------------------------------- bids

    function commitBid(uint32 round, bytes32 commitment) external onlyMember {
        if (_state != State.Active || round != _currentRound) revert WrongRound();
        if (_rules.maxBidBps == 0) revert BiddingOff();
        if (_standingOf[msg.sender] != Standing.Good || _receivedOf[msg.sender]) revert NotEligible();
        if (_eligibleBidderCount() < 2) revert NotEligible();
        uint64 due_ = dueTime(round);
        if (block.timestamp < due_ - _rules.commitWindow) revert TooEarly();
        if (block.timestamp >= due_) revert TooLate();
        _commitmentOf[round][msg.sender] = commitment;
        emit BidCommitted(msg.sender, round, commitment);
    }

    /// @dev FR-BID-07: with one eligible bidder left, bidding is pointless --
    /// the no-bid seat-order fallback already picks them.
    function _eligibleBidderCount() internal view returns (uint8 count) {
        uint8 n = _rules.memberCount;
        for (uint8 s = 0; s < n; s++) {
            address m = _memberAt[s];
            if (_standingOf[m] == Standing.Good && !_receivedOf[m]) count++;
        }
    }

    function revealBid(uint32 round, uint16 discountBps, bytes32 salt) external onlyMember {
        if (_state != State.Active || round != _currentRound) revert WrongRound();
        uint64 due_ = dueTime(round);
        if (block.timestamp < due_) revert TooEarly();
        if (block.timestamp > due_ + _rules.revealWindow) revert TooLate();
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
                _arrearsOf[m] += fromStake + fromPool;
                _arrearsPoolPortion[m] += fromPool;
                _standingOf[m] = Standing.Behind;
                _paidRound[round][m] = true;
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
            if (_hasRevealed[round][m]) {
                uint16 bps = _revealedBps[round][m];
                if (!foundBid || bps > bestBps) {
                    winner = m;
                    bestBps = bps;
                    foundBid = true;
                }
            }
        }
        if (!foundBid) {
            for (uint8 s = 0; s < n; s++) {
                address m = _memberAt[s];
                if (_standingOf[m] == Standing.Good && !_receivedOf[m] && _paidRound[round][m]) {
                    winner = m;
                    break;
                }
            }
        }
        if (winner == address(0)) {
            for (uint8 s = 0; s < n; s++) {
                address m = _memberAt[s];
                if (_standingOf[m] == Standing.Behind && !_receivedOf[m]) {
                    winner = m;
                    break;
                }
            }
        }

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

        uint256 holdbackAmt = 0;
        if (winner != address(0) && round < n) {
            holdbackAmt = (uint256(_rules.contribution) * (n - round) * _rules.holdbackBps) / 10_000;
            // SRS 7.7 assumes the pot covers the holdback; after heavy
            // misses and a winning bid it may not, so withhold what's there
            if (holdbackAmt > gross - discount) holdbackAmt = gross - discount;
            _holdbackPerPayment[winner] = (uint256(_rules.contribution) * _rules.holdbackBps) / 10_000;
            _holdbackRemaining[winner] = holdbackAmt;
            if (holdbackAmt > 0) {
                ausd.safeTransfer(address(vault), holdbackAmt);
                vault.deposit(winner, IStakeVault.Kind.Holdback, holdbackAmt);
            }
        }

        uint256 arrearsRepaid = 0;
        if (winner != address(0) && _standingOf[winner] == Standing.Behind) {
            uint256 available = gross - discount - holdbackAmt;
            arrearsRepaid = _arrearsOf[winner] < available ? _arrearsOf[winner] : available;
            if (arrearsRepaid > 0) {
                (uint256 stakeRestore, uint256 poolRestore) = _restoreArrears(winner, arrearsRepaid);
                if (stakeRestore > 0) {
                    ausd.safeTransfer(address(vault), stakeRestore);
                    vault.deposit(winner, IStakeVault.Kind.Stake, stakeRestore);
                }
                if (poolRestore > 0) pool += poolRestore;
                if (_arrearsOf[winner] == 0) _standingOf[winner] = Standing.Good;
            }
        }

        if (winner != address(0)) {
            uint256 paid = gross - discount - holdbackAmt - arrearsRepaid;
            _receivedOf[winner] = true;
            _recipientOf[round] = winner;
            if (paid > 0) ausd.safeTransfer(winner, paid);
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

    function dueTime(uint32 round) public view returns (uint64) {
        return _rules.firstDue + uint64(round - 1) * _rules.period;
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

    function withdrawable(address member) external view returns (uint256) {
        if (_seatIndexPlusOne[member] == 0) return 0;
        if (_state == State.Cancelled) return vault.balanceOf(address(this), member, IStakeVault.Kind.Stake);
        if (_state != State.Completed) return 0;
        uint256 stakeBal = vault.balanceOf(address(this), member, IStakeVault.Kind.Stake);
        uint256 hbBal = vault.balanceOf(address(this), member, IStakeVault.Kind.Holdback);
        if (_settled) {
            return stakeBal + hbBal + vault.balanceOf(address(this), member, IStakeVault.Kind.Pool)
                + _creditOf[member] + _finalPoolShare[member];
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
