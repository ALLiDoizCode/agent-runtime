/**
 * Unit tests for EscrowCoordinator
 *
 * Tests escrow address generation, stake requirement, and escrow resolution
 * based on coordination outcomes.
 */

import { EscrowCoordinator, EscrowCoordinatorConfig } from './escrow-coordinator';
import { Proposal, CoordinationOutcome, COORDINATION_PROPOSAL_KIND } from './types';
import { NostrEvent } from '../toon-codec';
import { Logger } from 'pino';

// Mock logger for testing
const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  fatal: jest.fn(),
  trace: jest.fn(),
  child: jest.fn(() => mockLogger),
} as unknown as Logger;

// Test config
const testConfig: EscrowCoordinatorConfig = {
  ilpAddress: 'g.alice.agent',
  logger: mockLogger,
};

// Helper function to create test proposal
function createTestProposal(overrides?: Partial<Proposal>): Proposal {
  const baseEvent: NostrEvent = {
    id: 'event123',
    pubkey: 'coordinator_pubkey',
    created_at: Math.floor(Date.now() / 1000),
    kind: COORDINATION_PROPOSAL_KIND,
    tags: [['d', 'proposal123']],
    content: 'Test proposal',
    sig: 'signature',
  };

  return {
    kind: COORDINATION_PROPOSAL_KIND,
    id: 'proposal123',
    type: 'consensus',
    participants: ['pubkey1', 'pubkey2'],
    expires: Math.floor(Date.now() / 1000) + 3600,
    content: 'Test proposal',
    event: baseEvent,
    ...overrides,
  };
}

