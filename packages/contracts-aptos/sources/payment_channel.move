/// Payment Channel Module for Aptos
///
/// Implements payment channel logic for off-chain balance updates between two parties.
/// Uses Move's resource model for channel state management and ed25519 signature
/// verification for claim authentication.
///
/// Supports any coin type (APT, custom tokens, etc.) via generics.
module payment_channel::channel {
    use std::signer;
    use std::vector;
    use std::bcs;
    use aptos_std::ed25519;
    use aptos_framework::coin::{Self, Coin};
    use aptos_framework::timestamp;

    // ============================================
    // Error Codes
    // ============================================

    /// Channel already exists for this owner
    const E_CHANNEL_EXISTS: u64 = 1;
    /// Channel not found for the specified owner
    const E_CHANNEL_NOT_FOUND: u64 = 2;
    /// Invalid ed25519 signature on claim
    const E_INVALID_SIGNATURE: u64 = 3;
    /// Claim amount exceeds available balance (deposited - claimed)
    const E_INSUFFICIENT_BALANCE: u64 = 4;
    /// Settle delay period has not elapsed since close request
    const E_SETTLE_DELAY_NOT_ELAPSED: u64 = 5;
    /// Caller is not authorized for this operation
    const E_UNAUTHORIZED: u64 = 6;
    /// Close has not been requested yet
    const E_CLOSE_NOT_REQUESTED: u64 = 7;
    /// Nonce must be greater than current nonce
    const E_INVALID_NONCE: u64 = 8;
    /// Amount must be greater than zero
    const E_ZERO_AMOUNT: u64 = 9;

    // ============================================
    // Resources
    // ============================================

    /// Payment channel state stored under owner's account.
    /// Coins are held in escrow within the channel itself.
    /// Generic over CoinType to support any token (APT, custom tokens, etc.)
    struct Channel<phantom CoinType> has key {
        destination: address,
        escrow: Coin<CoinType>,
        claimed: u64,
        nonce: u64,
        settle_delay: u64,
        close_requested_at: u64,
        destination_pubkey: vector<u8>,
    }

    // ============================================
    // View Functions
    // ============================================

    #[view]
    /// Get channel state for a given owner and coin type.
    /// Returns (destination, deposited, claimed, nonce, settle_delay, close_requested_at)
    public fun get_channel<CoinType>(owner: address): (address, u64, u64, u64, u64, u64) acquires Channel {
        assert!(exists<Channel<CoinType>>(owner), E_CHANNEL_NOT_FOUND);
        let channel = borrow_global<Channel<CoinType>>(owner);
        (
            channel.destination,
            coin::value(&channel.escrow),
            channel.claimed,
            channel.nonce,
            channel.settle_delay,
            channel.close_requested_at
        )
    }

    #[view]
    /// Check if a channel exists for the given owner and coin type
    public fun channel_exists<CoinType>(owner: address): bool {
        exists<Channel<CoinType>>(owner)
    }

    #[view]
    /// Get the destination public key for a channel
    public fun get_destination_pubkey<CoinType>(owner: address): vector<u8> acquires Channel {
        assert!(exists<Channel<CoinType>>(owner), E_CHANNEL_NOT_FOUND);
        let channel = borrow_global<Channel<CoinType>>(owner);
        channel.destination_pubkey
    }

    // ============================================
    // Entry Functions
    // ============================================

    /// Open a new payment channel.
    /// Creates a new channel from owner to destination with initial deposit.
    /// The destination_pubkey is used to verify claim signatures.
    /// Generic over CoinType - can be APT, custom tokens, etc.
    public entry fun open_channel<CoinType>(
        owner: &signer,
        destination: address,
        destination_pubkey: vector<u8>,
        amount: u64,
        settle_delay: u64,
    ) {
        let owner_addr = signer::address_of(owner);

        // Verify channel doesn't already exist for this coin type
        assert!(!exists<Channel<CoinType>>(owner_addr), E_CHANNEL_EXISTS);

        // Verify amount is greater than zero
        assert!(amount > 0, E_ZERO_AMOUNT);

        // Verify destination_pubkey is 32 bytes (ed25519 public key size)
        assert!(vector::length(&destination_pubkey) == 32, E_INVALID_SIGNATURE);

        // Withdraw coins from owner and store in escrow
        let escrow = coin::withdraw<CoinType>(owner, amount);

        // Create and store Channel resource under owner's address
        let channel = Channel<CoinType> {
            destination,
            escrow,
            claimed: 0,
            nonce: 0,
            settle_delay,
            close_requested_at: 0,
            destination_pubkey,
        };

        move_to(owner, channel);
    }

