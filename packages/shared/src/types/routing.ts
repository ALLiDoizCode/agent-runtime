/**
 * Routing table types for ILP connector
 * @packageDocumentation
 * @see {@link https://github.com/interledger/rfcs/blob/master/0027-interledger-protocol-4/0027-interledger-protocol-4.md|RFC-0027: Interledger Protocol v4}
 */

import { ILPAddress } from './ilp';

/**
 * Routing table entry mapping ILP address prefix to next-hop peer
 * @remarks
 * Used by RoutingTable to maintain mappings for longest-prefix matching per RFC-0027.
 * The priority field enables tie-breaking when multiple routes have equal prefix lengths.
 */
export interface RoutingTableEntry {
  /**
   * ILP address prefix (e.g., "g.alice" or "g.bob.crypto")
   * Must be a valid ILP address per RFC-0015
   */
  prefix: ILPAddress;

  /**
   * Peer identifier matching BTP connection
   * References a connected peer in the connector's peer list
   */
  nextHop: string;

  /**
   * Route priority for tie-breaking (optional, default 0)
   * Higher priority wins when multiple routes have same prefix length
   */
  priority?: number;
}
