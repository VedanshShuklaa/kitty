// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

/// @notice Per-circle ledgers of stake, holdback and pool collateral. Only a
/// registered circle may move its own ledger (FR-VLT-01).
interface IStakeVault {
    enum Kind {
        Stake,
        Holdback,
        Pool
    }

    error NotRegisteredCircle();

    function registerCircle(address circle) external;
    function deposit(address member, Kind kind, uint256 amount) external; // circle only
    function take(address member, Kind kind, uint256 amount, address to) external; // circle only
    function settle() external returns (uint256 assets, uint256 principal); // circle only
    function balanceOf(address circle, address member, Kind kind) external view returns (uint256);

    event Deposited(address indexed circle, address indexed member, Kind kind, uint256 amount);
    event Taken(address indexed circle, address indexed member, Kind kind, uint256 amount, address to);
    event Settled(address indexed circle, uint256 principal, uint256 assets, uint256 fees);
}
