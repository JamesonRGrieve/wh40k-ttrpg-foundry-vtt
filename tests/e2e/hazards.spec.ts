import type { Locator, Page } from '@playwright/test';
import { showChatMessage } from './lib/chat-capture';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { expect, test } from './lib/test';
import { scaledMs } from './lib/timing';
import {
    chatMessageIds,
    controlTokens,
    createProbeScene,
    deleteProbeScene,
    firstNewCard,
    type PostedCard,
    type ProbeActorSpec,
    setSceneEnvironment,
    snapChatCard,
    snapWindow,
    waitForNewCards,
} from './scene-probe';

/**
 * Tier B — the GM's Environmental Hazard tool (#118, #604), driven from the
 * scene controls the way the GM uses it:
 *
 *   1. Select tokens of two lines (DH2, RT) → the WH40K scene-control group's
 *      Hazard tool → a 6 m fall previews each subject's damage against its own
 *      line → Resolve posts one Falling card per subject → the card's Apply
 *      Damage button takes the wounds off the actor.
 *   2. Suffocation, strenuous: the allotment preview and the cards.
 *   3. A scene set to vacuum opens the tool on the Vacuum hazard (#604), and
 *      Resolve posts the vacuum card.
 */

const HAZARD_DIALOG = '.hazard-dialog';

const DH2_NAME = 'Hazard Probe Acolyte';
const RT_NAME = 'Hazard Probe Explorer';

/** A probe character of `type` with Toughness 30 (TB 3) and 12 of 12 wounds. */
function subject(name: string, type: string, gameSystem: string, x: number): ProbeActorSpec {
    return {
        name,
        type,
        system: { gameSystem, characteristics: { toughness: { base: 30, advance: 0, modifier: 0 } }, wounds: { max: 12, value: 12 } },
        x,
        y: 300,
    };
}

/** Open the Hazard tool from the WH40K scene-control group. */
async function openHazardTool(page: Page): Promise<Locator> {
    await page.locator('#scene-controls [data-control="wh40k"]').first().click();
    await page.locator('#scene-controls [data-tool="hazard"]').first().click();
    const dialog = page.locator(HAZARD_DIALOG).first();
    await expect(dialog).toBeVisible();
    return dialog;
}

/** The subject row of the hazard dialog for one actor. */
function subjectRow(dialog: Locator, name: string): Locator {
    return dialog.locator('li').filter({ hasText: name });
}

/** The posted card that names `name`. */
function cardFor(cards: readonly PostedCard[], name: string): PostedCard | undefined {
    return cards.find((c) => c.content.includes(name));
}

/** The actor's current wounds value. */
async function woundsOf(page: Page, actorId: string): Promise<number | null> {
    return page.evaluate((id: string) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global is injected by the licensed app; no shipped types
        const g = globalThis as unknown as { game: { actors: { get: (i: string) => { system: { wounds: { value: number } } } | undefined } } };
        return g.game.actors.get(id)?.system.wounds.value ?? null;
    }, actorId);
}

