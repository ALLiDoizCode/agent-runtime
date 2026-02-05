/// M2M Token - Custom Coin for Aptos Payment Channels
///
/// A custom coin (legacy coin standard) for M2M payment channels on Aptos.
/// Uses the managed_coin pattern for mint/burn capabilities.
/// Compatible with payment_channel::channel which uses aptos_framework::coin.
module payment_channel::m2m_token {
    use std::string::utf8;
    use std::signer;
    use aptos_framework::coin::{Self, MintCapability, FreezeCapability, BurnCapability};

    // ============================================
    // Error Codes
    // ============================================

    /// Caller is not authorized (not the token admin)
    const E_NOT_AUTHORIZED: u64 = 1;

    /// Token has already been initialized
    const E_ALREADY_INITIALIZED: u64 = 2;

    /// Token has not been initialized yet
    const E_NOT_INITIALIZED: u64 = 3;

    // ============================================
    // Structs
    // ============================================

    /// The M2M coin type marker
    struct M2M has key {}

    /// Stores the capabilities for minting, freezing, and burning
    struct Capabilities has key {
        mint_cap: MintCapability<M2M>,
        freeze_cap: FreezeCapability<M2M>,
        burn_cap: BurnCapability<M2M>,
    }

    // ============================================
    // Initialization
    // ============================================

    /// Initialize the M2M token. Only called once during module publication.
    fun init_module(admin: &signer) {
        // Create the M2M coin with capabilities
        let (burn_cap, freeze_cap, mint_cap) = coin::initialize<M2M>(
            admin,
            utf8(b"M2M Token"),
            utf8(b"M2M"),
            8, // decimals (same as APT)
            true, // monitor_supply
        );

        // Store capabilities under admin account
        move_to(admin, Capabilities {
            mint_cap,
            freeze_cap,
            burn_cap,
        });
    }

    // ============================================
    // View Functions
    // ============================================

    #[view]
    /// Check if the token has been initialized
    public fun is_initialized(): bool {
        exists<Capabilities>(@payment_channel)
    }

    #[view]
    /// Get the balance of an account
    public fun balance(account: address): u64 {
        if (coin::is_account_registered<M2M>(account)) {
            coin::balance<M2M>(account)
        } else {
            0
        }
    }

    #[view]
    /// Get total supply of M2M tokens
    public fun total_supply(): u128 {
        let supply_opt = coin::supply<M2M>();
        if (std::option::is_some(&supply_opt)) {
            std::option::extract(&mut supply_opt)
        } else {
            0
        }
    }

    // ============================================
    // Entry Functions
    // ============================================

    /// Register an account to hold M2M tokens (must be called before receiving)
    public entry fun register(account: &signer) {
        if (!coin::is_account_registered<M2M>(signer::address_of(account))) {
            coin::register<M2M>(account);
        }
    }

    /// Mint tokens to a recipient. Only the admin can mint.
    /// The recipient must be registered to hold M2M tokens.
    public entry fun mint(
        admin: &signer,
        recipient: address,
        amount: u64,
    ) acquires Capabilities {
        assert!(signer::address_of(admin) == @payment_channel, E_NOT_AUTHORIZED);
        assert!(exists<Capabilities>(@payment_channel), E_NOT_INITIALIZED);

        let caps = borrow_global<Capabilities>(@payment_channel);
        let coins = coin::mint(amount, &caps.mint_cap);
        coin::deposit(recipient, coins);
    }

    /// Transfer tokens between accounts.
    public entry fun transfer(
        from: &signer,
        to: address,
        amount: u64,
    ) {
        coin::transfer<M2M>(from, to, amount);
    }

    /// Burn tokens from the caller's account
    public entry fun burn(
        account: &signer,
        amount: u64,
    ) acquires Capabilities {
        assert!(exists<Capabilities>(@payment_channel), E_NOT_INITIALIZED);

        let caps = borrow_global<Capabilities>(@payment_channel);
        let coins = coin::withdraw<M2M>(account, amount);
        coin::burn(coins, &caps.burn_cap);
    }

    // ============================================
    // Tests
    // ============================================

    #[test_only]
    use aptos_framework::account;

    #[test(admin = @payment_channel)]
    fun test_init_and_mint(admin: &signer) acquires Capabilities {
        // Setup
        account::create_account_for_test(signer::address_of(admin));

        // Initialize the token
        init_module(admin);

        // Verify initialization
        assert!(is_initialized(), 1);

        // Register admin to receive tokens
        register(admin);

        // Mint tokens to admin
        mint(admin, signer::address_of(admin), 1000000);

        // Check balance
        assert!(balance(signer::address_of(admin)) == 1000000, 2);
    }

    #[test(admin = @payment_channel, user = @0x123)]
    fun test_transfer(admin: &signer, user: &signer) acquires Capabilities {
        // Setup
        account::create_account_for_test(signer::address_of(admin));
        account::create_account_for_test(signer::address_of(user));

        // Initialize and mint
        init_module(admin);

        // Register both accounts
        register(admin);
        register(user);

        // Mint to admin
        mint(admin, signer::address_of(admin), 1000000);

        // Transfer to user
        transfer(admin, signer::address_of(user), 500000);

        // Check balances
        assert!(balance(signer::address_of(admin)) == 500000, 1);
        assert!(balance(signer::address_of(user)) == 500000, 2);
    }
}
