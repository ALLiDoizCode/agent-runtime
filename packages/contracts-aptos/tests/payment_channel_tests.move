/// Payment Channel Unit Tests
///
/// Comprehensive tests for the payment channel module covering:
/// - Channel creation and state initialization
/// - Deposit functionality
/// - Claim with valid/invalid signatures
/// - Nonce replay protection
/// - Channel closure lifecycle
/// - Settle delay enforcement
#[test_only]
module payment_channel::channel_tests {
    use std::signer;
    use aptos_framework::account;
    use aptos_framework::coin;
    use aptos_framework::aptos_coin::{Self, AptosCoin};
    use aptos_framework::timestamp;
    use payment_channel::channel;

    // Test constants
    const INITIAL_BALANCE: u64 = 1000000000; // 10 APT in octas
    const CHANNEL_AMOUNT: u64 = 100000000;   // 1 APT in octas
    const SETTLE_DELAY: u64 = 3600;          // 1 hour in seconds

    // ============================================
    // Test Setup Helpers
    // ============================================

    /// Initialize the Aptos framework for testing
    fun setup_test(aptos_framework: &signer) {
        // Initialize timestamp for testing
        timestamp::set_time_has_started_for_testing(aptos_framework);
    }

    /// Create a test account with AptosCoin
    fun create_account_with_coins(aptos_framework: &signer, account: &signer, amount: u64) {
        // Create account
        let addr = signer::address_of(account);
        account::create_account_for_test(addr);

        // Initialize AptosCoin if not already done
        if (!coin::is_coin_initialized<AptosCoin>()) {
            let (burn_cap, mint_cap) = aptos_coin::initialize_for_test(aptos_framework);
            // Mint coins to the account
            let coins = coin::mint<AptosCoin>(amount, &mint_cap);
            coin::register<AptosCoin>(account);
            coin::deposit(addr, coins);
            // Destroy capabilities
            coin::destroy_burn_cap(burn_cap);
            coin::destroy_mint_cap(mint_cap);
        } else {
            coin::register<AptosCoin>(account);
        };
    }

    /// Create a dummy 32-byte public key for testing
    fun dummy_pubkey(): vector<u8> {
        x"1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
    }

    /// Create a dummy 64-byte signature for testing
    fun dummy_signature(): vector<u8> {
        x"1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
    }

    // ============================================
    // Channel Creation Tests
    // ============================================

    #[test(aptos_framework = @0x1, owner = @0x123, destination = @0x456)]
    fun test_open_channel(
        aptos_framework: &signer,
        owner: &signer,
        destination: &signer,
    ) {
        setup_test(aptos_framework);

        let owner_addr = signer::address_of(owner);
        let dest_addr = signer::address_of(destination);

        // Create accounts with coins
        create_account_with_coins(aptos_framework, owner, INITIAL_BALANCE);
        account::create_account_for_test(dest_addr);

        let pubkey = dummy_pubkey();

        // Open channel
        channel::open_channel<AptosCoin>(
            owner,
            dest_addr,
            pubkey,
            CHANNEL_AMOUNT,
            SETTLE_DELAY,
        );

        // Verify channel exists
        assert!(channel::channel_exists<AptosCoin>(owner_addr), 1);

        // Verify channel state
        let (dest, deposited, claimed, nonce, settle_delay, close_requested_at) =
            channel::get_channel<AptosCoin>(owner_addr);

        assert!(dest == dest_addr, 2);
        assert!(deposited == CHANNEL_AMOUNT, 3);
        assert!(claimed == 0, 4);
        assert!(nonce == 0, 5);
        assert!(settle_delay == SETTLE_DELAY, 6);
        assert!(close_requested_at == 0, 7);

        // Verify owner's balance decreased
        let owner_balance = coin::balance<AptosCoin>(owner_addr);
        assert!(owner_balance == INITIAL_BALANCE - CHANNEL_AMOUNT, 8);
    }

