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

/// @notice One rotating-savings circle, deployed as an EIP-1167 clone by
/// CircleFactory. Implements SRS section 7.7 in full: contributions, sealed
/// bids, ordered payouts, holdback release, covers and defaults. No
/// privileged power moves a member's money outside these rules (NFR-SEC-01).
contract Circle is ICircle, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 private constant JOIN_TYPEHASH = keccak256("kitty.join.v1");

    bool private _initialized;
    address public factory;
    IERC20 public ausd;
    IStakeVault public vault;
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
    mapping(address => uint256) private _creditOf;
    mapping(address => bool) private _autopayOf;
    mapping(address => uint256) private _holdbackRemaining;
    mapping(address => uint256) private _holdbackPerPayment;
    mapping(address => uint256) private _finalPoolShare;

    mapping(uint32 => mapping(address => bool)) private _paidRound;
    mapping(uint32 => mapping(address => bytes32)) private _commitmentOf;
    mapping(uint32 => mapping(address => bool)) private _hasRevealed;
    mapping(uint32 => mapping(address => uint16)) private _revealedBps;

    mapping(address => uint256) private _fillPerRound;
    mapping(address => uint256) private _fillRemainder;
    mapping(address => bool) private _defaultFillPending;

    modifier onlyMember() {
        if (_seatIndexPlusOne[msg.sender] == 0) revert NotMember();
        _;
    }

    function initialize(
        Rules calldata r,
        address[] calldata inviteSigners_,
        IERC20 ausd_,
        IStakeVault vault_,
        address organizer_,
        address factory_
    ) external {
        if (_initialized) revert WrongState();
        _initialized = true;
        _rules = r;
        ausd = ausd_;
        vault = vault_;
        organizer = organizer_;
        factory = factory_;
        for (uint8 i = 0; i < r.memberCount; i++) {
            _inviteSignerAt[i] = inviteSigners_[i];
        }
    }

    // ---------------------------------------------------------------- join

    function join(uint8 seat, bytes calldata inviteSig) external nonReentrant {
        if (_state != State.Forming) revert WrongState();
        if (block.timestamp >= _rules.joinDeadline) revert JoinClosed();
        if (seat >= _rules.memberCount) revert BadInvite();
        if (_memberAt[seat] != address(0)) revert SeatTaken();

        if (seat == 0) {
            if (msg.sender != organizer) revert BadInvite();
        } else {
            bytes32 digest = keccak256(abi.encode(JOIN_TYPEHASH, block.chainid, address(this), seat, msg.sender));
            address signer = ECDSA.recover(MessageHashUtils.toEthSignedMessageHash(digest), inviteSig);
            if (signer != _inviteSignerAt[seat]) revert BadInvite();
        }

        uint256 stake = (uint256(_rules.contribution) * _rules.stakeBps) / 10_000;
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
            vault.take(member, IStakeVault.Kind.Holdback, holdbackReleased, address(this));
            _holdbackRemaining[member] -= holdbackReleased;
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

    function payArrears() external onlyMember nonReentrant {
        uint256 amt = _arrearsOf[msg.sender];
        if (amt == 0) revert NothingToWithdraw();
        _arrearsOf[msg.sender] = 0;
        ausd.safeTransferFrom(msg.sender, address(vault), amt);
        vault.deposit(msg.sender, IStakeVault.Kind.Stake, amt);
        if (_standingOf[msg.sender] == Standing.Behind) _standingOf[msg.sender] = Standing.Good;
        emit ArrearsPaid(msg.sender, amt);
    }

    // --------------------------------------------------------------- bids

    function commitBid(uint32 round, bytes32 commitment) external onlyMember {
        if (_state != State.Active || round != _currentRound) revert WrongRound();
        if (_rules.maxBidBps == 0) revert BiddingOff();
        if (_standingOf[msg.sender] != Standing.Good || _receivedOf[msg.sender]) revert NotEligible();
        uint64 due_ = dueTime(round);
        if (block.timestamp < due_ - _rules.commitWindow) revert TooEarly();
        if (block.timestamp >= due_) revert TooLate();
        _commitmentOf[round][msg.sender] = commitment;
        emit BidCommitted(msg.sender, round, commitment);
    }

    function revealBid(uint32 round, uint16 discountBps, bytes32 salt) external onlyMember {
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
                if (fromStake > 0) vault.take(m, IStakeVault.Kind.Stake, fromStake, address(this));
                uint256 remaining = _rules.contribution - fromStake;
                uint256 fromPool = pool < remaining ? pool : remaining;
                pool -= fromPool;
                uint256 shortfall = remaining - fromPool;
                pot += fromStake + fromPool;
                _arrearsOf[m] += fromStake + fromPool;
                _standingOf[m] = Standing.Behind;
                _paidRound[round][m] = true;
                emit Covered(m, round, fromStake, fromPool, shortfall);
            } else {
                uint256 left = n - round + 1;
                uint256 obligation = uint256(_rules.contribution) * left;

                uint256 stakeBal = vault.balanceOf(address(this), m, IStakeVault.Kind.Stake);
                uint256 fromStake = stakeBal < obligation ? stakeBal : obligation;
                if (fromStake > 0) vault.take(m, IStakeVault.Kind.Stake, fromStake, address(this));
                uint256 rem = obligation - fromStake;

                uint256 hbBal = _holdbackRemaining[m];
                uint256 fromHoldback = hbBal < rem ? hbBal : rem;
                if (fromHoldback > 0) {
                    vault.take(m, IStakeVault.Kind.Holdback, fromHoldback, address(this));
                    _holdbackRemaining[m] -= fromHoldback;
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
        emit CreditsIssued(round, perMember, uint8(k), toPool + dust);

        uint256 holdbackAmt = 0;
        if (winner != address(0) && round < n) {
            holdbackAmt = (uint256(_rules.contribution) * (n - round) * _rules.holdbackBps) / 10_000;
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
                _arrearsOf[winner] -= arrearsRepaid;
                ausd.safeTransfer(address(vault), arrearsRepaid);
                vault.deposit(winner, IStakeVault.Kind.Stake, arrearsRepaid);
            }
        }

        if (winner != address(0)) {
            uint256 paid = gross - discount - holdbackAmt - arrearsRepaid;
            _receivedOf[winner] = true;
            if (paid > 0) ausd.safeTransfer(winner, paid);
            emit PotPaid(winner, round, gross, paid, discount, holdbackAmt, arrearsRepaid);
        }

        emit RoundClosed(round, msg.sender);
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
            vault.take(msg.sender, IStakeVault.Kind.Stake, stakeBal, msg.sender);
            emit Withdrawn(msg.sender, stakeBal);
            return;
        }
        if (_state != State.Completed) revert WrongState();

        if (!_settled) {
            vault.settle();
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
        uint256 creditAmt = _creditOf[msg.sender];
        uint256 poolShare = _finalPoolShare[msg.sender];

        uint256 total = stakeBal_ + hbBal + creditAmt + poolShare;
        if (total == 0) revert NothingToWithdraw();

        if (stakeBal_ > 0) vault.take(msg.sender, IStakeVault.Kind.Stake, stakeBal_, msg.sender);
        if (hbBal > 0) {
            vault.take(msg.sender, IStakeVault.Kind.Holdback, hbBal, msg.sender);
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

    function withdrawable(address member) external view returns (uint256) {
        if (_seatIndexPlusOne[member] == 0) return 0;
        if (_state == State.Cancelled) return vault.balanceOf(address(this), member, IStakeVault.Kind.Stake);
        if (_state != State.Completed) return 0;
        uint256 stakeBal = vault.balanceOf(address(this), member, IStakeVault.Kind.Stake);
        uint256 hbBal = vault.balanceOf(address(this), member, IStakeVault.Kind.Holdback);
        return stakeBal + hbBal + _creditOf[member] + _finalPoolShare[member];
    }
}
