import type { PromptTemplateId } from '@glass-frontier/dto';
import type { Pool } from 'pg';
import type { PlayerStore } from '../playerStore';
export declare const OFFICIAL_VARIANT_ID = "official";
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
export declare class PromptTemplateManager {
    #private;
    constructor(options: {
        pool: Pool;
        playerStore: PlayerStore;
    });
    listTemplates(playerId: string): Promise<TemplateSummary[]>;
    getTemplate(playerId: string, templateId: PromptTemplateId): Promise<TemplateDetail>;
    saveTemplate(options: {
        editable: string;
        label?: string;
        playerId: string;
        templateId: PromptTemplateId;
    }): Promise<TemplateDetail>;
    revertTemplate(options: {
        playerId: string;
        templateId: PromptTemplateId;
    }): Promise<TemplateDetail>;
    resolveTemplate(playerId: string, templateId: PromptTemplateId): Promise<{
        body: string;
        variantId: string;
    }>;
}
export {};