    #[test(aptos_framework = @0x1, owner = @0x123, destination = @0x456)]
    #[expected_failure(abort_code = 1)] // E_CHANNEL_EXISTS
    fun test_open_channel_already_exists(
        aptos_framework: &signer,
        owner: &signer,
        destination: &signer,
    ) {
        setup_test(aptos_framework);

        let dest_addr = signer::address_of(destination);
        create_account_with_coins(aptos_framework, owner, INITIAL_BALANCE);
        account::create_account_for_test(dest_addr);

        let pubkey = dummy_pubkey();

        // Open channel first time
        channel::open_channel<AptosCoin>(owner, dest_addr, pubkey, CHANNEL_AMOUNT, SETTLE_DELAY);

        // Try to open again - should fail
        channel::open_channel<AptosCoin>(owner, dest_addr, pubkey, CHANNEL_AMOUNT, SETTLE_DELAY);
    }

    #[test(aptos_framework = @0x1, owner = @0x123, destination = @0x456)]
    #[expected_failure(abort_code = 9)] // E_ZERO_AMOUNT
    fun test_open_channel_zero_amount(
        aptos_framework: &signer,
        owner: &signer,
        destination: &signer,
    ) {
        setup_test(aptos_framework);

        let dest_addr = signer::address_of(destination);
        create_account_with_coins(aptos_framework, owner, INITIAL_BALANCE);
        account::create_account_for_test(dest_addr);

        let pubkey = dummy_pubkey();

        // Try to open with zero amount
        channel::open_channel<AptosCoin>(owner, dest_addr, pubkey, 0, SETTLE_DELAY);
    }

    // ============================================
    // Deposit Tests
    // ============================================

    #[test(aptos_framework = @0x1, owner = @0x123, destination = @0x456)]
    fun test_deposit_increases_balance(
        aptos_framework: &signer,
        owner: &signer,
        destination: &signer,
    ) {
        setup_test(aptos_framework);

        let owner_addr = signer::address_of(owner);
        let dest_addr = signer::address_of(destination);

        create_account_with_coins(aptos_framework, owner, INITIAL_BALANCE);
        account::create_account_for_test(dest_addr);

        let pubkey = dummy_pubkey();

        // Open channel
        channel::open_channel<AptosCoin>(owner, dest_addr, pubkey, CHANNEL_AMOUNT, SETTLE_DELAY);

        // Deposit additional funds
        let additional = 50000000; // 0.5 APT
        channel::deposit<AptosCoin>(owner, additional);

        // Verify deposited amount increased
        let (_, deposited, _, _, _, _) = channel::get_channel<AptosCoin>(owner_addr);
        assert!(deposited == CHANNEL_AMOUNT + additional, 1);

        // Verify escrow balance
        let escrow_balance = channel::get_escrow_balance<AptosCoin>(owner_addr);
        assert!(escrow_balance == CHANNEL_AMOUNT + additional, 2);
    }

    #[test(aptos_framework = @0x1, owner = @0x123)]
    #[expected_failure(abort_code = 2)] // E_CHANNEL_NOT_FOUND
    fun test_deposit_no_channel(
        aptos_framework: &signer,
        owner: &signer,
    ) {
        setup_test(aptos_framework);
        create_account_with_coins(aptos_framework, owner, INITIAL_BALANCE);

        // Try to deposit without opening channel
        channel::deposit<AptosCoin>(owner, CHANNEL_AMOUNT);
    }

    // ============================================
    // Channel Closure Tests
    // ============================================

