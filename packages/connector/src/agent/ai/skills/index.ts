/**
 * Built-in Agent Skills
 *
 * Registers all built-in skills with the SkillRegistry.
 * Each skill wraps an existing event handler as an AI SDK tool.
 */

import type { SkillRegistry } from '../skill-registry';
import type { FollowGraphRouter } from '../../follow-graph-router';
import type { Logger } from 'pino';
import { createStoreNoteSkill } from './store-note-skill';
import { createUpdateFollowSkill } from './update-follow-skill';
import { createDeleteEventsSkill } from './delete-events-skill';
import { createQueryEventsSkill } from './query-events-skill';
import { createDVMQuerySkill } from './dvm-query-skill';
import { createForwardPacketSkill } from './forward-packet-skill';
import { createGetAgentInfoSkill } from './get-agent-info-skill';
import { createProposeCoordinationSkill } from './propose-coordination-skill';
import { createVoteCoordinationSkill } from './vote-coordination-skill';

export interface RegisterSkillsConfig {
  followGraphRouter: FollowGraphRouter;
  registeredKinds: () => number[];
  queryMaxResults?: number;
  /** Private key for coordination proposals (optional - needed for propose_coordination skill) */
  coordinatorPrivateKey?: string;
  /** Private key for voting (optional - needed for vote_coordination skill) */
  voterPrivateKey?: string;
  /** ILP address for coordination skills (optional - needed for coordination skills) */
  ilpAddress?: string;
  /** Logger instance (optional - needed for coordination skills) */
  logger?: Logger;
}

/**
 * Register all built-in agent skills with the skill registry.
 *
 * @param registry - SkillRegistry to register skills with
 * @param config - Configuration providing dependencies for skills
 */
export function registerBuiltInSkills(registry: SkillRegistry, config: RegisterSkillsConfig): void {
  registry.register(createStoreNoteSkill());
  registry.register(createUpdateFollowSkill(config.followGraphRouter));
  registry.register(createDeleteEventsSkill());
  registry.register(createQueryEventsSkill(config.queryMaxResults)); // Deprecated, backward compat
  registry.register(createDVMQuerySkill(config.queryMaxResults)); // DVM Kind 5000
  registry.register(createForwardPacketSkill(config.followGraphRouter));
  registry.register(createGetAgentInfoSkill(config.followGraphRouter, config.registeredKinds));

  // Only register coordination skills if keys, ilpAddress and logger are provided
  if (config.coordinatorPrivateKey && config.ilpAddress && config.logger) {
    registry.register(
      createProposeCoordinationSkill(config.coordinatorPrivateKey, config.ilpAddress, config.logger)
    );
  }
  if (config.voterPrivateKey && config.ilpAddress && config.logger) {
    registry.register(
      createVoteCoordinationSkill(config.voterPrivateKey, config.ilpAddress, config.logger)
    );
  }
}

// Re-export individual skill creators for custom registration
export { createStoreNoteSkill } from './store-note-skill';
export { createUpdateFollowSkill } from './update-follow-skill';
export { createDeleteEventsSkill } from './delete-events-skill';
export { createQueryEventsSkill } from './query-events-skill';
export { createDVMQuerySkill } from './dvm-query-skill';
export { createForwardPacketSkill } from './forward-packet-skill';
export { createGetAgentInfoSkill } from './get-agent-info-skill';
export { createProposeCoordinationSkill } from './propose-coordination-skill';
export { createVoteCoordinationSkill } from './vote-coordination-skill';
