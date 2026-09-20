// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

import { Rules } from "./ICircleFactory.sol";

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

    function join(uint8 seat, bytes calldata inviteSig) external; // seat 0: the organizer, empty signature
    function reissueInvite(uint8 seat, address signer) external; // organizer, while forming, seat empty
    function cancel() external;
    function contribute(uint32 round) external;
    function setAutopay(bool on) external;
    function collect(address member, uint32 round) external; // anyone, inside the autopay window
    function payArrears() external;
    function commitBid(uint32 round, bytes32 commitment) external; // may be replaced until due(r)
    function revealBid(uint32 round, uint16 discountBps, bytes32 salt) external;
    function closeRound(uint32 round) external; // anyone, from due(r) + grace
    function withdraw() external; // Completed or Cancelled

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
}
