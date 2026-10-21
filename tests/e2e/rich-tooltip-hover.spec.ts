import type { Locator, Page } from '@playwright/test';
import { type HarnessScene, installAttackHarness, leanWeapon } from './lib/attack-harness';
import { popOutChatMessage } from './lib/chat-capture';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { clearScreenOverlays, snap } from './lib/screenshot';
import { expect, test } from './lib/test';
import { scaledMs } from './lib/timing';
import { cleanupProbes, openProbeSheet } from './occult-sheet-flow';

/**
 * Tier B for #692: rich tooltips open on a real hover and on keyboard focus.
 *
 * Foundry's TooltipManager opens on hover only for `data-tooltip` elements, so
 * the rows marked only `data-wh40k-tooltip` (a damage card's provenance rows, a
 * sheet's armour locations) opened nothing. Each test hovers one such element
 * with the mouse and captures the open tooltip beside it. The roll card's
 * modifier row is hovered in roll-transparency.spec.ts.
 */

const CONVERSION_BEAMER = 'Compendium.wh40k-rpg.dh1-daemonhunter-items-weapons.Item.804d243ba234097d';
/** The least a tooltip line sits in from the tooltip's edge: its 2px border plus the panel padding. */
const MIN_TOOLTIP_INSET_PX = 10;

/** How long a hover may wait for its target to become actionable. */
const HOVER_TIMEOUT_MS = 15_000;

const marksman = { characteristics: { ballisticSkill: { base: 60 }, strength: { base: 40 } } };
const TOKENS = [
    { key: 'beamer', name: 'Beamer', type: 'dh1-character', x: 100, y: 100, items: [leanWeapon('Conversion Beamer', CONVERSION_BEAMER, 4)], system: marksman },
    { key: 'near', name: 'Near Target', type: 'dh1-npc', x: 600, y: 100 },
];

/** The open rich tooltip. */
function richTooltip(page: Page): Locator {
    return page.locator('#tooltip.wh40k-tooltip.active');
}

/** Capture `subject` with the open tooltip beside it. */
async function snapWithTooltip(page: Page, label: string, subject: Locator): Promise<void> {
    const [subjectBox, tipBox] = await Promise.all([subject.boundingBox(), richTooltip(page).boundingBox()]);
    if (subjectBox === null || tipBox === null) throw new Error(`${label}: subject or tooltip has no box`);
    const x = Math.min(subjectBox.x, tipBox.x);
    const y = Math.min(subjectBox.y, tipBox.y);
    const width = Math.max(subjectBox.x + subjectBox.width, tipBox.x + tipBox.width) - x;
    const height = Math.max(subjectBox.y + subjectBox.height, tipBox.y + tipBox.height) - y;
    await snap(page, label, { clip: { x, y, width, height }, keepTooltip: true });
}

