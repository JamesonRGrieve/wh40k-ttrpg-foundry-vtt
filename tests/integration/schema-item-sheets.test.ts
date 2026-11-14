/**
 * Tier A (#731): every item type's own sheet edits its stored fields.
 *
 * Against the real DataModel schemas:
 *   - each schema-sheet layout reaches every stored field of its type, except the
 *     fields every sheet handles elsewhere (description, source reference, …);
 *   - every layout path exists in its type's schema, and every choice option
 *     has a langpack label;
 *   - every item type with fields of its own is registered to its own sheet
 *     (`item-sheet-registry.ts`), not left on the BaseItemSheet fallback.
 */
import { describe, expect, it } from 'vitest';
import { choiceLabelKey, choiceValues, schemaNodeAt, type SchemaNode, type SchemaSheetLayout } from '../../src/module/applications/item/schema-sheet-layout';
import { SCHEMA_SHEET_LAYOUTS, SUPPLEMENTARY_LAYOUTS } from '../../src/module/applications/item/schema-sheet-layouts';
import { buildLangStub } from '../../src/module/testing/lang-stub';
import { readRepoFile } from '../lib/repo-file';
import { bootFoundryOnce, type FoundryRuntime } from './lib/boot';
import { requireOrSkip } from './lib/has-foundry';

const ok = requireOrSkip('A');
const bootResult = await bootFoundryOnce();
const skipAll = !ok || !bootResult.booted;
const runtime: FoundryRuntime = bootResult.runtime ?? ({} as FoundryRuntime);

interface ItemConfigSurface {
    Item: {
        dataModels: Record<string, { schema: SchemaNode }>;
    };
}

/**
 * Stored fields every item sheet edits through shared panels, or that the
 * system writes itself: the description and source-reference panels, the
 * compendium identifier and variant link, acquisition bookkeeping and the
 * per-line homebrew inventory overlay.
 */
const SHARED_FIELDS = /^(?:description\.|source\.|acquired$|identifier$|variantOf$|homebrew\.)/;

/** A schema's stored leaves as layout paths: `a.b`, `list[]` for scalar arrays, `list[].sub` for arrays of objects. */
function leafPaths(node: SchemaNode, path: string, out: string[]): string[] {
    if (node.fields !== undefined && node.constructor.name !== 'TypeDataField') {
        for (const [key, child] of Object.entries(node.fields)) leafPaths(child, path === '' ? key : `${path}.${key}`, out);
        return out;
    }
    if (node.constructor.name === 'ArrayField' && node.element !== undefined) {
        if (node.element.fields === undefined) out.push(`${path}[]`);
        else for (const [key, child] of Object.entries(node.element.fields)) leafPaths(child, `${path}[].${key}`, out);
        return out;
    }
    out.push(path);
    return out;
}

/** The node a layout path names, through `[]` array elements. */
function nodeAtLayoutPath(schema: SchemaNode, path: string): SchemaNode | undefined {
    const marker = path.indexOf('[]');
    if (marker < 0) return schemaNodeAt(schema, path);
    const element = schemaNodeAt(schema, path.slice(0, marker))?.element;
    const sub = path.slice(marker + 3);
    return sub === '' || element === undefined ? element : schemaNodeAt(element, sub);
}

