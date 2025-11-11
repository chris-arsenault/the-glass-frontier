import type {
  Character,
  Chronicle,
  Login,
  Turn
} from "@glass-frontier/dto";
import type { CharacterProgressPayload, ChronicleSnapshot } from "./types";

export interface WorldStateStore {
  ensureChronicle(params: {
    chronicleId?: string;
    loginId: string;
    locationId: string;
    characterId?: string;
    title?: string;
    status?: Chronicle["status"];
  }): Promise<Chronicle>;

  getChronicleState(chronicleId: string): Promise<ChronicleSnapshot | null>;

  upsertLogin(login: Login): Promise<Login>;
  getLogin(loginId: string): Promise<Login | null>;
  listLogins(): Promise<Login[]>;

  upsertCharacter(character: Character): Promise<Character>;
  getCharacter(characterId: string): Promise<Character | null>;
  listCharactersByLogin(loginId: string): Promise<Character[]>;

  upsertChronicle(chronicle: Chronicle): Promise<Chronicle>;
  getChronicle(chronicleId: string): Promise<Chronicle | null>;
  listChroniclesByLogin(loginId: string): Promise<Chronicle[]>;

  addTurn(turn: Turn): Promise<Turn>;
  listChronicleTurns(chronicleId: string): Promise<Turn[]>;

  applyCharacterProgress(update: CharacterProgressPayload): Promise<Character | null>;
}
