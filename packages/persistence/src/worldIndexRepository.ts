import {
  DynamoDBClient,
  PutItemCommand,
  QueryCommand,
  type AttributeValue
} from "@aws-sdk/client-dynamodb";

const PK_PREFIX = {
  login: "LOGIN#",
  character: "CHARACTER#",
  chronicle: "CHRONICLE#",
  turn: "TURN#",
  location: "LOCATION#"
} as const;

const SK_PREFIX = {
  login: "LOGIN#",
  character: "CHARACTER#",
  chronicle: "CHRONICLE#",
  turn: "TURN#",
  location: "LOCATION#"
} as const;

const TURN_PAD_LENGTH = 12;

const toPk = (prefix: keyof typeof PK_PREFIX, id: string) => `${PK_PREFIX[prefix]}${id}`;
const padSequence = (value: number) => value.toString().padStart(TURN_PAD_LENGTH, "0");

const decodePrefixedValue = (value: string | undefined, prefix: string): string | null => {
  if (!value || !value.startsWith(prefix)) {
    return null;
  }
  return value.slice(prefix.length);
};

type ChronicleTurnPointer = { turnId: string; turnSequence: number };

export class WorldIndexRepository {
  #client: DynamoDBClient;
  #tableName: string;

  constructor(options: { client: DynamoDBClient; tableName: string }) {
    if (!options.tableName) {
      throw new Error("WorldIndexRepository requires a DynamoDB table name.");
    }
    this.#client = options.client;
    this.#tableName = options.tableName;
  }

  async linkCharacterToLogin(characterId: string, loginId: string): Promise<void> {
    await Promise.all([
      this.#put(toPk("login", loginId), `${SK_PREFIX.character}${characterId}`, {
        targetType: { S: "character" },
        targetId: { S: characterId }
      }),
      this.#put(toPk("character", characterId), `${SK_PREFIX.login}${loginId}`, {
        targetType: { S: "login" },
        targetId: { S: loginId }
      })
    ]);
  }

  async linkChronicleToLogin(chronicleId: string, loginId: string): Promise<void> {
    await Promise.all([
      this.#put(toPk("login", loginId), `${SK_PREFIX.chronicle}${chronicleId}`, {
        targetType: { S: "chronicle" },
        targetId: { S: chronicleId }
      }),
      this.#put(toPk("chronicle", chronicleId), `${SK_PREFIX.login}${loginId}`, {
        targetType: { S: "login" },
        targetId: { S: loginId }
      })
    ]);
  }

  async linkChronicleToCharacter(chronicleId: string, characterId: string): Promise<void> {
    await this.#put(toPk("chronicle", chronicleId), `${SK_PREFIX.character}${characterId}`, {
      targetType: { S: "character" },
      targetId: { S: characterId }
    });
  }

  async linkChronicleToLocation(chronicleId: string, locationId: string): Promise<void> {
    await this.#put(toPk("chronicle", chronicleId), `${SK_PREFIX.location}${locationId}`, {
      targetType: { S: "location" },
      targetId: { S: locationId }
    });
  }

  async recordChronicleTurn(chronicleId: string, turnId: string, turnSequence: number): Promise<void> {
    const padded = padSequence(Math.max(turnSequence, 0));
    await this.#put(toPk("chronicle", chronicleId), `${SK_PREFIX.turn}${padded}#${turnId}`, {
      targetType: { S: "turn" },
      targetId: { S: turnId },
      turnSequence: { N: Math.max(turnSequence, 0).toString() }
    });
  }

  async listCharactersByLogin(loginId: string): Promise<string[]> {
    const items = await this.#query(toPk("login", loginId));
    return items
      .map((item) => decodePrefixedValue(item.sk?.S, SK_PREFIX.character))
      .filter((value): value is string => Boolean(value));
  }

  async listChroniclesByLogin(loginId: string): Promise<string[]> {
    const items = await this.#query(toPk("login", loginId));
    return items
      .map((item) => decodePrefixedValue(item.sk?.S, SK_PREFIX.chronicle))
      .filter((value): value is string => Boolean(value));
  }

  async getCharacterLogin(characterId: string): Promise<string | null> {
    const items = await this.#query(toPk("character", characterId));
    const candidate = items.find((item) => item.sk?.S?.startsWith(SK_PREFIX.login));
    return candidate ? decodePrefixedValue(candidate.sk?.S, SK_PREFIX.login) : null;
  }

  async getChronicleLogin(chronicleId: string): Promise<string | null> {
    const items = await this.#query(toPk("chronicle", chronicleId));
    const candidate = items.find((item) => item.sk?.S?.startsWith(SK_PREFIX.login));
    return candidate ? decodePrefixedValue(candidate.sk?.S, SK_PREFIX.login) : null;
  }

  async listChronicleTurns(chronicleId: string): Promise<ChronicleTurnPointer[]> {
    const items = await this.#query(toPk("chronicle", chronicleId));
    return items
      .filter((item) => item.sk?.S?.startsWith(SK_PREFIX.turn))
      .map((item) => {
        const parts = item.sk?.S?.split("#") ?? [];
        const turnSequence = item.turnSequence?.N ? Number(item.turnSequence.N) : Number(parts[1] ?? 0);
        const turnId = parts[2] ?? item.targetId?.S ?? "";
        return { turnId, turnSequence };
      })
      .filter((entry) => entry.turnId.length > 0)
      .sort((a, b) => a.turnSequence - b.turnSequence);
  }

  async listChronicleCharacters(chronicleId: string): Promise<string[]> {
    const items = await this.#query(toPk("chronicle", chronicleId));
    return items
      .map((item) => decodePrefixedValue(item.sk?.S, SK_PREFIX.character))
      .filter((value): value is string => Boolean(value));
  }

  async #put(
    pk: string,
    sk: string,
    attributes: Record<string, AttributeValue>
  ): Promise<void> {
    await this.#client.send(
      new PutItemCommand({
        TableName: this.#tableName,
        Item: {
          pk: { S: pk },
          sk: { S: sk },
          ...attributes
        }
      })
    );
  }

  async #query(pk: string) {
    const result = await this.#client.send(
      new QueryCommand({
        TableName: this.#tableName,
        KeyConditionExpression: "#pk = :pk",
        ExpressionAttributeNames: {
          "#pk": "pk"
        },
        ExpressionAttributeValues: {
          ":pk": { S: pk }
        }
      })
    );
    return result.Items ?? [];
  }
}
