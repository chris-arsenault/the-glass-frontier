import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type {
  PromptTemplateDescriptor,
  PromptTemplateId } from '@glass-frontier/dto';
import {
  PROMPT_TEMPLATE_DESCRIPTORS,
  type Player,
  type PlayerTemplateSlot,
  type PlayerTemplateVariant,
} from '@glass-frontier/dto';
import type { WorldStateStore } from '@glass-frontier/persistence';
import { resolveAwsEndpoint, resolveAwsRegion, shouldForcePathStyle } from '@glass-frontier/utils';
import { randomUUID } from 'node:crypto';

import {
  DEFAULT_PLAYER_PREFIX,
  OFFICIAL_VARIANT_ID,
  fromOverrideMap,
  isNonEmptyString,
  mergeVariants,
  readBodyAsString,
  toOverrideMap,
} from './templateUtils';

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
  readonly #worldState: WorldStateStore;
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
    worldStateStore: WorldStateStore;
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
    await this.#worldState.upsertPlayer(player);
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
    await this.#worldState.upsertPlayer(player);
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
    const cached = this.#playerCache.get(loginId)?.get(templateId);
    if (cached !== undefined && cached.variantId === variant.variantId) {
      return { body: cached.body, variantId: variant.variantId };
    }
    const body = await this.#readObject(variant.objectKey);
    this.#cachePlayerBody(loginId, templateId, variant.variantId, body);
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

  async #writeVariantBody(objectKey: string, body: string): Promise<void> {
    await this.#client.send(
      new PutObjectCommand({
        Body: body,
        Bucket: this.#bucket,
        ContentType: 'text/x-handlebars-template; charset=utf-8',
        Key: objectKey,
      })
    );
  }

  #cachePlayerBody(
    loginId: string,
    templateId: PromptTemplateId,
    variantId: string,
    body: string
  ): void {
    let cache = this.#playerCache.get(loginId);
    if (cache === undefined) {
      cache = new Map();
      this.#playerCache.set(loginId, cache);
    }
    cache.set(templateId, { body, variantId });
  }

  #invalidatePlayerCache(loginId: string, templateId: PromptTemplateId): void {
    const cache = this.#playerCache.get(loginId);
    if (cache !== undefined) {
      cache.delete(templateId);
      if (cache.size === 0) {
        this.#playerCache.delete(loginId);
      }
    }
  }

  async #ensurePlayer(loginId: string): Promise<Player> {
    const existing = await this.#worldState.getPlayer(loginId);
    if (existing !== null && existing !== undefined) {
      if (existing.templateOverrides === undefined) {
        existing.templateOverrides = {};
      }
      return existing;
    }
    const blank: Player = {
      loginId,
      templateOverrides: {},
    };
    await this.#worldState.upsertPlayer(blank);
    return blank;
  }

  #summarizeTemplate(templateId: PromptTemplateId, player: Player): TemplateSummary {
    const descriptor = this.#descriptor(templateId);
    const overrides = toOverrideMap(player.templateOverrides);
    const slot = overrides.get(templateId);
    const hasOverride = slot !== undefined && slot.variants.length > 0;
    const variantInfo = this.#resolveActiveVariant(slot, templateId);
    return {
      activeSource: variantInfo.source,
      activeVariantId: variantInfo.activeVariantId,
      description: descriptor.description,
      hasOverride,
      label: descriptor.label,
      nodeId: templateId,
      supportsVariants: descriptor.supportsVariants,
      updatedAt: variantInfo.updatedAt,
    };
  }

  #resolveActiveVariant(
    slot: PlayerTemplateSlot | undefined,
    templateId: PromptTemplateId
  ): { activeVariantId: string; source: VariantSource; updatedAt: number } {
    if (slot === undefined) {
      return this.#officialVariantInfo(templateId);
    }
    const selectedVariant = this.#selectPlayerVariant(slot);
    if (selectedVariant === null) {
      return this.#officialVariantInfo(templateId);
    }
    return {
      activeVariantId: selectedVariant.variantId,
      source: 'player',
      updatedAt: selectedVariant.updatedAt,
    };
  }

  async #materializeVariants(
    _loginId: string,
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
    const cached = this.#playerCache.get(context.loginId)?.get(context.templateId);
    let body: string;
    if (cached !== undefined && cached.variantId === variant.variantId) {
      body = cached.body;
    } else {
      body = await this.#readObject(variant.objectKey);
      this.#cachePlayerBody(context.loginId, context.templateId, variant.variantId, body);
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
    const official = await this.#getOfficialTemplate(templateId);
    const slice = this.#sliceTemplate(official.body, this.#descriptor(templateId));
    this.#officialSlices.set(templateId, slice);
    return slice;
  }

  #selectPlayerVariant(slot: PlayerTemplateSlot): PlayerTemplateVariant | null {
    if (slot.variants.length === 0) {
      return null;
    }
    if (isNonEmptyString(slot.activeVariantId)) {
      const match = slot.variants.find((variant) => variant.variantId === slot.activeVariantId);
      if (match !== undefined) {
        return match;
      }
    }
    return slot.variants[0] ?? null;
  }

  #officialVariantInfo(templateId: PromptTemplateId): {
    activeVariantId: string;
    source: VariantSource;
    updatedAt: number;
  } {
    return {
      activeVariantId: OFFICIAL_VARIANT_ID,
      source: 'official',
      updatedAt: this.#officialCache.get(templateId)?.updatedAt ?? Date.now(),
    };
  }

  #sliceTemplate(body: string, descriptor: PromptTemplateDescriptor): TemplateSlice {
    const startIndex = body.indexOf(descriptor.editableStartToken);
    if (startIndex === -1) {
      throw new Error(`Unable to locate editable start token for template ${descriptor.id}`);
    }
    const afterToken = startIndex + descriptor.editableStartToken.length;
    const newlineAfterToken = body.indexOf('\n', afterToken);
    const editableStart = newlineAfterToken === -1 ? afterToken : newlineAfterToken + 1;

    const endIndex = body.indexOf(descriptor.editableEndToken, editableStart);
    if (endIndex === -1) {
      throw new Error(`Unable to locate editable end token for template ${descriptor.id}`);
    }

    let suffixStart = endIndex;
    while (suffixStart > editableStart) {
      const char = body.charAt(suffixStart - 1);
      if (char === '\n' || char === '\r') {
        suffixStart -= 1;
      } else if (char === ' ' || char === '\t') {
        suffixStart -= 1;
      } else {
        break;
      }
    }

    return {
      editable: body.slice(editableStart, suffixStart),
      prefix: body.slice(0, editableStart),
      suffix: body.slice(suffixStart),
    };
  }

  async #readObject(key: string): Promise<string> {
    const output = await this.#client.send(
      new GetObjectCommand({
        Bucket: this.#bucket,
        Key: key,
      })
    );
    return readBodyAsString(output.Body);
  }

  #descriptor(templateId: PromptTemplateId): PromptTemplateDescriptor {
    const descriptor = this.#descriptorMap.get(templateId);
    if (descriptor === undefined) {
      throw new Error(`Unknown prompt template: ${templateId}`);
    }
    return descriptor;
  }

  #playerObjectKey(loginId: string, templateId: PromptTemplateId, variantId: string): string {
    return `${this.#playerPrefix}${loginId}/templates/${templateId}/${variantId}.hbs`;
  }

  #normalizePrefix(prefix: string): string {
    const trimmed = prefix.trim().replace(/\/+$/, '');
    const normalized = trimmed.length > 0 ? trimmed : DEFAULT_PLAYER_PREFIX;
    return `${normalized}/`;
  }

  #normalizeEditable(editable: string): string {
    const trimmed = editable.replace(/\s+$/u, '');
    if (trimmed.length === 0) {
      return '';
    }
    return `${trimmed}\n\n`;
  }
}
