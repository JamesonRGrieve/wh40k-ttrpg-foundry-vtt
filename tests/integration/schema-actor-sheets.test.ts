/**
 * Tier A (#735, #736): the NPC, craft and voidcraft sheets edit the stored
 * fields their own templates lack, through the shared schema rows.
 *
 * Against the real actor DataModel schemas:
 *   - each sheet carries its layout and renders the schema sections;
 *   - every layout path exists in at least one actor type the sheet opens
 *     (the NPC layout carries the Imperium Maledictum NPC's own fields too);
 *   - every choice option has a langpack label.
 */
import { describe, expect, it } from 'vitest';
import { CRAFT_EXTRA_LAYOUT, NPC_EXTRA_LAYOUT, VOIDCRAFT_EXTRA_LAYOUT } from '../../src/module/applications/actor/actor-schema-layouts';
import { choiceLabelKey, choiceValues, type SchemaNode, type SchemaSheetLayout } from '../../src/module/applications/item/schema-sheet-layout';
import { buildLangStub } from '../../src/module/testing/lang-stub';
import { bootFoundryOnce, type FoundryRuntime } from './lib/boot';
import { requireOrSkip } from './lib/has-foundry';
import { nodeAtLayoutPath, rendersSchemaSections } from './lib/schema-paths';

const ok = requireOrSkip('A');
const bootResult = await bootFoundryOnce();
const skipAll = !ok || !bootResult.booted;
const runtime: FoundryRuntime = bootResult.runtime ?? ({} as FoundryRuntime);

interface ActorConfigSurface {
    Actor: { dataModels: Record<string, { schema: SchemaNode }> };
}

interface SheetStatics {
    SCHEMA_LAYOUT?: SchemaSheetLayout | null;
    PARTS?: Record<string, { template: string }>;
}

/** Each sheet, its layout, and the actor types it opens (by type-name suffix). */
const SHEETS: ReadonlyArray<readonly [string, () => Promise<SheetStatics>, SchemaSheetLayout, RegExp]> = [
    ['NPC', async () => (await import('../../src/module/applications/actor/npc-sheet')).default, NPC_EXTRA_LAYOUT, /-npc$/],
    [
        'craft',
        async () => (await import('../../src/module/applications/actor/craft-sheet')).default,
        CRAFT_EXTRA_LAYOUT,
        /-(?:terracraft|aircraft|watercraft|vehicle)$/,
    ],
    ['voidcraft', async () => (await import('../../src/module/applications/actor/voidcraft-sheet')).default, VOIDCRAFT_EXTRA_LAYOUT, /-voidcraft$/],
];

describe.skipIf(skipAll)('actor sheets edit the fields their templates lack (Tier A, #735, #736)', () => {
    const config = runtime.CONFIG as ActorConfigSurface;
    const { has } = buildLangStub();
    const schemasFor = (types: RegExp): SchemaNode[] =>
        Object.entries(config.Actor.dataModels)
            .filter(([type]) => types.test(type))
            .map(([, model]) => model.schema);

    it.each(SHEETS)('the %s sheet carries its layout and renders the schema sections', async (_name, load, layout) => {
        const sheet = await load();
        expect(sheet.SCHEMA_LAYOUT).toBe(layout);
        expect(rendersSchemaSections(sheet.PARTS ?? {})).toBe(true);
    });

    it.each(SHEETS)('every %s layout path exists in an actor type the sheet opens', (_name, _load, layout, types) => {
        const schemas = schemasFor(types);
        expect(schemas.length).toBeGreaterThan(0);
        const paths = layout.sections.flatMap((section) => section.paths);
        expect(paths.filter((path) => schemas.every((schema) => nodeAtLayoutPath(schema, path) === undefined))).toEqual([]);
    });

    it.each(SHEETS)('every %s choice option has a label', (_name, _load, layout, types) => {
        const missing = schemasFor(types).flatMap((schema) =>
            layout.sections.flatMap((section) =>
                section.paths.flatMap((path) => {
                    const node = nodeAtLayoutPath(schema, path);
                    return node === undefined ? [] : choiceValues(node).map((value) => choiceLabelKey(layout, section, path, value));
                }),
            ),
        );
        expect([...new Set(missing)].filter((key) => !has(key))).toEqual([]);
    });
});
