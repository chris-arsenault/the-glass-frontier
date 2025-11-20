import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { PromptTemplateDescriptor, PromptTemplateId } from '@glass-frontier/dto';
import {
  PROMPT_TEMPLATE_DESCRIPTORS,
  type Player,
  type PlayerTemplateSlot,
  type PlayerTemplateVariant,
} from '@glass-frontier/dto';
import { resolveAwsEndpoint, resolveAwsRegion, shouldForcePathStyle } from '@glass-frontier/node-utils';
import type { WorldStateStore } from '@glass-frontier/worldstate';
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

  constructor(options: {
    worldStateStore: WorldStateStore;
    playerPrefix?: string;
    region?: string;
  }) {
    const bucket = process.env.PROMPT_TEMPLATE_BUCKET?.trim() ?? '';
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

  async listTemplates(playerId: string): Promise<TemplateSummary[]> {
    const player = await this.#ensurePlayer(playerId);
    return Array.from(this.#descriptorMap.keys()).map((id) => this.#summarizeTemplate(id, player));
  }

  async getTemplate(playerId: string, templateId: PromptTemplateId): Promise<TemplateDetail> {
    const player = await this.#ensurePlayer(playerId);
    const summary = this.#summarizeTemplate(templateId, player);
    const editable = await this.#loadTemplateBody(summary.activeSource, {
      activeVariantId: summary.activeVariantId,
      playerId,
      player,
      templateId,
    });
    return {
      ...summary,
      editable,
    };
  }

  async saveTemplate(options: {
    editable: string;
    label?: string;
    playerId: string;
    templateId: PromptTemplateId;
  }): Promise<TemplateDetail> {
    const player = await this.#ensurePlayer(options.playerId);
    const overrides = toOverrideMap(player.templateOverrides);
    const slot = overrides.get(options.templateId);
    const { activeVariantId, label } = this.#resolveVariantMetadata(slot, options.label);
    const objectKey = this.#playerObjectKey(options.playerId, options.templateId, activeVariantId);
    const sanitized = this.#normalizeTemplateBody(options.editable);
    await this.#writeVariantBody(objectKey, sanitized);

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
    return this.getTemplate(options.playerId, options.templateId);
  }

  async revertTemplate(options: { playerId: string; templateId: PromptTemplateId }): Promise<TemplateDetail> {
    const player = await this.#ensurePlayer(options.playerId);
    const overrides = toOverrideMap(player.templateOverrides);
    const slot = overrides.get(options.templateId);
    if (slot !== undefined) {
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
    return this.getTemplate(options.playerId, options.templateId);
  }

  async resolveTemplate(
    playerId: string,
    templateId: PromptTemplateId
  ): Promise<{ body: string; variantId: string }> {
    const player = await this.#ensurePlayer(playerId);
    const overrides = toOverrideMap(player.templateOverrides);
    const slot = overrides.get(templateId);
    if (slot === undefined) {
      const official = await this.#getOfficialTemplate(templateId);
      return { body: official.body, variantId: OFFICIAL_VARIANT_ID };
    }
    const variant = this.#selectPlayerVariant(slot);
    if (variant === null) {
      const fallback = await this.#getOfficialTemplate(templateId);
      return { body: fallback.body, variantId: OFFICIAL_VARIANT_ID };
    }
    const body = await this.#loadVariantBody(variant);
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

  async #ensurePlayer(playerId: string): Promise<Player> {
    const existing = await this.#worldState.getPlayer(playerId);
    if (existing !== null && existing !== undefined) {
      if (existing.templateOverrides === undefined) {
        existing.templateOverrides = {};
      }
      return existing;
    }
    const blank: Player = {
      email: undefined,
      id: playerId,
      templateOverrides: {},
      username: playerId,
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
      return this.#officialVariantInfo();
    }
    const selectedVariant = this.#selectPlayerVariant(slot);
    if (selectedVariant === null) {
      return this.#officialVariantInfo();
    }
    return {
      activeVariantId: selectedVariant.variantId,
      source: 'player',
      updatedAt: selectedVariant.updatedAt,
    };
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

  async #loadTemplateBody(
    source: VariantSource,
    context: {
      activeVariantId: string;
      playerId: string;
      player: Player;
      templateId: PromptTemplateId;
    }
  ): Promise<string> {
    if (source === 'official') {
      const official = await this.#getOfficialTemplate(context.templateId);
      return official.body;
    }
    const overrides = toOverrideMap(context.player.templateOverrides);
    const slot = overrides.get(context.templateId);
    const variant =
      slot?.variants.find((entry) => entry.variantId === context.activeVariantId) ??
      slot?.variants[0];
    if (variant === undefined) {
      const official = await this.#getOfficialTemplate(context.templateId);
      return official.body;
    }
    return this.#loadVariantBody(variant);
  }

  async #loadVariantBody(variant: PlayerTemplateVariant): Promise<string> {
    return this.#readObject(variant.objectKey);
  }

  async #getOfficialTemplate(
    templateId: PromptTemplateId
  ): Promise<{ body: string; updatedAt: number }> {
    const descriptor = this.#descriptor(templateId);
    const body = await this.#readObject(descriptor.officialObjectKey);
    return { body, updatedAt: Date.now() };
  }

  #officialVariantInfo(): {
    activeVariantId: string;
    source: VariantSource;
    updatedAt: number;
  } {
    return {
      activeVariantId: OFFICIAL_VARIANT_ID,
      source: 'official',
      updatedAt: Date.now(),
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

  #playerObjectKey(playerId: string, templateId: PromptTemplateId, variantId: string): string {
    return `${this.#playerPrefix}${playerId}/templates/${templateId}/${variantId}.hbs`;
  }

  #normalizePrefix(prefix: string): string {
    const trimmed = prefix.trim().replace(/\/+$/, '');
    const normalized = trimmed.length > 0 ? trimmed : DEFAULT_PLAYER_PREFIX;
    return `${normalized}/`;
  }

  #normalizeTemplateBody(editable: string): string {
    const normalized = editable.replace(/\r\n/g, '\n');
    return normalized.endsWith('\n') ? normalized : `${normalized}\n`;
  }
}
