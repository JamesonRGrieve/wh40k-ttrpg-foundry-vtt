import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { expect, test } from './lib/test';
import { cleanupProbes, forceDice, messageIds, openProbeSheet, restoreDice, snapElement, snapMessage, waitForMessage } from './occult-sheet-flow';

/**
 * Tier B for #645: a character rolls an active force field, the roll opens in the
 * unified roll dialog, and the card resolves it per RAW. RAW is the same in every
 * line: 1d100 at or under the protection rating nullifies the attack, and a roll
 * inside the overload band (Common craftsmanship: 01–10, DH2 core Table 5–13)
 * overloads the field. The card prints both checks.
 *
 * Dice faces are fixed through `CONFIG.Dice.randomUniform`: a d100 face is
 * ceil((1 − u) × 100).
 */

const CARD = 'Force Field Activation';
/** u giving a d100 of 12: protected (PR 30), outside the 01–10 band. */
const ROLL_12 = 0.885;
/** u giving a d100 of 7: protected AND overloaded. */
const ROLL_7 = 0.935;
/** u giving a d100 of 64: not protected. */
const ROLL_64 = 0.365;

const FIELD = {
    name: 'Refractor Field',
    type: 'forceField',
    system: { protectionRating: 30, craftsmanship: 'common', state: { equipped: true, activated: true, overloaded: false } },
};

interface ProbeItem {
    id: string;
    system: { state: { overloaded: boolean } };
}
interface ProbeActor {
    items: { find: (fn: (i: { type: string }) => boolean) => ProbeItem | undefined };
    rollItem: (id: string) => Promise<void>;
}
interface ProbeWindow {
    game: { actors: { get: (id: string) => ProbeActor | undefined } };
}

/** Roll the actor's force field from its document API (the sheet's item roll calls the same). */
async function rollField(page: Page, actorId: string): Promise<void> {
    await page.evaluate(async (id) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
        const actor = (globalThis as unknown as ProbeWindow).game.actors.get(id);
        const field = actor?.items.find((i) => i.type === 'forceField');
        if (actor === undefined || field === undefined) throw new Error('probe force field missing');
        await actor.rollItem(field.id);
    }, actorId);
}

async function fieldOverloaded(page: Page, actorId: string): Promise<boolean | null> {
    return page.evaluate((id) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
        const actor = (globalThis as unknown as ProbeWindow).game.actors.get(id);
        return actor?.items.find((i) => i.type === 'forceField')?.system.state.overloaded ?? null;
    }, actorId);
}

/** The open unified roll dialog: snap it, then roll. */
async function rollDialog(page: Page, label: string): Promise<void> {
    const form = page.locator('form.unified-roll-dialog').last();
    await expect(form).toBeVisible();
    await expect(form).toContainText('Refractor Field');
    const formId = (await form.getAttribute('id')) ?? '';
    await snapElement(page, label, `#${formId}`, formId);
    await form.locator('[data-action="systemRoll"]').click();
}

test.describe.serial('force-field protection roll (#645)', () => {
    let before: string[] = [];

    test.beforeEach(async ({ page }) => {
        await joinOrSkip(page);
        before = await messageIds(page);
    });

    test.afterEach(async ({ page }) => {
        await restoreDice(page);
        await cleanupProbes(page, before);
    });

    test('a roll under the protection rating nullifies the attack', async ({ page }) => {
        const { actorId } = await openProbeSheet(page, { name: 'Shielded Acolyte', type: 'dh2-character', system: { gameSystem: 'dh2' }, items: [FIELD] });
        await forceDice(page, ROLL_12);
        await rollField(page, actorId);
        await rollDialog(page, 'force-field-roll-dialog');

        const card = await waitForMessage(page, before, CARD);
        expect(card.content).toContain('d100 12 vs PR 30');
        expect(card.content).toContain('d100 12 vs 1–10');
        expect(card.content).toContain('Field Activated');
        expect(card.content).not.toContain('Field Overload!');
        expect(await fieldOverloaded(page, actorId)).toBe(false);
        await snapMessage(page, 'force-field-card-protected', card.id);
        recordCoverage('action', 'forceField.protected');
    });

    test('a roll in the overload band protects and overloads the field', async ({ page }) => {
        const { actorId } = await openProbeSheet(page, { name: 'Overloaded Acolyte', type: 'dh2-character', system: { gameSystem: 'dh2' }, items: [FIELD] });
        await forceDice(page, ROLL_7);
        await rollField(page, actorId);
        await rollDialog(page, 'force-field-roll-dialog-overload');

        const card = await waitForMessage(page, before, CARD);
        expect(card.content).toContain('d100 7 vs PR 30');
        expect(card.content).toContain('Field Activated');
        expect(card.content).toContain('Field Overload!');
        await expect.poll(async () => fieldOverloaded(page, actorId)).toBe(true);
        await snapMessage(page, 'force-field-card-overloaded', card.id);
        recordCoverage('action', 'forceField.overloaded');
    });

    test('a roll over the protection rating lets the attack through', async ({ page }) => {
        const { actorId } = await openProbeSheet(page, { name: 'Unlucky Acolyte', type: 'dh2-character', system: { gameSystem: 'dh2' }, items: [FIELD] });
        await forceDice(page, ROLL_64);
        await rollField(page, actorId);
        await rollDialog(page, 'force-field-roll-dialog-failed');

        const card = await waitForMessage(page, before, CARD);
        expect(card.content).toContain('d100 64 vs PR 30');
        expect(card.content).toContain('Field Failed');
        await snapMessage(page, 'force-field-card-failed', card.id);
    });
});
