import { generateSecretKey, getPublicKey } from 'nostr-tools';
import { bytesToHex } from '@noble/hashes/utils';
import { ProposalCreator } from './proposal';
import { ProposalParser } from './proposal-parser';
import { ProposalExpiredError, COORDINATION_PROPOSAL_KIND, CoordinationType } from './types';
import { NostrEvent } from '../toon-codec';

describe('ProposalParser', () => {
  let parser: ProposalParser;
  let creator: ProposalCreator;
  let testPrivateKeyHex: string;

  beforeEach(() => {
    const privateKey = generateSecretKey();
    testPrivateKeyHex = bytesToHex(privateKey);
    creator = new ProposalCreator(testPrivateKeyHex, 'g.test.agent');
    parser = new ProposalParser();
  });

  describe('Valid Proposal Parsing (AC: 1)', () => {
    it('should parse minimal valid proposal', () => {
      const participant1 = getPublicKey(generateSecretKey());
      const event = creator.create({
        type: 'consensus',
        participants: [participant1],
        expiresIn: 3600,
        description: 'Test minimal proposal',
      });

      const proposal = parser.parse(event);

      expect(proposal.kind).toBe(COORDINATION_PROPOSAL_KIND);
      expect(proposal.id).toBeDefined();
      expect(proposal.id.length).toBe(32); // 16 bytes as hex
      expect(proposal.type).toBe('consensus');
      expect(proposal.participants).toEqual([participant1]);
      expect(proposal.expires).toBeGreaterThan(Math.floor(Date.now() / 1000));
      expect(proposal.content).toBe('Test minimal proposal');
      expect(proposal.event).toBe(event);
      expect(proposal.threshold).toBeUndefined();
      expect(proposal.quorum).toBeUndefined();
      expect(proposal.action).toBeUndefined();
      expect(proposal.weights).toBeUndefined();
    });

    it('should parse full proposal with all optional fields', () => {
      const participant1 = getPublicKey(generateSecretKey());
      const participant2 = getPublicKey(generateSecretKey());
      const event = creator.create({
        type: 'threshold',
        participants: [participant1, participant2],
        threshold: 2,
        quorum: 2,
        expiresIn: 7200,
        action: {
          kind: 1000,
          data: JSON.stringify({ task: 'execute' }),
        },
        weights: {
          [participant1]: 1.5,
          [participant2]: 2.0,
        },
        description: 'Full proposal with all fields',
      });

      const proposal = parser.parse(event);

      expect(proposal.kind).toBe(COORDINATION_PROPOSAL_KIND);
      expect(proposal.type).toBe('threshold');
      expect(proposal.participants).toEqual([participant1, participant2]);
      expect(proposal.threshold).toBe(2);
      expect(proposal.quorum).toBe(2);
      expect(proposal.action).toEqual({
        kind: 1000,
        data: JSON.stringify({ task: 'execute' }),
      });
      expect(proposal.weights).toBeInstanceOf(Map);
      expect(proposal.weights?.get(participant1)).toBe(1.5);
      expect(proposal.weights?.get(participant2)).toBe(2.0);
    });
  });

  describe('Coordination Type Validation (AC: 2)', () => {
    it.each<CoordinationType>(['consensus', 'majority', 'threshold', 'ranked', 'allocation'])(
      'should accept valid coordination type: %s',
      (type) => {
        const participant = getPublicKey(generateSecretKey());
        const event = creator.create({
          type,
          participants: [participant],
          expiresIn: 3600,
          description: `Test ${type} type`,
        });

        const proposal = parser.parse(event);

        expect(proposal.type).toBe(type);
      }
    );

    it('should reject invalid coordination type', () => {
      const participant = getPublicKey(generateSecretKey());
      const event = creator.create({
        type: 'consensus',
        participants: [participant],
        expiresIn: 3600,
        description: 'Test',
      });

      // Manually modify type tag to invalid value
      const modifiedEvent = {
        ...event,
        tags: event.tags.map((tag) => (tag[0] === 'type' ? ['type', 'invalid'] : tag)),
      } as NostrEvent;

      expect(() => parser.parse(modifiedEvent)).toThrow(
        'Invalid coordination type: "invalid". Must be one of: consensus, majority, threshold, ranked, allocation'
      );
    });
  });

  describe('Participant Validation (AC: 3)', () => {
    it('should parse multiple participants', () => {
      const participant1 = getPublicKey(generateSecretKey());
      const participant2 = getPublicKey(generateSecretKey());
      const participant3 = getPublicKey(generateSecretKey());

      const event = creator.create({
        type: 'majority',
        participants: [participant1, participant2, participant3],
        expiresIn: 3600,
        description: 'Multi-participant proposal',
      });

      const proposal = parser.parse(event);

      expect(proposal.participants).toHaveLength(3);
      expect(proposal.participants).toEqual([participant1, participant2, participant3]);
    });

    it('should reject empty participants list', () => {
      const event = creator.create({
        type: 'consensus',
        participants: [getPublicKey(generateSecretKey())],
        expiresIn: 3600,
        description: 'Test',
      });

      // Manually remove all p tags
      const modifiedEvent = {
        ...event,
        tags: event.tags.filter((tag) => tag[0] !== 'p'),
      } as NostrEvent;

      expect(() => parser.parse(modifiedEvent)).toThrow('At least one participant required');
    });

    it('should reject invalid pubkey format (too short)', () => {
      const event = creator.create({
        type: 'consensus',
        participants: [getPublicKey(generateSecretKey())],
        expiresIn: 3600,
        description: 'Test',
      });

      // Manually modify p tag to invalid format
      const modifiedEvent = {
        ...event,
        tags: event.tags.map((tag) => (tag[0] === 'p' ? ['p', 'short'] : tag)),
      } as NostrEvent;

      expect(() => parser.parse(modifiedEvent)).toThrow(
        'Invalid pubkey format: short. Must be 64-character hex string'
      );
    });

    it('should reject invalid pubkey format (non-hex)', () => {
      const event = creator.create({
        type: 'consensus',
        participants: [getPublicKey(generateSecretKey())],
        expiresIn: 3600,
        description: 'Test',
      });

      const invalidPubkey = 'z'.repeat(64); // Non-hex characters

      // Manually modify p tag to invalid format
      const modifiedEvent = {
        ...event,
        tags: event.tags.map((tag) => (tag[0] === 'p' ? ['p', invalidPubkey] : tag)),
      } as NostrEvent;

      expect(() => parser.parse(modifiedEvent)).toThrow(
        `Invalid pubkey format: ${invalidPubkey}. Must be 64-character hex string`
      );
    });

    it('should enforce maximum participant limit', () => {
      const event = creator.create({
        type: 'consensus',
        participants: [getPublicKey(generateSecretKey())],
        expiresIn: 3600,
        description: 'Test',
      });

      // Create 1001 p tags to exceed MAX_PARTICIPANTS (1000)
      const excessivePTags = Array.from({ length: 1001 }, () => [
        'p',
        getPublicKey(generateSecretKey()),
      ]);

      const modifiedEvent = {
        ...event,
        tags: [...event.tags.filter((tag) => tag[0] !== 'p'), ...excessivePTags],
      } as NostrEvent;

      expect(() => parser.parse(modifiedEvent)).toThrow('Maximum 1000 participants allowed');
    });
  });

  describe('Threshold Validation (AC: 4)', () => {
    it('should accept threshold equal to participant count', () => {
      const participant1 = getPublicKey(generateSecretKey());
      const participant2 = getPublicKey(generateSecretKey());

      const event = creator.create({
        type: 'threshold',
        participants: [participant1, participant2],
        threshold: 2,
        expiresIn: 3600,
        description: 'Threshold equals participants',
      });

      const proposal = parser.parse(event);

      expect(proposal.threshold).toBe(2);
      expect(proposal.participants).toHaveLength(2);
    });

    it('should accept threshold less than participant count', () => {
      const participant1 = getPublicKey(generateSecretKey());
      const participant2 = getPublicKey(generateSecretKey());
      const participant3 = getPublicKey(generateSecretKey());

      const event = creator.create({
        type: 'threshold',
        participants: [participant1, participant2, participant3],
        threshold: 2,
        expiresIn: 3600,
        description: 'Threshold less than participants',
      });

      const proposal = parser.parse(event);

      expect(proposal.threshold).toBe(2);
      expect(proposal.participants).toHaveLength(3);
    });

    it('should reject threshold greater than participant count', () => {
      const participant1 = getPublicKey(generateSecretKey());
      const event = creator.create({
        type: 'threshold',
        participants: [participant1],
        expiresIn: 3600,
        description: 'Test',
      });

      // Manually set threshold > participants
      const modifiedEvent = {
        ...event,
        tags: [
          ...event.tags.filter((tag) => tag[0] !== 'threshold'),
          ['threshold', '5'], // 5 > 1 participant
        ],
      } as NostrEvent;

      expect(() => parser.parse(modifiedEvent)).toThrow('Threshold 5 exceeds participant count 1');
    });
  });

  describe('Expiration Validation (AC: 5)', () => {
    it('should accept future expiration timestamp', () => {
      const participant = getPublicKey(generateSecretKey());
      const event = creator.create({
        type: 'consensus',
        participants: [participant],
        expiresIn: 7200, // 2 hours in future
        description: 'Future expiration',
      });

      const proposal = parser.parse(event);

      const now = Math.floor(Date.now() / 1000);
      expect(proposal.expires).toBeGreaterThan(now);
    });

    it('should throw ProposalExpiredError for past expiration timestamp', () => {
      const participant = getPublicKey(generateSecretKey());
      const event = creator.create({
        type: 'consensus',
        participants: [participant],
        expiresIn: 3600,
        description: 'Expired proposal',
      });

      // Manually set expires to past timestamp
      const pastTimestamp = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
      const modifiedEvent = {
        ...event,
        tags: event.tags.map((tag) =>
          tag[0] === 'expires' ? ['expires', pastTimestamp.toString()] : tag
        ),
      } as NostrEvent;

      expect(() => parser.parse(modifiedEvent)).toThrow(ProposalExpiredError);
      expect(() => parser.parse(modifiedEvent)).toThrow('Proposal has expired');
    });

    it('should reject invalid expires value', () => {
      const participant = getPublicKey(generateSecretKey());
      const event = creator.create({
        type: 'consensus',
        participants: [participant],
        expiresIn: 3600,
        description: 'Test',
      });

      // Manually set expires to invalid value
      const modifiedEvent = {
        ...event,
        tags: event.tags.map((tag) => (tag[0] === 'expires' ? ['expires', 'invalid'] : tag)),
      } as NostrEvent;

      expect(() => parser.parse(modifiedEvent)).toThrow(
        'Invalid expires value: must be a positive Unix timestamp'
      );
    });
  });

  describe('Action Payload Validation (AC: 6)', () => {
    it('should parse valid action with JSON data', () => {
      const participant = getPublicKey(generateSecretKey());
      const actionData = JSON.stringify({ command: 'execute', target: 'service' });

      const event = creator.create({
        type: 'consensus',
        participants: [participant],
        expiresIn: 3600,
        action: {
          kind: 1000,
          data: actionData,
        },
        description: 'Action proposal',
      });

      const proposal = parser.parse(event);

      expect(proposal.action).toEqual({
        kind: 1000,
        data: actionData,
      });
    });

    it('should throw on invalid JSON in action data', () => {
      const participant = getPublicKey(generateSecretKey());
      const event = creator.create({
        type: 'consensus',
        participants: [participant],
        expiresIn: 3600,
        description: 'Test',
      });

      // Manually add action tag with invalid JSON
      const modifiedEvent = {
        ...event,
        tags: [...event.tags, ['action', '1000', 'invalid json']],
      } as NostrEvent;

      expect(() => parser.parse(modifiedEvent)).toThrow('Invalid action data: not valid JSON');
    });

    it('should throw on invalid action kind', () => {
      const participant = getPublicKey(generateSecretKey());
      const event = creator.create({
        type: 'consensus',
        participants: [participant],
        expiresIn: 3600,
        description: 'Test',
      });

      // Manually add action tag with invalid kind
      const modifiedEvent = {
        ...event,
        tags: [...event.tags, ['action', 'not-a-number', '{}']],
      } as NostrEvent;

      expect(() => parser.parse(modifiedEvent)).toThrow(
        'Invalid action kind: "not-a-number". Must be a positive integer'
      );
    });

    it('should throw on negative action kind', () => {
      const participant = getPublicKey(generateSecretKey());
      const event = creator.create({
        type: 'consensus',
        participants: [participant],
        expiresIn: 3600,
        description: 'Test',
      });

      // Manually add action tag with negative kind
      const modifiedEvent = {
        ...event,
        tags: [...event.tags, ['action', '-1', '{}']],
      } as NostrEvent;

      expect(() => parser.parse(modifiedEvent)).toThrow(
        'Invalid action kind: "-1". Must be a positive integer'
      );
    });

    it('should enforce maximum action data length', () => {
      const participant = getPublicKey(generateSecretKey());
      const event = creator.create({
        type: 'consensus',
        participants: [participant],
        expiresIn: 3600,
        description: 'Test',
      });

      // Create action data exceeding MAX_ACTION_DATA_LENGTH (100KB)
      const largeData = JSON.stringify({ data: 'x'.repeat(102401) });

      const modifiedEvent = {
        ...event,
        tags: [...event.tags, ['action', '1000', largeData]],
      } as NostrEvent;

      expect(() => parser.parse(modifiedEvent)).toThrow(
        'Action data exceeds maximum length of 102400 bytes'
      );
    });
  });

  describe('Active/Expired Checks (AC: 8)', () => {
    it('should return true for isActive() on non-expired proposal', () => {
      const participant = getPublicKey(generateSecretKey());
      const event = creator.create({
        type: 'consensus',
        participants: [participant],
        expiresIn: 7200, // 2 hours in future
        description: 'Active proposal',
      });

      const proposal = parser.parse(event);

      expect(parser.isActive(proposal)).toBe(true);
      expect(parser.isExpired(proposal)).toBe(false);
    });

    it('should return true for isExpired() on expired proposal', () => {
      const participant = getPublicKey(generateSecretKey());
      const event = creator.create({
        type: 'consensus',
        participants: [participant],
        expiresIn: 1, // 1 second
        description: 'Soon-to-expire proposal',
      });

      const proposal = parser.parse(event);

      // Wait for proposal to expire
      jest.useFakeTimers();
      jest.advanceTimersByTime(2000); // Advance 2 seconds

      expect(parser.isExpired(proposal)).toBe(true);
      expect(parser.isActive(proposal)).toBe(false);

      jest.useRealTimers();
    });
  });

  describe('Missing Tag Validation (AC: 7)', () => {
    it('should throw on missing d tag', () => {
      const participant = getPublicKey(generateSecretKey());
      const event = creator.create({
        type: 'consensus',
        participants: [participant],
        expiresIn: 3600,
        description: 'Test',
      });

      const modifiedEvent = {
        ...event,
        tags: event.tags.filter((tag) => tag[0] !== 'd'),
      } as NostrEvent;

      expect(() => parser.parse(modifiedEvent)).toThrow('Missing required tag: d');
    });

    it('should throw on missing type tag', () => {
      const participant = getPublicKey(generateSecretKey());
      const event = creator.create({
        type: 'consensus',
        participants: [participant],
        expiresIn: 3600,
        description: 'Test',
      });

      const modifiedEvent = {
        ...event,
        tags: event.tags.filter((tag) => tag[0] !== 'type'),
      } as NostrEvent;

      expect(() => parser.parse(modifiedEvent)).toThrow('Missing required tag: type');
    });

    it('should throw on missing expires tag', () => {
      const participant = getPublicKey(generateSecretKey());
      const event = creator.create({
        type: 'consensus',
        participants: [participant],
        expiresIn: 3600,
        description: 'Test',
      });

      const modifiedEvent = {
        ...event,
        tags: event.tags.filter((tag) => tag[0] !== 'expires'),
      } as NostrEvent;

      expect(() => parser.parse(modifiedEvent)).toThrow('Missing required tag: expires');
    });
  });

  describe('Invalid Kind Validation (AC: 7)', () => {
    it('should throw on wrong event kind', () => {
      const participant = getPublicKey(generateSecretKey());
      const event = creator.create({
        type: 'consensus',
        participants: [participant],
        expiresIn: 3600,
        description: 'Test',
      });

      // Manually change kind to invalid value
      const modifiedEvent = {
        ...event,
        kind: 1, // Wrong kind (should be 5910)
      } as NostrEvent;

      expect(() => parser.parse(modifiedEvent)).toThrow(
        `Invalid event kind: 1. Expected ${COORDINATION_PROPOSAL_KIND}`
      );
    });
  });

  describe('Weight Parsing (AC: 1)', () => {
    it('should parse weight tags correctly', () => {
      const participant1 = getPublicKey(generateSecretKey());
      const participant2 = getPublicKey(generateSecretKey());

      const event = creator.create({
        type: 'consensus',
        participants: [participant1, participant2],
        expiresIn: 3600,
        weights: {
          [participant1]: 2.5,
          [participant2]: 1.0,
        },
        description: 'Weighted proposal',
      });

      const proposal = parser.parse(event);

      expect(proposal.weights).toBeInstanceOf(Map);
      expect(proposal.weights?.size).toBe(2);
      expect(proposal.weights?.get(participant1)).toBe(2.5);
      expect(proposal.weights?.get(participant2)).toBe(1.0);
    });

    it('should return undefined when no weight tags present', () => {
      const participant = getPublicKey(generateSecretKey());
      const event = creator.create({
        type: 'consensus',
        participants: [participant],
        expiresIn: 3600,
        description: 'No weights',
      });

      const proposal = parser.parse(event);

      expect(proposal.weights).toBeUndefined();
    });

    it('should reject invalid weight value', () => {
      const participant = getPublicKey(generateSecretKey());
      const event = creator.create({
        type: 'consensus',
        participants: [participant],
        expiresIn: 3600,
        description: 'Test',
      });

      const modifiedEvent = {
        ...event,
        tags: [...event.tags, ['weight', participant, 'invalid']],
      } as NostrEvent;

      expect(() => parser.parse(modifiedEvent)).toThrow(
        'Invalid weight value: "invalid". Must be a non-negative number'
      );
    });

    it('should reject negative weight value', () => {
      const participant = getPublicKey(generateSecretKey());
      const event = creator.create({
        type: 'consensus',
        participants: [participant],
        expiresIn: 3600,
        description: 'Test',
      });

      const modifiedEvent = {
        ...event,
        tags: [...event.tags, ['weight', participant, '-1']],
      } as NostrEvent;

      expect(() => parser.parse(modifiedEvent)).toThrow(
        'Invalid weight value: "-1". Must be a non-negative number'
      );
    });

    it('should enforce maximum weight value', () => {
      const participant = getPublicKey(generateSecretKey());
      const event = creator.create({
        type: 'consensus',
        participants: [participant],
        expiresIn: 3600,
        description: 'Test',
      });

      const excessiveWeight = (1e9 + 1).toString(); // Exceeds MAX_WEIGHT_VALUE

      const modifiedEvent = {
        ...event,
        tags: [...event.tags, ['weight', participant, excessiveWeight]],
      } as NostrEvent;

      expect(() => parser.parse(modifiedEvent)).toThrow(
        `Weight value ${parseFloat(excessiveWeight)} exceeds maximum 1000000000`
      );
    });
  });
});
