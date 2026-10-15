import type { Page } from '@playwright/test';
import { createActor, deleteDocuments, openActorSheet } from './combat-resolution-flow';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B for the Only War "Healing Comrades" panel (#157 — OW Core p.271).
 *
 * The sheet built only part of the panel's context, so the panel read
 * "Auto-recovery: undefined days". Wounding the Comrade never started the
 * recovery clock, a finished clock never returned the Comrade to unharmed,
 * the one-Medicae-per-wound cap was not kept, and nothing on the sheet could
 * mark the squad back in camp. This walks the whole cycle through the
 * sheet's own buttons, clicked the way a player clicks them:
 *   Wound → 7-day clock → Tick Day → Medicae (3 DoS) → ticks to 0 → unharmed;
 *   Wound ×2 → dead → camp refit on → Replace → unharmed, refit used up.
 */

const DIALOG = 'dialog.application[open]';
const HEALING = '.wh40k-ow-healing-panel';
const COMRADE = '[data-wh40k-hook="ow-comrade-panel"]';

/** The actor's persisted Comrade-healing state. */
interface HealingState {
    state: string;
    days: number;
    refit: boolean;
    medicaeUsed: boolean;
}

async function healingState(page: Page, actorId: string): Promise<HealingState> {
    return page.evaluate((id) => {
        interface System {
            comrade: { state: string };
            comradeRecoveryDays: number;
            refitAvailable: boolean;
            comradeMedicaeUsed: boolean;
        }
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global has no browser-side types
        const g = globalThis as unknown as { game: { actors: { get: (i: string) => { system: System } | undefined } } };
        const sys = g.game.actors.get(id)?.system;
        if (sys === undefined) throw new Error('actor not found');
        return { state: sys.comrade.state, days: sys.comradeRecoveryDays, refit: sys.refitAvailable, medicaeUsed: sys.comradeMedicaeUsed };
    }, actorId);
}

/** What the healing panel shows. */
interface PanelReading {
    status: string | null;
    clockText: string;
    hasUndefined: boolean;
    /** Enabled state of Tick Day / Medicae / Replace, in that order. */
    enabled: boolean[];
}

async function readPanel(page: Page, sheetId: string): Promise<PanelReading> {
    return page.evaluate(
        ({ sheet, panelSel }) => {
            const panel = document.querySelector<HTMLElement>(`#${sheet} ${panelSel}`);
            if (panel === null) return { status: null, clockText: '', hasUndefined: true, enabled: [] };
            return {
                status: panel.querySelector<HTMLElement>('[data-recovery-status]')?.dataset['recoveryStatus'] ?? null,
                clockText: (panel.querySelector('[data-field="recovery-days"]')?.textContent ?? '').replace(/\s+/g, ' ').trim(),
                hasUndefined: panel.textContent.includes('undefined'),
                enabled: ['owComradeTickDay', 'owComradeMedicae', 'owComradeReplace2'].map(
                    (action) => panel.querySelector<HTMLButtonElement>(`button[data-action="${action}"]`)?.disabled === false,
                ),
            };
        },
        { sheet: sheetId, panelSel: HEALING },
    );
}

test.describe.serial('OW Comrade Healing panel (Tier B, #157)', () => {
    test('walks the recovery clock, the Medicae attempt and the camp replacement through the panel', async ({ page }) => {
        await joinOrSkip(page);
        const actor = await createActor(page, {
            data: {
                name: 'e2e-157 Guardsman',
                type: 'ow-character',
                system: { gameSystem: 'ow', comrade: { name: 'Comrade Probe', state: 'unharmed', distanceM: 3, hasVisualLine: true } },
            },
        });
        try {
            const sheetId = await openActorSheet(page, actor.id, 'overview');
            const healing = page.locator(`#${sheetId} ${HEALING}`);
            const comrade = page.locator(`#${sheetId} ${COMRADE}`);
            const click = async (panel: typeof healing, action: string): Promise<void> => {
                await panel.locator(`button[data-action="${action}"]`).click();
            };
            const settled = async (expected: Partial<HealingState>): Promise<void> => {
                await expect.poll(async () => healingState(page, actor.id)).toMatchObject(expected);
                await expect.poll(async () => (await readPanel(page, sheetId)).status).not.toBeNull();
            };

            await healing.scrollIntoViewIfNeeded();
            const ready = await readPanel(page, sheetId);
            await snap(page, 'ow-comrade-healing-ready', { selector: `#${sheetId} ${HEALING}` });
            expect(ready.hasUndefined, 'no panel value may render as "undefined"').toBe(false);
            expect(ready.clockText).toContain('Auto-recovery: 7 days');
            expect(ready).toMatchObject({ status: 'ready', enabled: [false, false, false] });

            // A wound starts the seven-day clock with its one Medicae attempt.
            await click(comrade, 'owComradeWound');
            await settled({ state: 'wounded', days: 7, medicaeUsed: false });
            await expect.poll(async () => readPanel(page, sheetId)).toMatchObject({ status: 'recovering', enabled: [true, true, false] });
            await snap(page, 'ow-comrade-healing-wounded', { selector: `#${sheetId} ${HEALING}` });
            expect((await readPanel(page, sheetId)).clockText).toContain('7 days until recovery');

            await click(healing, 'owComradeTickDay');
            await settled({ state: 'wounded', days: 6 });

            // The Medicae Test's Degrees of Success come off the clock, once.
            await click(healing, 'owComradeMedicae');
            const dialog = page.locator(DIALOG).last();
            await expect(dialog).toBeVisible();
            await dialog.locator('input[name="degreesOfSuccess"]').fill('3');
            await dialog.locator('button[data-action="ok"]').click();
            await settled({ state: 'wounded', days: 3, medicaeUsed: true });
            await expect.poll(async () => (await readPanel(page, sheetId)).enabled).toEqual([true, false, false]);
            await snap(page, 'ow-comrade-healing-after-medicae', { selector: `#${sheetId} ${HEALING}` });

            // The day the clock runs out, the Comrade is back on their feet.
            for (const days of [2, 1]) {
                await click(healing, 'owComradeTickDay');
                await settled({ days });
            }
            await click(healing, 'owComradeTickDay');
            await settled({ state: 'unharmed', days: 0 });
            await expect.poll(async () => (await readPanel(page, sheetId)).status).toBe('ready');

            // Killed, then replaced once the squad is back in camp.
            await click(comrade, 'owComradeWound');
            await settled({ state: 'wounded', days: 7 });
            await click(comrade, 'owComradeWound');
            await settled({ state: 'dead', days: 0 });
            await expect.poll(async () => readPanel(page, sheetId)).toMatchObject({ status: 'dead', enabled: [false, false, false] });
            await click(healing, 'owComradeToggleRefit');
            await settled({ refit: true });
            await expect.poll(async () => (await readPanel(page, sheetId)).enabled).toEqual([false, false, true]);
            await snap(page, 'ow-comrade-healing-dead-in-camp', { selector: `#${sheetId} ${HEALING}` });

            await click(healing, 'owComradeReplace2');
            await settled({ state: 'unharmed', days: 0, refit: false });
            await expect.poll(async () => (await readPanel(page, sheetId)).status).toBe('ready');
            await snap(page, 'ow-comrade-healing-replaced', { selector: `#${sheetId} ${HEALING}` });
            expect((await readPanel(page, sheetId)).hasUndefined).toBe(false);

            recordCoverage('panel.render', 'OwComradeHealingPanel');
        } finally {
            await deleteDocuments(page, { actors: [actor.id] });
        }
    });
});
