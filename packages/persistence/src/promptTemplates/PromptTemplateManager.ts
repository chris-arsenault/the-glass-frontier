import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import type { WorldStateStore } from "@glass-frontier/persistence";
import {
  PROMPT_TEMPLATE_DESCRIPTORS,
  PromptTemplateDescriptor,
  PromptTemplateId,
  type Player,
  type PlayerTemplateSlot,
  type PlayerTemplateVariant
} from "@glass-frontier/dto";

type VariantSource = "official" | "player";

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

const OFFICIAL_VARIANT_ID = "official";

export class PromptTemplateManager {
  #bucket: string;
  #playerPrefix: string;
  #client: S3Client;
  #worldState: WorldStateStore;
  #officialCache = new Map<PromptTemplateId, { body: string; updatedAt: number }>();
  #officialSlices = new Map<PromptTemplateId, TemplateSlice>();
  #playerCache = new Map<string, Map<PromptTemplateId, { variantId: string; body: string }>>();

  constructor(options: {
    bucket: string;
    worldStateStore: WorldStateStore;
    playerPrefix?: string;
    region?: string;
  }) {
    if (!options.bucket) {
      throw new Error("PromptTemplateManager requires a template bucket.");
    }
    this.#bucket = options.bucket;
    this.#playerPrefix = this.#normalizePrefix(options.playerPrefix ?? "players");
    this.#worldState = options.worldStateStore;
    this.#client = new S3Client({
      region: options.region ?? process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1"
    });
  }

  async listTemplates(loginId: string): Promise<TemplateSummary[]> {
    const player = await this.#ensurePlayer(loginId);
    return (Object.keys(PROMPT_TEMPLATE_DESCRIPTORS) as PromptTemplateId[]).map((id) =>
      this.#summarizeTemplate(id, player)
    );
  }

  async getTemplate(loginId: string, templateId: PromptTemplateId): Promise<TemplateDetail> {
    const player = await this.#ensurePlayer(loginId);
    const summary = this.#summarizeTemplate(templateId, player);
    const editable = await this.#loadEditableBlock(summary.activeVariantId, summary.activeSource, {
      loginId,
      templateId,
      player
    });
    const variants = await this.#materializeVariants(loginId, templateId, player, summary.activeVariantId);
    return {
      ...summary,
      editable,
      variants
    };
  }

  async saveTemplate(options: {
    loginId: string;
    templateId: PromptTemplateId;
    editable: string;
    label?: string;
  }): Promise<TemplateDetail> {
    const descriptor = this.#descriptor(options.templateId);
    const player = await this.#ensurePlayer(options.loginId);
    const slice = await this.#getOfficialSlice(options.templateId);
    const sanitized = this.#normalizeEditable(options.editable);
    const fullBody = `${slice.prefix}${sanitized}${slice.suffix}`;

    const slot = player.templateOverrides?.[options.templateId];
    const activeVariantId = slot?.activeVariantId ?? slot?.variants?.[0]?.variantId ?? randomUUID();
    const variantLabel = options.label?.trim() && options.label.trim().length > 0 ? options.label.trim() : slot?.variants?.[0]?.label ?? "Custom Variant";
    const objectKey = this.#playerObjectKey(options.loginId, options.templateId, activeVariantId);

    await this.#client.send(
      new PutObjectCommand({
        Bucket: this.#bucket,
        Key: objectKey,
        Body: fullBody,
        ContentType: "text/x-handlebars-template; charset=utf-8"
      })
    );

    const nextVariant: PlayerTemplateVariant = {
      variantId: activeVariantId,
      label: variantLabel,
      objectKey,
      updatedAt: Date.now()
    };

    const nextOverrides = {
      ...(player.templateOverrides ?? {})
    };

    const existingVariants = slot?.variants ?? [];
    nextOverrides[options.templateId] = {
      nodeId: options.templateId,
      activeVariantId,
      variants: [
        nextVariant,
        ...existingVariants.filter((variant) => variant.variantId !== activeVariantId)
      ]
    } satisfies PlayerTemplateSlot;

    player.templateOverrides = nextOverrides;
    await this.#worldState.upsertPlayer(player);
    this.#invalidatePlayerCache(options.loginId, options.templateId);

    return this.getTemplate(options.loginId, options.templateId);
  }

  async revertTemplate(options: { loginId: string; templateId: PromptTemplateId }): Promise<TemplateDetail> {
    const player = await this.#ensurePlayer(options.loginId);
    const slot = player.templateOverrides?.[options.templateId];
    if (slot?.variants?.length) {
      await Promise.all(
        slot.variants.map((variant) =>
          this.#client.send(
            new DeleteObjectCommand({
              Bucket: this.#bucket,
              Key: variant.objectKey
            })
          )
        )
      );
    }
    if (player.templateOverrides) {
      delete player.templateOverrides[options.templateId];
    }
    await this.#worldState.upsertPlayer(player);
    this.#invalidatePlayerCache(options.loginId, options.templateId);
    return this.getTemplate(options.loginId, options.templateId);
  }

  async resolveTemplate(loginId: string, templateId: PromptTemplateId): Promise<{ body: string; variantId: string }> {
    const player = await this.#ensurePlayer(loginId);
    const slot = player.templateOverrides?.[templateId];
    if (!slot || !slot.activeVariantId) {
      const official = await this.#getOfficialTemplate(templateId);
      return { body: official.body, variantId: OFFICIAL_VARIANT_ID };
    }
    const variant = slot.variants?.find((entry) => entry.variantId === slot.activeVariantId);
    if (!variant) {
      const fallback = await this.#getOfficialTemplate(templateId);
      return { body: fallback.body, variantId: OFFICIAL_VARIANT_ID };
    }
    const cached = this.#playerCache.get(loginId)?.get(templateId);
    if (cached && cached.variantId === variant.variantId) {
      return { body: cached.body, variantId: variant.variantId };
    }
    const body = await this.#readObject(variant.objectKey);
    this.#cachePlayerBody(loginId, templateId, variant.variantId, body);
    return { body, variantId: variant.variantId };
  }

  #cachePlayerBody(loginId: string, templateId: PromptTemplateId, variantId: string, body: string) {
    if (!this.#playerCache.has(loginId)) {
      this.#playerCache.set(loginId, new Map());
    }
    this.#playerCache.get(loginId)!.set(templateId, { variantId, body });
  }

  #invalidatePlayerCache(loginId: string, templateId: PromptTemplateId) {
    const cache = this.#playerCache.get(loginId);
    if (cache) {
      cache.delete(templateId);
    }
  }

  async #ensurePlayer(loginId: string): Promise<Player> {
    const existing = await this.#worldState.getPlayer(loginId);
    if (existing) {
      if (!existing.templateOverrides) {
        existing.templateOverrides = {};
      }
      return existing;
    }
    const blank: Player = {
      loginId,
      templateOverrides: {}
    };
    await this.#worldState.upsertPlayer(blank);
    return blank;
  }

  #summarizeTemplate(templateId: PromptTemplateId, player: Player): TemplateSummary {
    const descriptor = this.#descriptor(templateId);
    const slot = player.templateOverrides?.[templateId];
    const hasOverride = Boolean(slot?.variants?.length);
    const activeVariantId = slot?.activeVariantId ?? OFFICIAL_VARIANT_ID;
    const activeSource: VariantSource = slot?.activeVariantId ? "player" : "official";
    const updatedAt = slot?.activeVariantId
      ? slot?.variants?.find((variant) => variant.variantId === slot.activeVariantId)?.updatedAt ?? Date.now()
      : this.#officialCache.get(templateId)?.updatedAt ?? Date.now();

    return {
      nodeId: templateId,
      label: descriptor.label,
      description: descriptor.description,
      activeSource,
      activeVariantId,
      updatedAt,
      supportsVariants: descriptor.supportsVariants,
      hasOverride
    };
  }

  async #materializeVariants(
    loginId: string,
    templateId: PromptTemplateId,
    player: Player,
    activeVariantId: string
  ): Promise<TemplateVariantView[]> {
    const descriptor = this.#descriptor(templateId);
    const officialEntry: TemplateVariantView = {
      variantId: OFFICIAL_VARIANT_ID,
      label: "System Default",
      source: "official",
      updatedAt: this.#officialCache.get(templateId)?.updatedAt ?? Date.now(),
      isActive: activeVariantId === OFFICIAL_VARIANT_ID
    };

    const overrides = player.templateOverrides?.[templateId]?.variants ?? [];
    const overrideViews: TemplateVariantView[] = overrides.map((variant) => ({
      variantId: variant.variantId,
      label: variant.label,
      source: "player",
      updatedAt: variant.updatedAt,
      isActive: variant.variantId === activeVariantId
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
    if (source === "official") {
      const slice = await this.#getOfficialSlice(context.templateId);
      return slice.editable.trimEnd();
    }
    const slot = context.player.templateOverrides?.[context.templateId];
    const variant = slot?.variants?.find((entry) => entry.variantId === activeVariantId);
    if (!variant) {
      const slice = await this.#getOfficialSlice(context.templateId);
      return slice.editable.trimEnd();
    }
    const cached = this.#playerCache.get(context.loginId)?.get(context.templateId);
    let body: string;
    if (cached && cached.variantId === variant.variantId) {
      body = cached.body;
    } else {
      body = await this.#readObject(variant.objectKey);
      this.#cachePlayerBody(context.loginId, context.templateId, variant.variantId, body);
    }
    const slice = this.#sliceTemplate(body, this.#descriptor(context.templateId));
    return slice.editable.trimEnd();
  }

  async #getOfficialTemplate(templateId: PromptTemplateId): Promise<{ body: string; updatedAt: number }> {
    const cached = this.#officialCache.get(templateId);
    if (cached) {
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
    if (cached) {
      return cached;
    }
    const official = await this.#getOfficialTemplate(templateId);
    const slice = this.#sliceTemplate(official.body, this.#descriptor(templateId));
    this.#officialSlices.set(templateId, slice);
    return slice;
  }

  #sliceTemplate(body: string, descriptor: PromptTemplateDescriptor): TemplateSlice {
    const startIndex = body.indexOf(descriptor.editableStartToken);
    if (startIndex === -1) {
      throw new Error(`Unable to locate editable start token for template ${descriptor.id}`);
    }
    const afterToken = startIndex + descriptor.editableStartToken.length;
    const newlineAfterToken = body.indexOf("\n", afterToken);
    const editableStart = newlineAfterToken === -1 ? afterToken : newlineAfterToken + 1;

    const endIndex = body.indexOf(descriptor.editableEndToken, editableStart);
    if (endIndex === -1) {
      throw new Error(`Unable to locate editable end token for template ${descriptor.id}`);
    }

    let suffixStart = endIndex;
    while (suffixStart > editableStart) {
      const char = body.charAt(suffixStart - 1);
      if (char === "\n" || char === "\r") {
        suffixStart -= 1;
      } else if (char === " " || char === "\t") {
        suffixStart -= 1;
      } else {
        break;
      }
    }

    return {
      prefix: body.slice(0, editableStart),
      editable: body.slice(editableStart, suffixStart),
      suffix: body.slice(suffixStart)
    };
  }

  async #readObject(key: string): Promise<string> {
    const output = await this.#client.send(
      new GetObjectCommand({
        Bucket: this.#bucket,
        Key: key
      })
    );
    return this.#readBody(output.Body);
  }

  async #readBody(body: unknown): Promise<string> {
    if (!body) {
      throw new Error("Template body stream missing");
    }
    if (typeof body === "string") {
      return body;
    }
    if (Buffer.isBuffer(body)) {
      return body.toString("utf-8");
    }
    if (typeof (body as any).transformToString === "function") {
      return (body as any).transformToString("utf-8");
    }
    if (typeof (body as any).arrayBuffer === "function") {
      const buffer = await (body as any).arrayBuffer();
      return Buffer.from(buffer).toString("utf-8");
    }
    if (body instanceof Readable) {
      return await new Promise<string>((resolve, reject) => {
        const chunks: Buffer[] = [];
        body.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
        body.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
        body.on("error", reject);
      });
    }
    throw new Error("Unsupported template body type");
  }

  #descriptor(templateId: PromptTemplateId): PromptTemplateDescriptor {
    return PROMPT_TEMPLATE_DESCRIPTORS[templateId];
  }

  #playerObjectKey(loginId: string, templateId: PromptTemplateId, variantId: string): string {
    return `${this.#playerPrefix}${loginId}/templates/${templateId}/${variantId}.hbs`;
  }

  #normalizePrefix(prefix: string): string {
    return prefix.replace(/\/+$/, "") + "/";
  }

  #normalizeEditable(editable: string): string {
    const trimmed = editable.replace(/\s+$/u, "");
    if (!trimmed) {
      return "";
    }
    return `${trimmed}\n\n`;
  }
}
