import type { Page } from '@playwright/test';
import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Visual regression spec for #96: when a gear item declares a
 * `profaneObjectId`, the gear sheet surfaces a crimson "Profane
 * Object" badge in the header + an aura row + a per-action hook row
 * sourced from the canonical registry in
 * `src/module/rules/profane-objects.ts`.
 *
 * Creates a probe gear item with `profaneObjectId: 'eye-of-tzeentch'`,
 * opens its sheet, snaps the rendered DOM, then cleans up.
 */

interface ProfaneProbeResult {
    created: boolean;
    rendered: boolean;
    badgePresent: boolean;
    auraPresent: boolean;
    hookPresent: boolean;
    createError: string | null;
}

async function probeProfaneObjectSheet(page: Page): Promise<ProfaneProbeResult> {
    return page.evaluate(async () => {
        interface GearCreateData {
            name: string;
            type: string;
            system: Record<string, string>;
        }
        interface ItemSheet {
            // Render result is never read — we only await for completion.
            render?: (force?: boolean) => Promise<void>;
            element?: { querySelector?: (sel: string) => Element | null } | null;
        }
        interface ItemDoc {
            id?: string;
            sheet?: ItemSheet | null;
        }
        interface ItemClassShape {
            create: (data: GearCreateData) => Promise<ItemDoc | null>;
        }
        interface FoundryGlobal {
            Item?: ItemClassShape;
            __profaneObjectProbeId?: string;
        }
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals (Item) have no shipped types in this browser-side probe
        const g = globalThis as unknown as FoundryGlobal;
        const ItemCls = g.Item;
        if (ItemCls?.create == null) {
            return {
                created: false,
                rendered: false,
                badgePresent: false,
                auraPresent: false,
                hookPresent: false,
                createError: 'Item.create unavailable',
            };
        }
        let item: ItemDoc | null;
        try {
            item = await ItemCls.create({
                name: 'profane-object-probe-eye',
                type: 'gear',
                system: {
                    category: 'religious',
                    craftsmanship: 'best',
                    profaneObjectId: 'eye-of-tzeentch',
                    notes: 'Probe item for the #96 visual regression spec.',
                },
            });
        } catch (err) {
            return {
                created: false,
                rendered: false,
                badgePresent: false,
                auraPresent: false,
                hookPresent: false,
                createError: err instanceof Error ? err.message : String(err),
            };
        }
        if (item == null) {
            return {
                created: false,
                rendered: false,
                badgePresent: false,
                auraPresent: false,
                hookPresent: false,
                createError: 'Item.create returned null',
            };
        }

        let rendered = false;
        try {
            if (item.sheet?.render != null) {
                await item.sheet.render(true);
                await new Promise((r) => {
                    setTimeout(r, 200);
                });
                rendered = true;
            }
        } catch (err) {
            return {
                created: true,
                rendered: false,
                badgePresent: false,
                auraPresent: false,
                hookPresent: false,
                createError: err instanceof Error ? err.message : String(err),
            };
        }

        const root = item.sheet?.element;
        const badge = root?.querySelector?.('.wh40k-gear-profane-badge') ?? null;
        const panel = root?.querySelector?.('.wh40k-gear-profane-panel') ?? null;
        const aura = root?.querySelector?.('.wh40k-gear-profane-aura') ?? null;
        const hook = root?.querySelector?.('.wh40k-gear-profane-hook') ?? null;

        g.__profaneObjectProbeId = item.id;
        return {
            created: true,
            rendered,
            badgePresent: badge !== null || panel !== null,
            auraPresent: aura !== null,
            hookPresent: hook !== null,
            createError: null,
        };
    });
}

async function cleanupProfaneObjectProbe(page: Page): Promise<void> {
    await page.evaluate(async () => {
        interface CleanupItemDoc {
            sheet?: { close?: () => Promise<void> } | null;
            delete?: () => Promise<void>;
        }
        interface ItemCollection {
            get?: (id: string) => CleanupItemDoc | null | undefined;
        }
        interface FoundryGlobal {
            game?: { items?: ItemCollection };
            __profaneObjectProbeId?: string;
        }
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals (game) have no shipped types in this browser-side cleanup
        const g = globalThis as unknown as FoundryGlobal;
        const id = g.__profaneObjectProbeId;
        if (id == null) return;
        const item = g.game?.items?.get?.(id);
        try {
            await item?.sheet?.close?.();
        } catch {
            /* ignore */
        }
        try {
            await item?.delete?.();
        } catch {
            /* ignore */
        }
        delete g.__profaneObjectProbeId;
    });
}

test.describe.serial('profane object gear sheet', () => {
    test('renders the profane object badge + aura + hook (#96)', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const probe = await probeProfaneObjectSheet(page);
        test.skip(!probe.created, `could not create gear item: ${probe.createError ?? 'unknown'}`);

        await snap(page, 'profane-object-gear-sheet');
        await cleanupProfaneObjectProbe(page);

        const failures: string[] = [];
        if (!probe.rendered) failures.push(`sheet did not render: ${probe.createError ?? 'unknown'}`);
        if (!probe.badgePresent) failures.push('expected .wh40k-gear-profane-badge or .wh40k-gear-profane-panel to be present');
        if (!probe.auraPresent) failures.push('expected .wh40k-gear-profane-aura to be present (Eye of Tzeentch has an aura)');
        if (!probe.hookPresent) failures.push('expected .wh40k-gear-profane-hook to be present (Eye of Tzeentch has a hook)');

        expect(failures, `profane-object gear sheet failures:\n  - ${failures.join('\n  - ')}`).toEqual([]);
    });
});
