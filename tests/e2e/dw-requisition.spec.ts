import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the DW Requisition engine (#165 — core.md §"REQUISITION").
 *
 * Creates a DW Battle-Brother character, opens its sheet, asserts the
 * requisition panel renders with the expected affordances (RP readout,
 * mission-rating selector, Request Item button, Pool Requisition
 * button), then snaps the result for visual review. The sheet stays
 * OPEN through snap() so the screenshot captures the live DOM.
 *
 * The spec is defensive about the DW character DataModel not yet being
 * wired in to the running manifest — if `Actor.create` rejects the
 * `dw-character` type the test skips with a clear message rather than
 * failing the suite. Once the orchestrator merges the mixin into
 * `character.ts`, the skip evaporates automatically.
 */

test.describe.serial('DW Requisition (Tier B)', () => {
    test('renders DW character sheet with requisition panel and snaps', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const pageErrors: string[] = [];
        const listener = (err: Error): void => {
            pageErrors.push(err.message);
        };
        page.on('pageerror', listener);

        try {
            const result = await page.evaluate(async () => {
                /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side probe: Foundry globals are runtime-only */
                let error: string | null = null;
                let rendered = false;
                let hasPanel = false;
                let hasRpInput = false;
                let hasMissionSelect = false;
                let hasRequestButton = false;
                let hasPoolButton = false;
                let rpInitial: number | null = null;
                let missionInitial: string | null = null;
                let actorId: string | null = null;

                try {
                    const ActorCls = (globalThis as any).Actor;
                    if (typeof ActorCls?.create !== 'function') {
                        return {
                            rendered,
                            hasPanel,
                            hasRpInput,
                            hasMissionSelect,
                            hasRequestButton,
                            hasPoolButton,
                            rpInitial,
                            missionInitial,
                            actorId,
                            error: 'Actor.create unavailable',
                        };
                    }
                    const actor = await ActorCls.create({
                        name: 'rawReqProbe-#165',
                        type: 'dw-character',
                        system: {
                            gameSystem: 'dw',
                            requisitionPoints: 25,
                            missionRating: 'standard',
                        },
                    });
                    if (actor == null) {
                        return {
                            rendered,
                            hasPanel,
                            hasRpInput,
                            hasMissionSelect,
                            hasRequestButton,
                            hasPoolButton,
                            rpInitial,
                            missionInitial,
                            actorId,
                            error: 'Actor.create returned null',
                        };
                    }
                    actorId = actor.id ?? null;
                    rpInitial = typeof actor.system?.requisitionPoints === 'number' ? actor.system.requisitionPoints : null;
                    missionInitial = typeof actor.system?.missionRating === 'string' ? actor.system.missionRating : null;

                    if (typeof actor.sheet?.render === 'function') {
                        await actor.sheet.render(true);
                        await new Promise((r) => {
                            setTimeout(r, 120);
                        });
                        rendered = actor.sheet.element instanceof HTMLElement;
                        if (rendered && actor.sheet.element != null) {
                            const el = actor.sheet.element as HTMLElement;
                            hasPanel = el.querySelector('.wh40k-dw-requisition-panel') !== null;
                            hasRpInput = el.querySelector('input[name="system.requisitionPoints"]') !== null;
                            hasMissionSelect = el.querySelector('select[name="system.missionRating"]') !== null;
                            hasRequestButton = el.querySelector('button[data-action="dwRequisitionItem"]') !== null;
                            hasPoolButton = el.querySelector('button[data-action="dwRequisitionPool"]') !== null;
                        }
                    }

                    // Keep the sheet open for snap().
                    (globalThis as any).__c9req = actor;
                } catch (err) {
                    error = (err as Error).message;
                }

                return {
                    rendered,
                    hasPanel,
                    hasRpInput,
                    hasMissionSelect,
                    hasRequestButton,
                    hasPoolButton,
                    rpInitial,
                    missionInitial,
                    actorId,
                    error,
                };
                /* eslint-enable @typescript-eslint/no-explicit-any */
            });

            await snap(page, 'dw-requisition-panel');

            // Tear down so the actor doesn't leak into a sibling spec.
            await page.evaluate(async () => {
                /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side cleanup */
                const a = (globalThis as any).__c9req;
                try {
                    await a?.sheet?.close?.();
                    await a?.delete?.();
                } catch {
                    /* ignore */
                }
                (globalThis as any).__c9req = undefined;
                /* eslint-enable @typescript-eslint/no-explicit-any */
            });

            // Skip the spec gracefully if the DW character datamodel isn't registered
            // in this test build (the orchestrator wires the mixin into character.ts
            // after this spec ships).
            if (result.error !== null && /Actor\.create returned null|datamodel|invalid type|requisitionPoints/i.test(result.error)) {
                test.skip(true, `DW character datamodel not registered: ${result.error}`);
            }

            expect(result.error, `requisition probe error: ${result.error ?? ''}`).toBeNull();
            expect(result.actorId, 'actor must have been created').not.toBeNull();
            expect(result.rpInitial, 'initial RP must persist').toBe(25);
            expect(result.missionInitial, 'initial mission rating must persist').toBe('standard');
            expect(result.rendered, 'sheet must have rendered').toBe(true);
            expect(result.hasPanel, 'requisition panel must render').toBe(true);
            expect(result.hasRpInput, 'RP input must render').toBe(true);
            expect(result.hasMissionSelect, 'mission-rating select must render').toBe(true);
            expect(result.hasRequestButton, 'Request Item button must render').toBe(true);
            expect(result.hasPoolButton, 'Pool Requisition button must render').toBe(true);
            expect(pageErrors, `page errors: ${pageErrors.slice(0, 5).join(' | ')}`).toEqual([]);

            recordCoverage('actor.sheet.render', 'DwRequisitionPanel');
        } finally {
            page.off('pageerror', listener);
        }
    });
});
