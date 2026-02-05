/**
 * Unit tests for testnet-config.ts
 *
 * Tests the network mode configuration system that switches between
 * local Docker containers and public testnets.
 */

import {
  parseNetworkMode,
  getChainUrls,
  getTimeouts,
  TESTNET_URLS,
  LOCAL_URLS,
  TIMEOUTS,
} from './testnet-config';

describe('testnet-config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('parseNetworkMode', () => {
    it('returns local when NETWORK_MODE not set', () => {
      delete process.env.NETWORK_MODE;
      expect(parseNetworkMode()).toBe('local');
    });

    it('returns local when NETWORK_MODE is empty string', () => {
      process.env.NETWORK_MODE = '';
      expect(parseNetworkMode()).toBe('local');
    });

    it('returns local when NETWORK_MODE=local', () => {
      process.env.NETWORK_MODE = 'local';
      expect(parseNetworkMode()).toBe('local');
    });

    it('returns testnet when NETWORK_MODE=testnet', () => {
      process.env.NETWORK_MODE = 'testnet';
      expect(parseNetworkMode()).toBe('testnet');
    });

    it('returns testnet when NETWORK_MODE=TESTNET (case insensitive)', () => {
      process.env.NETWORK_MODE = 'TESTNET';
      expect(parseNetworkMode()).toBe('testnet');
    });

    it('returns testnet when NETWORK_MODE=Testnet (mixed case)', () => {
      process.env.NETWORK_MODE = 'Testnet';
      expect(parseNetworkMode()).toBe('testnet');
    });

    it('returns local for invalid values', () => {
      process.env.NETWORK_MODE = 'invalid';
      expect(parseNetworkMode()).toBe('local');
    });

    it('returns local for production (unsupported mode)', () => {
      process.env.NETWORK_MODE = 'production';
      expect(parseNetworkMode()).toBe('local');
    });
  });

  describe('getChainUrls', () => {
    describe('testnet mode', () => {
      it('returns testnet URLs when networkMode is testnet', () => {
        const urls = getChainUrls('testnet', false);

        expect(urls.aptosNodeUrl).toBe(TESTNET_URLS.aptos.nodeUrl);
        expect(urls.aptosFaucetUrl).toBe(TESTNET_URLS.aptos.faucetUrl);
        expect(urls.xrpWssUrl).toBe(TESTNET_URLS.xrp.wssUrl);
        expect(urls.xrpRpcUrl).toBe(TESTNET_URLS.xrp.rpcUrl);
        expect(urls.xrpFaucetUrl).toBe(TESTNET_URLS.xrp.faucetUrl);
        expect(urls.evmRpcUrl).toBe(TESTNET_URLS.evm.rpcUrl);
        expect(urls.evmChainId).toBe(TESTNET_URLS.evm.chainId);
      });

      it('returns same testnet URLs regardless of isDocker flag', () => {
        const urlsDocker = getChainUrls('testnet', true);
        const urlsHost = getChainUrls('testnet', false);

        expect(urlsDocker).toEqual(urlsHost);
      });

      it('allows environment variable overrides for Aptos testnet', () => {
        process.env.APTOS_TESTNET_NODE_URL = 'https://custom-aptos-node.com/v1';
        process.env.APTOS_TESTNET_FAUCET_URL = 'https://custom-aptos-faucet.com';

        const urls = getChainUrls('testnet', false);

        expect(urls.aptosNodeUrl).toBe('https://custom-aptos-node.com/v1');
        expect(urls.aptosFaucetUrl).toBe('https://custom-aptos-faucet.com');
      });

      it('allows environment variable overrides for XRP testnet', () => {
        process.env.XRP_TESTNET_WSS_URL = 'wss://custom-xrp.com:51233';
        process.env.XRP_TESTNET_RPC_URL = 'https://custom-xrp-rpc.com';
        process.env.XRP_TESTNET_FAUCET_URL = 'https://custom-xrp-faucet.com';

        const urls = getChainUrls('testnet', false);

        expect(urls.xrpWssUrl).toBe('wss://custom-xrp.com:51233');
        expect(urls.xrpRpcUrl).toBe('https://custom-xrp-rpc.com');
        expect(urls.xrpFaucetUrl).toBe('https://custom-xrp-faucet.com');
      });

      it('allows environment variable override for Base Sepolia', () => {
        process.env.BASE_SEPOLIA_RPC_URL = 'https://custom-base-sepolia.com';

        const urls = getChainUrls('testnet', false);

        expect(urls.evmRpcUrl).toBe('https://custom-base-sepolia.com');
      });
    });

    describe('local mode - Docker context', () => {
      it('returns Docker network hostnames when isDocker is true', () => {
        const urls = getChainUrls('local', true);

        expect(urls.aptosNodeUrl).toBe(LOCAL_URLS.aptos.nodeUrl);
        expect(urls.aptosFaucetUrl).toBe(LOCAL_URLS.aptos.faucetUrl);
        expect(urls.xrpWssUrl).toBe(LOCAL_URLS.xrp.wssUrl);
        expect(urls.xrpRpcUrl).toBe(LOCAL_URLS.xrp.rpcUrl);
        expect(urls.xrpFaucetUrl).toBeNull(); // Local uses genesis funding
        expect(urls.evmRpcUrl).toBe(LOCAL_URLS.evm.rpcUrl);
        expect(urls.evmChainId).toBe(LOCAL_URLS.evm.chainId);
      });

      it('returns null xrpFaucetUrl for local mode (uses genesis funding)', () => {
        const urls = getChainUrls('local', true);
        expect(urls.xrpFaucetUrl).toBeNull();
      });
    });

    describe('local mode - Host context', () => {
      it('returns localhost URLs when isDocker is false', () => {
        const urls = getChainUrls('local', false);

        expect(urls.aptosNodeUrl).toBe('http://localhost:8080');
        expect(urls.aptosFaucetUrl).toBe('http://localhost:8081');
        expect(urls.xrpWssUrl).toBe('ws://localhost:6006');
        expect(urls.xrpRpcUrl).toBe('http://localhost:5005');
        expect(urls.xrpFaucetUrl).toBeNull();
        expect(urls.evmRpcUrl).toBe('http://localhost:8545');
        expect(urls.evmChainId).toBe(31337);
      });
    });

    describe('local mode - environment overrides', () => {
      it('allows environment variable overrides for Aptos local', () => {
        process.env.APTOS_NODE_URL = 'http://custom-local:8080';
        process.env.APTOS_FAUCET_URL = 'http://custom-local:8081';

        const urls = getChainUrls('local', true);

        expect(urls.aptosNodeUrl).toBe('http://custom-local:8080');
        expect(urls.aptosFaucetUrl).toBe('http://custom-local:8081');
      });

      it('allows environment variable overrides for XRP local', () => {
        process.env.XRPL_WSS_URL = 'ws://custom-rippled:6006';
        process.env.XRPL_RPC_URL = 'http://custom-rippled:5005';

        const urls = getChainUrls('local', true);

        expect(urls.xrpWssUrl).toBe('ws://custom-rippled:6006');
        expect(urls.xrpRpcUrl).toBe('http://custom-rippled:5005');
      });

      it('allows environment variable override for Anvil', () => {
        process.env.ANVIL_RPC_URL = 'http://custom-anvil:8545';

        const urls = getChainUrls('local', true);

        expect(urls.evmRpcUrl).toBe('http://custom-anvil:8545');
      });
    });
  });

  describe('getTimeouts', () => {
    it('returns local timeouts for local mode', () => {
      const timeouts = getTimeouts('local');

      expect(timeouts).toEqual(TIMEOUTS.local);
      expect(timeouts.faucetWait).toBe(5000);
      expect(timeouts.transactionWait).toBe(10000);
      expect(timeouts.healthCheck).toBe(30000);
      expect(timeouts.httpRequest).toBe(10000);
    });

    it('returns testnet timeouts for testnet mode', () => {
      const timeouts = getTimeouts('testnet');

      expect(timeouts).toEqual(TIMEOUTS.testnet);
      expect(timeouts.faucetWait).toBe(30000);
      expect(timeouts.transactionWait).toBe(60000);
      expect(timeouts.healthCheck).toBe(60000);
      expect(timeouts.httpRequest).toBe(30000);
    });

    it('testnet timeouts are longer than local timeouts', () => {
      const localTimeouts = getTimeouts('local');
      const testnetTimeouts = getTimeouts('testnet');

      expect(testnetTimeouts.faucetWait).toBeGreaterThan(localTimeouts.faucetWait);
      expect(testnetTimeouts.transactionWait).toBeGreaterThan(localTimeouts.transactionWait);
      expect(testnetTimeouts.healthCheck).toBeGreaterThan(localTimeouts.healthCheck);
      expect(testnetTimeouts.httpRequest).toBeGreaterThan(localTimeouts.httpRequest);
    });
  });

  describe('TESTNET_URLS constants', () => {
    it('has correct Aptos testnet URLs', () => {
      expect(TESTNET_URLS.aptos.nodeUrl).toBe('https://fullnode.testnet.aptoslabs.com/v1');
      expect(TESTNET_URLS.aptos.faucetUrl).toBe('https://faucet.testnet.aptoslabs.com');
    });

    it('has correct XRP testnet URLs', () => {
      expect(TESTNET_URLS.xrp.wssUrl).toBe('wss://s.altnet.rippletest.net:51233');
      expect(TESTNET_URLS.xrp.rpcUrl).toBe('https://s.altnet.rippletest.net:51234');
      expect(TESTNET_URLS.xrp.faucetUrl).toBe('https://faucet.altnet.rippletest.net');
    });

    it('has correct Base Sepolia URLs', () => {
      expect(TESTNET_URLS.evm.rpcUrl).toBe('https://sepolia.base.org');
      expect(TESTNET_URLS.evm.chainId).toBe(84532);
    });
  });

  describe('LOCAL_URLS constants', () => {
    it('has correct Aptos local URLs', () => {
      expect(LOCAL_URLS.aptos.nodeUrl).toBe('http://aptos-local:8080');
      expect(LOCAL_URLS.aptos.faucetUrl).toBe('http://aptos-local:8081');
    });

    it('has correct XRP local URLs', () => {
      expect(LOCAL_URLS.xrp.wssUrl).toBe('ws://rippled:6006');
      expect(LOCAL_URLS.xrp.rpcUrl).toBe('http://rippled:5005');
    });

    it('has correct Anvil local URLs', () => {
      expect(LOCAL_URLS.evm.rpcUrl).toBe('http://anvil:8545');
      expect(LOCAL_URLS.evm.chainId).toBe(31337);
    });
  });
});
