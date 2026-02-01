// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../test/mocks/MockERC20.sol";
import "../src/TokenNetwork.sol";
import "../src/TokenNetworkRegistry.sol";

/**
 * @title DeployTestnetScript
 * @notice Deploys all required contracts to Base Sepolia testnet
 * @dev Run with: forge script script/DeployTestnet.s.sol --rpc-url https://sepolia.base.org --broadcast --verify
 *
 * Environment variables required:
 *   PRIVATE_KEY - The deployer's private key (without 0x prefix)
 */
contract DeployTestnetScript is Script {
    function run() external {
        // Load private key from environment
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("Deployer address:", deployer);
        console.log("Deployer balance:", deployer.balance);

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy TokenNetworkRegistry
        TokenNetworkRegistry registry = new TokenNetworkRegistry();
        console.log("TokenNetworkRegistry deployed to:", address(registry));

        // 2. Deploy MockERC20 token (AGENT token)
        MockERC20 agentToken = new MockERC20("Agent Token", "AGENT", 18);
        console.log("AgentToken deployed to:", address(agentToken));

        // 3. Deploy TokenNetwork for AGENT token
        // Max deposit: 1 million tokens, Max lifetime: 365 days
        TokenNetwork tokenNetwork = new TokenNetwork(
            address(agentToken),
            1000000 * 10**18,  // maxChannelDeposit
            365 days          // maxChannelLifetime
        );
        console.log("TokenNetwork deployed to:", address(tokenNetwork));

        vm.stopBroadcast();

        // Output addresses in format easy to parse
        console.log("");
        console.log("=== DEPLOYMENT COMPLETE ===");
        console.log("BASE_REGISTRY_ADDRESS=%s", address(registry));
        console.log("BASE_TOKEN_ADDRESS=%s", address(agentToken));
        console.log("BASE_TOKEN_NETWORK_ADDRESS=%s", address(tokenNetwork));
        console.log("");
        console.log("Add these to your environment or testnet-wallets.json:");
        console.log("  export BASE_REGISTRY_ADDRESS=%s", address(registry));
        console.log("  export BASE_TOKEN_ADDRESS=%s", address(agentToken));
        console.log("  export BASE_TOKEN_NETWORK_ADDRESS=%s", address(tokenNetwork));
    }
}