    #[test(aptos_framework = @0x1, owner = @0x123, destination = @0x456)]
    fun test_request_close_by_owner(
        aptos_framework: &signer,
        owner: &signer,
        destination: &signer,
    ) {
        setup_test(aptos_framework);

        let owner_addr = signer::address_of(owner);
        let dest_addr = signer::address_of(destination);

        create_account_with_coins(aptos_framework, owner, INITIAL_BALANCE);
        account::create_account_for_test(dest_addr);

        let pubkey = dummy_pubkey();

        // Open channel
        channel::open_channel<AptosCoin>(owner, dest_addr, pubkey, CHANNEL_AMOUNT, SETTLE_DELAY);

        // Set timestamp
        timestamp::update_global_time_for_test_secs(1000);

        // Request close
        channel::request_close<AptosCoin>(owner, owner_addr);

        // Verify close_requested_at is set
        let (_, _, _, _, _, close_requested_at) = channel::get_channel<AptosCoin>(owner_addr);
        assert!(close_requested_at == 1000, 1);
    }

    #[test(aptos_framework = @0x1, owner = @0x123, destination = @0x456)]
    fun test_request_close_by_destination(
        aptos_framework: &signer,
        owner: &signer,
        destination: &signer,
    ) {
        setup_test(aptos_framework);

        let owner_addr = signer::address_of(owner);
        let dest_addr = signer::address_of(destination);

        create_account_with_coins(aptos_framework, owner, INITIAL_BALANCE);
        account::create_account_for_test(dest_addr);

        let pubkey = dummy_pubkey();

        // Open channel
        channel::open_channel<AptosCoin>(owner, dest_addr, pubkey, CHANNEL_AMOUNT, SETTLE_DELAY);

        // Set timestamp
        timestamp::update_global_time_for_test_secs(2000);

        // Destination requests close
        channel::request_close<AptosCoin>(destination, owner_addr);

        // Verify close_requested_at is set
        let (_, _, _, _, _, close_requested_at) = channel::get_channel<AptosCoin>(owner_addr);
        assert!(close_requested_at == 2000, 1);
    }

    #[test(aptos_framework = @0x1, owner = @0x123, destination = @0x456, other = @0x789)]
    #[expected_failure(abort_code = 6)] // E_UNAUTHORIZED
    fun test_request_close_unauthorized(
        aptos_framework: &signer,
        owner: &signer,
        destination: &signer,
        other: &signer,
    ) {
        setup_test(aptos_framework);

        let owner_addr = signer::address_of(owner);
        let dest_addr = signer::address_of(destination);

        create_account_with_coins(aptos_framework, owner, INITIAL_BALANCE);
        account::create_account_for_test(dest_addr);
        account::create_account_for_test(signer::address_of(other));

        let pubkey = dummy_pubkey();

        // Open channel
        channel::open_channel<AptosCoin>(owner, dest_addr, pubkey, CHANNEL_AMOUNT, SETTLE_DELAY);

        // Unauthorized account tries to close
        channel::request_close<AptosCoin>(other, owner_addr);
    }

    #[test(aptos_framework = @0x1, owner = @0x123, destination = @0x456)]
    fun test_channel_closure_lifecycle(
        aptos_framework: &signer,
        owner: &signer,
        destination: &signer,
    ) {
        setup_test(aptos_framework);

        let owner_addr = signer::address_of(owner);
        let dest_addr = signer::address_of(destination);

        create_account_with_coins(aptos_framework, owner, INITIAL_BALANCE);
        account::create_account_for_test(dest_addr);
        coin::register<AptosCoin>(destination);

        let pubkey = dummy_pubkey();
        let initial_owner_balance = coin::balance<AptosCoin>(owner_addr);

        // Open channel
        channel::open_channel<AptosCoin>(owner, dest_addr, pubkey, CHANNEL_AMOUNT, SETTLE_DELAY);

        // Set timestamp for close request
        timestamp::update_global_time_for_test_secs(1000);

        // Request close
        channel::request_close<AptosCoin>(owner, owner_addr);

        // Fast-forward past settle delay
        timestamp::update_global_time_for_test_secs(1000 + SETTLE_DELAY + 1);

        // Finalize close
        channel::finalize_close<AptosCoin>(owner, owner_addr);

        // Verify channel is deleted
        assert!(!channel::channel_exists<AptosCoin>(owner_addr), 1);

        // Verify owner received remaining balance
        let final_owner_balance = coin::balance<AptosCoin>(owner_addr);
        assert!(final_owner_balance == initial_owner_balance, 2);
    }

