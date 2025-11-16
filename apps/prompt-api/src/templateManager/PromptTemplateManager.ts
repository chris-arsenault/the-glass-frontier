import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type {
  Player,
  PlayerPreferences,
  PlayerTemplateSlot,
  PlayerTemplateVariant,
  PromptTemplateDescriptor,
  PromptTemplateId,
} from '@glass-frontier/dto';
import {
  PROMPT_TEMPLATE_DESCRIPTORS,
  PlayerPreferencesSchema,
  PlayerTemplateSlot as PlayerTemplateSlotSchema,
} from '@glass-frontier/dto';
import type { Login } from '@glass-frontier/worldstate/dto';
import type { WorldStateStoreV2 } from '@glass-frontier/worldstate/persistence';
import { resolveAwsEndpoint, resolveAwsRegion, shouldForcePathStyle } from '@glass-frontier/node-utils';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import {
  DEFAULT_PLAYER_PREFIX,
  OFFICIAL_VARIANT_ID,
  fromOverrideMap,
  isNonEmptyString,
  mergeVariants,
  readBodyAsString,
  toOverrideMap,
} from './templateUtils';

const TemplateOverrideRecordSchema = z
  .record(z.string(), PlayerTemplateSlotSchema)
  .default({});

type VariantSource = 'official' | 'player';

export type TemplateVariantView = {
  variantId: string;
  label: string;
  source: VariantSource;
  updatedAt: number;
  isActive: boolean;
};

export type TemplateSummary = {
  nodeId: PromptTemplateId;
  label: string;
  description: string;
  activeSource: VariantSource;
  activeVariantId: string;
  updatedAt: number;
  supportsVariants: boolean;
  hasOverride: boolean;
};

export type TemplateDetail = TemplateSummary & {
  editable: string;
  variants: TemplateVariantView[];
};

type TemplateSlice = {
  prefix: string;
  editable: string;
  suffix: string;
};

