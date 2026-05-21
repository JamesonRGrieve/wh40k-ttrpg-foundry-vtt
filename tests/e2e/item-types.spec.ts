import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Data-driven coverage of every item type declared in the system manifest.
 * Items are gameSystem-agnostic at the schema level — one sweep covers all
 * of them. Creates, renders the sheet, deletes. Captures uncaught page
 * errors so a regression in any item sheet surfaces here.
 */

interface ItemTypeProbe {
    type: string;
    docId: string | null;
    sheetRendered: boolean;
    pageErrors: string[];
}

interface ProbeReturn {
    docId: string | null;
    sheetRendered: boolean;
    createError: string | null;
}

async function probeItemType(page: Page, itemType: string): Promise<ItemTypeProbe> {
    const errors: string[] = [];
    const listener = (err: Error): void => {
        errors.push(err.message);
    };
    page.on('pageerror', listener);
    try {
        const result = await page.evaluate(async (type: string): Promise<ProbeReturn> => {
            interface ItemSheet {
                render?: (force?: boolean) => Promise<void>;
                close?: () => Promise<void>;
            }
            interface ItemDoc {
                id?: string;
                sheet?: ItemSheet;
                delete?: () => Promise<void>;
            }
            interface ItemCtorShape {
                create?: (data: object) => Promise<ItemDoc | null>;
            }
            interface FoundryGlobal {
                Item?: ItemCtorShape;
            }
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime global, no type surface available in browser context
            const { Item: ItemCtor } = globalThis as unknown as FoundryGlobal;
            if (!ItemCtor?.create) return { docId: null, sheetRendered: false, createError: 'Item.create unavailable' };
            let item: ItemDoc | null;
            try {
                item = await ItemCtor.create({ name: `probe-${type}`, type });
            } catch (err) {
                return { docId: null, sheetRendered: false, createError: String(err instanceof Error ? err.message : err) };
            }
            if (!item) return { docId: null, sheetRendered: false, createError: 'Item.create returned null (silent failure)' };
            let sheetRendered = false;
            if (item.sheet?.render) {
                await item.sheet.render(true);
                sheetRendered = true;
                await item.sheet.close?.();
            }
            await item.delete?.();
            return { docId: item.id ?? null, sheetRendered, createError: null };
        }, itemType);
        if (result.docId == null && result.createError != null) errors.unshift(`create: ${result.createError}`);
        return { type: itemType, docId: result.docId, sheetRendered: result.sheetRendered, pageErrors: errors };
    } finally {
        page.off('pageerror', listener);
    }
}

async function listItemTypes(page: Page): Promise<string[]> {
    return page.evaluate((): string[] => {
        interface FoundryConfigGlobal {
            CONFIG?: { Item?: { dataModels?: Record<string, object> } };
        }
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry CONFIG global, no type surface in browser context
        const cfg = (globalThis as unknown as FoundryConfigGlobal).CONFIG;
        // Skip Foundry's `base` sentinel — it isn't a creatable concrete type.
        return Object.keys(cfg?.Item?.dataModels ?? {}).filter((t) => t !== 'base');
    });
}

test.describe.serial('item types (Tier B)', () => {
    test('every item type creates + renders sheet', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');
        const itemTypes = await listItemTypes(page);
        test.skip(itemTypes.length === 0, 'no item types discovered from CONFIG.Item.dataModels');
        const failures: string[] = [];
        for (const type of itemTypes) {
            const probe = await probeItemType(page, type).catch((err) => ({
                type,
                docId: null,
                sheetRendered: false,
                pageErrors: [String(err instanceof Error ? err.message : err)],
            }));
            if (probe.docId === null) {
                const reason = probe.pageErrors[0] ?? 'Item.create returned null';
                failures.push(`${type}: ${reason}`);
                continue;
            }
            recordCoverage('item.type', type);
            if (!probe.sheetRendered) {
                failures.push(`${type}: sheet did not render`);
                continue;
            }
            if (probe.pageErrors.length > 0) {
                failures.push(`${type}: ${probe.pageErrors[0]}`);
                continue;
            }
            recordCoverage('item.sheet-render', type);
        }
        expect(failures, `${failures.length}/${itemTypes.length} item types failed:\n  - ${failures.join('\n  - ')}`).toEqual([]);
    });
});
