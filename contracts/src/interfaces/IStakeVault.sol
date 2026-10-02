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
    /// @dev Lowers the ledger by `amount` and pays out as much of it as the
    /// circle's position still holds: all of it, unless redemption fees have
    /// eaten the last of the circle's collateral. The circle covers the rest.
    function take(address member, Kind kind, uint256 amount, address to) external returns (uint256 paid); // circle only
    function rebalance() external; // circle only: collateral above the liquid buffer goes to the yield adapter
    function settle() external returns (uint256 assets, uint256 principal); // circle only
    function topUp(uint256 amount) external; // circle only, after settle: the pool covering a fee shortfall
    function writeDown(address member, Kind kind, uint256 amount) external; // circle only, after settle
    function allocate(address member, Kind kind, uint256 amount) external; // circle only, after settle: yield to a member
    function balanceOf(address circle, address member, Kind kind) external view returns (uint256);
    function previewSettle(address circle) external view returns (uint256 assets, uint256 principal);
    function positionOf(address circle)
        external
        view
        returns (uint256 principal, uint256 liquid, uint256 invested, bool earning);

    event Deposited(address indexed circle, address indexed member, Kind kind, uint256 amount);
    event Taken(address indexed circle, address indexed member, Kind kind, uint256 amount, address to);
    event Invested(address indexed circle, uint256 assets, uint256 shares);
    event Redeemed(address indexed circle, uint256 shares, uint256 assets);
    event Settled(address indexed circle, uint256 principal, uint256 assets, uint256 fees);
    event ToppedUp(address indexed circle, uint256 amount);
    event WrittenDown(address indexed circle, address indexed member, Kind kind, uint256 amount);
    event Allocated(address indexed circle, address indexed member, Kind kind, uint256 amount);
}
