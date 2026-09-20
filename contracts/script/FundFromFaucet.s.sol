// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

import { Script } from "forge-std/Script.sol";
import { console } from "forge-std/console.sol";

interface IAusdFaucet {
    function requestFunds(address to) external;
}

/// @notice C0 deliverable: funds any address from the Agora AUSD testnet
/// faucet (SRS section 4.2). Usage:
///   forge script script/FundFromFaucet.s.sol --sig "run(address)" 0xYourAddress \
///     --rpc-url monad_testnet --account kitty-deployer --broadcast
contract FundFromFaucet is Script {
    address constant AUSD_FAUCET = 0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C;

    function run(address to) external {
        vm.startBroadcast();
        IAusdFaucet(AUSD_FAUCET).requestFunds(to);
        vm.stopBroadcast();
        console.log("requested AUSD faucet funds for", to);
    }
}