export class PromptTemplateManager {
  readonly #bucket: string;
  readonly #playerPrefix: string;
  readonly #client: S3Client;
  readonly #worldState: WorldStateStoreV2;
  readonly #descriptorMap = new Map<PromptTemplateId, PromptTemplateDescriptor>(
    Object.entries(PROMPT_TEMPLATE_DESCRIPTORS) as Array<
      [PromptTemplateId, PromptTemplateDescriptor]
    >
  );
  readonly #officialCache = new Map<PromptTemplateId, { body: string; updatedAt: number }>();
  readonly #officialSlices = new Map<PromptTemplateId, TemplateSlice>();
  readonly #playerCache = new Map<string, Map<PromptTemplateId, { variantId: string; body: string }>>();

  constructor(options: {
    bucket: string;
    worldStateStore: WorldStateStoreV2;
    playerPrefix?: string;
    region?: string;
  }) {
    const bucket = options.bucket.trim();
    if (bucket.length === 0) {
      throw new Error('PromptTemplateManager requires a template bucket.');
    }
    const playerPrefixInput = isNonEmptyString(options.playerPrefix)
      ? options.playerPrefix.trim()
      : DEFAULT_PLAYER_PREFIX;
    this.#bucket = bucket;
    this.#playerPrefix = this.#normalizePrefix(playerPrefixInput);
    this.#worldState = options.worldStateStore;
    const region = options.region ?? resolveAwsRegion();
    const endpoint = resolveAwsEndpoint('s3');
    this.#client = new S3Client({
      forcePathStyle: shouldForcePathStyle(),
      region,
      ...(endpoint ? { endpoint } : {}),
    });
  }

  async listTemplates(loginId: string): Promise<TemplateSummary[]> {
    const player = await this.#ensurePlayer(loginId);
    return Array.from(this.#descriptorMap.keys()).map((id) => this.#summarizeTemplate(id, player));
  }

  async getTemplate(loginId: string, templateId: PromptTemplateId): Promise<TemplateDetail> {
    const player = await this.#ensurePlayer(loginId);
    const summary = this.#summarizeTemplate(templateId, player);
    const editable = await this.#loadEditableBlock(summary.activeVariantId, summary.activeSource, {
      loginId,
      player,
      templateId,
    });
    const variants = await this.#materializeVariants(
      loginId,
      templateId,
      player,
      summary.activeVariantId
    );
    return {
      ...summary,
      editable,
      variants,
    };
  }

  async saveTemplate(options: {
    loginId: string;
    templateId: PromptTemplateId;
    editable: string;
    label?: string;
  }): Promise<TemplateDetail> {
    const player = await this.#ensurePlayer(options.loginId);
    const slice = await this.#getOfficialSlice(options.templateId);
    const sanitized = this.#normalizeEditable(options.editable);
    const fullBody = `${slice.prefix}${sanitized}${slice.suffix}`;
    const overrides = toOverrideMap(player.templateOverrides);
    const slot = overrides.get(options.templateId);
    const { activeVariantId, label } = this.#resolveVariantMetadata(slot, options.label);
    const objectKey = this.#playerObjectKey(options.loginId, options.templateId, activeVariantId);
    await this.#writeVariantBody(objectKey, fullBody);

    const nextVariant: PlayerTemplateVariant = {
      label,
      objectKey,
      updatedAt: Date.now(),
      variantId: activeVariantId,
    };

    overrides.set(options.templateId, {
      activeVariantId,
      nodeId: options.templateId,
      variants: mergeVariants(slot?.variants ?? [], nextVariant),
    });

    player.templateOverrides = fromOverrideMap(overrides);
    await this.#persistPlayer(player);
    this.#invalidatePlayerCache(options.loginId, options.templateId);

    return this.getTemplate(options.loginId, options.templateId);
  }

  async revertTemplate(options: {
    loginId: string;
    templateId: PromptTemplateId;
  }): Promise<TemplateDetail> {
    const player = await this.#ensurePlayer(options.loginId);
    const overrides = toOverrideMap(player.templateOverrides);
    const slot = overrides.get(options.templateId);
    if (slot !== undefined && slot.variants.length > 0) {
      await Promise.all(
        slot.variants.map((variant) =>
          this.#client.send(
            new DeleteObjectCommand({
              Bucket: this.#bucket,
              Key: variant.objectKey,
            })
          )
        )
      );
    }
    overrides.delete(options.templateId);
    player.templateOverrides = fromOverrideMap(overrides);
    await this.#persistPlayer(player);
    this.#invalidatePlayerCache(options.loginId, options.templateId);
    return this.getTemplate(options.loginId, options.templateId);
  }

  async resolveTemplate(
    loginId: string,
    templateId: PromptTemplateId
  ): Promise<{ body: string; variantId: string }> {
    const player = await this.#ensurePlayer(loginId);
    const overrides = toOverrideMap(player.templateOverrides);
    const slot = overrides.get(templateId);
    if (slot === undefined || !isNonEmptyString(slot.activeVariantId)) {
      const official = await this.#getOfficialTemplate(templateId);
      return { body: official.body, variantId: OFFICIAL_VARIANT_ID };
    }
    const variant = slot.variants?.find((entry) => entry.variantId === slot.activeVariantId);
    if (variant === undefined) {
      const fallback = await this.#getOfficialTemplate(templateId);
      return { body: fallback.body, variantId: OFFICIAL_VARIANT_ID };
    }
    const cached = this.#readPlayerCache(loginId)?.get(templateId);
    if (cached !== undefined && cached.variantId === variant.variantId) {
      return { body: cached.body, variantId: variant.variantId };
    }
    const body = await this.#readObject(variant.objectKey);
    this.#writePlayerCache(loginId, templateId, { body, variantId: variant.variantId });
    return { body, variantId: variant.variantId };
  }

  #resolveVariantMetadata(
    slot: PlayerTemplateSlot | undefined,
    labelInput?: string
  ): { activeVariantId: string; label: string } {
    return {
      activeVariantId: this.#determineActiveVariantId(slot),
      label: this.#determineVariantLabel(slot, labelInput),
    };
  }

  #determineVariantLabel(slot: PlayerTemplateSlot | undefined, labelInput?: string): string {
    const trimmedLabel = labelInput?.trim();
    if (isNonEmptyString(trimmedLabel)) {
      return trimmedLabel;
    }
    return slot?.variants?.[0]?.label ?? 'Custom Variant';
  }

  #determineActiveVariantId(slot: PlayerTemplateSlot | undefined): string {
    const candidateId = slot?.activeVariantId ?? slot?.variants?.[0]?.variantId ?? null;
    return isNonEmptyString(candidateId) ? candidateId : randomUUID();
  }

  async #readObject(objectKey: string): Promise<string> {
    const object = await this.#client.send(
      new GetObjectCommand({
        Bucket: this.#bucket,
        Key: objectKey,
      })
    );
    return readBodyAsString(object.Body);
  }

  async #writeVariantBody(objectKey: string, body: string): Promise<void> {
    await this.#client.send(
      new PutObjectCommand({
        Body: body,
        Bucket: this.#bucket,
        ContentType: 'text/plain; charset=utf-8',
        Key: objectKey,
      })
    );
  }

  async #ensurePlayer(loginId: string): Promise<Player> {
    const existing = await this.#getPlayer(loginId);
    if (existing !== null) {
      return existing;
    }
    const blank: Player = {
      loginId,
      templateOverrides: {},
    };
    await this.#persistPlayer(blank);
    return blank;
  }

  async #persistPlayer(player: Player): Promise<void> {
    const now = new Date().toISOString();
    const existingLogin = await this.#worldState.getLogin(player.loginId);
    const loginRecord: Login = existingLogin ?? {
      id: player.loginId,
      loginName: player.loginId,
      createdAt: now,
    };
    const metadata = {
      ...(loginRecord.metadata ?? {}),
      promptTemplateOverrides: player.templateOverrides ?? {},
      playerPreferences: player.preferences ?? undefined,
    };
    await this.#worldState.upsertLogin({
      ...loginRecord,
      loginName: loginRecord.loginName ?? player.loginId,
      metadata,
      updatedAt: now,
    });
  }

  async #getPlayer(loginId: string): Promise<Player | null> {
    const login = await this.#worldState.getLogin(loginId);
    if (!login) {
      return null;
    }
    const overrides = TemplateOverrideRecordSchema.parse(
      login.metadata?.promptTemplateOverrides ?? {}
    );
    const preferences = PlayerPreferencesSchema.optional().parse(
      login.metadata?.playerPreferences
    );
    return {
      loginId,
      metadata: login.metadata,
      preferences: preferences ?? undefined,
      templateOverrides: overrides,
    };
  }

  async #materializeVariants(
    loginId: string,
    templateId: PromptTemplateId,
    player: Player,
    activeVariantId: string
  ): Promise<TemplateVariantView[]> {
    const officialEntry: TemplateVariantView = {
      isActive: activeVariantId === OFFICIAL_VARIANT_ID,
      label: 'System Default',
      source: 'official',
      updatedAt: this.#officialCache.get(templateId)?.updatedAt ?? Date.now(),
      variantId: OFFICIAL_VARIANT_ID,
    };

    const overrides = toOverrideMap(player.templateOverrides)
      .get(templateId)?.variants ?? [];
    const overrideViews: TemplateVariantView[] = overrides.map((variant) => ({
      isActive: variant.variantId === activeVariantId,
      label: variant.label,
      source: 'player',
      updatedAt: variant.updatedAt,
      variantId: variant.variantId,
    }));

    if (!this.#officialCache.has(templateId)) {
      await this.#getOfficialTemplate(templateId);
    }

    return [officialEntry, ...overrideViews];
  }

  async #loadEditableBlock(
    activeVariantId: string,
    source: VariantSource,
    context: { loginId: string; templateId: PromptTemplateId; player: Player }
  ): Promise<string> {
    if (source === 'official') {
      const slice = await this.#getOfficialSlice(context.templateId);
      return slice.editable.trimEnd();
    }
    const overrides = toOverrideMap(context.player.templateOverrides);
    const slot = overrides.get(context.templateId);
    const variant = slot?.variants?.find((entry) => entry.variantId === activeVariantId);
    if (variant === undefined) {
      const slice = await this.#getOfficialSlice(context.templateId);
      return slice.editable.trimEnd();
    }
    const cached = this.#readPlayerCache(context.loginId)?.get(context.templateId);
    let body: string;
    if (cached !== undefined && cached.variantId === variant.variantId) {
      body = cached.body;
    } else {
      body = await this.#readObject(variant.objectKey);
      this.#writePlayerCache(context.loginId, context.templateId, {
        body,
        variantId: variant.variantId,
      });
    }
    const slice = this.#sliceTemplate(body, this.#descriptor(context.templateId));
    return slice.editable.trimEnd();
  }

  async #getOfficialTemplate(
    templateId: PromptTemplateId
  ): Promise<{ body: string; updatedAt: number }> {
    const cached = this.#officialCache.get(templateId);
    if (cached !== undefined) {
      return cached;
    }
    const descriptor = this.#descriptor(templateId);
    const body = await this.#readObject(descriptor.officialObjectKey);
    const entry = { body, updatedAt: Date.now() };
    this.#officialCache.set(templateId, entry);
    return entry;
  }

  async #getOfficialSlice(templateId: PromptTemplateId): Promise<TemplateSlice> {
    const cached = this.#officialSlices.get(templateId);
    if (cached !== undefined) {
      return cached;
    }
    const descriptor = this.#descriptor(templateId);
    const { body } = await this.#getOfficialTemplate(templateId);
    const slice = this.#sliceTemplate(body, descriptor);
    this.#officialSlices.set(templateId, slice);
    return slice;
  }

  #sliceTemplate(body: string, descriptor: PromptTemplateDescriptor): TemplateSlice {
    const prefix = descriptor.editablePrefix ?? '';
    const suffix = descriptor.editableSuffix ?? '';
    const editable = body.slice(prefix.length, body.length - suffix.length);
    return { prefix, editable, suffix };
  }

  #summarizeTemplate(templateId: PromptTemplateId, player: Player): TemplateSummary {
    const descriptor = this.#descriptor(templateId);
    const overrides = toOverrideMap(player.templateOverrides);
    const slot = overrides.get(templateId);
    if (slot === undefined || slot.variants.length === 0) {
      const official = this.#officialCache.get(templateId);
      return {
        nodeId: templateId,
        label: descriptor.label,
        description: descriptor.description,
        activeSource: 'official',
        activeVariantId: OFFICIAL_VARIANT_ID,
        updatedAt: official?.updatedAt ?? Date.now(),
        supportsVariants: descriptor.supportsVariants ?? false,
        hasOverride: false,
      };
    }
    const activeVariant =
      slot.variants.find((variant) => variant.variantId === slot.activeVariantId) ?? slot.variants[0];
    return {
      nodeId: templateId,
      label: descriptor.label,
      description: descriptor.description,
      activeSource: 'player',
      activeVariantId: activeVariant.variantId,
      updatedAt: activeVariant.updatedAt,
      supportsVariants: descriptor.supportsVariants ?? false,
      hasOverride: true,
    };
  }

  #descriptor(templateId: PromptTemplateId): PromptTemplateDescriptor {
    const descriptor = this.#descriptorMap.get(templateId);
    if (descriptor === undefined) {
      throw new Error(`Unknown prompt template ${templateId}`);
    }
    return descriptor;
  }

  #normalizeEditable(value: string): string {
    return value.trimEnd();
  }

  #playerObjectKey(loginId: string, templateId: string, variantId: string): string {
    const sanitizedLogin = loginId.replace(/[^a-zA-Z0-9-_]/g, '_');
    return `${this.#playerPrefix}/${sanitizedLogin}/${templateId}/${variantId}.hbs`;
  }

  #normalizePrefix(prefix: string): string {
    return prefix.replace(/\/+$/, '');
  }

  #readPlayerCache(
    loginId: string
  ): Map<PromptTemplateId, { variantId: string; body: string }> | undefined {
    return this.#playerCache.get(loginId);
  }

  #writePlayerCache(
    loginId: string,
    templateId: PromptTemplateId,
    payload: { variantId: string; body: string }
  ): void {
    const cache = this.#playerCache.get(loginId) ?? new Map();
    cache.set(templateId, payload);
    this.#playerCache.set(loginId, cache);
  }

  #invalidatePlayerCache(loginId: string, templateId: PromptTemplateId): void {
    const cache = this.#playerCache.get(loginId);
    if (cache) {
      cache.delete(templateId);
    }
  }
}
