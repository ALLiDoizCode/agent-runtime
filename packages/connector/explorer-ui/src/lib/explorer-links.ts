/**
 * Explorer Links Utility
 *
 * Centralized utility for building blockchain explorer URLs and detecting address types.
 * Supports Aptos, EVM (Base), and XRP blockchain explorers.
 */

/**
 * Supported blockchain address types
 */
export type AddressType = 'aptos' | 'evm' | 'xrp' | 'unknown';

/**
 * Resource types for explorer URLs
 */
export type ResourceType = 'address' | 'tx';

/**
 * Explorer configuration for testnet and mainnet URLs
 */
export interface ExplorerConfig {
  aptos: {
    testnet: string;
    mainnet: string;
  };
  evm: {
    testnet: string;
    mainnet: string;
  };
  xrp: {
    testnet: string;
    mainnet: string;
  };
}

/**
 * Explorer base URLs for all supported blockchains
 */
export const EXPLORER_CONFIG: ExplorerConfig = {
  aptos: {
    testnet: 'https://explorer.aptoslabs.com',
    mainnet: 'https://explorer.aptoslabs.com'
  },
  evm: {
    testnet: 'https://sepolia.basescan.org',
    mainnet: 'https://etherscan.io'
  },
  xrp: {
    testnet: 'https://testnet.xrpl.org',
    mainnet: 'https://livenet.xrpl.org'
  }
};

/**
 * Detect the blockchain type based on address format
 *
 * @param address - The address string to analyze
 * @returns The detected blockchain type or 'unknown'
 *
 * @example
 * detectAddressType('0xb206e544e69642e894f4eb4d2ba8b6e2b26bf1fd4b5a76cfc0d73c55ca725b6a')
 * // returns 'aptos'
 *
 * detectAddressType('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb')
 * // returns 'evm'
 *
 * detectAddressType('r3rfPzeWF9gSwi1zBP664vJGavk9faAkpR')
 * // returns 'xrp'
 */
export function detectAddressType(address: string): AddressType {
  if (!address || typeof address !== 'string') {
    return 'unknown';
  }

  // Normalize input (trim whitespace)
  const normalized = address.trim();

  // Aptos addresses: 0x + 64 hex chars = 66 total
  if (/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
    return 'aptos';
  }

  // EVM addresses: 0x + 40 hex chars = 42 total
  if (/^0x[0-9a-fA-F]{40}$/.test(normalized)) {
    return 'evm';
  }

  // XRP addresses: start with 'r' + base58 (25-35 chars typical)
  // Base58 charset: rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz
  if (/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(normalized)) {
    return 'xrp';
  }

  return 'unknown';
}

/**
 * Generate a blockchain explorer URL for an address or transaction hash
 *
 * @param value - The address or transaction hash
 * @param type - The resource type ('address' or 'tx')
 * @param chain - Optional blockchain type (auto-detected if not provided)
 * @param network - Network to use ('testnet' or 'mainnet')
 * @returns The explorer URL or null if detection fails
 *
 * @example
 * getExplorerUrl('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb', 'address')
 * // returns 'https://sepolia.basescan.org/address/0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb'
 *
 * getExplorerUrl('0xb206...', 'tx', 'aptos')
 * // returns 'https://explorer.aptoslabs.com/txn/0xb206...?network=testnet'
 */
export function getExplorerUrl(
  value: string,
  type: ResourceType = 'address',
  chain?: AddressType,
  network: 'testnet' | 'mainnet' = 'testnet'
): string | null {
  if (!value || typeof value !== 'string') {
    return null;
  }

  // Auto-detect chain if not provided
  const detectedChain = chain ?? detectAddressType(value);

  if (detectedChain === 'unknown') {
    return null;
  }

  const baseUrl = EXPLORER_CONFIG[detectedChain][network];

  switch (detectedChain) {
    case 'aptos':
      return type === 'tx'
        ? `${baseUrl}/txn/${value}?network=${network}`
        : `${baseUrl}/account/${value}?network=${network}`;
    case 'evm':
      return type === 'tx'
        ? `${baseUrl}/tx/${value}`
        : `${baseUrl}/address/${value}`;
    case 'xrp':
      return type === 'tx'
        ? `${baseUrl}/transactions/${value}`
        : `${baseUrl}/accounts/${value}`;
    default:
      return null;
  }
}
