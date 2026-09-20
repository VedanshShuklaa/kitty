// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IYieldAdapter } from "../interfaces/IYieldAdapter.sol";

/// @notice Collateral simply stays in AUSD: shares are 1:1 with assets, no
/// lag, no fee. Used when a circle's rules have yieldOn == false, and as the
/// C1 default before StakeVault wires a real adapter in C3.
contract NoYieldAdapter is IYieldAdapter {
    using SafeERC20 for IERC20;

    IERC20 public immutable asset;
    mapping(address => uint256) public sharesOf;

    constructor(IERC20 asset_) {
        asset = asset_;
    }

    function deposit(address assetIn, uint256 amountIn, address receiver) external returns (uint256 shares) {
        require(assetIn == address(asset), "bad asset");
        asset.safeTransferFrom(msg.sender, address(this), amountIn);
        sharesOf[receiver] += amountIn;
        return amountIn;
    }

    function instantRedeem(uint256 shares, address receiver) external returns (uint256 assetsAfterFee) {
        sharesOf[msg.sender] -= shares;
        asset.safeTransfer(receiver, shares);
        return shares;
    }

    function requestRedeem(uint256 shares, address receiver)
        external
        returns (uint256 claimableEpoch, uint256 y, uint256 m, uint256 d)
    {
        sharesOf[msg.sender] -= shares;
        asset.safeTransfer(receiver, shares);
        return (0, 0, 0, 0);
    }

    function claim(uint256, uint256, uint256, address) external pure returns (uint256 shares, uint256 assetsAfterFee) {
        return (0, 0);
    }

    function totalAssetsOf(address holder) external view returns (uint256) {
        return sharesOf[holder];
    }
}
