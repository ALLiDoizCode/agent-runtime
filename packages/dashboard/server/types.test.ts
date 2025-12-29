/**
 * Unit tests for telemetry message type guards
 */

import {
  isTelemetryMessage,
  isNodeStatusMessage,
  isPacketSentMessage,
  isPacketReceivedMessage,
  isRouteLookupMessage,
  TelemetryMessage,
} from './types';

describe('Telemetry Message Type Guards', () => {
  describe('isTelemetryMessage', () => {
    test('should return true for valid telemetry message', () => {
      const validMessage = {
        type: 'NODE_STATUS',
        nodeId: 'connector-a',
        timestamp: '2025-12-29T00:00:00.000Z',
        data: {},
      };

      expect(isTelemetryMessage(validMessage)).toBe(true);
    });

    test('should return false for message with missing type', () => {
      const invalidMessage = {
        nodeId: 'connector-a',
        timestamp: '2025-12-29T00:00:00.000Z',
        data: {},
      };

      expect(isTelemetryMessage(invalidMessage)).toBe(false);
    });

    test('should return false for message with missing nodeId', () => {
      const invalidMessage = {
        type: 'NODE_STATUS',
        timestamp: '2025-12-29T00:00:00.000Z',
        data: {},
      };

      expect(isTelemetryMessage(invalidMessage)).toBe(false);
    });

    test('should return false for message with missing timestamp', () => {
      const invalidMessage = {
        type: 'NODE_STATUS',
        nodeId: 'connector-a',
        data: {},
      };

      expect(isTelemetryMessage(invalidMessage)).toBe(false);
    });

    test('should return false for message with missing data', () => {
      const invalidMessage = {
        type: 'NODE_STATUS',
        nodeId: 'connector-a',
        timestamp: '2025-12-29T00:00:00.000Z',
      };

      expect(isTelemetryMessage(invalidMessage)).toBe(false);
    });

    test('should return false for null data', () => {
      const invalidMessage = {
        type: 'NODE_STATUS',
        nodeId: 'connector-a',
        timestamp: '2025-12-29T00:00:00.000Z',
        data: null,
      };

      expect(isTelemetryMessage(invalidMessage)).toBe(false);
    });

    test('should return false for null message', () => {
      expect(isTelemetryMessage(null)).toBe(false);
    });

    test('should return false for undefined message', () => {
      expect(isTelemetryMessage(undefined)).toBe(false);
    });
  });

  describe('isNodeStatusMessage', () => {
    test('should return true for valid NODE_STATUS message', () => {
      const validMessage: TelemetryMessage = {
        type: 'NODE_STATUS',
        nodeId: 'connector-a',
        timestamp: '2025-12-29T00:00:00.000Z',
        data: {
          routes: [{ prefix: 'g.connectorB', nextHop: 'connectorB' }],
          peers: [{ id: 'connectorB', url: 'ws://connector-b:3000', connected: true }],
          health: 'healthy',
          uptime: 3600,
          peersConnected: 1,
          totalPeers: 1,
        },
      };

      expect(isNodeStatusMessage(validMessage)).toBe(true);
    });

    test('should return false for message with wrong type', () => {
      const invalidMessage: TelemetryMessage = {
        type: 'PACKET_SENT',
        nodeId: 'connector-a',
        timestamp: '2025-12-29T00:00:00.000Z',
        data: {},
      };

      expect(isNodeStatusMessage(invalidMessage)).toBe(false);
    });

    test('should return false for NODE_STATUS with missing routes', () => {
      const invalidMessage: any = {
        type: 'NODE_STATUS',
        nodeId: 'connector-a',
        timestamp: '2025-12-29T00:00:00.000Z',
        data: {
          peers: [],
          health: 'healthy',
          uptime: 0,
          peersConnected: 0,
          totalPeers: 0,
        },
      };

      expect(isNodeStatusMessage(invalidMessage)).toBe(false);
    });

    test('should return false for NODE_STATUS with invalid health value', () => {
      const invalidMessage: any = {
        type: 'NODE_STATUS',
        nodeId: 'connector-a',
        timestamp: '2025-12-29T00:00:00.000Z',
        data: {
          routes: [],
          peers: [],
          health: 'invalid-health',
          uptime: 0,
          peersConnected: 0,
          totalPeers: 0,
        },
      };

      expect(isNodeStatusMessage(invalidMessage)).toBe(false);
    });

    test('should return true for all valid health states', () => {
      const healthStates = ['healthy', 'unhealthy', 'starting'];

      healthStates.forEach((health) => {
        const message: any = {
          type: 'NODE_STATUS',
          nodeId: 'connector-a',
          timestamp: '2025-12-29T00:00:00.000Z',
          data: {
            routes: [],
            peers: [],
            health,
            uptime: 0,
            peersConnected: 0,
            totalPeers: 0,
          },
        };

        expect(isNodeStatusMessage(message)).toBe(true);
      });
    });
  });

  describe('isPacketSentMessage', () => {
    test('should return true for valid PACKET_SENT message', () => {
      const validMessage: TelemetryMessage = {
        type: 'PACKET_SENT',
        nodeId: 'connector-b',
        timestamp: '2025-12-29T00:00:02.000Z',
        data: {
          packetId: 'prepare-abc123',
          nextHop: 'connectorC',
          timestamp: '2025-12-29T00:00:02.000Z',
        },
      };

      expect(isPacketSentMessage(validMessage)).toBe(true);
    });

    test('should return false for PACKET_SENT with missing packetId', () => {
      const invalidMessage: any = {
        type: 'PACKET_SENT',
        nodeId: 'connector-b',
        timestamp: '2025-12-29T00:00:02.000Z',
        data: {
          nextHop: 'connectorC',
          timestamp: '2025-12-29T00:00:02.000Z',
        },
      };

      expect(isPacketSentMessage(invalidMessage)).toBe(false);
    });

    test('should return false for PACKET_SENT with missing nextHop', () => {
      const invalidMessage: any = {
        type: 'PACKET_SENT',
        nodeId: 'connector-b',
        timestamp: '2025-12-29T00:00:02.000Z',
        data: {
          packetId: 'prepare-abc123',
          timestamp: '2025-12-29T00:00:02.000Z',
        },
      };

      expect(isPacketSentMessage(invalidMessage)).toBe(false);
    });
  });

  describe('isPacketReceivedMessage', () => {
    test('should return true for valid PACKET_RECEIVED message', () => {
      const validMessage: TelemetryMessage = {
        type: 'PACKET_RECEIVED',
        nodeId: 'connector-b',
        timestamp: '2025-12-29T00:00:01.000Z',
        data: {
          packetId: 'prepare-abc123',
          packetType: 'PREPARE',
          source: 'connector-a',
          destination: 'g.connectorC.dest',
          amount: '1000',
        },
      };

      expect(isPacketReceivedMessage(validMessage)).toBe(true);
    });

    test('should return true for all valid packet types', () => {
      const packetTypes = ['PREPARE', 'FULFILL', 'REJECT'];

      packetTypes.forEach((packetType) => {
        const message: any = {
          type: 'PACKET_RECEIVED',
          nodeId: 'connector-b',
          timestamp: '2025-12-29T00:00:01.000Z',
          data: {
            packetId: 'test-packet',
            packetType,
            source: 'connector-a',
            destination: 'g.dest',
            amount: '1000',
          },
        };

        expect(isPacketReceivedMessage(message)).toBe(true);
      });
    });

    test('should return false for PACKET_RECEIVED with invalid packetType', () => {
      const invalidMessage: any = {
        type: 'PACKET_RECEIVED',
        nodeId: 'connector-b',
        timestamp: '2025-12-29T00:00:01.000Z',
        data: {
          packetId: 'prepare-abc123',
          packetType: 'INVALID',
          source: 'connector-a',
          destination: 'g.connectorC.dest',
          amount: '1000',
        },
      };

      expect(isPacketReceivedMessage(invalidMessage)).toBe(false);
    });

    test('should return false for PACKET_RECEIVED with missing amount', () => {
      const invalidMessage: any = {
        type: 'PACKET_RECEIVED',
        nodeId: 'connector-b',
        timestamp: '2025-12-29T00:00:01.000Z',
        data: {
          packetId: 'prepare-abc123',
          packetType: 'PREPARE',
          source: 'connector-a',
          destination: 'g.connectorC.dest',
        },
      };

      expect(isPacketReceivedMessage(invalidMessage)).toBe(false);
    });
  });

  describe('isRouteLookupMessage', () => {
    test('should return true for valid ROUTE_LOOKUP message', () => {
      const validMessage: TelemetryMessage = {
        type: 'ROUTE_LOOKUP',
        nodeId: 'connector-b',
        timestamp: '2025-12-29T00:00:01.500Z',
        data: {
          destination: 'g.connectorC.dest',
          selectedPeer: 'connectorC',
          reason: 'longest prefix match',
        },
      };

      expect(isRouteLookupMessage(validMessage)).toBe(true);
    });

    test('should return false for ROUTE_LOOKUP with missing destination', () => {
      const invalidMessage: any = {
        type: 'ROUTE_LOOKUP',
        nodeId: 'connector-b',
        timestamp: '2025-12-29T00:00:01.500Z',
        data: {
          selectedPeer: 'connectorC',
          reason: 'longest prefix match',
        },
      };

      expect(isRouteLookupMessage(invalidMessage)).toBe(false);
    });

    test('should return false for ROUTE_LOOKUP with missing selectedPeer', () => {
      const invalidMessage: any = {
        type: 'ROUTE_LOOKUP',
        nodeId: 'connector-b',
        timestamp: '2025-12-29T00:00:01.500Z',
        data: {
          destination: 'g.connectorC.dest',
          reason: 'longest prefix match',
        },
      };

      expect(isRouteLookupMessage(invalidMessage)).toBe(false);
    });

    test('should return false for ROUTE_LOOKUP with missing reason', () => {
      const invalidMessage: any = {
        type: 'ROUTE_LOOKUP',
        nodeId: 'connector-b',
        timestamp: '2025-12-29T00:00:01.500Z',
        data: {
          destination: 'g.connectorC.dest',
          selectedPeer: 'connectorC',
        },
      };

      expect(isRouteLookupMessage(invalidMessage)).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    test('should handle messages with extra fields', () => {
      const messageWithExtraFields: any = {
        type: 'NODE_STATUS',
        nodeId: 'connector-a',
        timestamp: '2025-12-29T00:00:00.000Z',
        data: {
          routes: [],
          peers: [],
          health: 'healthy',
          uptime: 0,
          peersConnected: 0,
          totalPeers: 0,
        },
        extraField: 'should be ignored',
      };

      expect(isNodeStatusMessage(messageWithExtraFields)).toBe(true);
    });

    test('should reject messages with wrong data types', () => {
      const invalidMessage: any = {
        type: 'NODE_STATUS',
        nodeId: 123, // Should be string
        timestamp: '2025-12-29T00:00:00.000Z',
        data: {},
      };

      expect(isTelemetryMessage(invalidMessage)).toBe(false);
    });
  });
});
