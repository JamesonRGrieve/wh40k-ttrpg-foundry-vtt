import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the Only War Comrade Healing panel + actions
 * (GitHub #157).
 *
 * Creates an `ow-character` actor in the seed world seeded with a
 * dead Comrade, mid-recovery clock, and refit available; opens its
 * sheet; asserts the panel renders with all three RAW affordances;
 * drives `owComradeTickDay` on a wounded variant and asserts the
 * clock advances; snapshots the rendered sheet.
 */

interface ActorRef {
    id: string;
}

async function createOwActor(page: import('@playwright/test').Page): Promise<ActorRef | { error: string }> {
    const result = await page.evaluate(async () => {
        const { Actor } = globalThis as unknown as {
            Actor?: { create?: (data: object) => Promise<{ id?: string } | null> };
        };
        if (!Actor?.create) return { id: null, error: 'Actor.create unavailable' };
        try {
            const actor = await Actor.create({
                name: 'probe-ow-comrade-healing-pc',
                type: 'ow-character',
                system: {
                    gameSystem: 'ow',
                    comrade: { name: 'Comrade Probe', state: 'wounded', distanceM: 3, hasVisualLine: true },
                    comradeRecoveryDays: 5,
                    refitAvailable: true,
                },
            });
            if (!actor) return { id: null, error: 'Actor.create returned null' };
            return { id: actor.id ?? null, error: null };
        } catch (err) {
            return { id: null, error: String((err as Error)?.message ?? err) };
        }
    });
    if (!result.id) return { error: result.error ?? 'unknown create error' };
    return { id: result.id };
}

async function deleteActor(page: import('@playwright/test').Page, actorId: string): Promise<void> {
    await page.evaluate(async (id: string) => {
        const { game } = globalThis as unknown as {
            game?: { actors?: { get?: (id: string) => { delete?: () => Promise<unknown> } | undefined } };
        };
        const actor = game?.actors?.get?.(id);
        await actor?.delete?.();
    }, actorId);
}

test.describe.serial('OW Comrade Healing panel (Tier B, #157)', () => {
    test('renders the panel, drives owComradeTickDay, asserts the clock ticks, snaps', async ({ page }) => {
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
                if (!actor) return { error: 'actor lookup failed' };
                let rendered = false;
                let hasPanel = false;
                let hasTickBtn = false;
                let hasMedicaeBtn = false;
                let hasReplaceBtn = false;
                let hasStatusBadge = false;
                let recoveryBefore: number | null = null;
                let recoveryAfter: number | null = null;
                let tickDispatched = false;
                let probeError: string | null = null;

                try {
                    recoveryBefore = actor.system?.comradeRecoveryDays ?? null;
                    const sheet = actor.sheet;
                    if (!sheet) return { error: 'actor.sheet is null' };
                    await sheet.render({ force: true });
                    await new Promise((r) => setTimeout(r, 120));
                    rendered = sheet.element instanceof HTMLElement;

                    if (rendered && sheet.element) {
                        const el: HTMLElement = sheet.element;
                        const panel = el.querySelector('.wh40k-ow-healing-panel');
                        hasPanel = panel !== null;
                        hasTickBtn = el.querySelector('button[data-action="owComradeTickDay"]') !== null;
                        hasMedicaeBtn = el.querySelector('button[data-action="owComradeMedicae"]') !== null;
                        hasReplaceBtn = el.querySelector('button[data-action="owComradeReplace2"]') !== null;
                        hasStatusBadge = el.querySelector('[data-recovery-status]') !== null;

                        const tickBtn = el.querySelector('button[data-action="owComradeTickDay"]') as HTMLButtonElement | null;
                        if (tickBtn && !tickBtn.disabled) {
                            tickBtn.click();
                            await new Promise((r) => setTimeout(r, 150));
                            tickDispatched = true;
                        }
                        recoveryAfter = actor.system?.comradeRecoveryDays ?? null;
                    }

                    g.__c157sheet = sheet;
                } catch (err) {
                    probeError = String((err as Error)?.message ?? err);
                }

                return {
                    rendered,
                    hasPanel,
                    hasTickBtn,
                    hasMedicaeBtn,
                    hasReplaceBtn,
                    hasStatusBadge,
                    recoveryBefore,
                    recoveryAfter,
                    tickDispatched,
                    error: probeError,
                };
                /* eslint-enable @typescript-eslint/no-explicit-any */
            }, actorId);

            await snap(page, 'ow-comrade-healing-panel');

            // Tear down so the open sheet doesn't leak into the next test's DOM.
            await page.evaluate(async () => {
                /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side cleanup */
                const g = globalThis as any;
                try {
                    await g.__c157sheet?.close?.();
                } catch {
                    /* ignore */
                }
                g.__c157sheet = undefined;
                /* eslint-enable @typescript-eslint/no-explicit-any */
            });

            expect(result.error, `panel probe error: ${result.error ?? ''}`).toBeNull();
            expect(result.rendered, 'sheet did not render').toBe(true);
            // Panel + buttons only render once the orchestrator wires the
            // include into tab-status.hbs; the probe asserts presence so
            // post-wire-up the spec exercises the full interaction.
            expect(result.hasPanel, 'comrade healing panel should render in OW sheet').toBe(true);
            expect(result.hasTickBtn, 'Tick Day button should render').toBe(true);
            expect(result.hasMedicaeBtn, 'Medicae Attempt button should render').toBe(true);
            expect(result.hasReplaceBtn, 'Replace at Camp button should render').toBe(true);
            expect(result.hasStatusBadge, 'recovery status badge should render').toBe(true);
            expect(result.recoveryBefore, 'initial recovery days should be 5').toBe(5);
            if (result.tickDispatched) {
                expect(result.recoveryAfter, 'recovery should tick 5 → 4 after one day').toBe(4);
            }
            expect(pageErrors, `page errors: ${pageErrors.slice(0, 5).join(' | ')}`).toEqual([]);

            recordCoverage('panel.render', 'OwComradeHealingPanel');
        } finally {
            page.off('pageerror', listener);
            await deleteActor(page, actorId);
        }
    });
});
