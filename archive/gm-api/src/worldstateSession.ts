import type {
  Character,
  Chronicle,
  Turn,
  ChronicleSnapshotV2,
  WorldStateStoreV2,
} from '@glass-frontier/worldstate';

export type WorldstateSessionSummary = {
  characterId: string | null;
  chronicleId: string;
  chronicleStatus: Chronicle['status'];
  latestTurnSequence: number;
  loginId: string;
  nextTurnSequence: number;
  turnCount: number;
};

type WorldstateSessionInit = {
  chronicle: Chronicle;
  character: Character | null;
  turns: Turn[];
  snapshot: ChronicleSnapshotV2;
  store: WorldStateStoreV2;
};

export class WorldstateSession {
  readonly #chronicle: Chronicle;
  readonly #character: Character | null;
  readonly #turns: Turn[];
  readonly #snapshot: ChronicleSnapshotV2;
  readonly #store: WorldStateStoreV2;
  readonly #latestTurnSequence: number;

  constructor(init: WorldstateSessionInit) {
    this.#chronicle = init.chronicle;
    this.#character = init.character;
    this.#turns = init.turns;
    this.#snapshot = init.snapshot;
    this.#store = init.store;
    let latestSequence = -1;
    for (const turn of this.#turns) {
      if (turn.turnSequence > latestSequence) {
        latestSequence = turn.turnSequence;
      }
    }
    this.#latestTurnSequence = latestSequence;
  }

  get chronicle(): Chronicle {
    return this.#chronicle;
  }

  get character(): Character | null {
    return this.#character;
  }

  get turns(): Turn[] {
    return this.#turns;
  }

  get store(): WorldStateStoreV2 {
    return this.#store;
  }

  get snapshot(): ChronicleSnapshotV2 {
    return this.#snapshot;
  }

  get latestTurnSequence(): number {
    return this.#latestTurnSequence;
  }

  get nextTurnSequence(): number {
    return this.#latestTurnSequence + 1;
  }

  describe(): WorldstateSessionSummary {
    return {
      characterId: this.#character?.id ?? null,
      chronicleId: this.#chronicle.id,
      chronicleStatus: this.#chronicle.status,
      latestTurnSequence: this.#latestTurnSequence,
      loginId: this.#chronicle.loginId,
      nextTurnSequence: this.nextTurnSequence,
      turnCount: this.#turns.length,
    };
  }
}

export class WorldstateSessionFactory {
  constructor(private readonly store: WorldStateStoreV2) {}

  async create(chronicleId: string): Promise<WorldstateSession> {
    const snapshot = await this.store.getChronicleSnapshot(chronicleId);
    if (snapshot === null || snapshot.chronicle === null) {
      throw new Error(`Chronicle ${chronicleId} not found`);
    }
    if (snapshot.character === null) {
      throw new Error(`Chronicle ${chronicleId} is missing a character assignment`);
    }
    return new WorldstateSession({
      character: snapshot.character,
      chronicle: snapshot.chronicle,
      snapshot,
      store: this.store,
      turns: snapshot.turns ?? [],
    });
  }
}
