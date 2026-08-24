// === Entry point ===
export { WorldState } from './worldState';

// === Stores ===
export { createChronicleStore } from './chronicleStore';
export { createWorldSchemaStore } from './worldSchemaStore';

// === The write surface ===
export { CanonWriter } from './canonWriter';
export { ProposalRejected, validateProposal } from './canonValidation';

// === Vocabulary ===

// === Canon import tooling ===
export { buildTsonuProposal } from './tsonuBundle';
export {
  buildInitialEntityRoster,
  curateEntityRoster,
  isEntityRosterEligible,
  toEntityRosterEntries,
} from './entityRoster';

// === Types ===
export type { ChronicleStore, ChronicleSnapshot, WorldSchemaStore, WorldNeighbor } from './types';
export type { EntityStats } from './entityReader';
export type {
  EntityEmbeddingSource,
  ReferenceEntityCandidate,
  SubjectEntityCandidate,
} from './entityEmbeddings';
