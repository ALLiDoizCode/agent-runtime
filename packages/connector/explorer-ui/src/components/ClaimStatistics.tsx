/**
 * ClaimStatistics Component - Story 17.6
 *
 * Displays tri-chain claim exchange statistics with time range selection.
 * Shows claim send/receive/redemption counts and success rates for XRP, EVM, and Aptos.
 */

import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';
import { ClaimBlockchain, getBlockchainBadgeColor } from '../lib/event-types';

/**
 * Statistics for a single blockchain
 */
export interface ClaimStats {
  blockchain: ClaimBlockchain;
  sentCount: number;
  receivedCount: number;
  redeemedCount: number;
  verificationFailures: number;
  successRate: number; // 0.0 to 1.0
}

/**
 * ClaimStatistics component props
 */
export interface ClaimStatisticsProps {
  /** Statistics for each blockchain */
  stats: ClaimStats[];
  /** Selected time range */
  timeRange: '1h' | '24h' | '7d';
  /** Callback when time range changes */
  onTimeRangeChange?: (range: '1h' | '24h' | '7d') => void;
}

/**
 * Get success rate color class based on percentage
 */
function getSuccessRateColor(rate: number): string {
  if (rate >= 0.95) return 'text-green-600 bg-green-50';
  if (rate >= 0.9) return 'text-yellow-600 bg-yellow-50';
  return 'text-red-600 bg-red-50';
}

/**
 * Format success rate as percentage
 */
function formatSuccessRate(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

/**
 * Single blockchain statistics card
 */
const BlockchainStatCard: React.FC<{ stats: ClaimStats }> = ({ stats }) => {
  const successRateColor = getSuccessRateColor(stats.successRate);

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{stats.blockchain.toUpperCase()} Ledger</CardTitle>
          <Badge
            variant="outline"
            className={`text-xs border ${getBlockchainBadgeColor(stats.blockchain)}`}
          >
            {stats.blockchain.toUpperCase()}
          </Badge>
        </div>
        <CardDescription>Claim exchange statistics</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Claim counts */}
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Sent</p>
            <p className="text-2xl font-bold">{stats.sentCount}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Received</p>
            <p className="text-2xl font-bold">{stats.receivedCount}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Redeemed</p>
            <p className="text-2xl font-bold">{stats.redeemedCount}</p>
          </div>
        </div>

        {/* Success rate */}
        <div className="pt-2 border-t">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted-foreground">Success Rate</span>
            <span className={`text-sm font-semibold px-2 py-0.5 rounded ${successRateColor}`}>
              {formatSuccessRate(stats.successRate)}
            </span>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${
                stats.successRate >= 0.95
                  ? 'bg-green-600'
                  : stats.successRate >= 0.9
                    ? 'bg-yellow-600'
                    : 'bg-red-600'
              }`}
              style={{ width: `${stats.successRate * 100}%` }}
            />
          </div>
        </div>

        {/* Verification failures */}
        {stats.verificationFailures > 0 && (
          <div className="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded text-xs">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <span className="text-red-600">
              {stats.verificationFailures} verification{' '}
              {stats.verificationFailures === 1 ? 'failure' : 'failures'}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

/**
 * ClaimStatistics component
 *
 * Displays claim exchange statistics across three blockchains (XRP, EVM, Aptos)
 * with time range selection.
 *
 * @example
 * ```tsx
 * <ClaimStatistics
 *   stats={[
 *     {
 *       blockchain: 'xrp',
 *       sentCount: 150,
 *       receivedCount: 145,
 *       redeemedCount: 140,
 *       verificationFailures: 5,
 *       successRate: 0.933
 *     },
 *     {
 *       blockchain: 'evm',
 *       sentCount: 200,
 *       receivedCount: 198,
 *       redeemedCount: 195,
 *       verificationFailures: 2,
 *       successRate: 0.975
 *     },
 *     {
 *       blockchain: 'aptos',
 *       sentCount: 80,
 *       receivedCount: 79,
 *       redeemedCount: 78,
 *       verificationFailures: 1,
 *       successRate: 0.975
 *     }
 *   ]}
 *   timeRange="24h"
 *   onTimeRangeChange={(range) => console.log('Changed to:', range)}
 * />
 * ```
 */
export function ClaimStatistics({
  stats,
  timeRange,
  onTimeRangeChange,
}: ClaimStatisticsProps): React.ReactElement {
  const handleTabChange = (value: string) => {
    if (value === '1h' || value === '24h' || value === '7d') {
      onTimeRangeChange?.(value);
    }
  };

  return (
    <div className="w-full space-y-4">
      {/* Time range selector */}
      <Tabs value={timeRange} onValueChange={handleTabChange}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Claim Exchange Statistics</h3>
          <TabsList>
            <TabsTrigger value="1h">1 Hour</TabsTrigger>
            <TabsTrigger value="24h">24 Hours</TabsTrigger>
            <TabsTrigger value="7d">7 Days</TabsTrigger>
          </TabsList>
        </div>

        {/* Statistics cards */}
        <TabsContent value={timeRange} className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {stats.map((blockchainStats) => (
              <BlockchainStatCard key={blockchainStats.blockchain} stats={blockchainStats} />
            ))}
          </div>

          {/* Empty state */}
          {stats.length === 0 && (
            <div className="p-8 text-center text-muted-foreground">
              <p className="text-sm">No claim statistics available for this time range</p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
