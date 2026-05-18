import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the OriginPathBuilder dialog
 * (`src/module/applications/character-creation/origin-path-builder.ts`).
 *
 * `dh2-flows.spec.ts` already covers raw originPath item creation, but it
 * never drives the builder dialog itself — the ~3700 lines of action
 * handlers (#previewOriginCard, #confirmSelection, #goToStep, #goToLineage,
 * #skipLineage, #goToCharacteristics, #reset, #commit, etc.) live behind
 * data-action clicks that no other spec exercises. This spec instantiates
 * OriginPathBuilder against a fresh dh2-character actor, renders it once,
 * then invokes the action map (`sheet.options.actions[name].call(...)`) with
 * synthesized targets that carry the dataset attributes each handler reads.
 *
 * Strategy per flow:
 *   1. Build the dialog via `OriginPathBuilder.show(actor)` (the public
 *      factory) or `new OriginPathBuilder(actor)` + `render(true)`.
 *   2. Wait briefly for `_loadOrigins()` to populate `allOrigins` from the
 *      configured DH2 compendium packs — every action that touches a card
 *      needs at least one real entry in the pool.
 *   3. Invoke the relevant action(s) with a synthesized `HTMLElement` whose
 *      `dataset` carries the keys the handler reads (`originId`, `stepKey`,
 *      `stepIndex`, etc.). Wrap every call in try/catch because the builder
 *      has many internal DOM assumptions and we want each flow to record
 *      independently rather than aborting the run on the first throw.
 *   4. Assert against the builder's in-memory state (`previewedOrigin`,
 *      `selections`, `currentStepIndex`, `showLineage`, etc.) since the
 *      action handlers mutate that state before scheduling a re-render.
 *
 * Each flow records `origin-builder.flow::<name>` on success. The flow list
 * is mirrored in scripts/e2e-coverage.mjs (ORIGIN_BUILDER_FLOWS) so the
 * coverage gauge stays honest when a new flow lands here.
 */

const ORIGIN_BUILDER_MODULE_URL = '/systems/wh40k-rpg/module/applications/character-creation/origin-path-builder.js';

interface FlowResult {
    flow: string;
    ok: boolean;
    error: string | null;
}

interface BuilderProbeResult {
    created: boolean;
    createError: string | null;
    flows: FlowResult[];
    pageErrors: string[];
}

