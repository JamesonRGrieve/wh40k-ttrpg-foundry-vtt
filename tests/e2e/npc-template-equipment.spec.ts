import type { Page } from '@playwright/test';
import { openActorSheet } from './combat-resolution-flow';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { clearScreenOverlays, snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B: an NPC Template's carried equipment reaches the NPC made from it (#670).
 *
 * The template carries one piece named exactly as one carried compendium item on
 * the world's line, and one piece no compendium item is named. The GM creates the
 * NPC through the template selector. The matched piece must be an owned item linked
 * to its compendium document, with the template's quantity. The other must stay on
 * the NPC's carried-equipment list, which the NPC sheet's Equipment tab shows.
 */

const TEMPLATE_NAME = 'e2e-670 Template Gunman';
const UNMATCHED = { name: 'e2e-670 Lucky Charm', quantity: 1 };
const MATCHED_QUANTITY = 2;
const LINE = 'dh2';

interface ProbeDoc {
    id: string;
    name: string;
    type: string;
    delete: () => Promise<void>;
    sheet?: { close: () => Promise<void> } | null;
}
interface ProbeWindow {
    Item: { create: (data: object) => Promise<ProbeDoc | null> };
    game: {
        items: { filter: (fn: (i: ProbeDoc) => boolean) => ProbeDoc[] };
        actors: { filter: (fn: (a: ProbeDoc) => boolean) => ProbeDoc[] };
        packs: Array<{ documentName: string; metadata: { id: string }; getIndex: () => Promise<Iterable<{ name: string; type: string; uuid: string }>> }>;
        wh40k: { openTemplateSelector: (options?: object) => Promise<object | null> };
    };
    foundry: { applications: { instances: Map<string, { id: string; constructor: { name: string } }> } };
}

async function cleanUp(page: Page): Promise<void> {
    await page.evaluate(async (name) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
        const w = globalThis as unknown as ProbeWindow;
        for (const actor of w.game.actors.filter((a) => a.name === name)) {
            await actor.sheet?.close();
            await actor.delete();
        }
        for (const item of w.game.items.filter((i) => i.name === name)) await item.delete();
    }, TEMPLATE_NAME);
}

/** A piece of gear named by exactly one carried item in the line's packs, so the name resolves to it alone. */
async function uniqueLineGear(page: Page): Promise<{ name: string; uuid: string }> {
    return page.evaluate(async (line) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
        const w = globalThis as unknown as ProbeWindow;
        const carried = new Set([
            'ammunition',
            'armour',
            'armourModification',
            'cybernetic',
            'consumable',
            'drug',
            'forceField',
            'gear',
            'tool',
            'weapon',
            'weaponModification',
        ]);
        const onLine = w.game.packs.filter(
            (pack) =>
                pack.documentName === 'Item' &&
                /^wh40k-rpg\.(hb-)?/.test(pack.metadata.id) &&
                (pack.metadata.id.split('.')[1] ?? '').replace(/^hb-/, '').startsWith(`${line}-`),
        );
        // The index is a Collection, not an array, so it is spread into one.
        const entries = (await Promise.all(onLine.map(async (pack) => [...(await pack.getIndex())]))).flat().filter((entry) => carried.has(entry.type));
        const counts = new Map<string, number>();
        for (const entry of entries) counts.set(entry.name, (counts.get(entry.name) ?? 0) + 1);
        const gear = entries.find((entry) => entry.type === 'gear' && counts.get(entry.name) === 1);
        if (gear === undefined) throw new Error(`no uniquely named gear in the ${line} packs`);
        return { name: gear.name, uuid: gear.uuid };
    }, LINE);
}

test.describe.serial('NPC Template equipment (Tier B, #670)', () => {
    test.afterEach(async ({ page }) => {
        await cleanUp(page);
    });

    test('links the matched piece as an owned item and lists the rest on the NPC', async ({ page }) => {
        await joinOrSkip(page);
        await cleanUp(page);
        const gear = await uniqueLineGear(page);

        const dialogId = await page.evaluate(
            async ({ name, equipment }) => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
                const w = globalThis as unknown as ProbeWindow;
                await w.Item.create({ name, type: 'npcTemplate', system: { category: 'humanoid', faction: 'Chaos', baseThreatLevel: 4, equipment } });
                void w.game.wh40k.openTemplateSelector();
                await globalThis.wh40kE2E.waitFor(
                    () => [...w.foundry.applications.instances.values()].some((app) => app.constructor.name === 'TemplateSelector'),
                    'template selector rendered',
                );
                return [...w.foundry.applications.instances.values()].find((app) => app.constructor.name === 'TemplateSelector')?.id ?? '';
            },
            { name: TEMPLATE_NAME, equipment: [{ name: gear.name, quantity: MATCHED_QUANTITY }, UNMATCHED] },
        );

        const dialog = page.locator(`#${dialogId}`);
        await dialog.locator('[data-action="selectTemplate"]', { hasText: TEMPLATE_NAME }).click();
        await dialog.locator('[data-action="create"]').click();
        await expect(dialog).toBeHidden();

        const npc = await page.evaluate(async (name) => {
            interface Owned {
                name: string;
                system: object;
                _stats: { compendiumSource: string | null };
            }
            interface Npc {
                id: string;
                name: string;
                system: { equipment: Array<{ name: string; quantity: number }> };
                items: { contents: Owned[] };
            }
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            const w = globalThis as unknown as { game: { actors: { find: (fn: (a: Npc) => boolean) => Npc | undefined } } };
            await globalThis.wh40kE2E.waitFor(() => w.game.actors.find((a) => a.name === name) !== undefined, 'the created NPC');
            const actor = w.game.actors.find((a) => a.name === name);
            if (actor === undefined) throw new Error('NPC not created');
            return {
                id: actor.id,
                equipment: actor.system.equipment.map((entry) => ({ name: entry.name, quantity: entry.quantity })),
                owned: actor.items.contents.map((item) => ({
                    name: item.name,
                    quantity: 'quantity' in item.system && typeof item.system.quantity === 'number' ? item.system.quantity : null,
                    source: item._stats.compendiumSource,
                })),
            };
        }, TEMPLATE_NAME);

        expect(npc.owned).toContainEqual({ name: gear.name, quantity: MATCHED_QUANTITY, source: gear.uuid });
        expect(npc.equipment).toEqual([UNMATCHED]);

        const sheetId = await openActorSheet(page, npc.id, 'equipment');
        const panel = page.locator(`#${sheetId} [data-npc-carried-equipment]`);
        await expect(panel).toBeVisible();
        await expect(panel.locator('li')).toHaveCount(1);
        await expect(panel.locator('li span')).toHaveText([UNMATCHED.name, `×${UNMATCHED.quantity}`]);
        await expect(page.locator(`#${sheetId}`).getByText(gear.name, { exact: true }).first()).toBeVisible();
        await clearScreenOverlays(page, sheetId);
        await snap(page, 'npc-template-equipment-sheet', { selector: `#${sheetId}` });
        recordCoverage('dialog.action', 'TemplateSelector.create');
    });
});
