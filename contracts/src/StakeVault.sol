// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { IStakeVault } from "./interfaces/IStakeVault.sol";

/// @notice Holds every circle's stakes, holdbacks and cover pools under a
/// per-circle ledger. No yield adapter is wired in C1 (FR-VLT-02 lands in
/// C3); tokens simply sit here 1:1 until then. Only a registered circle can
/// move its own ledger (FR-VLT-01); the vault has no power over balances.
contract StakeVault is IStakeVault, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    error InsufficientBalance();
    error AlreadySettled();
    error NotFactory();

    IERC20 public immutable ausd;
    address public factory;

    mapping(address circle => bool) public isRegistered;
    mapping(address circle => mapping(address member => mapping(Kind kind => uint256))) private _balances;
    mapping(address circle => bool) public isSettled;

    constructor(IERC20 ausd_, address owner_) Ownable(owner_) {
        ausd = ausd_;
    }

    /// @dev One-time wiring: the factory address is not known at vault
    /// construction, since the factory itself takes the vault's address.
    function setFactory(address factory_) external onlyOwner {
        factory = factory_;
    }

    modifier onlyRegisteredCircle() {
        if (!isRegistered[msg.sender]) revert NotRegisteredCircle();
        _;
    }

    function registerCircle(address circle) external {
        if (msg.sender != factory) revert NotFactory();
        isRegistered[circle] = true;
    }

    /// @dev The circle must already have moved `amount` of AUSD to this
    /// vault (e.g. via `ausd.safeTransferFrom(member, address(vault), amount)`)
    /// before calling; this only updates the ledger.
    function deposit(address member, Kind kind, uint256 amount) external onlyRegisteredCircle {
        _balances[msg.sender][member][kind] += amount;
        emit Deposited(msg.sender, member, kind, amount);
    }

    function take(address member, Kind kind, uint256 amount, address to) external onlyRegisteredCircle nonReentrant {
        uint256 bal = _balances[msg.sender][member][kind];
        if (bal < amount) revert InsufficientBalance();
        unchecked {
            _balances[msg.sender][member][kind] = bal - amount;
        }
        emit Taken(msg.sender, member, kind, amount, to);
        ausd.safeTransfer(to, amount);
    }

    /// @dev No yield adapter exists yet, so settling is a one-time no-op
    /// per circle: assets always equal principal until C3 wires an adapter.
    function settle() external onlyRegisteredCircle returns (uint256 assets, uint256 principal) {
        if (isSettled[msg.sender]) revert AlreadySettled();
        isSettled[msg.sender] = true;
        emit Settled(msg.sender, 0, 0, 0);
        return (0, 0);
    }

    function balanceOf(address circle, address member, Kind kind) external view returns (uint256) {
        return _balances[circle][member][kind];
    }
}
