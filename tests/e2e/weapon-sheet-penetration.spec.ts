import type { Page } from '@playwright/test';
import { leanWeapon } from './lib/attack-harness';
import { assertFlowResults } from './lib/flow-assert';
import { joinOrSkip } from './lib/join';
import { snap } from './lib/screenshot';
import { allWithinContainer, createProbeActor, deleteProbeActors, openProbeSheet, type SheetWidth } from './lib/sheet-probe';
import { expect, test } from './lib/test';
import { scaledMs } from './lib/timing';

/**
 * Tier B coverage of the weapon sheet's Penetration tile (#614,
 * src/templates/item/item-weapon-sheet.hbs, WeaponData#penetrationLabel).
 *
 * The tile's label rendered as "ENETRATION" (clipped on the left) on every weapon
 * sheet, and a weapon whose damage comes in range bands (#608, the DH1 Conversion
 * Beamer) showed Penetration 0 though each band carries its own. The DH2 Hand
 * Flamer (Pen 2) and the Beamer are captured at their sheet's default and minimum
 * widths.
 *
 * Each flow records under `weapon-penetration.flow`. Keys MUST match
 * WEAPON_PENETRATION_FLOWS in scripts/e2e-coverage.mjs.
 */

const WEAPON_PENETRATION_FLOWS = [
    'label-fits-default-width',
    'label-fits-min-width',
    'banded-weapon-shows-band-penetration',
    'own-penetration-unchanged',
] as const;
type FlowName = (typeof WEAPON_PENETRATION_FLOWS)[number];

const HAND_FLAMER = 'Compendium.wh40k-rpg.dh2-core-items-weapons.Item.j7K8l9M0n1O2p3Q4';
const CONVERSION_BEAMER = 'Compendium.wh40k-rpg.dh1-daemonhunter-items-weapons.Item.804d243ba234097d';
const VALUE = '[data-weapon-penetration]';
/** The weapon sheet's minimum width (tailwind/weapon.js `min-width`, #614). */
const MIN_SHEET_WIDTH_PX = 400;

interface TileRead {
    value: string;
    label: string;
}

/** The Penetration tile's shown value and label. */
async function readTile(page: Page, appId: string): Promise<TileRead> {
    return page.evaluate(
        (args: { appId: string; value: string }) => {
            const value = document.querySelector(`#${args.appId} ${args.value}`);
            return { value: value?.textContent.trim() ?? '', label: value?.nextElementSibling?.textContent.trim() ?? '' };
        },
        { appId, value: VALUE },
    );
}

