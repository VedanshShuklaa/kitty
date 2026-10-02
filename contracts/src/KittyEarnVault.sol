// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IYieldAdapter } from "./interfaces/IYieldAdapter.sol";

/// @notice Testnet stand-in for earnAUSD (mainnet only, SRS section 2):
/// same call shape as Upshift's ITokenizedVault, same mainnet parameters —
/// a 72-hour redemption lag and a 20 bps instant-redemption fee. Yield is
/// simulated (SRS 15.7): it accrues every second at an owner-set annual rate,
/// set from earnAUSD's trailing rate on mainnet, and is paid out of a reserve
/// anyone can fund, so it grows without anyone pushing it. `speedUp` compresses
/// time for demo circles whose rounds last minutes, and the app labels every
/// figure as simulated. Never deployed to mainnet; the real earnAUSD address is
/// used there instead.
contract KittyEarnVault is IYieldAdapter, Ownable {
    using SafeERC20 for IERC20;

    uint256 public constant LAG_DURATION = 259_200; // 72 hours, seconds
    uint16 public instantRedemptionFeeBps = 20;

    IERC20 public immutable asset;
    uint256 public totalShares;
    uint256 public totalPending; // assets owed to queued redemptions, no longer backing shares
    uint256 public reserve; // funded yield not yet credited to shareholders
    uint32 public aprBps; // simulated annual rate; 450 is 4.5%
    uint32 public speedUp = 1; // 4_320 credits a month of yield every 10 minutes
    uint64 public lastAccrual;
    mapping(address => uint256) public sharesOf;

    struct PendingClaim {
        uint256 assets;
        uint256 claimableAt;
        bool claimed;
    }

    mapping(address => mapping(uint256 => PendingClaim)) private _pending;
    mapping(address => uint256) public nextEpoch;

    event Deposited(address indexed sender, address indexed receiver, uint256 assets, uint256 shares);
    event InstantRedeemed(
        address indexed holder, address indexed receiver, uint256 shares, uint256 assetsAfterFee, uint256 fee
    );
    /// @dev totalAssets and totalShares after the accrual give the indexer a
    /// share-price point without a call.
    event Accrued(uint256 amount, uint256 totalAssets, uint256 totalShares);
    event ReserveFunded(address indexed from, uint256 amount);
    event RateSet(uint32 aprBps, uint32 speedUp);

    constructor(IERC20 asset_, address owner_) Ownable(owner_) {
        asset = asset_;
        lastAccrual = uint64(block.timestamp);
    }

    // ------------------------------------------------------------- yield

    /// @dev Assets backing shares right now, before any yield still pending.
    function _base() internal view returns (uint256) {
        return asset.balanceOf(address(this)) - totalPending - reserve;
    }

    function _pendingYield() internal view returns (uint256 y) {
        // a chain's clock never runs backward, but a test's can
        if (aprBps == 0 || totalShares == 0 || reserve == 0 || block.timestamp <= lastAccrual) return 0;
        y = (_base() * aprBps * speedUp * (block.timestamp - lastAccrual)) / (10_000 * 365 days);
        if (y > reserve) y = reserve;
    }

    /// @dev Moves yield earned since the last call out of the reserve and into
    /// the assets that back shares. Every call that prices shares runs it first.
    function _accrue() internal {
        uint256 y = _pendingYield();
        if (block.timestamp > lastAccrual) lastAccrual = uint64(block.timestamp);
        if (y > 0) {
            reserve -= y;
            emit Accrued(y, _base(), totalShares);
        }
    }

    function totalAssets() public view returns (uint256) {
        return _base() + _pendingYield();
    }

    /// @notice Assets per share, scaled by 1e18.
    function sharePrice() external view returns (uint256) {
        return totalShares == 0 ? 1e18 : (totalAssets() * 1e18) / totalShares;
    }

    /// @notice Anyone may top up the reserve that pays simulated yield.
    function fundReserve(uint256 amount) external {
        _accrue();
        asset.safeTransferFrom(msg.sender, address(this), amount);
        reserve += amount;
        emit ReserveFunded(msg.sender, amount);
    }

    function setRate(uint32 aprBps_, uint32 speedUp_) external onlyOwner {
        require(speedUp_ > 0, "bad speed");
        _accrue();
        aprBps = aprBps_;
        speedUp = speedUp_;
        emit RateSet(aprBps_, speedUp_);
    }

    function setInstantRedemptionFeeBps(uint16 bps) external onlyOwner {
        require(bps <= 10_000, "fee too high");
        instantRedemptionFeeBps = bps;
    }

    // ------------------------------------------------- ITokenizedVault shape

    function deposit(address assetIn, uint256 amountIn, address receiver) external returns (uint256 shares) {
        require(assetIn == address(asset), "bad asset");
        _accrue();
        uint256 ta = totalAssets();
        shares = (totalShares == 0 || ta == 0) ? amountIn : (amountIn * totalShares) / ta;
        asset.safeTransferFrom(msg.sender, address(this), amountIn);
        totalShares += shares;
        sharesOf[receiver] += shares;
        emit Deposited(msg.sender, receiver, amountIn, shares);
    }

    function _assetsFor(uint256 shares) internal view returns (uint256) {
        return totalShares == 0 ? 0 : (shares * totalAssets()) / totalShares;
    }

    function previewInstantRedeem(uint256 shares) public view returns (uint256 assetsAfterFee) {
        uint256 assets = _assetsFor(shares);
        return assets - (assets * instantRedemptionFeeBps) / 10_000;
    }

    function instantRedeem(uint256 shares, address receiver) external returns (uint256 assetsAfterFee) {
        _accrue();
        sharesOf[msg.sender] -= shares;
        uint256 assets = _assetsFor(shares);
        totalShares -= shares;
        uint256 fee = (assets * instantRedemptionFeeBps) / 10_000;
        assetsAfterFee = assets - fee;
        asset.safeTransfer(receiver, assetsAfterFee);
        emit InstantRedeemed(msg.sender, receiver, shares, assetsAfterFee, fee);
    }

    /// @dev Upshift's interface buckets claims by calendar date; this stand-in
    /// only needs a unique handle per pending claim, so the epoch id is
    /// returned as `y` and `m`/`d` are left at zero.
    function requestRedeem(uint256 shares, address receiver)
        external
        returns (uint256 claimableEpoch, uint256 y, uint256 m, uint256 d)
    {
        _accrue();
        sharesOf[msg.sender] -= shares;
        uint256 assets = _assetsFor(shares);
        totalShares -= shares;
        totalPending += assets;
        uint256 epoch = nextEpoch[receiver]++;
        _pending[receiver][epoch] =
            PendingClaim({ assets: assets, claimableAt: block.timestamp + LAG_DURATION, claimed: false });
        return (epoch, epoch, 0, 0);
    }

    function claim(uint256 y, uint256, uint256, address receiver)
        external
        returns (uint256 shares, uint256 assetsAfterFee)
    {
        PendingClaim storage c = _pending[msg.sender][y];
        require(c.assets > 0 && !c.claimed, "no claim");
        require(block.timestamp >= c.claimableAt, "still queued");
        c.claimed = true;
        totalPending -= c.assets;
        assetsAfterFee = c.assets;
        asset.safeTransfer(receiver, assetsAfterFee);
        return (0, assetsAfterFee);
    }

    function totalAssetsOf(address holder) external view returns (uint256) {
        return _assetsFor(sharesOf[holder]);
    }
}
