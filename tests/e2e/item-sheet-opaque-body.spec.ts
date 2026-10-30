import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { compendiumUuid } from './lib/pack-lookup';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';
import { addCompendiumItems, cleanupProbes, openProbeSheet } from './occult-sheet-flow';

/**
 * Tier B for #694: an item sheet's body is opaque, so the sheet it is opened over
 * does not show through.
 *
 * The item sheets cleared their window body to transparent so their own surface
 * could fill it, but the Dark Pact sheet paints no surface, so the character sheet
 * behind it read through its text; gear, armour and origin sheets let the canvas
 * through more faintly. Each sheet is opened over a character sheet and its body
 * read: some layer from the window body up to the window must paint an opaque fill.
 */

const DH2_FLAK_ARMOUR = compendiumUuid({ line: 'dh2', category: 'armour' }, 'Ht6xNdQ2rBw9Km3P');
const DH2_PACT_OF_POWER = compendiumUuid({ line: 'dh2', category: 'dark-pacts' }, 'EB2PactPower0001');

/** One layer from the window body up to the window root: its fill. */
interface Layer {
    tag: string;
    classes: string;
    color: string;
    image: string;
}

interface SheetWindow {
    game: {
        actors: {
            get: (id: string) =>
                | {
                      createEmbeddedDocuments: (type: string, data: object[]) => Promise<Array<{ id: string }>>;
                      items: { get: (id: string) => { sheet: { id: string; render: (o: { force: boolean }) => Promise<object> } } | undefined };
                  }
                | undefined;
        };
    };
}

/** Open an owned item's sheet, beside the character sheet already open; returns its app id. */
async function openItemSheet(page: Page, actorId: string, itemId: string): Promise<string> {
    return page.evaluate(
        async ({ actor, item }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            const owner = (globalThis as unknown as SheetWindow).game.actors.get(actor);
            const doc = owner?.items.get(item);
            if (doc === undefined) throw new Error(`item ${item} missing`);
            await doc.sheet.render({ force: true });
            return doc.sheet.id;
        },
        { actor: actorId, item: itemId },
    );
}

/** The fills from the window body up to the window root. */
async function bodyLayers(page: Page, appId: string): Promise<Layer[]> {
    return page.evaluate((id) => {
        const root = document.getElementById(id);
        const body = root?.querySelector<HTMLElement>('.window-content');
        const layers: Array<{ tag: string; classes: string; color: string; image: string }> = [];
        for (let el: HTMLElement | null = body ?? null; el !== null; el = el === root ? null : el.parentElement) {
            const style = getComputedStyle(el);
            layers.push({
                tag: el.tagName.toLowerCase(),
                classes: el.className.toString().slice(0, 120),
                color: style.backgroundColor,
                image: style.backgroundImage,
            });
        }
        return layers;
    }, appId);
}

/** Whether a layer paints an opaque fill: an image, or a colour with full alpha. */
function isOpaque(layer: Layer): boolean {
    if (layer.image !== 'none' && layer.image.includes('url(')) return true;
    const rgba = /rgba?\(([^)]+)\)/u
        .exec(layer.color)?.[1]
        ?.split(',')
        .map((part) => Number.parseFloat(part.trim()));
    return rgba !== undefined && rgba.length >= 3 && (rgba.length === 3 || rgba[3] === 1);
}

test.describe.serial('item sheet bodies are opaque (Tier B, #694)', () => {
    test.beforeEach(async ({ page }) => {
        await joinOrSkip(page);
    });

    test.afterEach(async ({ page }) => {
        await cleanupProbes(page);
    });

    test('Dark Pact, gear and armour sheets opened over a character sheet show nothing through', async ({ page }) => {
        const { actorId, sheetId } = await openProbeSheet(page, { name: 'Opaque Probe', type: 'dh2-character', system: { gameSystem: 'dh2' } });
        // The character sheet's own body is opaque too.
        expect((await bodyLayers(page, sheetId)).some(isOpaque), 'character sheet body').toBe(true);
        const [armourId = '', pactId = ''] = await addCompendiumItems(page, actorId, [DH2_FLAK_ARMOUR, DH2_PACT_OF_POWER]);
        const created = await page.evaluate(async (id) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            const actor = (globalThis as unknown as SheetWindow).game.actors.get(id);
            if (actor === undefined) throw new Error(`actor ${id} missing`);
            const items = await actor.createEmbeddedDocuments('Item', [
                { name: 'Unwritten Pact', type: 'darkPact' },
                { name: 'Auspex', type: 'gear' },
            ]);
            return items.map((item) => item.id);
        }, actorId);
        const [bareId = '', gearId = ''] = created;
        const sheets: Array<[string, string, string | null]> = [
            // The book's pact grants 2d10+10 Corruption; a pact with no formula reads 0.
            ['dark-pact', pactId, '2d10+10'],
            ['dark-pact-unset', bareId, '0'],
            ['gear', gearId, null],
            ['armour', armourId, null],
        ];
        for (const [label, itemId, corruption] of sheets) {
            // eslint-disable-next-line no-await-in-loop -- one sheet at a time, each over the character sheet
            const appId = await openItemSheet(page, actorId, itemId);
            // eslint-disable-next-line no-await-in-loop -- read after this sheet renders
            const layers = await bodyLayers(page, appId);
            expect(layers.some(isOpaque), `${label} body layers ${JSON.stringify(layers)}`).toBe(true);
            // The window root too, behind the translucent title bar.
            expect(isOpaque(layers.at(-1) ?? { tag: '', classes: '', color: '', image: 'none' }), `${label} window root`).toBe(true);
            if (corruption !== null) {
                // eslint-disable-next-line no-await-in-loop -- read this pact sheet's Corruption gained
                await expect(page.locator(`#${appId} [data-dark-pact-term="corruption"]`)).toHaveText(corruption);
            }
            // eslint-disable-next-line no-await-in-loop -- capture this sheet over the character sheet
            await snap(page, `item-sheet-opaque-${label}`, { selector: `#${appId}` });
            // eslint-disable-next-line no-await-in-loop -- close before the next sheet opens in the same place
            await page.locator(`#${appId} [data-action="close"]`).first().click();
            // eslint-disable-next-line no-await-in-loop -- the closed sheet is gone before the next opens
            await expect(page.locator(`#${appId}`)).toHaveCount(0);
        }
        await expect(page.locator(`#${sheetId}`)).toBeVisible();
        recordCoverage('sheet.render', 'item.opaqueBody');
    });
});
