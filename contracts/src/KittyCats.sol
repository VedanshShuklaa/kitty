// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { Strings } from "@openzeppelin/contracts/utils/Strings.sol";
import { IKittyRecord } from "./interfaces/IKittyRecord.sol";

/// @notice ERC-5192: a token that can never move.
interface IERC5192 {
    event Locked(uint256 tokenId);
    event Unlocked(uint256 tokenId);

    function locked(uint256 tokenId) external view returns (bool);
}

/// @notice A cat for every Kitty account ("Feed the Kitty"). How much she
/// trusts you is your stage in KittyRecord; her coat comes from your address.
/// Holds no money, calls no token, has no owner or signer, and no circle reads
/// it: if this contract vanished every circle would run exactly the same.
/// Every cat is locked, so standing can't be sold or lent.
contract KittyCats is ERC721, IERC5192 {
    string private constant BASE_URI = "https://kitty-circle.vercel.app/api/cat/";

    IKittyRecord public immutable record;

    event Adopted(address indexed owner, uint256 indexed id);

    error Soulbound();
    error AlreadyAdopted();

    constructor(IKittyRecord record_) ERC721("Kitty Cats", "KCAT") {
        record = record_;
    }

    /// @notice One cat per address, free; id = the address as a number.
    function adopt() external returns (uint256 id) {
        id = uint256(uint160(msg.sender));
        if (_ownerOf(id) != address(0)) revert AlreadyAdopted();
        _mint(msg.sender, id);
        emit Adopted(msg.sender, id);
        emit Locked(id);
    }

    function catOf(address owner) external view returns (uint256 id, bool adopted) {
        id = uint256(uint160(owner));
        adopted = _ownerOf(id) != address(0);
    }

    /// @notice Her stage is the record's. Nothing to sync.
    function stageOf(address owner) external view returns (IKittyRecord.Stage) {
        return record.stageOf(owner);
    }

    /// @notice Six coats and three markings from keccak256(owner): the same
    /// cat on every phone, with no storage. The app runs the same hash.
    function lookOf(address owner) public pure returns (uint8 coat, uint8 pattern) {
        bytes32 h = keccak256(abi.encodePacked(owner));
        return (uint8(h[0]) % 6, uint8(h[1]) % 3);
    }

    function locked(uint256 tokenId) external view returns (bool) {
        _requireOwned(tokenId);
        return true;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return string.concat(BASE_URI, Strings.toHexString(address(uint160(tokenId))));
    }

    function supportsInterface(bytes4 interfaceId) public view override returns (bool) {
        return interfaceId == type(IERC5192).interfaceId || super.supportsInterface(interfaceId);
    }

    /// @dev Minting is the only movement a cat ever makes.
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        if (_ownerOf(tokenId) != address(0)) revert Soulbound();
        return super._update(to, tokenId, auth);
    }

    function approve(address, uint256) public pure override {
        revert Soulbound();
    }

    function setApprovalForAll(address, bool) public pure override {
        revert Soulbound();
    }
}
