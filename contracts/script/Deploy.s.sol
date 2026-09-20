// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

import { Script } from "forge-std/Script.sol";
import { console } from "forge-std/console.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { StakeVault } from "../src/StakeVault.sol";
import { CircleFactory } from "../src/CircleFactory.sol";
import { KittyEarnVault } from "../src/KittyEarnVault.sol";

/// @notice Deploys StakeVault, CircleFactory (which deploys the Circle
/// implementation it clones) and KittyEarnVault against the AUSD already
/// live on Monad testnet, and writes ../deployments/10143.json (FR-OPS-03).
/// Run with:
///   forge script script/Deploy.s.sol --rpc-url monad_testnet --account kitty-deployer --broadcast --verify
contract Deploy is Script {
    // Agora's testnet AUSD, verified live on 18 Sep 2026 (SRS section 4.2).
    address constant AUSD_TESTNET = 0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC;
    uint32 constant MIN_PERIOD_TESTNET = 300; // 5 minutes; a mainnet factory uses 86_400

    function run() external {
        uint256 chainId = block.chainid;
        address deployer = msg.sender;

        vm.startBroadcast();

        StakeVault vault = new StakeVault(IERC20(AUSD_TESTNET), deployer);
        CircleFactory factory = new CircleFactory(IERC20(AUSD_TESTNET), vault, MIN_PERIOD_TESTNET, deployer);
        vault.setFactory(address(factory));
        KittyEarnVault earnVault = new KittyEarnVault(IERC20(AUSD_TESTNET), deployer);

        vm.stopBroadcast();

        console.log("chainId", chainId);
        console.log("ausd", AUSD_TESTNET);
        console.log("stakeVault", address(vault));
        console.log("circleFactory", address(factory));
        console.log("circleImplementation", factory.circleImplementation());
        console.log("kittyEarnVault", address(earnVault));

        string memory json = "deployment";
        vm.serializeUint(json, "chainId", chainId);
        vm.serializeAddress(json, "ausd", AUSD_TESTNET);
        vm.serializeAddress(json, "stakeVault", address(vault));
        vm.serializeAddress(json, "circleFactory", address(factory));
        vm.serializeAddress(json, "circleImplementation", factory.circleImplementation());
        vm.serializeUint(json, "deployBlock", block.number);
        string memory out = vm.serializeAddress(json, "kittyEarnVault", address(earnVault));
        vm.writeJson(out, "../deployments/10143.json");
    }
}