test.describe.serial('Environmental hazards (Tier B, #118)', () => {
    test.setTimeout(scaledMs(240_000));
    // A stuck click or fill fails with its locator instead of eating the whole test budget.
    test.use({ actionTimeout: scaledMs(15_000) });

    test('falling: per-line preview, one card per subject, Apply Damage takes the wounds', async ({ page }) => {
        await joinOrSkip(page);
        const probe = await createProbeScene(page, 'Hazard Probe — falling', [
            subject(DH2_NAME, 'dh2-character', 'dh2', 300),
            subject(RT_NAME, 'rt-character', 'rt', 500),
        ]);
        try {
            expect(probe.error, probe.error ?? '').toBeNull();
            await controlTokens(page, probe.tokenIds);
            const dialog = await openHazardTool(page);
            await expect(dialog.locator('select[name="kind"]')).toHaveValue('falling');
            await expect(subjectRow(dialog, DH2_NAME)).toBeVisible();
            await expect(subjectRow(dialog, RT_NAME)).toBeVisible();

            await dialog.locator('input[name="metres"]').fill('6');
            await dialog.locator('input[name="metres"]').press('Tab');
            await expect(subjectRow(dialog, DH2_NAME)).toContainText('1d10+6');
            await expect(dialog.locator('[data-action="resolve"]')).toBeEnabled();
            // The shared prompt footer keeps each button's label on one line ("Resolve Hazard" wrapped).
            const wrappedFooter = await dialog
                .locator('button[data-action="resolve"], button[data-action="cancel"]')
                .evaluateAll((buttons) => buttons.filter((b) => globalThis.wh40kE2E.textLines(b) > 1).map((b) => b.textContent.trim()));
            expect(wrappedFooter, 'footer button labels that wrap').toEqual([]);
            expect(await snapWindow(page, 'hazards-falling-dialog', dialog)).not.toBeNull();

            const before = await chatMessageIds(page);
            await dialog.locator('[data-action="resolve"]').click();
            const cards = await waitForNewCards(page, before, 2);
            await expect(page.locator(HAZARD_DIALOG)).toHaveCount(0);
            const dh2Card = cardFor(cards, DH2_NAME);
            expect(dh2Card, 'a Falling card for the DH2 subject').toBeDefined();
            expect(cardFor(cards, RT_NAME), 'a Falling card for the RT subject').toBeDefined();
            expect(dh2Card?.content ?? '').toContain('Falling Damage');
            expect(dh2Card?.content ?? '').toContain('roll-control__apply-damage');
            expect(await snapChatCard(page, 'hazards-falling-card', dh2Card?.id ?? '')).not.toBeNull();

            const actorId = probe.actorIds[0] ?? '';
            const woundsBefore = await woundsOf(page, actorId);
            const beforeApply = await chatMessageIds(page);
            const dh2CardSelector = await showChatMessage(page, dh2Card?.id ?? '');
            await page.locator(`${dh2CardSelector} .roll-control__apply-damage`).click();
            const applied = await firstNewCard(page, beforeApply);
            await expect.poll(async () => woundsOf(page, actorId)).not.toBe(woundsBefore);
            expect(await snapChatCard(page, 'hazards-falling-after-apply', applied.id)).not.toBeNull();
            recordCoverage('hazard.flow', 'falling-apply');
        } finally {
            await deleteProbeScene(page, probe);
        }
    });

    test('suffocation: strenuous allotment per line, one card per subject', async ({ page }) => {
        await joinOrSkip(page);
        const probe = await createProbeScene(page, 'Hazard Probe — suffocation', [
            subject(DH2_NAME, 'dh2-character', 'dh2', 300),
            subject(RT_NAME, 'rt-character', 'rt', 500),
        ]);
        try {
            expect(probe.error, probe.error ?? '').toBeNull();
            await controlTokens(page, probe.tokenIds);
            const dialog = await openHazardTool(page);
            await dialog.locator('select[name="kind"]').selectOption('suffocation');
            await expect(dialog.locator('input[name="metres"]')).toHaveCount(0);
            const relaxed = await subjectRow(dialog, DH2_NAME).innerText();
            await dialog.locator('input[name="strenuous"]').check();
            await expect(subjectRow(dialog, DH2_NAME)).not.toHaveText(relaxed);
            expect(await snapWindow(page, 'hazards-suffocation-dialog', dialog)).not.toBeNull();

            const before = await chatMessageIds(page);
            await dialog.locator('[data-action="resolve"]').click();
            const cards = await waitForNewCards(page, before, 2);
            const dh2Card = cardFor(cards, DH2_NAME);
            expect(dh2Card?.content ?? '').toContain('Suffocation');
            expect(cardFor(cards, RT_NAME)?.content ?? '').toContain('Suffocation');
            expect(await snapChatCard(page, 'hazards-suffocation-card', dh2Card?.id ?? '')).not.toBeNull();
            recordCoverage('hazard.flow', 'suffocation');
        } finally {
            await deleteProbeScene(page, probe);
        }
    });

    test('vacuum: a vacuum scene opens the tool on the Vacuum hazard, and Resolve posts the card', async ({ page }) => {
        await joinOrSkip(page);
        const probe = await createProbeScene(page, 'Hazard Probe — vacuum', [subject(DH2_NAME, 'dh2-character', 'dh2', 300)]);
        try {
            expect(probe.error, probe.error ?? '').toBeNull();
            await setSceneEnvironment(page, probe.sceneId, { gravity: 'zero', harshConditions: false, atmosphere: 'vacuum' });
            await controlTokens(page, probe.tokenIds);
            const dialog = await openHazardTool(page);
            await expect(dialog.locator('select[name="kind"]')).toHaveValue('vacuum');
            await expect(dialog.locator('select[name="exposure"]')).toHaveValue('sudden');
            await expect(dialog.locator('input[name="inSpace"]')).toBeChecked();
            await expect(subjectRow(dialog, DH2_NAME).locator('[data-wh40k-hook="hazard-vacuum-row"]')).toBeVisible();
            expect(await snapWindow(page, 'hazards-vacuum-dialog', dialog)).not.toBeNull();

            const before = await chatMessageIds(page);
            await dialog.locator('[data-action="resolve"]').click();
            const card = await firstNewCard(page, before);
            expect(card.content).toContain('Vacuum');
            expect(card.content).toContain(DH2_NAME);
            expect(await snapChatCard(page, 'hazards-vacuum-card', card.id)).not.toBeNull();
            recordCoverage('hazard.flow', 'vacuum-scene-default');
        } finally {
            await deleteProbeScene(page, probe);
        }
    });
});
