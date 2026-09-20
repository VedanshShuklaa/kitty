// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Clones } from "@openzeppelin/contracts/proxy/Clones.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { ICircleFactory, Rules } from "./interfaces/ICircleFactory.sol";
import { Circle } from "./Circle.sol";
import { IStakeVault } from "./interfaces/IStakeVault.sol";

/// @notice Validates circle rules and deploys each circle as an EIP-1167
/// clone with CREATE2 (SRS section 7.2). The owner can pause new circle
/// creation only; an existing circle is untouchable by anyone (7.1).
contract CircleFactory is ICircleFactory, Ownable, Pausable {
    address public immutable circleImplementation;
    IERC20 public immutable ausdToken;
    IStakeVault public immutable vaultAddress;
    uint32 public immutable minPeriodValue;

    mapping(address => bool) private _isCircle;
    mapping(address => uint256) public organizerNonce;

    constructor(IERC20 ausd_, IStakeVault vault_, uint32 minPeriod_, address owner_) Ownable(owner_) {
        ausdToken = ausd_;
        vaultAddress = vault_;
        minPeriodValue = minPeriod_;
        circleImplementation = address(new Circle());
    }

    function setPaused(bool paused_) external onlyOwner {
        if (paused_) _pause();
        else _unpause();
    }

    function createCircle(Rules calldata rules, address[] calldata inviteSigners)
        external
        whenNotPaused
        returns (address circle)
    {
        _validateRules(rules, inviteSigners);

        bytes32 salt = _salt(msg.sender, organizerNonce[msg.sender]);
        organizerNonce[msg.sender] += 1;
        circle = Clones.cloneDeterministic(circleImplementation, salt);

        Circle(circle).initialize(rules, inviteSigners, ausdToken, vaultAddress, msg.sender, address(this));
        vaultAddress.registerCircle(circle);
        _isCircle[circle] = true;

        emit CircleCreated(circle, msg.sender, rules, inviteSigners);
    }

    function predictCircle(address organizer) external view returns (address) {
        return Clones.predictDeterministicAddress(
            circleImplementation, _salt(organizer, organizerNonce[organizer]), address(this)
        );
    }

    function isCircle(address circle) external view returns (bool) {
        return _isCircle[circle];
    }

    function minPeriod() external view returns (uint32) {
        return minPeriodValue;
    }

    function ausd() external view returns (address) {
        return address(ausdToken);
    }

    function vault() external view returns (address) {
        return address(vaultAddress);
    }

    function _salt(address organizer, uint256 nonce) internal pure returns (bytes32) {
        return keccak256(abi.encode(organizer, nonce));
    }

    function _validateRules(Rules calldata r, address[] calldata inviteSigners) internal view {
        if (r.memberCount < 2 || r.memberCount > 12) revert BadRules();
        if (r.contribution < 1_000000) revert BadRules();
        if (r.stakeBps < 5_000 || r.stakeBps > 20_000) revert BadRules();
        if (r.maxBidBps > 5_000 || r.poolShareBps > 5_000 || r.holdbackBps > 5_000) revert BadRules();
        if (r.period < minPeriodValue) revert BadRules();
        if (r.commitWindow == 0 || r.revealWindow == 0) revert BadRules();
        if (r.grace < r.revealWindow) revert BadRules();
        if (r.commitWindow + r.grace > r.period) revert BadRules();
        if (block.timestamp >= r.joinDeadline) revert BadRules();
        if (r.joinDeadline + r.commitWindow > r.firstDue) revert BadRules();
        if (inviteSigners.length != r.memberCount) revert BadRules();
        if (inviteSigners[0] != address(0)) revert BadRules();
        for (uint256 i = 1; i < inviteSigners.length; i++) {
            if (inviteSigners[i] == address(0)) revert BadRules();
            for (uint256 j = 1; j < i; j++) {
                if (inviteSigners[i] == inviteSigners[j]) revert BadRules();
            }
        }
    }
}
