import * as React from 'react';
import { ExternalLink } from 'lucide-react';
import {
  isEthereumAddress,
  isTransactionHash,
  getAddressExplorerUrl,
  getTransactionExplorerUrl,
  truncateHash,
} from '@/lib/event-types';

interface ExplorerLinkProps {
  /** The value to display and link (address or transaction hash) */
  value: string;
  /** Optional label to show instead of the value */
  label?: string;
  /** Whether to truncate the displayed value */
  truncate?: boolean;
  /** Whether to show the external link icon */
  showIcon?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * ExplorerLink component - renders a clickable link to the block explorer
 * Automatically detects whether the value is an Ethereum address or transaction hash
 * and links to the appropriate Base Sepolia explorer page.
 *
 * If the value is not a valid address or hash, it renders as plain text.
 */
export const ExplorerLink = React.memo(function ExplorerLink({
  value,
  label,
  truncate = true,
  showIcon = false,
  className = '',
}: ExplorerLinkProps) {
  const isAddress = isEthereumAddress(value);
  const isTxHash = isTransactionHash(value);

  // If not a valid address or hash, render as plain text
  if (!isAddress && !isTxHash) {
    return (
      <span className={`font-mono ${className}`} title={value}>
        {label || value}
      </span>
    );
  }

  const explorerUrl = isAddress ? getAddressExplorerUrl(value) : getTransactionExplorerUrl(value);
  const displayValue = label || (truncate ? truncateHash(value) : value);
  const linkType = isAddress ? 'address' : 'transaction';

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent parent click handlers (e.g., row selection)
  };

  return (
    <a
      href={explorerUrl}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleClick}
      className={`font-mono text-blue-400 hover:text-blue-300 hover:underline inline-flex items-center gap-1 ${className}`}
      title={`View ${linkType} on Base Sepolia explorer: ${value}`}
    >
      {displayValue}
      {showIcon && <ExternalLink className="h-3 w-3 shrink-0" />}
    </a>
  );
});
