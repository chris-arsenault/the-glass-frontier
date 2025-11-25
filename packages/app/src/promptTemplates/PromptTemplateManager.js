import { PROMPT_TEMPLATE_DESCRIPTORS } from '@glass-frontier/dto';
import { randomUUID } from 'node:crypto';
export const OFFICIAL_VARIANT_ID = 'official';
export class PromptTemplateManager {
    #pool;
    #playerStore;
    #descriptorMap = new Map(Object.entries(PROMPT_TEMPLATE_DESCRIPTORS));
    constructor(options) {
        this.#pool = options.pool;
        this.#playerStore = options.playerStore;
    }
    async listTemplates(playerId) {
        const player = await this.#ensurePlayer(playerId);
        const official = await this.#loadOfficialMetadata();
        const overrides = await this.#loadOverrides(player.id);
        return Array.from(this.#descriptorMap.keys()).map((id) => this.#summarizeTemplate(id, overrides, official));
    }
    async getTemplate(playerId, templateId) {
        const player = await this.#ensurePlayer(playerId);
        const official = await this.#loadOfficialMetadata();
        const overrides = await this.#loadOverrides(player.id, templateId);
        const summary = this.#summarizeTemplate(templateId, overrides, official);
        const editable = await this.#loadTemplateBody(summary, player.id, templateId);
        return { ...summary, editable };
    }
    async saveTemplate(options) {
        const player = await this.#ensurePlayer(options.playerId);
        this.#descriptor(options.templateId);
        const overrides = await this.#loadOverrides(player.id, options.templateId);
        const activeVariant = this.#selectActiveVariant(overrides.get(options.templateId) ?? []);
        const activeVariantId = this.#determineActiveVariantId(activeVariant);
        const label = this.#determineVariantLabel(activeVariant, options.label);
        const normalized = this.#normalizeTemplateBody(options.editable);
        await this.#pool.query(`INSERT INTO app.prompt_template_override (template_id, player_id, variant_id, label, body, is_active, updated_at)
       VALUES ($1, $2, $3, $4, $5, true, now())
       ON CONFLICT (template_id, player_id, variant_id) DO UPDATE
       SET label = EXCLUDED.label,
           body = EXCLUDED.body,
           is_active = true,
           updated_at = now()`, [options.templateId, player.id, activeVariantId, label, normalized]);
        await this.#pool.query(`UPDATE app.prompt_template_override
       SET is_active = false
       WHERE player_id = $1 AND template_id = $2 AND variant_id <> $3 AND is_active = true`, [player.id, options.templateId, activeVariantId]);
        return this.getTemplate(player.id, options.templateId);
    }
    async revertTemplate(options) {
        const player = await this.#ensurePlayer(options.playerId);
        this.#descriptor(options.templateId);
        await this.#pool.query('DELETE FROM app.prompt_template_override WHERE player_id = $1 AND template_id = $2', [player.id, options.templateId]);
        return this.getTemplate(player.id, options.templateId);
    }
    async resolveTemplate(playerId, templateId) {
        const player = await this.#ensurePlayer(playerId);
        const overrides = await this.#loadOverrideDetails(player.id, templateId);
        const activeVariant = this.#selectActiveVariant(overrides.get(templateId) ?? []);
        if (activeVariant && typeof activeVariant.body === 'string') {
            return { body: activeVariant.body, variantId: activeVariant.variantId };
        }
        const official = await this.#getOfficialTemplate(templateId);
        return { body: official.body, variantId: OFFICIAL_VARIANT_ID };
    }
    async #loadTemplateBody(summary, playerId, templateId) {
        if (summary.activeSource === 'official') {
            const official = await this.#getOfficialTemplate(templateId);
            return official.body;
        }
        const overrides = await this.#loadOverrideDetails(playerId, templateId);
        const variants = overrides.get(templateId) ?? [];
        const active = variants.find((variant) => variant.variantId === summary.activeVariantId) ??
            this.#selectActiveVariant(variants);
        if (active?.body !== undefined) {
            return active.body;
        }
        const fallback = await this.#getOfficialTemplate(templateId);
        return fallback.body;
    }
    async #loadOverrides(playerId, templateId) {
        const params = [playerId];
        const predicate = templateId ? 'AND template_id = $2' : '';
        if (templateId) {
            params.push(templateId);
        }
        const result = await this.#pool.query(`SELECT template_id, variant_id, label, updated_at, is_active
       FROM app.prompt_template_override
       WHERE player_id = $1 ${predicate}
       ORDER BY updated_at DESC`, params);
        return this.#mapOverrides(result.rows, false);
    }
    async #loadOverrideDetails(playerId, templateId) {
        const result = await this.#pool.query(`SELECT template_id, variant_id, label, body, updated_at, is_active
       FROM app.prompt_template_override
       WHERE player_id = $1 AND template_id = $2
       ORDER BY updated_at DESC`, [playerId, templateId]);
        return this.#mapOverrides(result.rows, true);
    }
    #mapOverrides(rows, includeBody) {
        const map = new Map();
        for (const row of rows) {
            const templateId = row.template_id;
            const variants = map.get(templateId) ?? [];
            variants.push({
                body: includeBody ? row.body : undefined,
                isActive: Boolean(row.is_active),
                label: String(row.label),
                templateId,
                updatedAt: this.#coerceTimestamp(row.updated_at),
                variantId: String(row.variant_id),
            });
            map.set(templateId, variants);
        }
        return map;
    }
    async #loadOfficialMetadata() {
        const result = await this.#pool.query('SELECT id, updated_at FROM app.prompt_template');
        const map = new Map();
        for (const row of result.rows) {
            const id = row.id;
            map.set(id, { updatedAt: this.#coerceTimestamp(row.updated_at) });
        }
        return map;
    }
    async #getOfficialTemplate(templateId) {
        this.#descriptor(templateId);
        const result = await this.#pool.query('SELECT body, updated_at FROM app.prompt_template WHERE id = $1', [templateId]);
        const row = result.rows[0];
        if (!row) {
            throw new Error(`Official prompt template missing: ${templateId}`);
        }
        return {
            body: String(row.body),
            updatedAt: this.#coerceTimestamp(row.updated_at),
        };
    }
    #summarizeTemplate(templateId, overrides, officialMeta) {
        const descriptor = this.#descriptor(templateId);
        const variants = overrides.get(templateId) ?? [];
        const active = this.#selectActiveVariant(variants);
        if (active !== null) {
            return {
                activeSource: 'player',
                activeVariantId: active.variantId,
                description: descriptor.description,
                hasOverride: variants.length > 0,
                label: descriptor.label,
                nodeId: descriptor.id,
                supportsVariants: descriptor.supportsVariants,
                updatedAt: active.updatedAt,
            };
        }
        const meta = officialMeta.get(templateId);
        if (meta === undefined) {
            throw new Error(`Official prompt template metadata missing: ${templateId}`);
        }
        return {
            activeSource: 'official',
            activeVariantId: OFFICIAL_VARIANT_ID,
            description: descriptor.description,
            hasOverride: false,
            label: descriptor.label,
            nodeId: descriptor.id,
            supportsVariants: descriptor.supportsVariants,
            updatedAt: meta.updatedAt,
        };
    }
    #selectActiveVariant(variants) {
        if (variants.length === 0) {
            return null;
        }
        const explicit = variants.find((variant) => variant.isActive);
        return explicit ?? variants[0];
    }
    #determineVariantLabel(active, labelInput) {
        const trimmed = labelInput?.trim();
        if (typeof trimmed === 'string' && trimmed.length > 0) {
            return trimmed;
        }
        if (active !== null) {
            return active.label;
        }
        return 'Custom Variant';
    }
    #determineActiveVariantId(active) {
        if (active !== null && this.#isNonEmptyString(active.variantId)) {
            return active.variantId;
        }
        return randomUUID();
    }
    #descriptor(templateId) {
        const descriptor = this.#descriptorMap.get(templateId);
        if (descriptor === undefined) {
            throw new Error(`Unknown prompt template: ${templateId}`);
        }
        return descriptor;
    }
    async #ensurePlayer(playerId) {
        return this.#playerStore.ensure(playerId);
    }
    #coerceTimestamp(value) {
        if (value instanceof Date) {
            return value.getTime();
        }
        const numeric = typeof value === 'number' ? value : Date.parse(String(value));
        return Number.isFinite(numeric) ? numeric : Date.now();
    }
    #normalizeTemplateBody(editable) {
        const normalized = editable.replace(/\r\n/g, '\n');
        return normalized.endsWith('\n') ? normalized : `${normalized}\n`;
    }
    #isNonEmptyString(value) {
        return typeof value === 'string' && value.trim().length > 0;
    }
}
