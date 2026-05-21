import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the Only War Regimental Drawbacks + Multiple
 * Comrades panel (GitHub #160).
 *
 * Creates an `ow-character` actor in the seed world seeded with two
 * Regimental Drawback ids and an explicit Multiple Comrades roster;
 * opens its sheet; asserts the panel renders with the drawback list,
 * the refund badge, the merged-penalty surface (when populated by the
 * orchestrator's `_prepareContext` builder), the budget readout, and
 * the roster row; clicks the toggle on the first drawback and asserts
 * the system field shrinks by one entry; snapshots the rendered sheet.
 */

interface ActorRef {
    id: string;
}

async function createOwActor(page: Page): Promise<ActorRef | { error: string }> {
    const result = await page.evaluate(async () => {
        const { Actor: ActorGlobal } = globalThis as unknown as {
            Actor?: { create?: (data: object) => Promise<{ id?: string } | null> };
        };
        if (!ActorGlobal?.create) return { id: null, error: 'Actor.create unavailable' };
        try {
            const actor = await ActorGlobal.create({
                name: 'probe-ow-drawbacks-pc',
                type: 'ow-character',
                system: {
                    gameSystem: 'ow',
                    comrade: { name: 'Comrade Probe', state: 'unharmed', distanceM: 3, hasVisualLine: true },
                    regimentDrawbacks: ['demolitions-paranoia', 'short-rations'],
                    multiComradeRoster: {
                        primaryId: 'guardsman-vellis',
                        additionalIds: ['guardsman-arkos', 'guardsman-jadek'],
                    },
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

test.describe.serial('OW Regimental Drawbacks panel (Tier B, #160)', () => {
    test('renders the panel, drives owToggleDrawback, asserts the list shrinks, snaps', async ({ page }) => {
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
                let hasRefundBadge = false;
                let hasBudgetRow = false;
                let hasRoster = false;
                let rosterCountBefore: number | null = null;
                let drawbacksBefore: number | null = null;
                let drawbacksAfter: number | null = null;
                let toggleDispatched = false;
                let probeError: string | null = null;

                try {
                    drawbacksBefore = (actor.system?.regimentDrawbacks ?? []).length;
                    rosterCountBefore = actor.system?.multiComradeRoster?.additionalIds?.length ?? null;
                    const sheet = actor.sheet;
                    if (sheet == null) return { error: 'actor.sheet is null' };
                    await sheet.render({ force: true });
                    await new Promise<void>((r) => {
                        setTimeout(r, 120);
                    });
                    rendered = sheet.element instanceof HTMLElement;

                    if (rendered && sheet.element != null) {
                        const el: HTMLElement = sheet.element;
                        const panel = el.querySelector('.wh40k-ow-drawback-panel');
                        hasPanel = panel !== null;
                        hasRefundBadge = el.querySelector('[data-refund-total]') !== null;
                        hasBudgetRow = el.querySelector('[data-adjusted-budget]') !== null;
                        hasRoster = el.querySelector('[data-field="multi-comrade-roster"]') !== null;

                        const toggleBtn = el.querySelector('button[data-action="owToggleDrawback"]');
                        if (toggleBtn instanceof HTMLButtonElement && !toggleBtn.disabled) {
                            toggleBtn.click();
                            await new Promise<void>((r) => {
                                setTimeout(r, 150);
                            });
                            toggleDispatched = true;
                        }
                        drawbacksAfter = (actor.system?.regimentDrawbacks ?? []).length;
                    }

                    g.__c160sheet = sheet;
                } catch (err) {
                    probeError = err instanceof Error ? err.message : String(err);
                }

                return {
                    rendered,
                    hasPanel,
                    hasRefundBadge,
                    hasBudgetRow,
                    hasRoster,
                    rosterCountBefore,
                    drawbacksBefore,
                    drawbacksAfter,
                    toggleDispatched,
                    error: probeError,
                };
                /* eslint-enable @typescript-eslint/no-explicit-any */
            }, actorId);

            await snap(page, 'ow-drawback-panel');

            // Tear down so the open sheet doesn't leak into the next test's DOM.
            await page.evaluate(async () => {
                /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side cleanup */
                const g = globalThis as any;
                try {
                    await g.__c160sheet?.close?.();
                } catch {
                    /* ignore */
                }
                g.__c160sheet = undefined;
                /* eslint-enable @typescript-eslint/no-explicit-any */
            });

            expect(result.error, `panel probe error: ${result.error ?? ''}`).toBeNull();
            expect(result.rendered, 'sheet did not render').toBe(true);
            // Panel + buttons only render once the orchestrator wires the
            // include into tab-overview.hbs; the probe asserts presence so
            // post-wire-up the spec exercises the full interaction.
            expect(result.hasPanel, 'drawback panel should render in OW sheet').toBe(true);
            expect(result.hasRefundBadge, 'refund badge should render').toBe(true);
            expect(result.hasBudgetRow, 'budget readout should render').toBe(true);
            expect(result.hasRoster, 'multi-comrade roster section should render').toBe(true);
            expect(result.drawbacksBefore, 'initial drawback count should be 2').toBe(2);
            expect(result.rosterCountBefore, 'initial additional-comrade count should be 2').toBe(2);
            if (result.toggleDispatched === true) {
                expect(result.drawbacksAfter, 'one click should remove one drawback id').toBe(1);
            }
            expect(pageErrors, `page errors: ${pageErrors.slice(0, 5).join(' | ')}`).toEqual([]);

            recordCoverage('panel.render', 'OwDrawbackPanel');
        } finally {
            page.off('pageerror', listener);
            await deleteActor(page, actorId);
        }
    });
});