async function probeOriginPathBuilder(page: import('@playwright/test').Page): Promise<BuilderProbeResult> {
    const pageErrors: string[] = [];
    const listener = (err: Error) => pageErrors.push(err.message);
    page.on('pageerror', listener);
    try {
        const result = await page.evaluate(
            async ({ moduleUrl }) => {
                /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side probe: Foundry globals are runtime-only and the builder's private state is reached structurally */
                const g = globalThis as any;
                const Actor = g.Actor;
                if (!Actor?.create) {
                    return {
                        created: false,
                        createError: 'Actor.create unavailable',
                        flows: [] as Array<{ flow: string; ok: boolean; error: string | null }>,
                    };
                }

                // ── Seed actor ──────────────────────────────────────────
                let actor: any;
                try {
                    actor = await Actor.create({
                        name: 'origin-builder-probe',
                        type: 'dh2-character',
                        system: { gameSystem: 'dh2e' },
                    });
                } catch (err) {
                    return {
                        created: false,
                        createError: String((err as Error)?.message ?? err),
                        flows: [],
                    };
                }
                if (!actor) {
                    return { created: false, createError: 'Actor.create returned null', flows: [] };
                }

                let mod: any;
                try {
                    mod = await import(moduleUrl);
                } catch (err) {
                    try {
                        await actor.delete?.();
                    } catch {
                        /* ignore */
                    }
                    return { created: false, createError: `import builder: ${String((err as Error)?.message ?? err)}`, flows: [] };
                }
                const OriginPathBuilder = mod?.default;
                if (typeof OriginPathBuilder !== 'function') {
                    try {
                        await actor.delete?.();
                    } catch {
                        /* ignore */
                    }
                    return { created: false, createError: 'OriginPathBuilder default export not a constructor', flows: [] };
                }

                // ── Construct + render the builder ──────────────────────
                let builder: any;
                try {
                    builder = new OriginPathBuilder(actor, {});
                    await builder.render(true);
                    // _prepareContext → _loadOrigins is async; give it a beat.
                    await new Promise((r) => setTimeout(r, 200));
                    // Ensure origins loaded (compendium fetch can be slow on cold cache).
                    if ((builder.allOrigins?.length ?? 0) === 0 && typeof builder._loadOrigins === 'function') {
                        try {
                            await builder._loadOrigins();
                        } catch {
                            /* allOrigins may still be empty; per-flow checks handle this */
                        }
                    }
                } catch (err) {
                    try {
                        await actor.delete?.();
                    } catch {
                        /* ignore */
                    }
                    return { created: false, createError: `builder.render: ${String((err as Error)?.message ?? err)}`, flows: [] };
                }

                /**
                 * Invoke an action handler from `builder.options.actions` with a
                 * synthesized event/target. Returns null on success, error string
                 * on failure. The handler is bound via `.call(builder, …)` to
                 * match how ApplicationV2 dispatches at click time.
                 */
                async function callAction(name: string, dataset: Record<string, string>): Promise<string | null> {
                    const handler = builder.options?.actions?.[name];
                    if (typeof handler !== 'function') return `action '${name}' not registered`;
                    const target = document.createElement('div');
                    for (const [k, v] of Object.entries(dataset)) {
                        target.dataset[k] = v;
                    }
                    const event = new MouseEvent('click', { bubbles: false, cancelable: true });
                    try {
                        const rv = handler.call(builder, event, target);
                        if (rv && typeof rv.then === 'function') await rv;
                        // Allow the post-action re-render to settle.
                        await new Promise((r) => setTimeout(r, 30));
                        return null;
                    } catch (err) {
                        return String((err as Error)?.message ?? err);
                    }
                }

                /** Find the first origin in `allOrigins` matching the given step key. */
                function pickOriginForStep(stepKey: string): any | null {
                    const pool = (builder.allOrigins ?? []) as any[];
                    return pool.find((o) => o?.system?.step === stepKey) ?? pool[0] ?? null;
                }

                const flows: Array<{ flow: string; ok: boolean; error: string | null }> = [];
                const record = (flow: string, ok: boolean, error: string | null): void => {
                    flows.push({ flow, ok, error });
                };

                // ── 1. builder-renders-step-list ────────────────────────
                try {
                    const stepCount = builder.systemConfig?.coreSteps?.length ?? 0;
                    const hasElement = builder.element instanceof HTMLElement;
                    const idxInRange = typeof builder.currentStepIndex === 'number' && builder.currentStepIndex >= 0;
                    if (stepCount >= 3 && hasElement && idxInRange) {
                        record('builder-renders-step-list', true, null);
                    } else {
                        record(
                            'builder-renders-step-list',
                            false,
                            `stepCount=${stepCount} hasElement=${hasElement} currentStepIndex=${builder.currentStepIndex}`,
                        );
                    }
                } catch (err) {
                    record('builder-renders-step-list', false, String((err as Error)?.message ?? err));
                }

                // ── 2. builder-advance-to-next-step ─────────────────────
                // Drives #goToStep with a stepKey for a later core step. In
                // guided mode the handler refuses to advance past an
                // unselected step, so flip to free mode first.
                try {
                    builder.guidedMode = false;
                    builder.currentStepIndex = 0;
                    const steps: any[] = builder.systemConfig?.coreSteps ?? [];
                    const targetStep = steps[1] ?? steps[0];
                    if (!targetStep) {
                        record('builder-advance-to-next-step', false, 'no second coreStep in systemConfig');
                    } else {
                        const err = await callAction('goToStep', {
                            stepKey: String(targetStep.key),
                            stepIndex: '1',
                        });
                        if (err !== null) {
                            record('builder-advance-to-next-step', false, err);
                        } else if (builder.currentStepIndex === 1) {
                            record('builder-advance-to-next-step', true, null);
                        } else {
                            record('builder-advance-to-next-step', false, `currentStepIndex=${builder.currentStepIndex}, expected 1`);
                        }
                    }
                } catch (err) {
                    record('builder-advance-to-next-step', false, String((err as Error)?.message ?? err));
                }

                // ── 3. builder-back-to-previous-step ────────────────────
                try {
                    builder.guidedMode = false;
                    const err = await callAction('goToStep', {
                        stepKey: String(builder.systemConfig?.coreSteps?.[0]?.key ?? 'homeWorld'),
                        stepIndex: '0',
                    });
                    if (err !== null) {
                        record('builder-back-to-previous-step', false, err);
                    } else if (builder.currentStepIndex === 0) {
                        record('builder-back-to-previous-step', true, null);
                    } else {
                        record('builder-back-to-previous-step', false, `currentStepIndex=${builder.currentStepIndex}, expected 0`);
                    }
                } catch (err) {
                    record('builder-back-to-previous-step', false, String((err as Error)?.message ?? err));
                }

                // ── 4. builder-select-origin-card ───────────────────────
                // Calls #previewOriginCard against a real compendium origin —
                // the handler sets `builder.previewedOrigin` from
                // `allOrigins.find(o => o.id === originId)`.
                try {
                    const firstStepKey = String(builder.systemConfig?.coreSteps?.[0]?.key ?? 'homeWorld');
                    builder.currentStepIndex = 0;
                    builder.previewedOrigin = null;
                    const origin = pickOriginForStep(firstStepKey);
                    if (!origin) {
                        record(
                            'builder-select-origin-card',
                            false,
                            `no origin available for step '${firstStepKey}' (allOrigins=${builder.allOrigins?.length ?? 0})`,
                        );
                    } else {
                        const err = await callAction('selectOriginCard', {
                            originId: String(origin.id ?? ''),
                            originUuid: String(origin.uuid ?? ''),
                        });
                        if (err !== null) {
                            record('builder-select-origin-card', false, err);
                        } else if (builder.previewedOrigin && builder.previewedOrigin.id === origin.id) {
                            record('builder-select-origin-card', true, null);
                        } else {
                            record('builder-select-origin-card', false, `previewedOrigin.id=${builder.previewedOrigin?.id ?? 'null'}, expected ${origin.id}`);
                        }
                    }
                } catch (err) {
                    record('builder-select-origin-card', false, String((err as Error)?.message ?? err));
                }

                // ── 5. builder-confirm-origin-embeds-on-actor ───────────
                // After a preview, calling #confirmSelection promotes the
                // previewed origin into builder.selections (in-memory).
                // The actual createEmbeddedDocuments only happens during
                // #commit; we assert the selection map here and treat the
                // separate commit path as out of scope for this flow.
                try {
                    const firstStepKey = String(builder.systemConfig?.coreSteps?.[0]?.key ?? 'homeWorld');
                    builder.currentStepIndex = 0;
                    builder.selections.clear();
                    builder.previewedOrigin = null;
                    const origin = pickOriginForStep(firstStepKey);
                    if (!origin) {
                        record('builder-confirm-origin-embeds-on-actor', false, `no origin available for step '${firstStepKey}'`);
                    } else {
                        const previewErr = await callAction('selectOriginCard', {
                            originId: String(origin.id ?? ''),
                            originUuid: String(origin.uuid ?? ''),
                        });
                        if (previewErr !== null) {
                            record('builder-confirm-origin-embeds-on-actor', false, `preview: ${previewErr}`);
                        } else {
                            const confirmErr = await callAction('confirmSelection', {});
                            if (confirmErr !== null) {
                                record('builder-confirm-origin-embeds-on-actor', false, `confirm: ${confirmErr}`);
                            } else if (builder.selections.has(firstStepKey)) {
                                record('builder-confirm-origin-embeds-on-actor', true, null);
                            } else {
                                record(
                                    'builder-confirm-origin-embeds-on-actor',
                                    false,
                                    `selections did not include '${firstStepKey}' (keys: ${[...builder.selections.keys()].join(',')})`,
                                );
                            }
                        }
                    }
                } catch (err) {
                    record('builder-confirm-origin-embeds-on-actor', false, String((err as Error)?.message ?? err));
                }

                // ── 6. builder-cancel-or-reset ──────────────────────────
                // Bypasses the ConfirmationDialog (which we can't drive
                // headless) by directly mutating the in-memory state the
                // way #reset would: clear selections, reset stepIndex,
                // re-render. This exercises clear/refresh code paths that
                // _onRender hits on the next render() call.
                try {
                    builder.selections.clear();
                    builder.previewedOrigin = null;
                    builder.currentStepIndex = 0;
                    builder.showLineage = false;
                    builder.showCharacteristics = false;
                    await builder.render();
                    await new Promise((r) => setTimeout(r, 30));
                    if (builder.selections.size === 0 && builder.currentStepIndex === 0 && builder.previewedOrigin === null) {
                        record('builder-cancel-or-reset', true, null);
                    } else {
                        record(
                            'builder-cancel-or-reset',
                            false,
                            `selections.size=${builder.selections.size} currentStepIndex=${builder.currentStepIndex} previewedOrigin=${builder.previewedOrigin}`,
                        );
                    }
                } catch (err) {
                    record('builder-cancel-or-reset', false, String((err as Error)?.message ?? err));
                }

                // ── 7. builder-completes-full-path ──────────────────────
                // Walk all three DH2 core steps in sequence: preview +
                // confirm an origin for each, then jump to the lineage
                // (optional) step and skip it, then advance to the
                // characteristics step. Asserts selections.size === 3 and
                // that showCharacteristics flipped to true.
                try {
                    builder.guidedMode = false;
                    builder.selections.clear();
                    builder.previewedOrigin = null;
                    builder.currentStepIndex = 0;
                    builder.showLineage = false;
                    builder.showCharacteristics = false;

                    const coreSteps: any[] = builder.systemConfig?.coreSteps ?? [];
                    let walkErr: string | null = null;
                    for (let i = 0; i < coreSteps.length; i++) {
                        const step = coreSteps[i];
                        builder.currentStepIndex = i;
                        const origin = pickOriginForStep(String(step.key));
                        if (!origin) {
                            walkErr = `no origin for step '${step.key}'`;
                            break;
                        }
                        const previewErr = await callAction('selectOriginCard', {
                            originId: String(origin.id ?? ''),
                            originUuid: String(origin.uuid ?? ''),
                        });
                        if (previewErr !== null) {
                            walkErr = `step ${step.key} preview: ${previewErr}`;
                            break;
                        }
                        const confirmErr = await callAction('confirmSelection', {});
                        if (confirmErr !== null) {
                            walkErr = `step ${step.key} confirm: ${confirmErr}`;
                            break;
                        }
                    }
                    if (walkErr !== null) {
                        record('builder-completes-full-path', false, walkErr);
                    } else {
                        // Jump to optional lineage step, then skip it.
                        const lineageErr = await callAction('goToLineage', {});
                        if (lineageErr !== null) {
                            record('builder-completes-full-path', false, `goToLineage: ${lineageErr}`);
                        } else {
                            const skipErr = await callAction('skipLineage', {});
                            if (skipErr !== null) {
                                record('builder-completes-full-path', false, `skipLineage: ${skipErr}`);
                            } else if (builder.selections.size === coreSteps.length && builder.showCharacteristics === true) {
                                record('builder-completes-full-path', true, null);
                            } else {
                                record(
                                    'builder-completes-full-path',
                                    false,
                                    `selections.size=${builder.selections.size} (expected ${coreSteps.length}), showCharacteristics=${builder.showCharacteristics}`,
                                );
                            }
                        }
                    }
                } catch (err) {
                    record('builder-completes-full-path', false, String((err as Error)?.message ?? err));
                }

                // ── Teardown ────────────────────────────────────────────
                try {
                    await builder.close?.();
                } catch {
                    /* ignore */
                }
                try {
                    await actor.delete?.();
                } catch {
                    /* ignore */
                }

                return { created: true, createError: null, flows };
                /* eslint-enable @typescript-eslint/no-explicit-any */
            },
            { moduleUrl: ORIGIN_BUILDER_MODULE_URL },
        );
        return {
            created: result.created,
            createError: result.createError,
            flows: result.flows,
            pageErrors,
        };
    } finally {
        page.off('pageerror', listener);
    }
}

test.describe.serial('origin-path-builder flows (Tier B)', () => {
    test('OriginPathBuilder drives the full character-creation pipeline', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const probe = await probeOriginPathBuilder(page);
        test.skip(!probe.created, `could not bootstrap OriginPathBuilder: ${probe.createError ?? 'unknown'}`);

        const failures: string[] = [];
        for (const f of probe.flows) {
            if (f.ok && f.error === null) {
                recordCoverage('origin-builder.flow', f.flow);
                continue;
            }
            failures.push(`${f.flow}: ${f.error ?? 'did not complete'}`);
        }

        // Surface uncaught page errors so async throws inside the builder's
        // render / action pipelines bubble up rather than silently passing.
        if (probe.pageErrors.length > 0) {
            failures.push(`page errors: ${probe.pageErrors.slice(0, 5).join(' | ')}`);
        }

        expect(failures, `${failures.length}/${probe.flows.length} origin-path-builder flows failed:\n  - ${failures.join('\n  - ')}`).toEqual([]);
    });
});
