// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {AgentMarket} from "../src/AgentMarket.sol";

/// @notice Deploy AgentMarket. Needs AGENT_NFT_ADDRESS env set to the deployed AgentNFT.
///   AGENT_NFT_ADDRESS=0x... forge script script/DeployMarket.s.sol --rpc-url galileo \
///     --broadcast --legacy --with-gas-price 5000000000
contract DeployMarket is Script {
    function run() external {
        uint256 pk = vm.envUint("ZG_PRIVATE_KEY");
        address nft = vm.envAddress("AGENT_NFT_ADDRESS");
        address deployer = vm.addr(pk);
        vm.startBroadcast(pk);
        AgentMarket market = new AgentMarket(nft, 250, deployer); // 2.5% fee
        vm.stopBroadcast();
        console.log("AgentMarket deployed at:", address(market));
        console.log("for AgentNFT:", nft);
    }
}