describe.skipIf(skipAll)('item types have sheets that edit their own fields (Tier A, #731)', () => {
    const config = runtime.CONFIG as ItemConfigSurface;
    const { has } = buildLangStub();
    /** The registered DataModel schema of an item type. */
    const schemaOf = (type: string): SchemaNode => {
        const model = Object.hasOwn(config.Item.dataModels, type) ? config.Item.dataModels[type] : undefined;
        if (model === undefined) throw new Error(`no ${type} DataModel is registered`);
        return model.schema;
    };

    it.each(SCHEMA_SHEET_LAYOUTS.map((layout) => [layout.type, layout] as const))('%s: the layout reaches every stored field', (type, layout) => {
        const schema = schemaOf(type);
        const laidOut = new Set(layout.sections.flatMap((section) => section.paths));
        const stored = leafPaths(schema, '', []).filter((path) => !SHARED_FIELDS.test(path));
        expect(stored.filter((path) => !laidOut.has(path))).toEqual([]);
        expect([...laidOut].filter((path) => nodeAtLayoutPath(schema, path) === undefined)).toEqual([]);
    });

    it.each(SCHEMA_SHEET_LAYOUTS.map((layout) => [layout.type, layout] as const))('%s: every choice option has a label', (type, layout) => {
        const schema = schemaOf(type);
        const missing = layout.sections.flatMap((section) =>
            section.paths.flatMap((path) => {
                const node = nodeAtLayoutPath(schema, path);
                if (node === undefined) return [];
                return choiceValues(node)
                    .map((value) => choiceLabelKey(layout, section, path, value))
                    .filter((key) => !has(key));
            }),
        );
        expect(missing).toEqual([]);
    });

    it('no item type with fields of its own opens the BaseItemSheet fallback', async () => {
        const { ITEM_SHEETS } = await import('../../src/module/applications/item/item-sheet-registry');
        const ownSheet = new Set(ITEM_SHEETS.flatMap((registration) => registration.types ?? []));
        const fallback = Object.entries(config.Item.dataModels)
            .filter(([, model]) => leafPaths(model.schema, '', []).some((path) => !SHARED_FIELDS.test(path)))
            .map(([type]) => type)
            .filter((type) => !ownSheet.has(type));
        expect(fallback).toEqual([]);
    });

    /** Each item type a hand-built sheet opens, with the supplementary layout it carries (#732). */
    const supplementary = Object.entries(SUPPLEMENTARY_LAYOUTS);

    it.each(supplementary)('%s: its sheet carries the supplementary layout, and every path a type lacks is one another type has', async (type, layout) => {
        const { ITEM_SHEETS } = await import('../../src/module/applications/item/item-sheet-registry');
        const registration = ITEM_SHEETS.find((entry) => entry.types?.includes(type) === true);
        expect((registration?.sheet as { SCHEMA_LAYOUT?: SchemaSheetLayout | null } | undefined)?.SCHEMA_LAYOUT).toBe(layout);
        const users = supplementary.filter(([, other]) => other === layout).map(([user]) => schemaOf(user));
        const paths = layout.sections.flatMap((section) => section.paths);
        expect(paths.filter((path) => users.every((schema) => nodeAtLayoutPath(schema, path) === undefined))).toEqual([]);
    });

    it.each(supplementary)('%s: every supplementary choice option has a label', (type, layout) => {
        const schema = schemaOf(type);
        const missing = layout.sections.flatMap((section) =>
            section.paths.flatMap((path) => {
                const node = nodeAtLayoutPath(schema, path);
                return node === undefined
                    ? []
                    : choiceValues(node)
                          .map((value) => choiceLabelKey(layout, section, path, value))
                          .filter((key) => !has(key));
            }),
        );
        expect(missing).toEqual([]);
    });

    it('every sheet with a schema layout renders the schema sections in one of its templates', async () => {
        const { ITEM_SHEETS } = await import('../../src/module/applications/item/item-sheet-registry');
        const missing = ITEM_SHEETS.filter((entry) => {
            const sheet = entry.sheet as { SCHEMA_LAYOUT?: SchemaSheetLayout | null; PARTS?: Record<string, { template: string }> };
            if (sheet.SCHEMA_LAYOUT == null) return false;
            const templates = Object.values(sheet.PARTS ?? {})
                .map((part) => part.template)
                .filter((path) => path.startsWith('systems/wh40k-rpg/'))
                .map((path) => readRepoFile(path.replace('systems/wh40k-rpg/', 'src/')));
            return !templates.some(
                (source) => source.includes('templates/item/partial/schema-sections.hbs') || source.includes('templates/item/item-schema-sheet.hbs'),
            );
        });
        expect(missing.map((entry) => entry.label)).toEqual([]);
    });
});
