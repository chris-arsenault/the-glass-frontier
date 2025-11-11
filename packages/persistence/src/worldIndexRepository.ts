import type { AttributeValue, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { HybridIndexRepository } from './hybridIndexRepository';

const PK_PREFIX = {
  login: 'LOGIN#',
  character: 'CHARACTER#',
  chronicle: 'CHRONICLE#',
  turn: 'TURN#',
  location: 'LOCATION#',
} as const;

const SK_PREFIX = {
  login: 'LOGIN#',
  character: 'CHARACTER#',
  chronicle: 'CHRONICLE#',
  turn: 'TURN#',
  location: 'LOCATION#',
} as const;

const TURN_PAD_LENGTH = 12;

const toPk = (prefix: keyof typeof PK_PREFIX, id: string) => `${PK_PREFIX[prefix]}${id}`;
const padSequence = (value: number) => value.toString().padStart(TURN_PAD_LENGTH, '0');

const decodePrefixedValue = (value: string | undefined, prefix: string): string | null => {
  if (!value || !value.startsWith(prefix)) {
    return null;
  }
  return value.slice(prefix.length);
};

type ChronicleTurnPointer = { turnId: string; turnSequence: number };

export class WorldIndexRepository extends HybridIndexRepository {
  constructor(options: { client: DynamoDBClient; tableName: string }) {
    super({ tableName: options.tableName, client: options.client });
  }

  async linkCharacterToLogin(characterId: string, loginId: string): Promise<void> {
    await Promise.all([
      this.put(toPk('login', loginId), `${SK_PREFIX.character}${characterId}`, {
        targetType: { S: 'character' },
        targetId: { S: characterId },
      }),
      this.put(toPk('character', characterId), `${SK_PREFIX.login}${loginId}`, {
        targetType: { S: 'login' },
        targetId: { S: loginId },
      }),
    ]);
  }

  async linkChronicleToLogin(chronicleId: string, loginId: string): Promise<void> {
    await Promise.all([
      this.put(toPk('login', loginId), `${SK_PREFIX.chronicle}${chronicleId}`, {
        targetType: { S: 'chronicle' },
        targetId: { S: chronicleId },
      }),
      this.put(toPk('chronicle', chronicleId), `${SK_PREFIX.login}${loginId}`, {
        targetType: { S: 'login' },
        targetId: { S: loginId },
      }),
    ]);
  }

  async linkChronicleToCharacter(chronicleId: string, characterId: string): Promise<void> {
    await this.put(toPk('chronicle', chronicleId), `${SK_PREFIX.character}${characterId}`, {
      targetType: { S: 'character' },
      targetId: { S: characterId },
    });
  }

  async linkChronicleToLocation(chronicleId: string, locationId: string): Promise<void> {
    await this.put(toPk('chronicle', chronicleId), `${SK_PREFIX.location}${locationId}`, {
      targetType: { S: 'location' },
      targetId: { S: locationId },
    });
  }

  async recordChronicleTurn(
    chronicleId: string,
    turnId: string,
    turnSequence: number
  ): Promise<void> {
    const padded = padSequence(Math.max(turnSequence, 0));
    await this.put(toPk('chronicle', chronicleId), `${SK_PREFIX.turn}${padded}#${turnId}`, {
      targetType: { S: 'turn' },
      targetId: { S: turnId },
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
      (item) => {
        const parts = item.sk?.S?.split('#') ?? [];
        const turnSequence = item.turnSequence?.N
          ? Number(item.turnSequence.N)
          : Number(parts[1] ?? 0);
        const turnId = parts[2] ?? item.targetId?.S ?? '';
        if (!turnId) {
          return null;
        }
        return { turnId, turnSequence };
      },
      { sort: (a, b) => a.turnSequence - b.turnSequence }
    );
  }

  async listChronicleCharacters(chronicleId: string): Promise<string[]> {
    return this.listByPrefix(toPk('chronicle', chronicleId), SK_PREFIX.character, (item) =>
      decodePrefixedValue(item.sk?.S, SK_PREFIX.character)
    );
  }
}
