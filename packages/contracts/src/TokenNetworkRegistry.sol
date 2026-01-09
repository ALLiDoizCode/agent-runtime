// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./TokenNetwork.sol";

/// @title TokenNetworkRegistry
/// @notice Factory contract for deploying isolated TokenNetwork contracts per ERC20 token
/// @dev Follows Raiden Network architecture pattern for multi-token payment channels
/// @dev Provides security isolation between different token types
contract TokenNetworkRegistry is Ownable {
    /// @notice Mapping from ERC20 token address to TokenNetwork contract address
    mapping(address => address) public token_to_token_networks;

    /// @notice Mapping from TokenNetwork contract address to ERC20 token address
    /// @dev Provides reverse lookup for TokenNetwork contracts
    mapping(address => address) public token_network_to_token;

    /// @notice Thrown when attempting to create a TokenNetwork for a token that already has one
    /// @param token The token address that triggered the error
    error TokenNetworkAlreadyExists(address token);

    /// @notice Thrown when attempting to create a TokenNetwork with zero address
    error InvalidTokenAddress();

    /// @notice Thrown when TokenNetwork deployment fails
    error TokenNetworkCreationFailed();

    /// @notice Emitted when a new TokenNetwork is created
    /// @param token The ERC20 token address
    /// @param tokenNetwork The deployed TokenNetwork contract address
    event TokenNetworkCreated(address indexed token, address indexed tokenNetwork);

    /// @notice Deploy a new TokenNetworkRegistry
    /// @dev Sets the deployer as the initial owner
    constructor() Ownable(msg.sender) {}

    /// @notice Create a new TokenNetwork contract for an ERC20 token
    /// @param token The address of the ERC20 token
    /// @return The address of the deployed TokenNetwork contract
    /// @dev Reverts if token is zero address or TokenNetwork already exists
    function createTokenNetwork(address token) external returns (address) {
        // Validate token address is not zero
        if (token == address(0)) revert InvalidTokenAddress();

        // Check for duplicate TokenNetwork
        if (token_to_token_networks[token] != address(0)) {
            revert TokenNetworkAlreadyExists(token);
        }

        // Deploy new TokenNetwork contract
        TokenNetwork tokenNetwork = new TokenNetwork(token);
        address tokenNetworkAddress = address(tokenNetwork);

        // Validate deployment succeeded
        if (tokenNetworkAddress == address(0)) revert TokenNetworkCreationFailed();

        // Store in mappings
        token_to_token_networks[token] = tokenNetworkAddress;
        token_network_to_token[tokenNetworkAddress] = token;

        // Emit event
        emit TokenNetworkCreated(token, tokenNetworkAddress);

        // Return address
        return tokenNetworkAddress;
    }

    /// @notice Get the TokenNetwork contract address for a token
    /// @param token The ERC20 token address
    /// @return The TokenNetwork contract address, or address(0) if doesn't exist
    function getTokenNetwork(address token) external view returns (address) {
        return token_to_token_networks[token];
    }
}
