// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

/// @notice Circle creation rules, locked immutably at creation. Bounds checked
/// in CircleFactory.createCircle per SRS section 7.2.
struct Rules {
    uint8 memberCount; // 2..12; seat 0 is the organizer
    uint16 stakeBps; // stake = contribution * stakeBps / 10_000       (default 10_000)
    uint16 maxBidBps; // 0 turns bidding off; at most 5_000              (default 3_000)
    uint16 poolShareBps; // share of a winning discount kept in the pool    (default 1_000)
    uint16 holdbackBps; // 0..5_000                                        (default 2_000)
    bool yieldOn; // collateral goes to the yield adapter
    uint64 contribution; // AUSD units, 6 decimals; at least 1_000000
    uint64 firstDue; // unix seconds; due time of round 1
    uint32 period; // seconds between due times; at least factory.minPeriod()
    uint32 commitWindow; // seconds before each due time when bids can be committed
    uint32 revealWindow; // seconds after each due time when bids can be revealed
    uint32 grace; // seconds after a due time that payments are still accepted
    uint64 joinDeadline; // unix seconds
}

interface ICircleFactory {
    event CircleCreated(address indexed circle, address indexed organizer, Rules rules, address[] inviteSigners);

    error BadRules();

    function createCircle(Rules calldata rules, address[] calldata inviteSigners) external returns (address circle);
    function predictCircle(address organizer) external view returns (address);
    function isCircle(address) external view returns (bool);
    function minPeriod() external view returns (uint32);
    function ausd() external view returns (address);
    function vault() external view returns (address);
}
