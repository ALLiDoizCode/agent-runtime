import { generateSecretKey, getPublicKey } from 'nostr-tools';
import { bytesToHex } from '@noble/hashes/utils';
import { ZodError } from 'zod';
import { ProposalCreator } from './proposal';
import {
  COORDINATION_PROPOSAL_KIND,
  TAG_D,
  TAG_TYPE,
  TAG_P,
  TAG_THRESHOLD,
  TAG_QUORUM,
  TAG_EXPIRES,
  TAG_ACTION,
  TAG_WEIGHT,
  CreateProposalParams,
} from './types';

describe('ProposalCreator', () => {
  let creator: ProposalCreator;
  let testPrivateKeyHex: string;
  let testPubkey: string;
  let participantPubkeys: [string, string, string];

  beforeEach(() => {
    // Generate fresh test keys for each test
    const privateKey = generateSecretKey();
    testPrivateKeyHex = bytesToHex(privateKey);
    testPubkey = getPublicKey(privateKey);

    // Generate participant pubkeys
    participantPubkeys = [
      getPublicKey(generateSecretKey()),
      getPublicKey(generateSecretKey()),
      getPublicKey(generateSecretKey()),
    ];

    creator = new ProposalCreator(testPrivateKeyHex, 'g.test.agent');
  });

  describe('constructor', () => {
    it('should create instance with correct pubkey', () => {
      expect(creator.pubkey).toBe(testPubkey);
    });
  });

  describe('generateProposalId', () => {
    it('should generate a 32-character hex string', () => {
      const id = creator.generateProposalId();
      expect(id).toHaveLength(32);
      expect(/^[0-9a-f]{32}$/.test(id)).toBe(true);
    });

    it('should generate unique IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(creator.generateProposalId());
      }
      expect(ids.size).toBe(100);
    });
  });

  describe('create', () => {
    const minimalParams: CreateProposalParams = {
      type: 'consensus',
      participants: [],
      expiresIn: 3600,
      description: 'Test proposal',
    };

    beforeEach(() => {
      minimalParams.participants = participantPubkeys;
    });

    describe('Kind 5910 event creation', () => {
      it('should create event with kind 5910', () => {
        const event = creator.create(minimalParams);
        expect(event.kind).toBe(COORDINATION_PROPOSAL_KIND);
      });

      it('should set pubkey to coordinator pubkey', () => {
        const event = creator.create(minimalParams);
        expect(event.pubkey).toBe(testPubkey);
      });

      it('should set created_at to current timestamp', () => {
        const before = Math.floor(Date.now() / 1000);
        const event = creator.create(minimalParams);
        const after = Math.floor(Date.now() / 1000);
        expect(event.created_at).toBeGreaterThanOrEqual(before);
        expect(event.created_at).toBeLessThanOrEqual(after);
      });
    });

    describe('AC 1: unique d tag', () => {
      it('should include d tag with unique proposal ID', () => {
        const event = creator.create(minimalParams);
        const dTag = event.tags.find((t) => t[0] === TAG_D);
        expect(dTag).toBeDefined();
        expect(dTag![1]).toHaveLength(32);
      });

      it('should generate different d tags for each proposal', () => {
        const event1 = creator.create(minimalParams);
        const event2 = creator.create(minimalParams);
        const dTag1 = event1.tags.find((t) => t[0] === TAG_D);
        const dTag2 = event2.tags.find((t) => t[0] === TAG_D);
        expect(dTag1![1]).not.toBe(dTag2![1]);
      });
    });

    describe('AC 2: type tag', () => {
      it('should include type tag matching params.type', () => {
        const event = creator.create(minimalParams);
        const typeTag = event.tags.find((t) => t[0] === TAG_TYPE);
        expect(typeTag).toEqual([TAG_TYPE, 'consensus']);
      });

      it.each(['consensus', 'majority', 'threshold', 'ranked', 'allocation'] as const)(
        'should support type %s',
        (type) => {
          const event = creator.create({ ...minimalParams, type });
          const typeTag = event.tags.find((t) => t[0] === TAG_TYPE);
          expect(typeTag).toEqual([TAG_TYPE, type]);
        }
      );
    });

    describe('AC 3: p tags for participants', () => {
      it('should include p tag for each participant', () => {
        const event = creator.create(minimalParams);
        const pTags = event.tags.filter((t) => t[0] === TAG_P);
        expect(pTags).toHaveLength(participantPubkeys.length);
        pTags.forEach((tag, i) => {
          expect(tag).toEqual([TAG_P, participantPubkeys[i]]);
        });
      });

      it('should handle single participant', () => {
        const params = { ...minimalParams, participants: [participantPubkeys[0]] };
        const event = creator.create(params);
        const pTags = event.tags.filter((t) => t[0] === TAG_P);
        expect(pTags).toHaveLength(1);
      });
    });

    describe('AC 4: threshold tag', () => {
      it('should include threshold tag when provided', () => {
        const params = { ...minimalParams, type: 'threshold' as const, threshold: 2 };
        const event = creator.create(params);
        const thresholdTag = event.tags.find((t) => t[0] === TAG_THRESHOLD);
        expect(thresholdTag).toEqual([TAG_THRESHOLD, '2']);
      });

      it('should not include threshold tag when not provided', () => {
        const event = creator.create(minimalParams);
        const thresholdTag = event.tags.find((t) => t[0] === TAG_THRESHOLD);
        expect(thresholdTag).toBeUndefined();
      });
    });

    describe('AC 5: quorum tag', () => {
      it('should include quorum tag when provided', () => {
        const params = { ...minimalParams, quorum: 3 };
        const event = creator.create(params);
        const quorumTag = event.tags.find((t) => t[0] === TAG_QUORUM);
        expect(quorumTag).toEqual([TAG_QUORUM, '3']);
      });

      it('should not include quorum tag when not provided', () => {
        const event = creator.create(minimalParams);
        const quorumTag = event.tags.find((t) => t[0] === TAG_QUORUM);
        expect(quorumTag).toBeUndefined();
      });
    });

    describe('AC 6: expires tag', () => {
      it('should include expires tag with calculated timestamp', () => {
        const before = Math.floor(Date.now() / 1000) + minimalParams.expiresIn;
        const event = creator.create(minimalParams);
        const after = Math.floor(Date.now() / 1000) + minimalParams.expiresIn;

        const expiresTag = event.tags.find((t) => t[0] === TAG_EXPIRES);
        expect(expiresTag).toBeDefined();
        const expiresValue = parseInt(expiresTag![1] ?? '0', 10);
        expect(expiresValue).toBeGreaterThanOrEqual(before);
        expect(expiresValue).toBeLessThanOrEqual(after);
      });

      it('should calculate expiration based on expiresIn seconds', () => {
        const params = { ...minimalParams, expiresIn: 7200 }; // 2 hours
        const nowSeconds = Math.floor(Date.now() / 1000);
        const event = creator.create(params);

        const expiresTag = event.tags.find((t) => t[0] === TAG_EXPIRES);
        const expiresValue = parseInt(expiresTag![1] ?? '0', 10);
        // Allow 1 second tolerance
        expect(expiresValue).toBeGreaterThanOrEqual(nowSeconds + 7199);
        expect(expiresValue).toBeLessThanOrEqual(nowSeconds + 7201);
      });
    });

    describe('AC 7: action tag', () => {
      it('should include action tag when provided', () => {
        const params: CreateProposalParams = {
          ...minimalParams,
          action: { kind: 30000, data: '{"key":"value"}' },
        };
        const event = creator.create(params);
        const actionTag = event.tags.find((t) => t[0] === TAG_ACTION);
        expect(actionTag).toEqual([TAG_ACTION, '30000', '{"key":"value"}']);
      });

      it('should not include action tag when not provided', () => {
        const event = creator.create(minimalParams);
        const actionTag = event.tags.find((t) => t[0] === TAG_ACTION);
        expect(actionTag).toBeUndefined();
      });
    });

    describe('AC 8: weight tags', () => {
      it('should include weight tags for weighted voting', () => {
        const weights: Record<string, number> = {};
        weights[participantPubkeys[0]] = 2;
        weights[participantPubkeys[1]] = 1;
        weights[participantPubkeys[2]] = 3;
        const params = { ...minimalParams, weights };
        const event = creator.create(params);

        const weightTags = event.tags.filter((t) => t[0] === TAG_WEIGHT);
        expect(weightTags).toHaveLength(3);
        expect(weightTags).toContainEqual([TAG_WEIGHT, participantPubkeys[0], '2']);
        expect(weightTags).toContainEqual([TAG_WEIGHT, participantPubkeys[1], '1']);
        expect(weightTags).toContainEqual([TAG_WEIGHT, participantPubkeys[2], '3']);
      });

      it('should not include weight tags when not provided', () => {
        const event = creator.create(minimalParams);
        const weightTags = event.tags.filter((t) => t[0] === TAG_WEIGHT);
        expect(weightTags).toHaveLength(0);
      });
    });

    describe('AC 9: content equals description', () => {
      it('should set content to params.description', () => {
        const event = creator.create(minimalParams);
        expect(event.content).toBe('Test proposal');
      });

      it('should handle multi-line descriptions', () => {
        const params = {
          ...minimalParams,
          description: 'Line 1\nLine 2\nLine 3',
        };
        const event = creator.create(params);
        expect(event.content).toBe('Line 1\nLine 2\nLine 3');
      });
    });

    describe('AC 10: event is signed', () => {
      it('should have non-empty sig field', () => {
        const event = creator.create(minimalParams);
        expect(event.sig).toBeDefined();
        expect(event.sig.length).toBeGreaterThan(0);
      });

      it('should have 128-character hex signature', () => {
        const event = creator.create(minimalParams);
        expect(event.sig).toHaveLength(128);
        expect(/^[0-9a-f]{128}$/.test(event.sig)).toBe(true);
      });

      it('should have valid event id', () => {
        const event = creator.create(minimalParams);
        expect(event.id).toBeDefined();
        expect(event.id).toHaveLength(64);
        expect(/^[0-9a-f]{64}$/.test(event.id)).toBe(true);
      });
    });

    describe('full proposal creation', () => {
      it('should create proposal with all optional fields', () => {
        const weights: Record<string, number> = {};
        weights[participantPubkeys[0]] = 1;
        weights[participantPubkeys[1]] = 2;
        const fullParams: CreateProposalParams = {
          type: 'threshold',
          participants: participantPubkeys,
          threshold: 2,
          quorum: 3,
          expiresIn: 3600,
          action: { kind: 30000, data: '{"action":"execute"}' },
          weights,
          description: 'Full proposal with all options',
        };

        const event = creator.create(fullParams);

        expect(event.kind).toBe(COORDINATION_PROPOSAL_KIND);
        expect(event.tags.find((t) => t[0] === TAG_D)).toBeDefined();
        expect(event.tags.find((t) => t[0] === TAG_TYPE)).toEqual([TAG_TYPE, 'threshold']);
        expect(event.tags.filter((t) => t[0] === TAG_P)).toHaveLength(3);
        expect(event.tags.find((t) => t[0] === TAG_THRESHOLD)).toEqual([TAG_THRESHOLD, '2']);
        expect(event.tags.find((t) => t[0] === TAG_QUORUM)).toEqual([TAG_QUORUM, '3']);
        expect(event.tags.find((t) => t[0] === TAG_EXPIRES)).toBeDefined();
        expect(event.tags.find((t) => t[0] === TAG_ACTION)).toEqual([
          TAG_ACTION,
          '30000',
          '{"action":"execute"}',
        ]);
        expect(event.tags.filter((t) => t[0] === TAG_WEIGHT)).toHaveLength(2);
        expect(event.content).toBe('Full proposal with all options');
        expect(event.sig).toBeDefined();
      });
    });
  });

  describe('validation errors', () => {
    it('should throw ZodError for invalid type', () => {
      const params = {
        type: 'invalid' as unknown as CreateProposalParams['type'],
        participants: [participantPubkeys[0]],
        expiresIn: 3600,
        description: 'Test',
      };
      expect(() => creator.create(params)).toThrow(ZodError);
    });

    it('should throw ZodError for empty participants array', () => {
      const params: CreateProposalParams = {
        type: 'consensus',
        participants: [],
        expiresIn: 3600,
        description: 'Test',
      };
      expect(() => creator.create(params)).toThrow(ZodError);
    });

    it('should throw ZodError for negative expiresIn', () => {
      const params = {
        type: 'consensus' as const,
        participants: [participantPubkeys[0]],
        expiresIn: -1,
        description: 'Test',
      };
      expect(() => creator.create(params)).toThrow(ZodError);
    });

    it('should throw ZodError for zero expiresIn', () => {
      const params = {
        type: 'consensus' as const,
        participants: [participantPubkeys[0]],
        expiresIn: 0,
        description: 'Test',
      };
      expect(() => creator.create(params)).toThrow(ZodError);
    });

    it('should throw ZodError for empty description', () => {
      const params = {
        type: 'consensus' as const,
        participants: [participantPubkeys[0]],
        expiresIn: 3600,
        description: '',
      };
      expect(() => creator.create(params)).toThrow(ZodError);
    });
  });

  describe('toProposal', () => {
    it('should convert NostrEvent back to Proposal', () => {
      const weights: Record<string, number> = {};
      weights[participantPubkeys[0]] = 1;
      weights[participantPubkeys[1]] = 2;
      const params: CreateProposalParams = {
        type: 'threshold',
        participants: participantPubkeys,
        threshold: 2,
        quorum: 3,
        expiresIn: 3600,
        action: { kind: 30000, data: '{"test":true}' },
        weights,
        description: 'Test proposal for conversion',
      };

      const event = creator.create(params);
      const proposal = creator.toProposal(event);

      expect(proposal.kind).toBe(COORDINATION_PROPOSAL_KIND);
      expect(proposal.id).toHaveLength(32);
      expect(proposal.type).toBe('threshold');
      expect(proposal.participants).toEqual(participantPubkeys);
      expect(proposal.threshold).toBe(2);
      expect(proposal.quorum).toBe(3);
      expect(proposal.expires).toBeGreaterThan(Math.floor(Date.now() / 1000));
      expect(proposal.action).toEqual({ kind: 30000, data: '{"test":true}' });
      expect(proposal.weights).toBeInstanceOf(Map);
      expect(proposal.weights?.get(participantPubkeys[0])).toBe(1);
      expect(proposal.weights?.get(participantPubkeys[1])).toBe(2);
      expect(proposal.content).toBe('Test proposal for conversion');
      expect(proposal.event).toBe(event);
    });

    it('should handle minimal proposal without optional fields', () => {
      const params: CreateProposalParams = {
        type: 'consensus',
        participants: [participantPubkeys[0]],
        expiresIn: 3600,
        description: 'Minimal proposal',
      };

      const event = creator.create(params);
      const proposal = creator.toProposal(event);

      expect(proposal.threshold).toBeUndefined();
      expect(proposal.quorum).toBeUndefined();
      expect(proposal.action).toBeUndefined();
      expect(proposal.weights).toBeUndefined();
    });
  });
});
