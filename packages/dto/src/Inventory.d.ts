import { z } from 'zod';
export declare const InventoryEntryKindSchema: z.ZodEnum<{
    relic: "relic";
    consumable: "consumable";
    supplies: "supplies";
    gear: "gear";
}>;
export type InventoryEntryKind = z.infer<typeof InventoryEntryKindSchema>;
export declare const InventoryDeltaOpSchema: z.ZodObject<{
    op: z.ZodEnum<{
        add: "add";
        remove: "remove";
        update: "update";
    }>;
    name: z.ZodString;
    kind: z.ZodEnum<{
        relic: "relic";
        consumable: "consumable";
        supplies: "supplies";
        gear: "gear";
    }>;
    description: z.ZodString;
    effect: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    quantity: z.ZodNumber;
}, z.core.$strip>;
export type InventoryDeltaOp = z.infer<typeof InventoryDeltaOpSchema>;
export declare const InventoryDeltaSchema: z.ZodObject<{
    ops: z.ZodDefault<z.ZodArray<z.ZodObject<{
        op: z.ZodEnum<{
            add: "add";
            remove: "remove";
            update: "update";
        }>;
        name: z.ZodString;
        kind: z.ZodEnum<{
            relic: "relic";
            consumable: "consumable";
            supplies: "supplies";
            gear: "gear";
        }>;
        description: z.ZodString;
        effect: z.ZodNullable<z.ZodOptional<z.ZodString>>;
        quantity: z.ZodNumber;
    }, z.core.$strip>>>;
}, z.core.$strip>;
export type InventoryDelta = z.infer<typeof InventoryDeltaSchema>;
export declare const InventoryEntrySchema: z.ZodObject<{
    id: z.ZodString;
    kind: z.ZodEnum<{
        relic: "relic";
        consumable: "consumable";
        supplies: "supplies";
        gear: "gear";
    }>;
    name: z.ZodString;
    description: z.ZodString;
    effect: z.ZodOptional<z.ZodString>;
    quantity: z.ZodDefault<z.ZodNumber>;
}, z.core.$strip>;
export type InventoryEntry = z.infer<typeof InventoryEntrySchema>;
export declare const InventorySchema: z.ZodDefault<z.ZodArray<z.ZodObject<{
    id: z.ZodString;
    kind: z.ZodEnum<{
        relic: "relic";
        consumable: "consumable";
        supplies: "supplies";
        gear: "gear";
    }>;
    name: z.ZodString;
    description: z.ZodString;
    effect: z.ZodOptional<z.ZodString>;
    quantity: z.ZodDefault<z.ZodNumber>;
}, z.core.$strip>>>;
export type Inventory = z.infer<typeof InventorySchema>;
export declare const createEmptyInventory: () => Inventory;
