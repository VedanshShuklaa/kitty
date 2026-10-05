// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

import { Script } from "forge-std/Script.sol";
import { console } from "forge-std/console.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { StakeVault } from "../src/StakeVault.sol";
import { CircleFactory } from "../src/CircleFactory.sol";
import { KittyEarnVault } from "../src/KittyEarnVault.sol";
import { KittyRecord } from "../src/KittyRecord.sol";
import { KittyCats } from "../src/KittyCats.sol";

/// @notice Deploys KittyEarnVault, StakeVault (wired to it as the yield
/// adapter, SRS 15.7), CircleFactory (which deploys the Circle implementation
/// it clones) against the AUSD already live on Monad testnet, starts simulated
/// yield at earnAUSD's rate, and writes ../deployments/10143.json (FR-OPS-03).
/// Run with (after `set -a; source .env.local; set +a`):
///   forge script script/Deploy.s.sol --rpc-url monad_testnet \
///     --keystore ~/.foundry/keystores/kitty-deployer --sender <deployer address> --broadcast --verify
/// --sender is required: without it `msg.sender` below is Foundry's default
/// sender, so the vault and factory would be owned by an address nobody holds
/// and setFactory would revert.
contract Deploy is Script {
    // Agora's testnet AUSD, verified live on 18 Sep 2026 (SRS section 4.2).
    address constant AUSD_TESTNET = 0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC;
    uint32 constant MIN_PERIOD_TESTNET = 60; // 1-minute practice rounds; a mainnet factory uses 86_400
    // a new factory's circles write to the record after this delay; 48 hours
    // on mainnet, none on testnet so a fresh deploy can be demoed at once
    uint64 constant RECORD_DELAY_TESTNET = 0;
    // earnAUSD's trailing rate on mainnet, and a month of it every ten
    // minutes so a demo circle shows yield; a script retunes it daily
    uint32 constant APR_BPS = 450;
    uint32 constant SPEED_UP = 4_320;

    function run() external {
        uint256 chainId = block.chainid;

        vm.startBroadcast();
        address deployer = msg.sender;

        KittyEarnVault earnVault = new KittyEarnVault(IERC20(AUSD_TESTNET), deployer);
        StakeVault vault = new StakeVault(IERC20(AUSD_TESTNET), deployer);
        vault.setAdapter(earnVault); // before the factory: one-time wiring
        // the record outlives factory redeploys: reuse it when KITTY_RECORD is set
        KittyRecord record = KittyRecord(vm.envOr("KITTY_RECORD", address(0)));
        if (address(record) == address(0)) record = new KittyRecord(deployer, RECORD_DELAY_TESTNET);
        CircleFactory factory = new CircleFactory(IERC20(AUSD_TESTNET), vault, record, MIN_PERIOD_TESTNET, deployer);
        vault.setFactory(address(factory));
        record.addFactory(address(factory));
        // the cat only reads the record; reuse it with the record when KITTY_CATS is set
        KittyCats cats = KittyCats(vm.envOr("KITTY_CATS", address(0)));
        if (address(cats) == address(0)) cats = new KittyCats(record);
        earnVault.setRate(APR_BPS, SPEED_UP);
        // half of whatever AUSD the deployer holds pays the simulated yield
        uint256 reserve = IERC20(AUSD_TESTNET).balanceOf(deployer) / 2;
        if (reserve > 0) {
            IERC20(AUSD_TESTNET).approve(address(earnVault), reserve);
            earnVault.fundReserve(reserve);
        }

        vm.stopBroadcast();

        console.log("chainId", chainId);
        console.log("ausd", AUSD_TESTNET);
        console.log("stakeVault", address(vault));
        console.log("circleFactory", address(factory));
        console.log("circleImplementation", factory.circleImplementation());
        console.log("kittyEarnVault", address(earnVault));
        console.log("kittyRecord", address(record));
        console.log("kittyCats", address(cats));

        string memory json = "deployment";
        vm.serializeUint(json, "chainId", chainId);
        vm.serializeAddress(json, "ausd", AUSD_TESTNET);
        vm.serializeAddress(json, "stakeVault", address(vault));
        vm.serializeAddress(json, "circleFactory", address(factory));
        vm.serializeAddress(json, "circleImplementation", factory.circleImplementation());
        vm.serializeUint(json, "deployBlock", block.number);
        vm.serializeAddress(json, "kittyRecord", address(record));
        vm.serializeAddress(json, "kittyCats", address(cats));
        string memory out = vm.serializeAddress(json, "kittyEarnVault", address(earnVault));
        vm.writeJson(out, "../deployments/10143.json");
    }
}