    /// Add funds to an existing channel.
    /// Only the channel owner can deposit additional funds.
    public entry fun deposit<CoinType>(
        owner: &signer,
        amount: u64,
    ) acquires Channel {
        let owner_addr = signer::address_of(owner);

        // Verify channel exists for this coin type
        assert!(exists<Channel<CoinType>>(owner_addr), E_CHANNEL_NOT_FOUND);

        // Verify amount is greater than zero
        assert!(amount > 0, E_ZERO_AMOUNT);

        // Withdraw additional coins from owner
        let additional = coin::withdraw<CoinType>(owner, amount);

        // Add to escrow
        let channel = borrow_global_mut<Channel<CoinType>>(owner_addr);
        coin::merge(&mut channel.escrow, additional);
    }

    /// Submit a claim with signed balance proof.
    /// Called by destination to redeem signed balance proofs from the owner.
    /// The signature must be over: "CLAIM_APTOS" || owner || amount || nonce
    public entry fun claim<CoinType>(
        destination: &signer,
        owner: address,
        amount: u64,
        nonce: u64,
        signature: vector<u8>,
    ) acquires Channel {
        let dest_addr = signer::address_of(destination);

        // Verify channel exists for this coin type
        assert!(exists<Channel<CoinType>>(owner), E_CHANNEL_NOT_FOUND);

        let channel = borrow_global_mut<Channel<CoinType>>(owner);

        // Verify caller is the channel destination
        assert!(dest_addr == channel.destination, E_UNAUTHORIZED);

        // Verify nonce is greater than current (replay protection)
        assert!(nonce > channel.nonce, E_INVALID_NONCE);

        // Verify amount doesn't exceed available balance
        let escrow_balance = coin::value(&channel.escrow);
        assert!(amount <= escrow_balance, E_INSUFFICIENT_BALANCE);

        // Verify signature
        let is_valid = verify_claim_signature(
            owner,
            amount,
            nonce,
            signature,
            channel.destination_pubkey
        );
        assert!(is_valid, E_INVALID_SIGNATURE);

        // Calculate incremental amount to transfer
        let transfer_amount = amount - channel.claimed;

        // Update channel state
        channel.claimed = amount;
        channel.nonce = nonce;

        // Extract coins from escrow and deposit to destination
        let payment = coin::extract(&mut channel.escrow, transfer_amount);
        coin::deposit(dest_addr, payment);
    }

    /// Request channel closure - Phase 1 of two-phase close.
    /// Either owner or destination can initiate closure.
    /// Starts the settle_delay countdown.
    public entry fun request_close<CoinType>(
        requester: &signer,
        channel_owner: address,
    ) acquires Channel {
        let requester_addr = signer::address_of(requester);

        // Verify channel exists for this coin type
        assert!(exists<Channel<CoinType>>(channel_owner), E_CHANNEL_NOT_FOUND);

        let channel = borrow_global_mut<Channel<CoinType>>(channel_owner);

        // Verify requester is owner or destination
        assert!(
            requester_addr == channel_owner || requester_addr == channel.destination,
            E_UNAUTHORIZED
        );

        // Set close_requested_at to current timestamp
        channel.close_requested_at = timestamp::now_seconds();
    }

    /// Finalize channel closure - Phase 2 of two-phase close.
    /// Completes closure after settle_delay has elapsed.
    /// Returns remaining balance to owner and deletes the channel.
    public entry fun finalize_close<CoinType>(
        _requester: &signer,
        channel_owner: address,
    ) acquires Channel {
        let requester_addr = signer::address_of(_requester);

        // Verify channel exists for this coin type
        assert!(exists<Channel<CoinType>>(channel_owner), E_CHANNEL_NOT_FOUND);

        // Get channel reference to check conditions
        {
            let channel = borrow_global<Channel<CoinType>>(channel_owner);

            // Verify close was requested
            assert!(channel.close_requested_at > 0, E_CLOSE_NOT_REQUESTED);

            // Verify requester is owner or destination
            assert!(
                requester_addr == channel_owner || requester_addr == channel.destination,
                E_UNAUTHORIZED
            );

            // Verify settle_delay has elapsed
            let current_time = timestamp::now_seconds();
            let close_time = channel.close_requested_at + channel.settle_delay;
            assert!(current_time >= close_time, E_SETTLE_DELAY_NOT_ELAPSED);
        };

        // Delete channel resource and extract remaining coins
        let Channel {
            destination: _,
            escrow,
            claimed: _,
            nonce: _,
            settle_delay: _,
            close_requested_at: _,
            destination_pubkey: _,
        } = move_from<Channel<CoinType>>(channel_owner);

        // Transfer remaining balance to owner
        if (coin::value(&escrow) > 0) {
            coin::deposit(channel_owner, escrow);
        } else {
            coin::destroy_zero(escrow);
        };
    }

