// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { IStakeVault } from "./interfaces/IStakeVault.sol";
import { IYieldAdapter } from "./interfaces/IYieldAdapter.sol";
import { ICircle } from "./interfaces/ICircle.sol";

/// @notice Holds every circle's stakes, holdbacks and yield shares under a
/// per-circle ledger. Only a registered circle can move its own ledger
/// (FR-VLT-01); the vault has no power over balances.
///
/// Circles with `yieldOn` (SRS 15.7, testnet only) keep at least 30% of their
/// collateral liquid and place the rest in the yield adapter on each
/// `rebalance` (FR-VLT-02). A take larger than the liquid buffer redeems
/// instantly and pays in the same call (FR-VLT-04). `settle` redeems the rest;
/// the circle then splits any surplus with `allocate`, or covers a fee
/// shortfall with `topUp` and `writeDown` (SRS 7.7). Pots never come here
/// (FR-VLT-03): only collateral does.
contract StakeVault is IStakeVault, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    error InsufficientBalance();
    error AlreadySettled();
    error NotSettled();
    error NotFactory();
    error FactoryAlreadySet();

    uint256 public constant BUFFER_BPS = 3_000;

    IERC20 public immutable ausd;
    address public factory;
    IYieldAdapter public adapter;

    enum Mode {
        Unknown,
        Off,
        On
    }

    struct Position {
        uint256 principal; // sum of the circle's ledger balances
        uint256 liquid; // AUSD this vault holds for the circle
        uint256 shares; // adapter shares held for the circle
        Mode mode;
        bool settled;
    }

    mapping(address circle => bool) public isRegistered;
    mapping(address circle => mapping(address member => mapping(Kind kind => uint256))) private _balances;
    mapping(address circle => Position) private _pos;

    constructor(IERC20 ausd_, address owner_) Ownable(owner_) {
        ausd = ausd_;
    }

    /// @dev One-time wiring, before the factory: once circles exist, changing
    /// the adapter would move their collateral somewhere they never agreed to.
    function setAdapter(IYieldAdapter adapter_) external onlyOwner {
        if (factory != address(0) || address(adapter) != address(0)) revert FactoryAlreadySet();
        adapter = adapter_;
    }

    /// @dev One-time wiring: the factory address is not known at vault
    /// construction, since the factory itself takes the vault's address.
    /// Re-pointing it later would let the owner register a fake circle
    /// whose ledger is backed by every real circle's tokens.
    function setFactory(address factory_) external onlyOwner {
        if (factory != address(0)) revert FactoryAlreadySet();
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

    // ------------------------------------------------------------- ledger

    /// @dev The circle must already have moved `amount` of AUSD to this
    /// vault (e.g. via `ausd.safeTransferFrom(member, address(vault), amount)`)
    /// before calling; this only updates the ledger. The circle's yield mode
    /// is read here, on its first deposit, and not at creation: createCircle
    /// has no gas left for it (SRS 15.7).
    function deposit(address member, Kind kind, uint256 amount) external onlyRegisteredCircle {
        Position storage p = _pos[msg.sender];
        if (p.settled) revert AlreadySettled();
        if (p.mode == Mode.Unknown) {
            p.mode = (address(adapter) != address(0) && ICircle(msg.sender).rules().yieldOn) ? Mode.On : Mode.Off;
        }
        _balances[msg.sender][member][kind] += amount;
        p.principal += amount;
        p.liquid += amount;
        emit Deposited(msg.sender, member, kind, amount);
    }

    function take(address member, Kind kind, uint256 amount, address to)
        external
        nonReentrant
        onlyRegisteredCircle
        returns (uint256 paid)
    {
        uint256 bal = _balances[msg.sender][member][kind];
        if (bal < amount) revert InsufficientBalance();
        unchecked {
            _balances[msg.sender][member][kind] = bal - amount;
        }
        Position storage p = _pos[msg.sender];
        p.principal -= amount;
        if (p.liquid < amount && p.shares > 0) _redeemFor(msg.sender, p, amount);
        paid = p.liquid < amount ? p.liquid : amount;
        p.liquid -= paid;
        emit Taken(msg.sender, member, kind, paid, to);
        if (paid > 0) ausd.safeTransfer(to, paid);
    }

    /// @dev Redeems enough shares that `need` AUSD is liquid, or every share
    /// if that is not enough. The instant-redemption fee is absorbed by the
    /// circle's position: from yield while there is any, then from the pool.
    function _redeemFor(address circle, Position storage p, uint256 need) internal {
        uint256 shares = p.shares;
        uint256 short = need - p.liquid;
        uint256 value = adapter.previewInstantRedeem(shares);
        uint256 s = shares;
        if (value > short) {
            // round up, plus one share for the rounding inside the adapter
            s = (short * shares + value - 1) / value + 1;
            if (s > shares) s = shares;
        }
        uint256 got = adapter.instantRedeem(s, address(this));
        p.shares = shares - s;
        p.liquid += got;
        emit Redeemed(circle, s, got);
    }

    /// @notice Moves collateral above the 30% liquid buffer into the adapter.
    /// Never redeems: the buffer refills from deposits, and a take that
    /// outruns it redeems on demand.
    function rebalance() external nonReentrant onlyRegisteredCircle {
        Position storage p = _pos[msg.sender];
        if (p.mode != Mode.On || p.settled) return;
        uint256 keep = (p.principal * BUFFER_BPS + 9_999) / 10_000;
        if (p.liquid <= keep) return;
        uint256 amount = p.liquid - keep;
        p.liquid = keep;
        ausd.forceApprove(address(adapter), amount);
        uint256 shares = adapter.deposit(address(ausd), amount, address(this));
        p.shares += shares;
        emit Invested(msg.sender, amount, shares);
    }

    // --------------------------------------------------------- settlement

    /// @notice Redeems everything the circle holds in the adapter. Returns
    /// what the circle now has here (`assets`) against what its ledger owes
    /// (`principal`); the circle reconciles the difference.
    function settle() external nonReentrant onlyRegisteredCircle returns (uint256 assets, uint256 principal) {
        Position storage p = _pos[msg.sender];
        if (p.settled) revert AlreadySettled();
        p.settled = true;
        if (p.shares > 0) {
            uint256 s = p.shares;
            p.shares = 0;
            uint256 got = adapter.instantRedeem(s, address(this));
            p.liquid += got;
            emit Redeemed(msg.sender, s, got);
        }
        assets = p.liquid;
        principal = p.principal;
        emit Settled(msg.sender, principal, assets, assets < principal ? principal - assets : 0);
    }

    /// @notice After settle: the circle's pool covering a fee shortfall. The
    /// circle must already have moved `amount` of AUSD here.
    function topUp(uint256 amount) external onlyRegisteredCircle {
        Position storage p = _pos[msg.sender];
        if (!p.settled) revert NotSettled();
        p.liquid += amount;
        emit ToppedUp(msg.sender, amount);
    }

    /// @notice After settle: lowers a ledger balance the circle's assets can
    /// no longer back, once the pool has covered what it can.
    function writeDown(address member, Kind kind, uint256 amount) external onlyRegisteredCircle {
        Position storage p = _pos[msg.sender];
        if (!p.settled) revert NotSettled();
        uint256 bal = _balances[msg.sender][member][kind];
        if (bal < amount) revert InsufficientBalance();
        unchecked {
            _balances[msg.sender][member][kind] = bal - amount;
        }
        p.principal -= amount;
        emit WrittenDown(msg.sender, member, kind, amount);
    }

    /// @notice After settle: credits part of the circle's surplus (its yield)
    /// to a member's ledger.
    function allocate(address member, Kind kind, uint256 amount) external onlyRegisteredCircle {
        Position storage p = _pos[msg.sender];
        if (!p.settled) revert NotSettled();
        if (p.principal + amount > p.liquid) revert InsufficientBalance();
        _balances[msg.sender][member][kind] += amount;
        p.principal += amount;
        emit Allocated(msg.sender, member, kind, amount);
    }

    // -------------------------------------------------------------- views

    function balanceOf(address circle, address member, Kind kind) external view returns (uint256) {
        return _balances[circle][member][kind];
    }

    /// @notice What settle would return right now.
    function previewSettle(address circle) public view returns (uint256 assets, uint256 principal) {
        Position storage p = _pos[circle];
        assets = p.liquid + (p.shares > 0 ? adapter.previewInstantRedeem(p.shares) : 0);
        principal = p.principal;
    }

    function positionOf(address circle)
        external
        view
        returns (uint256 principal, uint256 liquid, uint256 invested, bool earning)
    {
        Position storage p = _pos[circle];
        principal = p.principal;
        liquid = p.liquid;
        invested = p.shares > 0 ? adapter.previewInstantRedeem(p.shares) : 0;
        earning = p.mode == Mode.On;
    }
}
