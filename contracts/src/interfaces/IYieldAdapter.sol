// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

/// @notice Mirrors Upshift's ITokenizedVault shape, the interface earnAUSD
/// exposes on mainnet, so the same StakeVault code works against the
/// KittyEarnVault stand-in on testnet and the real vault on mainnet.
interface IYieldAdapter {
    function deposit(address assetIn, uint256 amountIn, address receiver) external returns (uint256 shares);
    function instantRedeem(uint256 shares, address receiver) external returns (uint256 assetsAfterFee);
    function requestRedeem(uint256 shares, address receiver)
        external
        returns (uint256 claimableEpoch, uint256 y, uint256 m, uint256 d);
    function claim(uint256 y, uint256 m, uint256 d, address receiver)
        external
        returns (uint256 shares, uint256 assetsAfterFee);
    function totalAssetsOf(address holder) external view returns (uint256);
}
