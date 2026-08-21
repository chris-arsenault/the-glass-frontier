// === Entry point ===
export { WorldState } from './worldState';

// === Stores ===
export { createChronicleStore } from './chronicleStore';
export { createWorldSchemaStore } from './worldSchemaStore';

// === The write surface ===
export { CanonWriter } from './canonWriter';
export { ProposalRejected, validateProposal } from './canonValidation';

// === Vocabulary ===
export { seedVocabulary } from './seedVocabulary';

// === Types ===
export type { ChronicleStore, ChronicleSnapshot, WorldSchemaStore, WorldNeighbor } from './types';
