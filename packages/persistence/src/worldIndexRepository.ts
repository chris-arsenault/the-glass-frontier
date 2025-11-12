import type { AttributeValue, DynamoDBClient } from '@aws-sdk/client-dynamodb';

import { HybridIndexRepository } from './hybridIndexRepository';

const PK_PREFIX = {
  character: 'CHARACTER#',
  chronicle: 'CHRONICLE#',
  location: 'LOCATION#',
  login: 'LOGIN#',
  turn: 'TURN#',
} as const;

const SK_PREFIX = {
  character: 'CHARACTER#',
  chronicle: 'CHRONICLE#',
  location: 'LOCATION#',
  login: 'LOGIN#',
  turn: 'TURN#',
} as const;

const TURN_PAD_LENGTH = 12;

const resolvePkPrefix = (prefix: keyof typeof PK_PREFIX): string => {
  switch (prefix) {
  case 'character':
    return PK_PREFIX.character;
  case 'chronicle':
    return PK_PREFIX.chronicle;
  case 'location':
    return PK_PREFIX.location;
  case 'login':
    return PK_PREFIX.login;
  case 'turn':
    return PK_PREFIX.turn;
  default:
    throw new Error(`Unknown PK prefix: ${prefix}`);
  }
};

const toPk = (prefix: keyof typeof PK_PREFIX, id: string): string => `${resolvePkPrefix(prefix)}${id}`;
const padSequence = (value: number): string => value.toString().padStart(TURN_PAD_LENGTH, '0');

const decodePrefixedValue = (value: string | undefined, prefix: string): string | null => {
  if (value === undefined || !value.startsWith(prefix)) {
    return null;
  }
  return value.slice(prefix.length);
};

const hasText = (value: string | null | undefined): value is string =>
  typeof value === 'string' && value.length > 0;

type ChronicleTurnPointer = { turnId: string; turnSequence: number };

export class WorldIndexRepository extends HybridIndexRepository {
  constructor(options: { client: DynamoDBClient; tableName: string }) {
    super({ client: options.client, tableName: options.tableName });
  }

  async linkCharacterToLogin(characterId: string, loginId: string): Promise<void> {
    await Promise.all([
      this.put(toPk('login', loginId), `${SK_PREFIX.character}${characterId}`, {
        targetId: { S: characterId },
        targetType: { S: 'character' },
      }),
      this.put(toPk('character', characterId), `${SK_PREFIX.login}${loginId}`, {
        targetId: { S: loginId },
        targetType: { S: 'login' },
      }),
    ]);
  }

  async linkChronicleToLogin(chronicleId: string, loginId: string): Promise<void> {
    await Promise.all([
      this.put(toPk('login', loginId), `${SK_PREFIX.chronicle}${chronicleId}`, {
        targetId: { S: chronicleId },
        targetType: { S: 'chronicle' },
      }),
      this.put(toPk('chronicle', chronicleId), `${SK_PREFIX.login}${loginId}`, {
        targetId: { S: loginId },
        targetType: { S: 'login' },
      }),
    ]);
  }

  async linkChronicleToCharacter(chronicleId: string, characterId: string): Promise<void> {
    await this.put(toPk('chronicle', chronicleId), `${SK_PREFIX.character}${characterId}`, {
      targetId: { S: characterId },
      targetType: { S: 'character' },
    });
  }

  async linkChronicleToLocation(chronicleId: string, locationId: string): Promise<void> {
    await this.put(toPk('chronicle', chronicleId), `${SK_PREFIX.location}${locationId}`, {
      targetId: { S: locationId },
      targetType: { S: 'location' },
    });
  }

  async recordChronicleTurn(
    chronicleId: string,
    turnId: string,
    turnSequence: number
  ): Promise<void> {
    const padded = padSequence(Math.max(turnSequence, 0));
    await this.put(toPk('chronicle', chronicleId), `${SK_PREFIX.turn}${padded}#${turnId}`, {
      targetId: { S: turnId },
      targetType: { S: 'turn' },
      turnSequence: { N: Math.max(turnSequence, 0).toString() },
    });
  }

  async listCharactersByLogin(loginId: string): Promise<string[]> {
    return this.listByPrefix(toPk('login', loginId), SK_PREFIX.character, (item) =>
      decodePrefixedValue(item.sk?.S, SK_PREFIX.character)
    );
  }

  async listChroniclesByLogin(loginId: string): Promise<string[]> {
    return this.listByPrefix(toPk('login', loginId), SK_PREFIX.chronicle, (item) =>
      decodePrefixedValue(item.sk?.S, SK_PREFIX.chronicle)
    );
  }

  async getCharacterLogin(characterId: string): Promise<string | null> {
    const matches = await this.listByPrefix(
      toPk('character', characterId),
      SK_PREFIX.login,
      (item) => decodePrefixedValue(item.sk?.S, SK_PREFIX.login)
    );
    return matches[0] ?? null;
  }

  async getChronicleLogin(chronicleId: string): Promise<string | null> {
    const matches = await this.listByPrefix(
      toPk('chronicle', chronicleId),
      SK_PREFIX.login,
      (item) => decodePrefixedValue(item.sk?.S, SK_PREFIX.login)
    );
    return matches[0] ?? null;
  }

  async listChronicleTurns(chronicleId: string): Promise<ChronicleTurnPointer[]> {
    return this.listByPrefix(
      toPk('chronicle', chronicleId),
      SK_PREFIX.turn,
      (item) => parseChronicleTurnPointer(item),
      { sort: (a, b) => a.turnSequence - b.turnSequence }
    );
  }

  async listChronicleCharacters(chronicleId: string): Promise<string[]> {
    return this.listByPrefix(toPk('chronicle', chronicleId), SK_PREFIX.character, (item) =>
      decodePrefixedValue(item.sk?.S, SK_PREFIX.character)
    );
  }

  async removeChronicleFromLogin(chronicleId: string, loginId: string): Promise<void> {
    await Promise.all([
      this.delete(toPk('login', loginId), `${SK_PREFIX.chronicle}${chronicleId}`),
      this.delete(toPk('chronicle', chronicleId), `${SK_PREFIX.login}${loginId}`),
    ]);
  }

  async deleteChronicleRecords(chronicleId: string): Promise<void> {
    const pk = toPk('chronicle', chronicleId);
    const items = await this.query(pk);
    await Promise.all(
      items.map((item) => {
        const sortKey = item.sk?.S ?? null;
        if (!hasText(sortKey)) {
          return Promise.resolve();
        }
        return this.delete(pk, sortKey);
      })
    );
  }
}

const parseChronicleTurnPointer = (
  item: Record<string, AttributeValue>
): ChronicleTurnPointer | null => {
  const rawKey = item.sk?.S;
  const parts = typeof rawKey === 'string' ? rawKey.split('#') : [];
  const sequenceSource = item.turnSequence?.N ?? parts[1] ?? '0';
  const turnSequence = Number(sequenceSource);
  const candidateId = parts[2] ?? item.targetId?.S ?? null;
  if (!hasText(candidateId)) {
    return null;
  }
  return { turnId: candidateId, turnSequence };
};
