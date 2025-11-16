type PathSegment = string | number;

const join = (...parts: PathSegment[]): string =>
  parts
    .map((part) => part.toString().replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/');

export class WorldStateKeyFactory {
  readonly #prefix: string;

  constructor(prefix?: string) {
    this.#prefix = prefix ? prefix.replace(/^\/+|\/+$/g, '') : '';
  }

  #path(...parts: PathSegment[]): string {
    const tail = join(...parts);
    return this.#prefix ? `${this.#prefix}/${tail}` : tail;
  }

  login(loginId: string): string {
    return this.#path('logins', `${loginId}.json`);
  }

  characterDocument(characterId: string): string {
    return this.#path('characters', characterId, 'full.json');
  }

  chronicleMeta(chronicleId: string): string {
    return this.#path('chronicles', chronicleId, 'meta.json');
  }

  chronicleManifest(chronicleId: string): string {
    return this.#path('chronicles', chronicleId, 'manifest.json');
  }

  chronicleTurnChunk(chronicleId: string, chunkIndex: number): string {
    return this.#path('chronicles', chronicleId, 'turn-chunks', `${chunkIndex}.json`);
  }

  locationMeta(locationId: string): string {
    return this.#path('locations', locationId, 'meta.json');
  }

  locationManifest(locationId: string): string {
    return this.#path('locations', locationId, 'manifest.json');
  }

  locationGraphChunk(locationId: string, chunkIndex: number): string {
    return this.#path('locations', locationId, 'graph-chunks', `${chunkIndex}.json`);
  }

  locationState(locationId: string, characterId: string): string {
    return this.#path('locations', locationId, 'states', `${characterId}.json`);
  }

  locationEvents(locationId: string): string {
    return this.#path('locations', locationId, 'events.json');
  }
}
