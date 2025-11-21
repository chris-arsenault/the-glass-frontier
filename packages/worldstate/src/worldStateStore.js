import { randomUUID } from 'node:crypto';
import { GraphOperations } from './graphOperations';
import { createPool, withTransaction } from './pg';
import { createWorldSchemaStore } from './worldSchemaStore';
import { isNonEmptyString } from './utils';
const ensureInventory = (character) => {
    if (character.inventory !== undefined) {
        return character;
    }
    return {
        ...character,
        inventory: [],
    };
};
const normalizeChronicle = (chronicle) => {
    const beatsEnabled = chronicle.beatsEnabled === undefined || chronicle.beatsEnabled === null
        ? true
        : Boolean(chronicle.beatsEnabled);
    const beats = Array.isArray(chronicle.beats) ? chronicle.beats : [];
    const summaries = Array.isArray(chronicle.summaries) ? chronicle.summaries : [];
    return {
        ...chronicle,
        beats,
        beatsEnabled,
        summaries,
    };
};
const serializeJson = (value) => JSON.stringify(value ?? {});
const resolveTurnIndex = (turn) => Math.max(turn.turnSequence ?? 0, 0);
const resolveText = (value, fallback = '') => {
    if (typeof value === 'string') {
        return value;
    }
    if (value && typeof value === 'object' && 'text' in value && typeof value.text === 'string') {
        return value.text;
    }
    return fallback;
};
class PostgresChronicleStore {
    #pool;
    #graph;
    #worldStore;
    constructor(options) {
        this.#pool = options.pool;
        this.#graph = options.graph ?? new GraphOperations(options.pool);
        this.#worldStore = options.worldStore ?? createWorldSchemaStore({ pool: this.#pool, graph: this.#graph });
    }
    get graph() {
        return this.#graph;
    }
    async #assertPlayerExists(playerId, executor = this.#pool) {
        const lookup = await executor.query('SELECT 1 FROM app.player WHERE id = $1', [playerId]);
        if (!lookup.rowCount) {
            throw new Error(`Player ${playerId} not found in app schema`);
        }
    }
    async ensureChronicle(params) {
        const chronicleId = params.chronicleId ?? randomUUID();
        const existing = await this.getChronicle(chronicleId);
        if (existing !== null) {
            return existing;
        }
        const record = this.#buildChronicleRecord(params, chronicleId);
        return this.upsertChronicle(record);
    }
    #buildChronicleRecord(params, chronicleId) {
        return normalizeChronicle({
            anchorEntityId: params.anchorEntityId ?? undefined,
            beats: [],
            beatsEnabled: params.beatsEnabled ?? true,
            characterId: params.characterId,
            id: chronicleId,
            locationId: params.locationId,
            playerId: params.playerId,
            seedText: params.seedText ?? undefined,
            status: params.status ?? 'open',
            summaries: [],
            title: params.title ?? 'Untitled Chronicle',
        });
    }
    async getChronicleState(chronicleId) {
        const chronicle = await this.getChronicle(chronicleId);
        if (chronicle === null) {
            return null;
        }
        const character = isNonEmptyString(chronicle.characterId)
            ? await this.getCharacter(chronicle.characterId)
            : null;
        const locationSummary = this.#worldStore && isNonEmptyString(chronicle.locationId)
            ? await this.#summarizeLocation(chronicle.locationId)
            : null;
        const turns = await this.listChronicleTurns(chronicleId);
        const lastTurn = turns.length > 0 ? turns[turns.length - 1] : null;
        const turnSequence = lastTurn?.turnSequence ?? -1;
        return {
            character,
            chronicle,
            chronicleId: chronicle.id,
            location: locationSummary,
            turns,
            turnSequence,
        };
    }
    async upsertCharacter(character) {
        const normalized = ensureInventory({
            ...character,
            playerId: character.playerId,
        });
        await withTransaction(this.#pool, async (client) => {
            await this.#assertPlayerExists(normalized.playerId, client);
            await this.#graph.upsertNode(client, normalized.id, 'character', normalized);
            await client.query(`INSERT INTO character (
           id, player_id, name, tags, archetype, pronouns, bio, attributes, skills, inventory, momentum, created_at, updated_at
         )
         VALUES ($1::uuid, $2, $3, $4::text[], $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb, now(), now())
         ON CONFLICT (id) DO UPDATE
         SET player_id = EXCLUDED.player_id,
             name = EXCLUDED.name,
             tags = EXCLUDED.tags,
             archetype = EXCLUDED.archetype,
             pronouns = EXCLUDED.pronouns,
             bio = EXCLUDED.bio,
             attributes = EXCLUDED.attributes,
             skills = EXCLUDED.skills,
             inventory = EXCLUDED.inventory,
             momentum = EXCLUDED.momentum,
             updated_at = now()`, [
                normalized.id,
                normalized.playerId,
                normalized.name,
                normalized.tags ?? [],
                normalized.archetype,
                normalized.pronouns,
                normalized.bio ?? null,
                serializeJson(normalized.attributes),
                serializeJson(normalized.skills),
                serializeJson(normalized.inventory),
                serializeJson(normalized.momentum),
            ]);
        });
        return normalized;
    }
    async getCharacter(characterId) {
        const result = await this.#pool.query(`SELECT n.props
       FROM character c
       JOIN node n ON n.id = c.id
       WHERE c.id = $1::uuid`, [characterId]);
        const row = result.rows[0];
        if (!row) {
            return null;
        }
        const parsed = ensureInventory(row.props);
        return parsed;
    }
    async listCharactersByPlayer(playerId) {
        const result = await this.#pool.query(`SELECT n.props
       FROM character c
       JOIN node n ON n.id = c.id
       WHERE c.player_id = $1
       ORDER BY c.created_at ASC`, [playerId]);
        return result.rows.map((row) => ensureInventory(row.props));
    }
    async upsertChronicle(chronicle) {
        const normalized = normalizeChronicle(chronicle);
        await withTransaction(this.#pool, async (client) => {
            await this.#assertPlayerExists(normalized.playerId, client);
            await this.#ensureLocationExists(client, normalized.locationId, normalized.title);
            if (isNonEmptyString(normalized.anchorEntityId)) {
                await this.#assertAnchorExists(client, normalized.anchorEntityId);
            }
            await this.#graph.upsertNode(client, normalized.id, 'chronicle', normalized);
            await client.query(`INSERT INTO chronicle (
           id, title, primary_char_id, status, player_id, location_id, seed_text, beats_enabled, anchor_entity_id, created_at, updated_at
         ) VALUES ($1::uuid, $2, $3::uuid, $4, $5, $6::uuid, $7, $8, $9::uuid, now(), now())
         ON CONFLICT (id) DO UPDATE
         SET title = EXCLUDED.title,
             primary_char_id = EXCLUDED.primary_char_id,
             status = EXCLUDED.status,
             player_id = EXCLUDED.player_id,
             location_id = EXCLUDED.location_id,
             seed_text = EXCLUDED.seed_text,
             beats_enabled = EXCLUDED.beats_enabled,
             anchor_entity_id = EXCLUDED.anchor_entity_id,
             updated_at = now()`, [
                normalized.id,
                normalized.title,
                normalized.characterId ?? null,
                normalized.status ?? 'open',
                normalized.playerId,
                normalized.locationId,
                normalized.seedText ?? null,
                normalized.beatsEnabled ?? true,
                normalized.anchorEntityId ?? null,
            ]);
        });
        return normalized;
    }
    async getChronicle(chronicleId) {
        const result = await this.#pool.query(`SELECT n.props, c.anchor_entity_id
       FROM chronicle c
       JOIN node n ON n.id = c.id
       WHERE c.id = $1::uuid`, [chronicleId]);
        const row = result.rows[0];
        if (!row) {
            return null;
        }
        const normalizedProps = normalizeChronicle(row.props);
        return normalizeChronicle({
            ...normalizedProps,
            anchorEntityId: row.anchor_entity_id ?? normalizedProps.anchorEntityId,
        });
    }
    async listChroniclesByPlayer(playerId) {
        const result = await this.#pool.query(`SELECT n.props
       FROM chronicle c
       JOIN node n ON n.id = c.id
       WHERE c.player_id = $1
       ORDER BY c.created_at ASC`, [playerId]);
        return result.rows.map((row) => normalizeChronicle(row.props));
    }
    async deleteChronicle(chronicleId) {
        await withTransaction(this.#pool, async (client) => {
            const turnIds = await client.query('SELECT id FROM chronicle_turn WHERE chronicle_id = $1::uuid', [chronicleId]);
            await client.query('DELETE FROM chronicle_turn WHERE chronicle_id = $1::uuid', [
                chronicleId,
            ]);
            if (turnIds.rowCount && turnIds.rows.length > 0) {
                const ids = turnIds.rows.map((row) => row.id);
                await client.query('DELETE FROM node WHERE id = ANY($1::uuid[])', [ids]);
            }
            await client.query('DELETE FROM chronicle WHERE id = $1::uuid', [chronicleId]);
            await client.query('DELETE FROM node WHERE id = $1::uuid', [chronicleId]);
        });
    }
    async addTurn(turn) {
        const chronicleId = turn.chronicleId ?? null;
        if (!isNonEmptyString(chronicleId)) {
            throw new Error(`Chronicle ${chronicleId ?? '<unknown>'} not found for turn ${turn.id}`);
        }
        const chronicle = await this.getChronicle(chronicleId);
        if (chronicle === null) {
            throw new Error(`Chronicle ${chronicleId} not found for turn ${turn.id}`);
        }
        const turnSequence = resolveTurnIndex(turn);
        await withTransaction(this.#pool, async (client) => {
            await this.#graph.upsertNode(client, turn.id, 'chronicle_turn', turn);
            await client.query(`INSERT INTO chronicle_turn (
           id, chronicle_id, turn_sequence, created_at,
           handler_id, executed_nodes, failure, advances_timeline, world_delta_tags,
           player_message_id, player_message_content, player_message_metadata,
           resolved_intent_type, player_intent,
           gm_response_id, gm_response_content, gm_response_metadata, gm_summary,
           system_message_id, system_message_content, system_message_metadata,
           skill_check_plan, skill_check_result,
           inventory_delta, location_delta, beat_tracker,
           gm_trace
         ) VALUES (
           $1::uuid, $2::uuid, $3, now(),
           $4, $5, $6, $7, $8,
           $9, $10, $11::jsonb,
           $12, $13::jsonb,
           $14, $15, $16::jsonb, $17,
           $18, $19, $20::jsonb,
           $21::jsonb, $22::jsonb,
           $23::jsonb, $24::jsonb, $25::jsonb,
           $26::jsonb
         )
         ON CONFLICT (chronicle_id, turn_sequence) DO UPDATE SET
           handler_id = EXCLUDED.handler_id,
           executed_nodes = EXCLUDED.executed_nodes,
           failure = EXCLUDED.failure,
           advances_timeline = EXCLUDED.advances_timeline,
           world_delta_tags = EXCLUDED.world_delta_tags,
           player_message_id = EXCLUDED.player_message_id,
           player_message_content = EXCLUDED.player_message_content,
           player_message_metadata = EXCLUDED.player_message_metadata,
           resolved_intent_type = EXCLUDED.resolved_intent_type,
           player_intent = EXCLUDED.player_intent,
           gm_response_id = EXCLUDED.gm_response_id,
           gm_response_content = EXCLUDED.gm_response_content,
           gm_response_metadata = EXCLUDED.gm_response_metadata,
           gm_summary = EXCLUDED.gm_summary,
           system_message_id = EXCLUDED.system_message_id,
           system_message_content = EXCLUDED.system_message_content,
           system_message_metadata = EXCLUDED.system_message_metadata,
           skill_check_plan = EXCLUDED.skill_check_plan,
           skill_check_result = EXCLUDED.skill_check_result,
           inventory_delta = EXCLUDED.inventory_delta,
           location_delta = EXCLUDED.location_delta,
           beat_tracker = EXCLUDED.beat_tracker,
           gm_trace = EXCLUDED.gm_trace`, [
                turn.id,
                chronicleId,
                turnSequence,
                turn.handlerId ?? null,
                turn.executedNodes ?? [],
                turn.failure,
                turn.advancesTimeline ?? false,
                turn.worldDeltaTags ?? [],
                turn.playerMessage.id,
                turn.playerMessage.content,
                serializeJson(turn.playerMessage.metadata),
                turn.resolvedIntentType ?? null,
                turn.playerIntent ? serializeJson(turn.playerIntent) : null,
                turn.gmResponse?.id ?? null,
                turn.gmResponse?.content ?? null,
                turn.gmResponse?.metadata ? serializeJson(turn.gmResponse.metadata) : null,
                turn.gmSummary ?? null,
                turn.systemMessage?.id ?? null,
                turn.systemMessage?.content ?? null,
                turn.systemMessage?.metadata ? serializeJson(turn.systemMessage.metadata) : null,
                turn.skillCheckPlan ? serializeJson(turn.skillCheckPlan) : null,
                turn.skillCheckResult ? serializeJson(turn.skillCheckResult) : null,
                turn.inventoryDelta ? serializeJson(turn.inventoryDelta) : null,
                null, // location_delta - will be populated from GraphContext in future
                turn.beatTracker ? serializeJson(turn.beatTracker) : null,
                turn.gmTrace ? serializeJson(turn.gmTrace) : null,
            ]);
        });
        return turn;
    }
    async listChronicleTurns(chronicleId) {
        const result = await this.#pool.query(`SELECT
         id, chronicle_id, turn_sequence,
         handler_id, executed_nodes, failure, advances_timeline, world_delta_tags,
         player_message_id, player_message_content, player_message_metadata,
         resolved_intent_type, player_intent,
         gm_response_id, gm_response_content, gm_response_metadata, gm_summary,
         system_message_id, system_message_content, system_message_metadata,
         skill_check_plan, skill_check_result,
         inventory_delta, beat_tracker,
         gm_trace
       FROM chronicle_turn
       WHERE chronicle_id = $1::uuid
       ORDER BY turn_sequence ASC`, [chronicleId]);
        return result.rows.map((row) => ({
            id: row.id,
            chronicleId: row.chronicle_id,
            turnSequence: row.turn_sequence,
            handlerId: row.handler_id ?? undefined,
            executedNodes: row.executed_nodes ?? undefined,
            failure: row.failure,
            advancesTimeline: row.advances_timeline ?? undefined,
            worldDeltaTags: row.world_delta_tags ?? undefined,
            playerMessage: {
                id: row.player_message_id,
                content: row.player_message_content,
                metadata: row.player_message_metadata ?? { tags: [], timestamp: Date.now() },
                role: 'player',
            },
            resolvedIntentType: row.resolved_intent_type ?? undefined,
            playerIntent: row.player_intent ?? undefined,
            gmResponse: row.gm_response_id ? {
                id: row.gm_response_id,
                content: row.gm_response_content,
                metadata: row.gm_response_metadata ?? { tags: [], timestamp: Date.now() },
                role: 'gm',
            } : undefined,
            gmSummary: row.gm_summary ?? undefined,
            systemMessage: row.system_message_id ? {
                id: row.system_message_id,
                content: row.system_message_content,
                metadata: row.system_message_metadata ?? { tags: [], timestamp: Date.now() },
                role: 'system',
            } : undefined,
            skillCheckPlan: row.skill_check_plan ?? undefined,
            skillCheckResult: row.skill_check_result ?? undefined,
            inventoryDelta: row.inventory_delta ?? undefined,
            beatTracker: row.beat_tracker ?? undefined,
            gmTrace: row.gm_trace ?? undefined,
        }));
    }
    async #summarizeLocation(locationId) {
        if (!this.#worldStore) {
            return null;
        }
        try {
            const state = await this.#worldStore.getEntity({ id: locationId });
            if (!state || state.kind !== 'location') {
                return null;
            }
            return {
                id: state.id,
                slug: state.slug,
                name: state.name,
                kind: 'location',
                subkind: state.subkind ?? undefined,
                description: state.description ?? undefined,
                prominence: state.prominence ?? 'recognized',
                status: state.status ?? undefined,
                tags: [],
                createdAt: state.createdAt,
                updatedAt: state.updatedAt,
            };
        }
        catch {
            return null;
        }
    }
    async #ensureLocationExists(client, locationId, name) {
        if (!this.#worldStore) {
            return;
        }
        const existing = await this.#worldStore.getEntity({ id: locationId });
        if (existing && existing.kind === 'location') {
            return;
        }
        await this.#worldStore.upsertEntity({
            id: locationId,
            kind: 'location',
            name: name ?? 'Unknown Location',
        });
    }
    async #assertAnchorExists(client, anchorEntityId) {
        const lookup = await client.query('SELECT 1 FROM hard_state WHERE id = $1::uuid', [anchorEntityId]);
        if (!lookup.rowCount) {
            throw new Error(`Anchor entity ${anchorEntityId} not found`);
        }
    }
    async moveCharacterToLocation(input) {
        await withTransaction(this.#pool, async (client) => {
            // Verify character exists
            const charCheck = await client.query('SELECT 1 FROM character WHERE id = $1::uuid', [input.characterId]);
            if (!charCheck.rowCount) {
                throw new Error(`Character ${input.characterId} not found`);
            }
            // Verify location exists
            const locCheck = await client.query('SELECT 1 FROM hard_state WHERE id = $1::uuid AND kind = $2', [
                input.locationId,
                'location',
            ]);
            if (!locCheck.rowCount) {
                throw new Error(`Location ${input.locationId} not found`);
            }
            // Delete existing resides_in edges for this character
            await client.query('DELETE FROM edge WHERE src_id = $1::uuid AND type = $2', [
                input.characterId,
                'resides_in',
            ]);
            // Create new resides_in edge
            await this.#graph.upsertEdge(client, {
                src: input.characterId,
                dst: input.locationId,
                type: 'resides_in',
                props: { note: input.note ?? undefined },
            });
        });
        return {
            characterId: input.characterId,
            locationId: input.locationId,
            note: input.note ?? undefined,
            updatedAt: Date.now(),
        };
    }
}
export function createChronicleStore(options) {
    const pool = createPool({
        connectionString: options?.connectionString,
        pool: options?.pool,
    });
    const store = new PostgresChronicleStore({
        pool,
        graph: options?.graph,
        worldStore: options?.worldStore ?? null,
    });
    return store;
}
