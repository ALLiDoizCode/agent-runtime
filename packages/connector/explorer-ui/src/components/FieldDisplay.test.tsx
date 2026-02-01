import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { AddressField, HexField } from './FieldDisplay';

describe('AddressField', () => {
  describe('with explorerUrl', () => {
    it('should render AddressField with external link icon when explorerUrl provided', () => {
      const { getByRole, getByLabelText } = render(
        <AddressField
          label="EVM Address"
          value="0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
          explorerUrl="https://sepolia.basescan.org/address/0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
        />
      );

      expect(getByRole('link')).toHaveAttribute(
        'href',
        'https://sepolia.basescan.org/address/0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb'
      );
      expect(getByLabelText('View on blockchain explorer')).toBeInTheDocument();
    });

    it('should open explorer URL in new tab when external link icon clicked', () => {
      const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
      const { getByLabelText } = render(
        <AddressField
          label="Address"
          value="0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
          explorerUrl="https://sepolia.basescan.org/address/0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
        />
      );

      fireEvent.click(getByLabelText('View on blockchain explorer'));
      expect(windowOpenSpy).toHaveBeenCalledWith(
        'https://sepolia.basescan.org/address/0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        '_blank',
        'noopener,noreferrer'
      );

      windowOpenSpy.mockRestore();
    });

    it('should open explorer URL in new tab when address text clicked', () => {
      const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
      const { getByRole } = render(
        <AddressField
          label="Address"
          value="0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
          explorerUrl="https://sepolia.basescan.org/address/0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
        />
      );

      fireEvent.click(getByRole('link'));
      expect(windowOpenSpy).toHaveBeenCalledWith(
        'https://sepolia.basescan.org/address/0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        '_blank',
        'noopener,noreferrer'
      );

      windowOpenSpy.mockRestore();
    });

    it('should keep copy button functional with explorerUrl present', async () => {
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: {
          writeText: writeTextMock,
        },
      });

      const { getByTitle } = render(
        <AddressField
          label="Address"
          value="0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
          explorerUrl="https://sepolia.basescan.org/address/0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
        />
      );

      const copyButton = getByTitle('Copy to clipboard');
      fireEvent.click(copyButton);

      expect(writeTextMock).toHaveBeenCalledWith('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb');
    });
  });

  describe('without explorerUrl', () => {
    it('should render AddressField without external link when explorerUrl not provided', () => {
      const { queryByRole, queryByLabelText } = render(
        <AddressField label="ILP Address" value="g.alice" />
      );

      expect(queryByRole('link')).not.toBeInTheDocument();
      expect(queryByLabelText('View on blockchain explorer')).not.toBeInTheDocument();
    });

    it('should render address as plain text when no explorerUrl', () => {
      const { getByText } = render(<AddressField label="ILP Address" value="g.alice" />);

      const addressText = getByText('g.alice');
      expect(addressText.tagName).toBe('SPAN');
    });
  });
});

describe('HexField', () => {
  describe('with explorerUrl', () => {
    it('should render HexField with external link icon when explorerUrl provided', () => {
      const { getByRole, getByLabelText } = render(
        <HexField
          label="Transaction Hash"
          value="0xb206e544e69642e894f4eb4d2ba8b6e2b26bf1fd4b5a76cfc0d73c55ca725b6a"
          explorerUrl="https://explorer.aptoslabs.com/txn/0xb206e544e69642e894f4eb4d2ba8b6e2b26bf1fd4b5a76cfc0d73c55ca725b6a?network=testnet"
        />
      );

      expect(getByRole('link')).toHaveAttribute(
        'href',
        'https://explorer.aptoslabs.com/txn/0xb206e544e69642e894f4eb4d2ba8b6e2b26bf1fd4b5a76cfc0d73c55ca725b6a?network=testnet'
      );
      expect(getByLabelText('View on blockchain explorer')).toBeInTheDocument();
    });

    it('should expand/collapse on click without opening explorer link when truncated', () => {
      const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
      const longValue = '0xb206e544e69642e894f4eb4d2ba8b6e2b26bf1fd4b5a76cfc0d73c55ca725b6a';

      const { getByRole } = render(
        <HexField label="Hash" value={longValue} maxLength={32} explorerUrl="https://example.com" />
      );

      // Value should be truncated initially
      const link = getByRole('link');
      expect(link.textContent).not.toBe(longValue);

      // Click should expand, not open link
      fireEvent.click(link);
      expect(windowOpenSpy).not.toHaveBeenCalled();

      windowOpenSpy.mockRestore();
    });

    it('should open explorer URL when external link icon clicked', () => {
      const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
      const { getByLabelText } = render(
        <HexField
          label="Hash"
          value="0xb206e544e69642e894f4eb4d2ba8b6e2b26bf1fd4b5a76cfc0d73c55ca725b6a"
          explorerUrl="https://explorer.aptoslabs.com/txn/0xb206e544e69642e894f4eb4d2ba8b6e2b26bf1fd4b5a76cfc0d73c55ca725b6a?network=testnet"
        />
      );

      fireEvent.click(getByLabelText('View on blockchain explorer'));
      expect(windowOpenSpy).toHaveBeenCalledWith(
        'https://explorer.aptoslabs.com/txn/0xb206e544e69642e894f4eb4d2ba8b6e2b26bf1fd4b5a76cfc0d73c55ca725b6a?network=testnet',
        '_blank',
        'noopener,noreferrer'
      );

      windowOpenSpy.mockRestore();
    });

    it('should keep copy button functional with explorerUrl present', async () => {
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: {
          writeText: writeTextMock,
        },
      });

      const txHash = '0xb206e544e69642e894f4eb4d2ba8b6e2b26bf1fd4b5a76cfc0d73c55ca725b6a';
      const { getByTitle } = render(
        <HexField
          label="Hash"
          value={txHash}
          explorerUrl="https://explorer.aptoslabs.com/txn/..."
        />
      );

      const copyButton = getByTitle('Copy to clipboard');
      fireEvent.click(copyButton);

      expect(writeTextMock).toHaveBeenCalledWith(txHash);
    });
  });

  describe('without explorerUrl', () => {
    it('should render HexField without external link when explorerUrl not provided', () => {
      const { queryByRole, queryByLabelText } = render(
        <HexField label="Hash" value="0xabcdef1234567890" />
      );

      expect(queryByRole('link')).not.toBeInTheDocument();
      expect(queryByLabelText('View on blockchain explorer')).not.toBeInTheDocument();
    });

    it('should render truncated hex value as plain span when no explorerUrl', () => {
      const longValue = '0xb206e544e69642e894f4eb4d2ba8b6e2b26bf1fd4b5a76cfc0d73c55ca725b6a';
      const { container } = render(<HexField label="Hash" value={longValue} maxLength={32} />);

      // Should be a span, not a link
      const spans = container.querySelectorAll('span.font-mono.text-xs');
      expect(spans.length).toBeGreaterThan(0);
    });

    it('should expand/collapse on click when truncated without explorerUrl', () => {
      const longValue = '0xb206e544e69642e894f4eb4d2ba8b6e2b26bf1fd4b5a76cfc0d73c55ca725b6a';
      const { container } = render(<HexField label="Hash" value={longValue} maxLength={32} />);

      const valueSpan = container.querySelector('span.font-mono.text-xs.break-all');
      expect(valueSpan).toBeInTheDocument();
      expect(valueSpan?.textContent).not.toBe(longValue);

      // Click to expand
      if (valueSpan) {
        fireEvent.click(valueSpan);
      }

      // Should now show full value
      expect(valueSpan?.textContent).toBe(longValue);
    });
  });
});
