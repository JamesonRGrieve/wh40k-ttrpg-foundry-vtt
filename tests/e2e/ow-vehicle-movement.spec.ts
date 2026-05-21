import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the Only War Vehicle Movement panel + action
 * (#156 — core.md §"VEHICLE MOVEMENT", p.12305).
 *
 * Creates an `ow-character` actor in the seed world (with a primed
 * `chaseState` so the chase readout exercises the populated branch),
 * opens its sheet, asserts the Vehicle Movement panel renders with
 * all five action rows (Evasive Manoeuvring / Floor It! / Hit & Run /
 * Jink / Tactical Manoeuvring), drives one Issue click for the
 * Evasive Manoeuvring row, asserts the action dispatch did not
 * throw, and snapshots the rendered sheet.
 *
 * Panel visibility depends on the orchestrator wiring the include
 * into `tab-status.hbs` gated on `isOW` and the schema fields onto
 * CharacterData. Pre-wire-up the presence assertions surface the
 * wiring gap; post-wire-up the spec exercises the full interaction.
 */

interface ActorRef {
    id: string;
}

async function createOwActor(page: Page): Promise<ActorRef | { error: string }> {
    const result = await page.evaluate(async () => {
        const { Actor: ActorCls } = globalThis as unknown as {
            Actor?: { create?: (data: object) => Promise<{ id?: string } | null> };
        };
        if (!ActorCls?.create) return { id: null, error: 'Actor.create unavailable' };
        try {
            const actor = await ActorCls.create({
                name: 'probe-ow-vehicle-movement-pc',
                type: 'ow-character',
                system: {
                    gameSystem: 'ow',
                    chaseState: {
                        pursuerDistance: 120,
                        dangerZone: false,
                        turnCount: 2,
                    },
                },
            });
            if (!actor) return { id: null, error: 'Actor.create returned null' };
            return { id: actor.id ?? null, error: null };
        } catch (createErr) {
            return { id: null, error: String((createErr as Error).message) };
        }
    });
    if (result.id == null) return { error: result.error ?? 'unknown create error' };
    return { id: result.id };
}

async function deleteActor(page: Page, actorId: string): Promise<void> {
    await page.evaluate(async (id: string) => {
        const { game: gameRef } = globalThis as unknown as {
            game?: { actors?: { get?: (id: string) => { delete?: () => Promise<unknown> } | undefined } };
        };
        const actor = gameRef?.actors?.get?.(id);
        await actor?.delete?.();
    }, actorId);
}

test.describe.serial('OW Vehicle Movement panel (Tier B, #156)', () => {
    test('renders the panel, drives owVehicleAction, asserts chase readout, snaps', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const created = await createOwActor(page);
        if ('error' in created) {
            test.skip(true, `ow-character creation failed: ${created.error}`);
            return;
        }
        const actorId = created.id;

        const pageErrors: string[] = [];
        const listener = (pageErr: Error): void => {
            pageErrors.push(pageErr.message);
        };
        page.on('pageerror', listener);

        try {
            const result = await page.evaluate(async (id: string) => {
                /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side probe: Foundry globals are runtime-only */
                const g = globalThis as any;
                const actor = g.game?.actors?.get?.(id);
                if (actor == null) return { error: 'actor lookup failed' };

                let rendered = false;
                let hasPanel = false;
                let hasEvasiveRow = false;
                let hasFloorItRow = false;
                let hasHitAndRunRow = false;
                let hasJinkRow = false;
                let hasTacticalRow = false;
                let hasIssueButton = false;
                let hasChaseReadout = false;
                let issueDispatched = false;
                let probeError: string | null = null;

                try {
                    const sheet = actor.sheet;
                    if (sheet == null) return { error: 'actor.sheet is null' };
                    await sheet.render({ force: true });
                    await new Promise<void>((r) => {
                        setTimeout(r, 120);
                    });
                    rendered = sheet.element instanceof HTMLElement;

                    if (rendered && sheet.element != null) {
                        const el: HTMLElement = sheet.element;
                        const panel = el.querySelector('.wh40k-ow-vehicle-movement-panel');
                        hasPanel = panel !== null;
                        hasEvasiveRow = el.querySelector('[data-action-id="evasive-manoeuvring"]') !== null;
                        hasFloorItRow = el.querySelector('[data-action-id="floor-it"]') !== null;
                        hasHitAndRunRow = el.querySelector('[data-action-id="hit-and-run"]') !== null;
                        hasJinkRow = el.querySelector('[data-action-id="jink"]') !== null;
                        hasTacticalRow = el.querySelector('[data-action-id="tactical-manoeuvring"]') !== null;
                        hasChaseReadout = el.querySelector('.wh40k-ow-vehicle-movement-chase-readout') !== null;
                        const issueBtn = el.querySelector<HTMLButtonElement>('button[data-action="owVehicleAction"][data-action-id="evasive-manoeuvring"]');
                        hasIssueButton = issueBtn !== null;

                        if (issueBtn !== null && !issueBtn.disabled) {
                            issueBtn.click();
                            await new Promise<void>((r) => {
                                setTimeout(r, 200);
                            });
                            issueDispatched = true;
                        }
                    }

                    // Keep the sheet open so snap() (outside this evaluate)
                    // captures the live DOM.
                    g.__c156sheet = sheet;
                } catch (probeErr) {
                    probeError = String((probeErr as Error).message);
                }

                return {
                    rendered,
                    hasPanel,
                    hasEvasiveRow,
                    hasFloorItRow,
                    hasHitAndRunRow,
                    hasJinkRow,
                    hasTacticalRow,
                    hasIssueButton,
                    hasChaseReadout,
                    issueDispatched,
                    error: probeError,
                };
                /* eslint-enable @typescript-eslint/no-explicit-any */
            }, actorId);

            await snap(page, 'ow-vehicle-movement-panel');

            await page.evaluate(async () => {
                /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side cleanup */
                const g = globalThis as any;
                try {
                    await g.__c156sheet?.close?.();
                } catch {
                    /* ignore */
                }
                g.__c156sheet = undefined;
                /* eslint-enable @typescript-eslint/no-explicit-any */
            });

            expect(result.error, `panel probe error: ${result.error ?? ''}`).toBeNull();
            expect(result.rendered, 'sheet did not render').toBe(true);
            expect(result.hasPanel, 'OW Vehicle Movement panel should render in OW sheet').toBe(true);
            expect(result.hasEvasiveRow, 'Evasive Manoeuvring row should render').toBe(true);
            expect(result.hasFloorItRow, 'Floor It! row should render').toBe(true);
            expect(result.hasHitAndRunRow, 'Hit & Run row should render').toBe(true);
            expect(result.hasJinkRow, 'Jink row should render').toBe(true);
            expect(result.hasTacticalRow, 'Tactical Manoeuvring row should render').toBe(true);
            expect(result.hasIssueButton, 'Issue button for Evasive Manoeuvring should render').toBe(true);
            expect(result.hasChaseReadout, 'Chase readout should render when chaseState is non-null').toBe(true);
            expect(pageErrors, `page errors: ${pageErrors.slice(0, 5).join(' | ')}`).toEqual([]);

            recordCoverage('panel.render', 'OwVehicleMovementPanel');
        } finally {
            page.off('pageerror', listener);
            await deleteActor(page, actorId);
        }
    });
});