describe('EscrowCoordinator', () => {
  let escrowCoordinator: EscrowCoordinator;

  beforeEach(() => {
    // Clear mock calls before each test
    jest.clearAllMocks();
    escrowCoordinator = new EscrowCoordinator(testConfig);
  });

  describe('generateEscrowAddress', () => {
    it('should generate escrow address with correct format', () => {
      // Arrange
      const proposalId = 'proposal123';

      // Act
      const escrowAddress = escrowCoordinator.generateEscrowAddress(proposalId);

      // Assert
      expect(escrowAddress).toBe('g.alice.agent.escrow.proposal123');
    });

    it('should generate unique addresses for different proposal IDs', () => {
      // Arrange
      const proposalId1 = 'proposal123';
      const proposalId2 = 'proposal456';

      // Act
      const escrowAddress1 = escrowCoordinator.generateEscrowAddress(proposalId1);
      const escrowAddress2 = escrowCoordinator.generateEscrowAddress(proposalId2);

      // Assert
      expect(escrowAddress1).not.toBe(escrowAddress2);
      expect(escrowAddress1).toBe('g.alice.agent.escrow.proposal123');
      expect(escrowAddress2).toBe('g.alice.agent.escrow.proposal456');
    });

    it('should handle special characters in proposal ID', () => {
      // Arrange
      const proposalId = 'abc-123_def.456';

      // Act
      const escrowAddress = escrowCoordinator.generateEscrowAddress(proposalId);

      // Assert
      expect(escrowAddress).toBe('g.alice.agent.escrow.abc-123_def.456');
    });
  });

  describe('requireStake', () => {
    it('should set escrow address in proposal', async () => {
      // Arrange
      const proposal = createTestProposal();
      const amount = 1000n;

      // Act
      await escrowCoordinator.requireStake(proposal, amount);

      // Assert
      expect(proposal.escrowAddress).toBe('g.alice.agent.escrow.proposal123');
    });

    it('should initialize stakes Map in proposal', async () => {
      // Arrange
      const proposal = createTestProposal();
      const amount = 1000n;

      // Act
      await escrowCoordinator.requireStake(proposal, amount);

      // Assert
      expect(proposal.stakes).toBeInstanceOf(Map);
      expect(proposal.stakes?.size).toBe(0);
    });

    it('should log escrow creation with correct parameters', async () => {
      // Arrange
      const proposal = createTestProposal();
      const amount = 1000n;

      // Act
      await escrowCoordinator.requireStake(proposal, amount);

      // Assert
      expect(mockLogger.info).toHaveBeenCalledWith(
        {
          proposalId: 'proposal123',
          amount: '1000',
          escrowAddress: 'g.alice.agent.escrow.proposal123',
          participantCount: 2,
        },
        'Escrow required for coordination proposal'
      );
    });

    it('should preserve existing stakes Map if already present', async () => {
      // Arrange
      const existingStakes = new Map<string, bigint>([['pubkey1', 500n]]);
      const proposal = createTestProposal({ stakes: existingStakes });
      const amount = 1000n;

      // Act
      await escrowCoordinator.requireStake(proposal, amount);

      // Assert
      expect(proposal.stakes).toBe(existingStakes);
      expect(proposal.stakes?.get('pubkey1')).toBe(500n);
    });

    it('should handle large stake amounts', async () => {
      // Arrange
      const proposal = createTestProposal();
      const largeAmount = 1000000000000n; // 1 trillion units

      // Act
      await escrowCoordinator.requireStake(proposal, largeAmount);

      // Assert
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: '1000000000000',
        }),
        'Escrow required for coordination proposal'
      );
    });
  });

  describe('releaseEscrow - approved outcome', () => {
    it('should log release to recipient when outcome is approved', async () => {
      // Arrange
      const proposal = createTestProposal({
        stakeRequired: 1000n,
        stakes: new Map([
          ['pubkey1', 1000n],
          ['pubkey2', 1000n],
        ]),
        escrowAddress: 'g.alice.agent.escrow.proposal123',
      });

      // Act
      await escrowCoordinator.releaseEscrow(proposal, 'approved');

      // Assert
      expect(mockLogger.info).toHaveBeenCalledWith(
        {
          proposalId: 'proposal123',
          outcome: 'approved',
          escrowAddress: 'g.alice.agent.escrow.proposal123',
          stakeCount: 2,
        },
        'Escrow release to recipient (payment logic deferred)'
      );
    });

    it('should clear stakes Map after release', async () => {
      // Arrange
      const proposal = createTestProposal({
        stakeRequired: 1000n,
        stakes: new Map([
          ['pubkey1', 1000n],
          ['pubkey2', 1000n],
        ]),
        escrowAddress: 'g.alice.agent.escrow.proposal123',
      });

      // Act
      await escrowCoordinator.releaseEscrow(proposal, 'approved');

      // Assert
      expect(proposal.stakes?.size).toBe(0);
    });
  });

  describe('releaseEscrow - rejected outcome', () => {
    it('should log refund to participants when outcome is rejected', async () => {
      // Arrange
      const proposal = createTestProposal({
        stakeRequired: 1000n,
        stakes: new Map([['pubkey1', 1000n]]),
        escrowAddress: 'g.alice.agent.escrow.proposal123',
      });

      // Act
      await escrowCoordinator.releaseEscrow(proposal, 'rejected');

      // Assert
      expect(mockLogger.info).toHaveBeenCalledWith(
        {
          proposalId: 'proposal123',
          outcome: 'rejected',
          escrowAddress: 'g.alice.agent.escrow.proposal123',
          stakeCount: 1,
        },
        'Escrow refund to participants (payment logic deferred)'
      );
    });

    it('should clear stakes Map after refund', async () => {
      // Arrange
      const proposal = createTestProposal({
        stakeRequired: 1000n,
        stakes: new Map([['pubkey1', 1000n]]),
        escrowAddress: 'g.alice.agent.escrow.proposal123',
      });

      // Act
      await escrowCoordinator.releaseEscrow(proposal, 'rejected');

      // Assert
      expect(proposal.stakes?.size).toBe(0);
    });
  });

  describe('releaseEscrow - expired outcome', () => {
    it('should log refund to participants when outcome is expired', async () => {
      // Arrange
      const proposal = createTestProposal({
        stakeRequired: 1000n,
        stakes: new Map([['pubkey1', 1000n]]),
        escrowAddress: 'g.alice.agent.escrow.proposal123',
      });

      // Act
      await escrowCoordinator.releaseEscrow(proposal, 'expired');

      // Assert
      expect(mockLogger.info).toHaveBeenCalledWith(
        {
          proposalId: 'proposal123',
          outcome: 'expired',
          escrowAddress: 'g.alice.agent.escrow.proposal123',
          stakeCount: 1,
        },
        'Escrow refund to participants (payment logic deferred)'
      );
    });

    it('should clear stakes Map after refund', async () => {
      // Arrange
      const proposal = createTestProposal({
        stakeRequired: 1000n,
        stakes: new Map([['pubkey1', 1000n]]),
        escrowAddress: 'g.alice.agent.escrow.proposal123',
      });

      // Act
      await escrowCoordinator.releaseEscrow(proposal, 'expired');

      // Assert
      expect(proposal.stakes?.size).toBe(0);
    });
  });

  describe('releaseEscrow - inconclusive outcome', () => {
    it('should log refund to participants when outcome is inconclusive', async () => {
      // Arrange
      const proposal = createTestProposal({
        stakeRequired: 1000n,
        stakes: new Map([['pubkey1', 1000n]]),
        escrowAddress: 'g.alice.agent.escrow.proposal123',
      });

      // Act
      await escrowCoordinator.releaseEscrow(proposal, 'inconclusive');

      // Assert
      expect(mockLogger.info).toHaveBeenCalledWith(
        {
          proposalId: 'proposal123',
          outcome: 'inconclusive',
          escrowAddress: 'g.alice.agent.escrow.proposal123',
          stakeCount: 1,
        },
        'Escrow refund to participants (payment logic deferred)'
      );
    });
  });

  describe('releaseEscrow - no-op scenarios', () => {
    it('should return immediately if stakeRequired is undefined', async () => {
      // Arrange
      const proposal = createTestProposal(); // No stakeRequired

      // Act
      await escrowCoordinator.releaseEscrow(proposal, 'approved');

      // Assert
      expect(mockLogger.info).not.toHaveBeenCalled();
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should return immediately if stakes Map is undefined', async () => {
      // Arrange
      const proposal = createTestProposal({
        stakeRequired: 1000n,
        // stakes Map intentionally undefined
      });

      // Act
      await escrowCoordinator.releaseEscrow(proposal, 'approved');

      // Assert
      expect(mockLogger.info).not.toHaveBeenCalled();
      expect(mockLogger.error).not.toHaveBeenCalled();
    });
  });

  describe('releaseEscrow - error handling', () => {
    it('should log error and not throw if escrow resolution fails', async () => {
      // Arrange
      const proposal = createTestProposal({
        stakeRequired: 1000n,
        stakes: new Map([['pubkey1', 1000n]]),
        escrowAddress: 'g.alice.agent.escrow.proposal123',
      });

      // Force an error by making stakes.clear() throw
      const mockClear = jest.fn(() => {
        throw new Error('Mock stakes.clear() error');
      });
      proposal.stakes!.clear = mockClear;

      // Act
      await escrowCoordinator.releaseEscrow(proposal, 'approved');

      // Assert
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          proposalId: 'proposal123',
          outcome: 'approved',
        }),
        'Failed to release escrow'
      );
    });
  });

  describe('releaseEscrow - outcome-based routing', () => {
    it.each<CoordinationOutcome>(['rejected', 'expired', 'inconclusive'])(
      'should refund for outcome: %s',
      async (outcome) => {
        // Arrange
        const proposal = createTestProposal({
          stakeRequired: 1000n,
          stakes: new Map([['pubkey1', 1000n]]),
          escrowAddress: 'g.alice.agent.escrow.proposal123',
        });

        // Act
        await escrowCoordinator.releaseEscrow(proposal, outcome);

        // Assert
        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            outcome,
          }),
          'Escrow refund to participants (payment logic deferred)'
        );
      }
    );

    it('should release only for approved outcome', async () => {
      // Arrange
      const proposal = createTestProposal({
        stakeRequired: 1000n,
        stakes: new Map([['pubkey1', 1000n]]),
        escrowAddress: 'g.alice.agent.escrow.proposal123',
      });

      // Act
      await escrowCoordinator.releaseEscrow(proposal, 'approved');

      // Assert
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          outcome: 'approved',
        }),
        'Escrow release to recipient (payment logic deferred)'
      );
    });
  });
});
