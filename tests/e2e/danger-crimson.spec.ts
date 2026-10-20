import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { expect, test } from './lib/test';
import { cleanupProbes, openProbeSheet, snapElement } from './occult-sheet-flow';

/**
 * Tier B: danger text reads crimson on every line (#685).
 *
 * Nine danger branches wrote `tw-text-crimson-l40` glued to the line's accent
 * class. That made one unknown class, so neither colour applied and the text
 * inherited whatever was around it. Each danger branch now carries crimson alone.
 *
 * Live surfaces, on DH2 and RT actors:
 * - the NPC sheet's fatigue banner once Fatigue passes its threshold
 *   (fatigue-panel.hbs, one of the nine sites), whose colour is measured;
 * - the Overview vitals in the critical-wounds state (0 wounds, critical damage):
 *   the Critical row's pips up to the damage taken are crimson, the rest are not.
 */

/** `tw-text-crimson-l40` (tailwind.config.js `crimson.l40`, #ff5a5a). */
const DANGER_CRIMSON = 'rgb(255, 90, 90)';
const LINES = ['dh2', 'rt'] as const;
const FATIGUE_BANNER = 'section.tab[data-tab="npc"] div.tw-text-crimson-l40';
const VITALS = 'section.tab[data-tab="overview"] [data-wh40k-hook="overview-vitals"]';
/** The Critical row's pips, and the damage the probe has taken on it. */
const CRITICAL_TRACK = 10;
const CRITICAL_TAKEN = 6;

function endangered(line: string, role: 'character' | 'npc'): { name: string; type: string; system: object } {
    return {
        name: `Danger ${line} ${role}`,
        type: `${line}-${role}`,
        system: { gameSystem: line, wounds: { max: 12, value: 0, critical: CRITICAL_TAKEN }, fatigue: { value: 30 } },
    };
}

async function colourOf(page: Page, selector: string): Promise<string> {
    return page
        .locator(selector)
        .first()
        .evaluate((el) => getComputedStyle(el).color);
}

test.describe.serial('danger text reads crimson (Tier B, #685)', () => {
    test.afterEach(async ({ page }) => {
        await cleanupProbes(page);
    });

    for (const line of LINES) {
        test(`${line}: the fatigue banner is crimson and the critical-wounds vitals render`, async ({ page }) => {
            await joinOrSkip(page);
            const { sheetId } = await openProbeSheet(page, endangered(line, 'npc'), 'npc');
            const banner = `#${sheetId} ${FATIGUE_BANNER}`;
            await expect(page.locator(banner).first()).toBeVisible();
            expect(await colourOf(page, banner)).toBe(DANGER_CRIMSON);
            await snapElement(page, `danger-fatigue-banner-${line}`, banner, sheetId);

            const overview = await openProbeSheet(page, endangered(line, 'character'), 'overview');
            const pips = page.locator(`#${overview.sheetId} ${VITALS} [data-action="setCriticalPip"]`);
            await expect(pips).toHaveCount(CRITICAL_TRACK);
            const colours = await pips.evaluateAll((els) => els.map((el) => getComputedStyle(el).color));
            expect(
                colours.slice(0, CRITICAL_TAKEN).every((colour) => colour === DANGER_CRIMSON),
                `filled pips ${colours.join(', ')}`,
            ).toBe(true);
            expect(colours[CRITICAL_TAKEN]).not.toBe(DANGER_CRIMSON);
            await snapElement(page, `critical-wounds-vitals-${line}`, `#${overview.sheetId} ${VITALS}`, overview.sheetId);
            recordCoverage('sheet.danger', `${line}.fatigue-banner`);
            recordCoverage('sheet.danger', `${line}.critical-pips`);
        });
    }
});
