// === Entry point ===
export { WorldState } from './worldState';

// === Stores ===
export { createChronicleStore } from './chronicleStore';
export {
  createEncyclopediaStore,
  encyclopediaSummary,
  playerEncyclopediaEntry,
} from './encyclopediaStore';
export { createWorldSchemaStore } from './worldSchemaStore';

// === The write surface ===
export { CanonWriter } from './canonWriter';
export { CanonSnapshotWriter } from './canonSnapshotWriter';
export { ProposalRejected, validateProposal } from './canonValidation';

// === Vocabulary ===

// === Canon import tooling ===
export {
  buildTsonuProposal,
  buildTsonuSnapshot,
  parseTsonuBundle,
  parseTsonuSnapshot,
} from './tsonuBundle';
export { isEntityOfferable } from './entityOfferability';
export {
  buildInitialEntityRoster,
  curateEntityRoster,
  toEntityRosterEntries,
} from './entityRoster';

// === Types ===
export type {
  ChronicleStore,
  ChronicleSnapshot,
  EncyclopediaEmbeddingSource,
  EncyclopediaSearchCandidate,
  EncyclopediaStore,
  StoredEncyclopediaEntry,
  WorldSchemaStore,
  WorldNeighbor,
} from './types';
export type { EntityStats } from './entityReader';
export type {
  EntityEmbeddingSource,
  EntitySearchCandidate,
  ReferenceEntityCandidate,
  SubjectEntityCandidate,
} from './entityEmbeddings';
export type { CanonSnapshotResult } from './canonSnapshotWriter';
export type { TsonuCanonSnapshot } from './tsonuBundle';