test.describe.serial('rich tooltips open on hover and focus (Tier B, #692)', () => {
    test.setTimeout(scaledMs(300_000));

    test.beforeEach(async ({ page }) => {
        await joinOrSkip(page);
    });

    test('hovering a damage card provenance row opens its tooltip', async ({ page }) => {
        await installAttackHarness(page);
        try {
            const scene: HarnessScene = await page.evaluate(async (tokens) => globalThis.wh40kAttack.setup({ width: 1200, height: 600, tokens }), TOKENS);
            const attack = await page.evaluate(async (a) => globalThis.wh40kAttack.attack(a), {
                firer: scene.tokens['beamer'] ?? '',
                target: scene.tokens['near'] ?? '',
                weaponName: 'Conversion Beamer',
                faces: [[5, 100]] as Array<[number, number]>,
            });
            const hitId = await page.evaluate(async (ids: readonly string[]) => {
                const { pollUntil } = globalThis.wh40kE2E;
                for (const id of ids) {
                    const sel = `#sidebar .chat-log .message[data-message-id="${id}"]`;
                    // eslint-disable-next-line no-await-in-loop -- each card is read once it renders
                    await pollUntil(() => document.querySelector(sel) !== null);
                    if (document.querySelector(`${sel} .roll-control__roll-damage`) !== null) return id;
                }
                return null;
            }, attack.messageIds);
            if (hitId === null) throw new Error(`no hit card; attack notices ${attack.notices.join(' | ')}`);
            const posted = await page.evaluate(
                async (id: string) =>
                    globalThis.wh40kAttack.clickInMessage({ messageId: id, buttonSelector: '.roll-control__roll-damage', faces: [[6, 10]], expectMessages: 1 }),
                hitId,
            );
            const damageId = posted.at(-1);
            if (damageId === undefined) throw new Error('no damage card');

            const popout = await popOutChatMessage(page, damageId);
            const card = page.locator(popout).first();
            const row = card.locator('[data-damage-profile][data-wh40k-tooltip="modifier"]');
            await expect(row).toHaveCount(1);
            await expect(row).not.toHaveAttribute('data-tooltip');
            await clearScreenOverlays(page, popout.replace('#', ''));
            await row.hover({ timeout: scaledMs(HOVER_TIMEOUT_MS) });
            await expect(richTooltip(page)).toBeVisible();
            // #693: the band tooltip names the weapon and its band rule, then every component the band sets
            // (near band: its dice, Energy damage, penetration 2).
            await expect(richTooltip(page).locator('.wh40k-tooltip__title')).toContainText('Conversion Beamer');
            await expect(richTooltip(page).locator('.wh40k-tooltip__title')).toContainText('Range band 1 of 3');
            const rows = richTooltip(page).locator('.wh40k-tooltip__source');
            await expect(rows.filter({ hasText: 'Formula' })).toContainText('1d10');
            await expect(rows.filter({ hasText: 'Damage type' })).toContainText(/energy/i);
            await expect(rows.filter({ hasText: 'Penetration' })).toContainText('+2');
            await snapWithTooltip(page, 'rich-tooltip-damage-card-hover', card);

            // Keyboard: the row is in the Tab order, and focusing it opens the tooltip too.
            await page.mouse.move(0, 0);
            await expect(richTooltip(page)).toBeHidden();
            await expect(row).toHaveAttribute('tabindex', '0');
            await row.focus();
            await expect(richTooltip(page)).toBeVisible();
            recordCoverage('action', 'RichTooltip.hoverDamageRow');
        } finally {
            await page.evaluate(async () => globalThis.wh40kAttack.teardown());
        }
    });

    test('hovering a sheet armour location opens its tooltip', async ({ page }) => {
        try {
            const { sheetId } = await openProbeSheet(page, { name: 'Tooltip Acolyte', type: 'dh2-character', system: { gameSystem: 'dh2' } }, 'combat');
            const location = page.locator(`#${sheetId} section.tab[data-tab="combat"] [data-location="head"][data-wh40k-tooltip="armor"]`).first();
            await expect(location).toBeVisible();
            // #693: no native title stacks over the rich tooltip; the location is named by aria-label.
            await expect(location).not.toHaveAttribute('title');
            await expect(location).toHaveAttribute('aria-label', /01-10/);
            await clearScreenOverlays(page, sheetId);
            await location.hover();
            await expect(richTooltip(page)).toBeVisible();
            // #693: the Formula line sits inside the panel's padding, not flush against its border.
            const inset = await richTooltip(page).evaluate((tip) => {
                const formula = tip.querySelector('.wh40k-tooltip__formula');
                if (formula === null) return null;
                return formula.getBoundingClientRect().left - tip.getBoundingClientRect().left;
            });
            expect(inset).toBeGreaterThanOrEqual(MIN_TOOLTIP_INSET_PX);
            await snapWithTooltip(page, 'rich-tooltip-sheet-armour-hover', location);
            recordCoverage('action', 'RichTooltip.hoverSheetRow');
        } finally {
            await cleanupProbes(page);
        }
    });
});
