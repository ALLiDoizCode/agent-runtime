// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title TokenNetwork
/// @notice Placeholder contract for managing payment channels for a specific ERC20 token
/// @dev Minimal implementation for Story 8.2. Full implementation in Story 8.3
contract TokenNetwork {
    /// @notice The ERC20 token address this TokenNetwork manages
    address public token;

    /// @notice Deploy a new TokenNetwork for a specific token
    /// @param _token The ERC20 token address
    constructor(address _token) {
        token = _token;
    }
}