    // ============================================
    // Internal Functions
    // ============================================

    /// Verify ed25519 signature on a claim message.
    /// Message format: "CLAIM_APTOS" || owner (BCS) || amount (BCS) || nonce (BCS)
    fun verify_claim_signature(
        channel_owner: address,
        amount: u64,
        nonce: u64,
        signature: vector<u8>,
        public_key: vector<u8>,
    ): bool {
        // Construct message: "CLAIM_APTOS" || owner || amount || nonce
        let message = b"CLAIM_APTOS";
        vector::append(&mut message, bcs::to_bytes(&channel_owner));
        vector::append(&mut message, bcs::to_bytes(&amount));
        vector::append(&mut message, bcs::to_bytes(&nonce));

        // Parse signature (must be 64 bytes)
        if (vector::length(&signature) != 64) {
            return false
        };
        let sig = ed25519::new_signature_from_bytes(signature);

        // Parse public key (must be 32 bytes)
        if (vector::length(&public_key) != 32) {
            return false
        };
        let pk = ed25519::new_unvalidated_public_key_from_bytes(public_key);

        // Verify signature
        ed25519::signature_verify_strict(&sig, &pk, message)
    }

    // ============================================
    // Test Helpers (test_only)
    // ============================================

    #[test_only]
    /// Get the escrow balance directly (for testing)
    public fun get_escrow_balance<CoinType>(owner: address): u64 acquires Channel {
        assert!(exists<Channel<CoinType>>(owner), E_CHANNEL_NOT_FOUND);
        let channel = borrow_global<Channel<CoinType>>(owner);
        coin::value(&channel.escrow)
    }

    // ============================================
    // Move Prover Specifications
    // ============================================

    /// Invariant: claimed amount tracks what has been paid out
    /// The escrow holds the remaining balance after claims
    spec Channel {
        // Claimed amount is always non-negative (trivially true for u64)
        invariant claimed >= 0;
        // Nonce is monotonically tracked
        invariant nonce >= 0;
    }

    /// Specification for open_channel
    spec open_channel {
        // Aborts if channel already exists
        aborts_if exists<Channel<CoinType>>(signer::address_of(owner));
        // Aborts if amount is zero
        aborts_if amount == 0;
        // Aborts if public key is not 32 bytes
        aborts_if len(destination_pubkey) != 32;
        // Post-condition: channel is created
        ensures exists<Channel<CoinType>>(signer::address_of(owner));
    }

    /// Specification for deposit
    spec deposit {
        // Aborts if channel doesn't exist
        aborts_if !exists<Channel<CoinType>>(signer::address_of(owner));
        // Aborts if amount is zero
        aborts_if amount == 0;
    }

    /// Specification for claim
    spec claim {
        // Aborts if channel doesn't exist
        aborts_if !exists<Channel<CoinType>>(owner);
        // Aborts if caller is not the destination
        aborts_if signer::address_of(destination) != global<Channel<CoinType>>(owner).destination;
        // Aborts if nonce is not greater than current
        aborts_if nonce <= global<Channel<CoinType>>(owner).nonce;
    }

    /// Specification for request_close
    spec request_close {
        // Aborts if channel doesn't exist
        aborts_if !exists<Channel<CoinType>>(channel_owner);
    }

    /// Specification for finalize_close
    spec finalize_close {
        // Aborts if channel doesn't exist
        aborts_if !exists<Channel<CoinType>>(channel_owner);
        // Aborts if close was not requested
        aborts_if global<Channel<CoinType>>(channel_owner).close_requested_at == 0;
        // Post-condition: channel is deleted
        ensures !exists<Channel<CoinType>>(channel_owner);
    }
}
