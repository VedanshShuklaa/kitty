// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IYieldAdapter } from "./interfaces/IYieldAdapter.sol";

/// @notice Testnet stand-in for earnAUSD (mainnet only, SRS section 2):
/// same call shape as Upshift's ITokenizedVault, same mainnet parameters —
/// a 72-hour redemption lag and a 20 bps instant-redemption fee — with yield
/// paid out of a faucet-funded reserve instead of a real strategy. Never
/// deployed to mainnet; the real earnAUSD address is used there instead.
contract KittyEarnVault is IYieldAdapter, Ownable {
    using SafeERC20 for IERC20;

    uint256 public constant LAG_DURATION = 259_200; // 72 hours, seconds
    uint16 public instantRedemptionFeeBps = 20;

    IERC20 public immutable asset;
    uint256 public totalShares;
    mapping(address => uint256) public sharesOf;

    struct PendingClaim {
        uint256 shares;
        uint256 claimableAt;
        bool claimed;
    }

    mapping(address => mapping(uint256 => PendingClaim)) private _pending;
    mapping(address => uint256) public nextEpoch;

    event YieldAccrued(uint256 amount);

    constructor(IERC20 asset_, address owner_) Ownable(owner_) {
        asset = asset_;
    }

    function totalAssets() public view returns (uint256) {
        return asset.balanceOf(address(this));
    }

    /// @dev Owner tops up the reserve to simulate accrued yield; never
    /// available on a mainnet deployment, which does not exist for this
    /// contract.
    function accrueYield(uint256 amount) external onlyOwner {
        asset.safeTransferFrom(msg.sender, address(this), amount);
        emit YieldAccrued(amount);
    }

    function setInstantRedemptionFeeBps(uint16 bps) external onlyOwner {
        instantRedemptionFeeBps = bps;
    }

    function deposit(address assetIn, uint256 amountIn, address receiver) external returns (uint256 shares) {
        require(assetIn == address(asset), "bad asset");
        uint256 ta = totalAssets();
        shares = (totalShares == 0 || ta == 0) ? amountIn : (amountIn * totalShares) / ta;
        asset.safeTransferFrom(msg.sender, address(this), amountIn);
        totalShares += shares;
        sharesOf[receiver] += shares;
    }

    function _assetsFor(uint256 shares) internal view returns (uint256) {
        return totalShares == 0 ? 0 : (shares * totalAssets()) / totalShares;
    }

    function instantRedeem(uint256 shares, address receiver) external returns (uint256 assetsAfterFee) {
        sharesOf[msg.sender] -= shares;
        uint256 assets = _assetsFor(shares);
        totalShares -= shares;
        uint256 fee = (assets * instantRedemptionFeeBps) / 10_000;
        assetsAfterFee = assets - fee;
        asset.safeTransfer(receiver, assetsAfterFee);
    }

    /// @dev Upshift's interface buckets claims by calendar date; this stand-in
    /// only needs a unique handle per pending claim, so the epoch id is
    /// returned as `y` and `m`/`d` are left at zero.
    function requestRedeem(uint256 shares, address receiver)
        external
        returns (uint256 claimableEpoch, uint256 y, uint256 m, uint256 d)
    {
        sharesOf[msg.sender] -= shares;
        uint256 assets = _assetsFor(shares);
        totalShares -= shares;
        uint256 epoch = nextEpoch[receiver]++;
        _pending[receiver][epoch] =
            PendingClaim({ shares: assets, claimableAt: block.timestamp + LAG_DURATION, claimed: false });
        return (epoch, epoch, 0, 0);
    }

    function claim(uint256 y, uint256, uint256, address receiver)
        external
        returns (uint256 shares, uint256 assetsAfterFee)
    {
        PendingClaim storage c = _pending[msg.sender][y];
        require(c.shares > 0 && !c.claimed, "no claim");
        require(block.timestamp >= c.claimableAt, "still queued");
        c.claimed = true;
        assetsAfterFee = c.shares;
        asset.safeTransfer(receiver, assetsAfterFee);
        return (0, assetsAfterFee);
    }

    function totalAssetsOf(address holder) external view returns (uint256) {
        return _assetsFor(sharesOf[holder]);
    }
}