    #[test(aptos_framework = @0x1, owner = @0x123, destination = @0x456)]
    #[expected_failure(abort_code = 5)] // E_SETTLE_DELAY_NOT_ELAPSED
    fun test_finalize_before_delay_fails(
        aptos_framework: &signer,
        owner: &signer,
        destination: &signer,
    ) {
        setup_test(aptos_framework);

        let owner_addr = signer::address_of(owner);
        let dest_addr = signer::address_of(destination);

        create_account_with_coins(aptos_framework, owner, INITIAL_BALANCE);
        account::create_account_for_test(dest_addr);

        let pubkey = dummy_pubkey();

        // Open channel
        channel::open_channel<AptosCoin>(owner, dest_addr, pubkey, CHANNEL_AMOUNT, SETTLE_DELAY);

        // Set timestamp
        timestamp::update_global_time_for_test_secs(1000);

        // Request close
        channel::request_close<AptosCoin>(owner, owner_addr);

        // Try to finalize immediately (before settle delay)
        timestamp::update_global_time_for_test_secs(1000 + SETTLE_DELAY - 1);
        channel::finalize_close<AptosCoin>(owner, owner_addr);
    }

    #[test(aptos_framework = @0x1, owner = @0x123, destination = @0x456)]
    #[expected_failure(abort_code = 7)] // E_CLOSE_NOT_REQUESTED
    fun test_finalize_without_request_fails(
        aptos_framework: &signer,
        owner: &signer,
        destination: &signer,
    ) {
        setup_test(aptos_framework);

        let owner_addr = signer::address_of(owner);
        let dest_addr = signer::address_of(destination);

        create_account_with_coins(aptos_framework, owner, INITIAL_BALANCE);
        account::create_account_for_test(dest_addr);

        let pubkey = dummy_pubkey();

        // Open channel
        channel::open_channel<AptosCoin>(owner, dest_addr, pubkey, CHANNEL_AMOUNT, SETTLE_DELAY);

        // Try to finalize without requesting close
        channel::finalize_close<AptosCoin>(owner, owner_addr);
    }

    // ============================================
    // Claim Tests (Basic - signature verification is tested separately)
    // ============================================

    #[test(aptos_framework = @0x1, owner = @0x123, destination = @0x456)]
    #[expected_failure(abort_code = 6)] // E_UNAUTHORIZED
    fun test_claim_unauthorized_caller(
        aptos_framework: &signer,
        owner: &signer,
        destination: &signer,
    ) {
        setup_test(aptos_framework);

        let owner_addr = signer::address_of(owner);
        let dest_addr = signer::address_of(destination);

        create_account_with_coins(aptos_framework, owner, INITIAL_BALANCE);
        account::create_account_for_test(dest_addr);

        let pubkey = dummy_pubkey();
        let signature = dummy_signature();

        // Open channel
        channel::open_channel<AptosCoin>(owner, dest_addr, pubkey, CHANNEL_AMOUNT, SETTLE_DELAY);

        // Owner tries to claim (should fail - only destination can claim)
        channel::claim<AptosCoin>(owner, owner_addr, 1000, 1, signature);
    }

    #[test(aptos_framework = @0x1, owner = @0x123, destination = @0x456)]
    #[expected_failure(abort_code = 8)] // E_INVALID_NONCE
    fun test_nonce_replay_protection(
        aptos_framework: &signer,
        owner: &signer,
        destination: &signer,
    ) {
        setup_test(aptos_framework);

        let owner_addr = signer::address_of(owner);
        let dest_addr = signer::address_of(destination);

        create_account_with_coins(aptos_framework, owner, INITIAL_BALANCE);
        account::create_account_for_test(dest_addr);
        coin::register<AptosCoin>(destination);

        let pubkey = dummy_pubkey();
        let signature = dummy_signature();

        // Open channel
        channel::open_channel<AptosCoin>(owner, dest_addr, pubkey, CHANNEL_AMOUNT, SETTLE_DELAY);

        // Try to claim with nonce 0 (must be > current nonce which is 0)
        channel::claim<AptosCoin>(destination, owner_addr, 1000, 0, signature);
    }

