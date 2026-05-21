import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the Only War Comrade-in-Combat panel + actions
 * (GitHub #152).
 *
 * Creates an `ow-character` actor in the seed world, opens its sheet,
 * asserts the Comrade panel renders with the expected affordances,
 * drives one panel interaction by dispatching the registered
 * `owComradeWound` sheet action, asserts the actor's
 * `system.comrade.state` advanced unharmed → wounded, and snapshots
 * the rendered sheet.
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
                name: 'probe-ow-comrade-pc',
                type: 'ow-character',
                system: {
                    gameSystem: 'ow',
                    comrade: { name: 'Comrade Probe', state: 'unharmed', distanceM: 3, hasVisualLine: true },
                },
            });
            if (!actor) return { id: null, error: 'Actor.create returned null' };
            return { id: actor.id ?? null, error: null };
        } catch (err) {
            return { id: null, error: err instanceof Error ? err.message : String(err) };
        }
    });
    if (result.id === null) return { error: result.error ?? 'unknown create error' };
    return { id: result.id };
}

async function deleteActor(page: Page, actorId: string): Promise<void> {
    await page.evaluate(async (id: string) => {
        const { game: gameGlobal } = globalThis as unknown as {
            game?: { actors?: { get?: (id: string) => { delete?: () => Promise<unknown> } | undefined } };
        };
        const actor = gameGlobal?.actors?.get?.(id);
        await actor?.delete?.();
    }, actorId);
}

test.describe.serial('OW Comrade panel (Tier B, #152)', () => {
    test('renders the panel, drives owComradeWound, asserts the track advances, snaps', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const created = await createOwActor(page);
        if ('error' in created) {
            test.skip(true, `ow-character creation failed: ${created.error}`);
            return;
        }
        const actorId = created.id;

        const pageErrors: string[] = [];
        const listener = (err: Error): void => {
            pageErrors.push(err.message);
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
                let hasWoundBtn = false;
                let hasHealBtn = false;
                let hasReplaceBtn = false;
                let hasStateBadge = false;
                let stateBefore: string | null = null;
                let stateAfter: string | null = null;
                let woundDispatched = false;
                let probeError: string | null = null;

                try {
                    stateBefore = actor.system?.comrade?.state ?? null;
                    const sheet = actor.sheet;
                    if (sheet == null) return { error: 'actor.sheet is null' };
                    await sheet.render({ force: true });
                    await new Promise((r) => {
                        setTimeout(r, 120);
                    });
                    rendered = sheet.element instanceof HTMLElement;

                    if (rendered && sheet.element != null) {
                        const el: HTMLElement = sheet.element;
                        const panel = el.querySelector('.wh40k-ow-comrade-panel');
                        hasPanel = panel !== null;
                        hasWoundBtn = el.querySelector('button[data-action="owComradeWound"]') !== null;
                        hasHealBtn = el.querySelector('button[data-action="owComradeHeal"]') !== null;
                        hasReplaceBtn = el.querySelector('button[data-action="owComradeReplace"]') !== null;
                        hasStateBadge = el.querySelector('[data-state-badge]') !== null;

                        const woundBtn = el.querySelector<HTMLButtonElement>('button[data-action="owComradeWound"]');
                        if (woundBtn && !woundBtn.disabled) {
                            woundBtn.click();
                            await new Promise((r) => {
                                setTimeout(r, 150);
                            });
                            woundDispatched = true;
                        }
                        stateAfter = actor.system?.comrade?.state ?? null;
                    }

                    // Keep the sheet open so snap() (called outside this evaluate)
                    // captures the live DOM. Closing here would leave the
                    // screenshot empty.
                    g.__c152sheet = sheet;
                } catch (err) {
                    probeError = err instanceof Error ? err.message : String(err);
                }

                return {
                    rendered,
                    hasPanel,
                    hasWoundBtn,
                    hasHealBtn,
                    hasReplaceBtn,
                    hasStateBadge,
                    stateBefore,
                    stateAfter,
                    woundDispatched,
                    error: probeError,
                };
                /* eslint-enable @typescript-eslint/no-explicit-any */
            }, actorId);

            await snap(page, 'ow-comrade-panel');

            // Tear down so the open sheet doesn't leak into the next test's DOM.
            await page.evaluate(async () => {
                /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side cleanup */
                const g = globalThis as any;
                try {
                    await g.__c152sheet?.close?.();
                } catch {
                    /* ignore */
                }
                g.__c152sheet = undefined;
                /* eslint-enable @typescript-eslint/no-explicit-any */
            });

            expect(result.error, `panel probe error: ${result.error ?? ''}`).toBeNull();
            expect(result.rendered, 'sheet did not render').toBe(true);
            // Panel + buttons only render once the orchestrator wires the
            // include into tab-status.hbs; the probe asserts presence so
            // post-wire-up the spec exercises the full interaction. Until
            // then the panel-presence assertions surface the wiring gap.
            expect(result.hasPanel, 'comrade panel should render in OW sheet').toBe(true);
            expect(result.hasWoundBtn, 'Wound button should render').toBe(true);
            expect(result.hasHealBtn, 'Heal button should render').toBe(true);
            expect(result.hasReplaceBtn, 'Replace button should render').toBe(true);
            expect(result.hasStateBadge, 'State badge should render').toBe(true);
            expect(result.stateBefore, 'initial state should be unharmed').toBe('unharmed');
            if (result.woundDispatched === true) {
                expect(result.stateAfter, 'state should advance unharmed → wounded').toBe('wounded');
            }
            expect(pageErrors, `page errors: ${pageErrors.slice(0, 5).join(' | ')}`).toEqual([]);

            recordCoverage('panel.render', 'OwComradePanel');
        } finally {
            page.off('pageerror', listener);
            await deleteActor(page, actorId);
        }
    });
});
