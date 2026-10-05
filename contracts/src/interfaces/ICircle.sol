// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

import { Rules } from "./ICircleFactory.sol";
import { IKittyRecord } from "./IKittyRecord.sol";

/// @notice One rotating-savings circle: seats, stakes, contributions, sealed
/// bids, payouts, credits, covers, defaults, completion. See SRS section 7.
interface ICircle {
    enum State {
        Forming,
        Active,
        Completed,
        Cancelled
    }
    enum Standing {
        None,
        Good,
        Behind,
        Defaulted
    }

    error WrongState();
    error NotMember();
    error SeatTaken();
    error BadInvite();
    error JoinClosed();
    error WrongRound();
    error TooEarly();
    error TooLate();
    error AlreadyPaid();
    error NotEligible();
    error BiddingOff();
    error BidTooHigh();
    error BadReveal();
    error AutopayOff();
    error NothingToWithdraw();
    error Owing(); // an unpaid debt in the record: Away can't join
    error TooManyCircles(); // the stage's circles-at-once limit

    function join(uint8 seat, bytes calldata inviteSig) external; // seat 0: the organizer, empty signature
    function reissueInvite(uint8 seat, address signer) external; // organizer, while forming, seat empty
    function cancel() external;
    function contribute(uint32 round) external;
    function setAutopay(bool on) external;
    function collect(address member, uint32 round) external; // anyone, inside the autopay window
    function payArrears() external;
    function commitBid(uint32 round, bytes32 commitment) external; // may be replaced until due(r)
    function revealBid(uint32 round, uint16 discountBps, bytes32 salt) external; // current round only
    function closeRound(uint32 round) external; // anyone, from due(r) + grace
    function withdraw() external; // Completed or Cancelled
    function recordFinish(address member) external; // anyone, once Completed
    function repay() external; // pays back a default's loss
    function repayFor(address member, uint256 max) external returns (uint256 paid);

    function rules() external view returns (Rules memory);
    function state() external view returns (State);
    function currentRound() external view returns (uint32);
    function dueTime(uint32 round) external view returns (uint64);
    function amountDue(address member, uint32 round)
        external
        view
        returns (uint256 pay, uint256 creditUsed, uint256 holdbackReleased);
    function standingOf(address member)
        external
        view
        returns (Standing standing, bool received, uint256 arrears, uint256 credit);
    function memberAt(uint8 seat) external view returns (address);
    function inviteSignerAt(uint8 seat) external view returns (address);
    function commitmentOf(uint32 round, address member) external view returns (bytes32);
    function withdrawable(address member) external view returns (uint256);
    // App reads (the testnet RPC caps eth_getLogs at 100 blocks, so a phone
    // cannot rebuild these from events)
    function paidRound(uint32 round, address member) external view returns (bool);
    function recipientOf(uint32 round) external view returns (address); // zero if nobody was paid
    function revealedBid(uint32 round, address member) external view returns (bool revealed, uint16 discountBps);
    // terms fixed at join, and what this member's default still owes the circle
    function placeOf(address member)
        external
        view
        returns (IKittyRecord.Stage stage, uint8 limitMonths, uint8 offerFrom, uint256 owed);

    event Joined(address indexed member, uint8 indexed seat, uint256 stake);
    event InviteReissued(uint8 indexed seat, address signer);
    event Activated(uint64 firstDue);
    event Cancelled(uint64 at);
    event Contributed(
        address indexed member,
        uint32 indexed round,
        uint256 paid,
        uint256 creditUsed,
        uint256 holdbackReleased,
        bool late,
        bool autopay
    );
    event AutopaySet(address indexed member, bool on);
    event ArrearsPaid(address indexed member, uint256 amount);
    event BidCommitted(address indexed member, uint32 indexed round, bytes32 commitment);
    event BidRevealed(address indexed member, uint32 indexed round, uint16 discountBps);
    event Covered(address indexed member, uint32 indexed round, uint256 fromStake, uint256 fromPool, uint256 shortfall);
    event Defaulted(
        address indexed member,
        uint32 indexed round,
        uint256 obligation,
        uint256 fromStake,
        uint256 fromHoldback,
        uint256 fromPool,
        uint256 shortfall
    );
    event DefaultFilled(address indexed member, uint32 indexed round, uint256 filled, uint256 shortfall);
    event PotPaid(
        address indexed recipient,
        uint32 indexed round,
        uint256 gross,
        uint256 paid,
        uint256 discount,
        uint256 holdback,
        uint256 arrearsRepaid
    );
    event CreditsIssued(uint32 indexed round, uint256 perMember, uint8 members, uint256 toPool);
    event RoundClosed(uint32 indexed round, address indexed closer);
    event Completed(uint64 at);
    event Withdrawn(address indexed member, uint256 amount);
    event Placed(address indexed member, IKittyRecord.Stage stage);
    event Repaid(address indexed member, uint256 amount);
    event DebtPaidElsewhere(address indexed member, address indexed circle, uint256 amount);
    // FR-TRU-17: what a member's miss or default kept from `to`, paid back as credit
    event ArrearsCredited(address indexed from, address indexed to, uint256 amount);
}