    #[test(aptos_framework = @0x1, owner = @0x123, destination = @0x456)]
    #[expected_failure(abort_code = 4)] // E_INSUFFICIENT_BALANCE
    fun test_claim_exceeds_balance(
        aptos_framework: &signer,
        owner: &signer,
        destination: &signer,
    ) {
        setup_test(aptos_framework);

        let owner_addr = signer::address_of(owner);
        let dest_addr = signer::address_of(destination);

        create_account_with_coins(aptos_framework, owner, INITIAL_BALANCE);
        account::create_account_for_test(dest_addr);
        coin::register<AptosCoin>(destination);

        let pubkey = dummy_pubkey();
        let signature = dummy_signature();

        // Open channel with 1 APT
        channel::open_channel<AptosCoin>(owner, dest_addr, pubkey, CHANNEL_AMOUNT, SETTLE_DELAY);

        // Try to claim more than deposited
        channel::claim<AptosCoin>(destination, owner_addr, CHANNEL_AMOUNT + 1, 1, signature);
    }

    #[test(aptos_framework = @0x1, owner = @0x123, destination = @0x456)]
    #[expected_failure(abort_code = 3)] // E_INVALID_SIGNATURE
    fun test_claim_with_invalid_signature(
        aptos_framework: &signer,
        owner: &signer,
        destination: &signer,
    ) {
        setup_test(aptos_framework);

        let owner_addr = signer::address_of(owner);
        let dest_addr = signer::address_of(destination);

        create_account_with_coins(aptos_framework, owner, INITIAL_BALANCE);
        account::create_account_for_test(dest_addr);
        coin::register<AptosCoin>(destination);

        let pubkey = dummy_pubkey();
        let invalid_signature = dummy_signature(); // This won't match the message

        // Open channel
        channel::open_channel<AptosCoin>(owner, dest_addr, pubkey, CHANNEL_AMOUNT, SETTLE_DELAY);

        // Try to claim with invalid signature
        channel::claim<AptosCoin>(destination, owner_addr, 1000, 1, invalid_signature);
    }

    // ============================================
    // View Function Tests
    // ============================================

    #[test(aptos_framework = @0x1, owner = @0x123)]
    #[expected_failure(abort_code = 2)] // E_CHANNEL_NOT_FOUND
    fun test_get_channel_not_found(
        aptos_framework: &signer,
        owner: &signer,
    ) {
        setup_test(aptos_framework);

        let owner_addr = signer::address_of(owner);

        // Try to get non-existent channel
        channel::get_channel<AptosCoin>(owner_addr);
    }

    #[test(aptos_framework = @0x1, owner = @0x123, destination = @0x456)]
    fun test_get_destination_pubkey(
        aptos_framework: &signer,
        owner: &signer,
        destination: &signer,
    ) {
        setup_test(aptos_framework);

        let owner_addr = signer::address_of(owner);
        let dest_addr = signer::address_of(destination);

        create_account_with_coins(aptos_framework, owner, INITIAL_BALANCE);
        account::create_account_for_test(dest_addr);

        let pubkey = dummy_pubkey();

        // Open channel
        channel::open_channel<AptosCoin>(owner, dest_addr, pubkey, CHANNEL_AMOUNT, SETTLE_DELAY);

        // Get and verify destination pubkey
        let stored_pubkey = channel::get_destination_pubkey<AptosCoin>(owner_addr);
        assert!(stored_pubkey == pubkey, 1);
    }
}