test.describe.serial('weapon sheet Penetration tile (Tier B, #614)', () => {
    test.setTimeout(scaledMs(240_000));
    test('the label fits at every width and a banded weapon shows its bands’ penetration', async ({ page }) => {
        await joinOrSkip(page);
        const results: Array<{ name: FlowName; ok: boolean; detail: string | null }> = [];
        const record = (name: FlowName, ok: boolean, detail: string): void => {
            results.push({ name, ok, detail: ok ? null : detail });
        };
        const actors: string[] = [];
        try {
            const flamerOwner = await createProbeActor(page, {
                name: 'Pen probe (flamer)',
                type: 'dh2-character',
                items: [leanWeapon('Hand Flamer', HAND_FLAMER, 2)],
            });
            const beamerOwner = await createProbeActor(page, {
                name: 'Pen probe (beamer)',
                type: 'dh1-character',
                items: [leanWeapon('Conversion Beamer', CONVERSION_BEAMER, 4)],
            });
            for (const id of [flamerOwner, beamerOwner]) if (id !== null) actors.push(id);
            if (flamerOwner === null || beamerOwner === null) throw new Error('probe actors were not created');

            const widths: Array<{ width: SheetWidth; flow: FlowName; tag: string }> = [
                { width: 'default', flow: 'label-fits-default-width', tag: 'default' },
                { width: 'min', flow: 'label-fits-min-width', tag: 'min' },
            ];
            for (const { width, flow, tag } of widths) {
                const fits: string[] = [];
                for (const [ownerId, itemName, slug] of [
                    [flamerOwner, 'Hand Flamer', 'hand-flamer'],
                    [beamerOwner, 'Conversion Beamer', 'conversion-beamer'],
                ] as const) {
                    // eslint-disable-next-line no-await-in-loop -- one sheet open at a time, captured in turn
                    const sheet = await openProbeSheet(page, ownerId, { itemName, width });
                    if (sheet === null) {
                        fits.push(`${itemName}: sheet did not open`);
                        continue;
                    }
                    // eslint-disable-next-line no-await-in-loop -- reads the sheet just opened
                    const tile = await readTile(page, sheet.appId);
                    // eslint-disable-next-line no-await-in-loop -- reads the sheet just opened
                    const inside = await allWithinContainer(page, sheet.appId, `${VALUE} + span, ${VALUE}`, '[data-tooltip]');
                    if (!inside.ok || tile.label !== 'Pen') fits.push(`${itemName} at ${sheet.width}px: label "${tile.label}"; ${inside.detail}`);
                    // The DAMAGE value shows in full inside its tile, and the name field shows
                    // the whole name: at Foundry's 200px floor they read "1D10+9 E /" and "Conversi".
                    // eslint-disable-next-line no-await-in-loop -- reads the sheet just opened
                    const damage = await allWithinContainer(page, sheet.appId, '[data-weapon-damage]', '[data-tooltip]');
                    if (!damage.ok) fits.push(`${itemName} at ${sheet.width}px damage: ${damage.detail}`);
                    // eslint-disable-next-line no-await-in-loop -- reads the sheet just opened
                    const nameFits = await page.evaluate((appId) => {
                        const input = document.querySelector<HTMLInputElement>(`#${appId} input[name="name"]`);
                        return input !== null && input.scrollWidth <= input.clientWidth + 1;
                    }, sheet.appId);
                    if (!nameFits) fits.push(`${itemName} at ${sheet.width}px: the name field truncates`);
                    if (width === 'min' && sheet.width < MIN_SHEET_WIDTH_PX) fits.push(`${itemName}: min width ${sheet.width}px < ${MIN_SHEET_WIDTH_PX}px`);
                    if (width === 'default') {
                        if (itemName === 'Hand Flamer') record('own-penetration-unchanged', tile.value === '2', `Hand Flamer shows "${tile.value}"`);
                        else record('banded-weapon-shows-band-penetration', tile.value === '2/8/14', `Conversion Beamer shows "${tile.value}"`);
                    }
                    // eslint-disable-next-line no-await-in-loop -- captures the sheet just opened
                    await snap(page, `weapon-penetration-${slug}-${tag}-width`, { selector: `#${sheet.appId}`, closeWindows: true, keepWindow: sheet.appId });
                }
                record(flow, fits.length === 0, fits.join('; '));
            }

            // #701: the weapon sheet uses the shared item title, so a long name steps its font down
            // and fits, with the whole name in the tooltip, at the default and minimum widths.
            const longName = 'Mars Pattern Mk IV Long Hand Flamer';
            const longOwner = await createProbeActor(page, {
                name: 'Title probe (long name)',
                type: 'dh2-character',
                items: [leanWeapon(longName, HAND_FLAMER, 2)],
            });
            if (longOwner === null) throw new Error('long-name probe actor was not created');
            actors.push(longOwner);
            for (const width of ['default', 'min'] as const) {
                // eslint-disable-next-line no-await-in-loop -- one sheet open at a time, captured in turn
                const sheet = await openProbeSheet(page, longOwner, { itemName: longName, width });
                if (sheet === null) throw new Error(`the long-name weapon sheet did not open at ${width} width`);
                // eslint-disable-next-line no-await-in-loop -- reads the sheet just opened
                const title = await page.evaluate((appId) => {
                    const input = document.querySelector<HTMLInputElement>(`#${appId} input[name="name"]`);
                    return { fits: input !== null && input.scrollWidth <= input.clientWidth + 1, tooltip: input?.dataset['tooltip'] ?? null };
                }, sheet.appId);
                expect(title, `the long weapon name at ${width} width (${sheet.width}px)`).toEqual({ fits: true, tooltip: longName });
                // eslint-disable-next-line no-await-in-loop -- captures the sheet just opened
                await snap(page, `weapon-sheet-long-name-${width}-width`, { selector: `#${sheet.appId}`, closeWindows: true, keepWindow: sheet.appId });
            }
        } finally {
            await deleteProbeActors(page, actors);
        }
        assertFlowResults({ results }, WEAPON_PENETRATION_FLOWS, { dimension: 'weapon-penetration.flow', label: 'weapon penetration' });
    });
});
