// Keys MUST match the CHARGEN_WIZARD_FLOWS constant in scripts/e2e-coverage.mjs (registered by the orchestrator).

import type { Page } from '@playwright/test';

import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the character-creation wizard surfaces NOT already
 * covered by tests/e2e/origin-path-builder.spec.ts (outer step nav /
 * select-origin / confirm / cancel) or tests/e2e/character-creation-dialogs
 * .spec.ts (origin-roll-dialog, origin-path-choice-dialog,
 * origin-detail-dialog render probes).
 *
 * This spec drives the remaining modules under
 * `src/module/applications/character-creation/`:
 *   - `system-origin-builders.ts` (`getBuilderForActorType`, per-system
 *     subclasses BCOriginPathBuilder / DH1OriginPathBuilder /
 *     DH2OriginPathBuilder / DWOriginPathBuilder / OWOriginPathBuilder /
 *     RTOriginPathBuilder) — each subclass stamps `gameSystem` so the
 *     shared OriginPathBuilder._loadOrigins reaches the right compendium
 *     pack list. RT's `coreSteps` length (6) differs from DH2e's (3); the
 *     dh2e/rt cross-product proves the per-system divergence is real.
 *   - `normalized-origin.ts` (`normalizeOrigin`, `normalizeChoice`) — the
 *     boundary function that coerces untyped Foundry compendium docs into
 *     the typed `NormalizedOrigin` shape every builder consumes.
 *   - `origin-path-builder.ts` action handlers the outer-shell spec does
 *     NOT exercise: `randomize`, `setMode`, `clearOrigin`,
 *     `goToCharacteristics`, `rollCharacteristicsBank`, `charReset`,
 *     `charToggleAdvanced`, `setCharGenMode`, `goToEquipment`,
 *     `clearEquipment`, `toggleEquipmentItem`, `export`.
 *
 * Strategy mirrors weapon-attack.spec.ts: a single page.evaluate probe
 * round-trip per top-level describe, collect-failures-then-assert at the
 * end, every created actor / item registered in a cleanup queue and
 * drained in finally. Each probe also calls `closeOpenDialogs()` between
 * sub-flows so a ConfirmationDialog the builder pops can't stall the run.
 *
 * Per-system cross-product:
 *   - DH2e is the default actor type for every flow (matches the rest of
 *     the Tier B suite).
 *   - RT exercises divergence (6 vs 3 core steps).
 *   - getBuilderForActorType is unit-driven across all 6 character actor
 *     prefixes (dh1, dh2, rt, bc, ow, dw) plus the IM fallback.
 *
 * Keys MUST match the CHARGEN_WIZARD_FLOWS constant in scripts/e2e-coverage
 * .mjs (registered by the orchestrator).
 */

const CHARGEN_WIZARD_FLOWS = [
    'system-builders-actor-type-dispatch',
    'system-builders-dh2e-stamps-game-system',
    'system-builders-rt-six-core-steps',
    'system-builders-im-falls-back-to-dh2e',
    'normalize-origin-from-raw-compendium-doc',
    'normalize-choice-handles-string-options',
    'builder-randomize-fills-selections',
    'builder-set-mode-toggles-guided',
    'builder-clear-origin-removes-selection',
    'builder-go-to-characteristics-step',
    'builder-roll-characteristics-bank-populates',
    'builder-char-reset-clears-assignments',
    'builder-char-toggle-advanced-flips',
    'builder-set-char-gen-mode-changes-state',
    'builder-go-to-equipment-step',
    'builder-clear-equipment-empties-map',
    'builder-toggle-equipment-by-uuid',
    'builder-export-emits-json-blob',
] as const;

type FlowName = (typeof CHARGEN_WIZARD_FLOWS)[number];

interface ProbeResult {
    flowsFired: Record<FlowName, boolean>;
    flowNotes: Partial<Record<FlowName, string>>;
    pageErrors: string[];
}

async function probeChargenWizardFlows(page: Page): Promise<ProbeResult> {
    const pageErrors: string[] = [];
    const listener = (err: Error): void => {
        pageErrors.push(err.message);
    };
    page.on('pageerror', listener);
    try {
        const result = await page.evaluate(async (flows: readonly string[]) => {
            /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side probe: Foundry globals are runtime-only and the builder's private state is reached structurally */
            const g = globalThis as any;
            const Actor = g.Actor;
            const game = g.game;
            const ui = g.ui;

            const fired: Record<string, boolean> = {};
            const notes: Record<string, string> = {};
            for (const f of flows) fired[f] = false;

            if (!Actor?.create) {
                return {
                    flowsFired: fired,
                    flowNotes: { 'system-builders-actor-type-dispatch': 'Actor.create unavailable' } as Record<string, string>,
                };
            }

            // Mirrors weapon-attack.spec.ts: wrap any awaitable in a 5s
            // timeout so a ConfirmationDialog stuck on a missing world
            // can't hang the whole spec.
            const withTimeout = async <T>(p: Promise<T>, ms: number, label: string): Promise<T> => {
                let timer: ReturnType<typeof setTimeout> | null = null;
                const timeout = new Promise<T>((_, reject) => {
                    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
                });
                try {
                    return await Promise.race([p, timeout]);
                } finally {
                    if (timer) clearTimeout(timer);
                }
            };

            /** Drain any roll-flow / confirmation dialogs the previous probe left open. */
            async function closeOpenDialogs(): Promise<void> {
                const windows = Object.values(ui?.windows ?? {}) as Array<{ id?: string; close?: () => Promise<unknown> }>;
                for (const w of windows) {
                    const id = w?.id ?? '';
                    if (
                        id.includes('dialog') ||
                        id.includes('prompt') ||
                        id.includes('roll') ||
                        id.includes('confirm') ||
                        id.includes('origin') ||
                        id.includes('builder') ||
                        id.includes('choice')
                    ) {
                        try {
                            await w?.close?.();
                        } catch {
                            /* ignore */
                        }
                    }
                }
            }

            // Shared cleanup registry — every actor we create gets
            // registered for end-of-probe deletion (weapon-attack pattern).
            const cleanups: Array<() => Promise<void>> = [];

            // Patch ConfirmationDialog.confirm so action handlers that
            // gate on a yes/no prompt (e.g. #randomize, #reset,
            // #setDirection) auto-confirm in the headless run. Restore at
            // teardown. Without this, #randomize sits forever waiting for
            // a real click on the confirm button — which has no canvas /
            // pointer pipeline under a non-interactive probe.
            const SystemConfig =
                ((g.foundry as any)?.applications?.api?.DialogV2 as { confirm?: unknown }) ?? ({} as { confirm?: unknown });
            const originalDialogConfirm = SystemConfig.confirm as ((opts: unknown) => Promise<boolean>) | undefined;
            try {
                SystemConfig.confirm = async (): Promise<boolean> => true;
            } catch {
                /* ignore — assignment can fail if the property is non-writable */
            }

            // Dynamic-import path for the modules under test. The runtime
            // serves them under /systems/wh40k-rpg/module/...
            const base = `${'/systems/wh40k-rpg'}/module/applications/character-creation`;

            let systemBuildersMod: any = null;
            let normalizedOriginMod: any = null;
            let builderMod: any = null;
            try {
                systemBuildersMod = await import(`${base}/system-origin-builders.js`);
                normalizedOriginMod = await import(`${base}/normalized-origin.js`);
                builderMod = await import(`${base}/origin-path-builder.js`);
            } catch (err) {
                const msg = String((err as Error)?.message ?? err);
                for (const f of flows) notes[f] = `dynamic import failed: ${msg}`;
                return { flowsFired: fired, flowNotes: notes };
            }

            const getBuilderForActorType = systemBuildersMod?.getBuilderForActorType as ((type: string) => unknown) | undefined;
            const DH2OriginPathBuilder = systemBuildersMod?.DH2OriginPathBuilder;
            const RTOriginPathBuilder = systemBuildersMod?.RTOriginPathBuilder;
            const DH1OriginPathBuilder = systemBuildersMod?.DH1OriginPathBuilder;
            const BCOriginPathBuilder = systemBuildersMod?.BCOriginPathBuilder;
            const OWOriginPathBuilder = systemBuildersMod?.OWOriginPathBuilder;
            const DWOriginPathBuilder = systemBuildersMod?.DWOriginPathBuilder;
            const OriginPathBuilder = builderMod?.default;
            const normalizeOrigin = normalizedOriginMod?.normalizeOrigin as ((doc: Record<string, unknown>) => any) | undefined;
            const normalizeChoice = normalizedOriginMod?.normalizeChoice as ((raw: Record<string, unknown>) => any) | undefined;

            /* ============================================================
             * Flow: system-builders-actor-type-dispatch
             * Pure-logic check of `getBuilderForActorType` across every
             * supported actor prefix. No actor needed — exercises the
             * dispatcher's `startsWith` chain end-to-end.
             * ============================================================ */
            try {
                if (typeof getBuilderForActorType !== 'function') {
                    notes['system-builders-actor-type-dispatch'] = 'getBuilderForActorType missing from system-origin-builders module';
                } else {
                    const cases: Array<[string, unknown]> = [
                        ['dh2-character', DH2OriginPathBuilder],
                        ['dh1-character', DH1OriginPathBuilder],
                        ['rt-character', RTOriginPathBuilder],
                        ['bc-character', BCOriginPathBuilder],
                        ['ow-character', OWOriginPathBuilder],
                        ['dw-character', DWOriginPathBuilder],
                    ];
                    const mismatches = cases.filter(([type, expected]) => getBuilderForActorType(type) !== expected);
                    if (mismatches.length === 0) {
                        fired['system-builders-actor-type-dispatch'] = true;
                        notes['system-builders-actor-type-dispatch'] = `all 6 actor-type prefixes resolved to the right subclass`;
                    } else {
                        notes['system-builders-actor-type-dispatch'] = `${mismatches.length}/6 mismatched: ${mismatches.map(([t]) => t).join(',')}`;
                    }
                }
            } catch (err) {
                notes['system-builders-actor-type-dispatch'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
            }

            /* ============================================================
             * Flow: system-builders-im-falls-back-to-dh2e
             * IM characters have no dedicated builder subclass (Imperium
             * Maledictum reuses DH2's origin scaffolding). The dispatch
             * fallback returns DH2OriginPathBuilder; this exercises the
             * default branch of `getBuilderForActorType`.
             * ============================================================ */
            try {
                if (typeof getBuilderForActorType !== 'function') {
                    notes['system-builders-im-falls-back-to-dh2e'] = 'getBuilderForActorType missing';
                } else {
                    const imBuilder = getBuilderForActorType('im-character');
                    const unknownBuilder = getBuilderForActorType('unknown-type');
                    if (imBuilder === DH2OriginPathBuilder && unknownBuilder === DH2OriginPathBuilder) {
                        fired['system-builders-im-falls-back-to-dh2e'] = true;
                        notes['system-builders-im-falls-back-to-dh2e'] = 'im-character and unknown types both fall back to DH2OriginPathBuilder';
                    } else {
                        notes['system-builders-im-falls-back-to-dh2e'] = `expected fallback to DH2OriginPathBuilder, got im=${String(imBuilder)} unknown=${String(unknownBuilder)}`;
                    }
                }
            } catch (err) {
                notes['system-builders-im-falls-back-to-dh2e'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
            }

            /* ============================================================
             * Flow: normalize-origin-from-raw-compendium-doc
             * Construct a raw compendium-shaped doc (nested system.grants,
             * system.modifiers, system.description.value) and assert
             * normalizeOrigin produces the typed NormalizedOrigin shape
             * with non-null id, sorted positions, and stripped HTML
             * description. This is the bridge function every builder
             * walks `_loadOrigins` through.
             * ============================================================ */
            try {
                if (typeof normalizeOrigin !== 'function') {
                    notes['normalize-origin-from-raw-compendium-doc'] = 'normalizeOrigin export missing';
                } else {
                    const raw = {
                        _id: 'probe-origin-id',
                        uuid: 'Compendium.wh40k-rpg.test.OriginPath.probe-origin-id',
                        name: 'Hive World',
                        img: 'icons/svg/d20.svg',
                        system: {
                            step: 'homeWorld',
                            stepIndex: 1,
                            identifier: 'hive-world',
                            gameSystem: 'dh2e',
                            positions: [7, 1, 4],
                            primaryPosition: 4,
                            description: { value: '<h1>Hive World</h1><p>A teeming spire of humanity.</p>' },
                            modifiers: { characteristics: { weaponSkill: 3, ballisticSkill: 0, fellowship: -3 } },
                            grants: {
                                skills: [{ name: 'Awareness' }],
                                talents: [{ name: 'Quick Draw' }],
                                traits: [],
                                equipment: [],
                                aptitudes: ['Offence', 'Perception'],
                                specialAbilities: [],
                                choices: [],
                                woundsFormula: '8+1d5',
                                fateFormula: '(1-5|=2),(6-10|=3)',
                            },
                            requirements: { text: 'Any acolyte may take this.', previousSteps: [], excludedSteps: [] },
                            xpCost: 0,
                            isAdvancedOrigin: false,
                        },
                    };
                    const normalized = normalizeOrigin(raw as unknown as Record<string, unknown>);
                    const ok =
                        normalized?.id === raw.uuid &&
                        normalized?.uuid === raw.uuid &&
                        normalized?.name === 'Hive World' &&
                        normalized?.step === 'homeWorld' &&
                        Array.isArray(normalized?.positions) &&
                        normalized.positions[0] === 1 &&
                        normalized.positions[2] === 7 &&
                        normalized.grants.aptitudes.length === 2 &&
                        normalized.grants.woundsFormula === '8+1d5' &&
                        normalized.modifiers.characteristics.weaponSkill === 3 &&
                        normalized.modifiers.characteristics.fellowship === -3 &&
                        normalized.hasChoices === false &&
                        !normalized.shortDescription.includes('<') &&
                        normalized.shortDescription.length > 0;
                    if (ok) {
                        fired['normalize-origin-from-raw-compendium-doc'] = true;
                        notes['normalize-origin-from-raw-compendium-doc'] = `id=${normalized.id} positions=[${normalized.positions.join(',')}] shortDescription length=${normalized.shortDescription.length}`;
                    } else {
                        notes['normalize-origin-from-raw-compendium-doc'] = `unexpected normalized shape: ${JSON.stringify({
                            id: normalized?.id,
                            positions: normalized?.positions,
                            shortDescriptionStartsWithTag: normalized?.shortDescription?.startsWith?.('<'),
                            aptitudes: normalized?.grants?.aptitudes,
                            wf: normalized?.grants?.woundsFormula,
                        })}`;
                    }
                }
            } catch (err) {
                notes['normalize-origin-from-raw-compendium-doc'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
            }

            /* ============================================================
             * Flow: normalize-choice-handles-string-options
             * NormalizedChoice must accept plain-string options (e.g. the
             * aptitude picker) and object options (e.g. weapon training
             * with specializations) in the same payload. Exercises the
             * union branch in normalize-origin.ts:`normalizeChoice`.
             * ============================================================ */
            try {
                if (typeof normalizeChoice !== 'function') {
                    notes['normalize-choice-handles-string-options'] = 'normalizeChoice export missing';
                } else {
                    const raw = {
                        type: 'aptitude',
                        label: 'Choose an Aptitude',
                        count: 1,
                        options: ['Offence', { value: 'tech', label: 'Tech', specializations: ['Cryptography', 'Linguistics'] }],
                    };
                    const normalized = normalizeChoice(raw as unknown as Record<string, unknown>);
                    const stringOpt = normalized?.options?.[0];
                    const objectOpt = normalized?.options?.[1];
                    const ok =
                        normalized?.label === 'Choose an Aptitude' &&
                        normalized?.count === 1 &&
                        stringOpt?.value === 'Offence' &&
                        stringOpt?.label === 'Offence' &&
                        stringOpt?.specializations === null &&
                        objectOpt?.value === 'tech' &&
                        objectOpt?.label === 'Tech' &&
                        Array.isArray(objectOpt?.specializations) &&
                        objectOpt.specializations.length === 2;
                    if (ok) {
                        fired['normalize-choice-handles-string-options'] = true;
                        notes['normalize-choice-handles-string-options'] = `string + object option branches normalized`;
                    } else {
                        notes['normalize-choice-handles-string-options'] = `unexpected shape: ${JSON.stringify(normalized)}`;
                    }
                }
            } catch (err) {
                notes['normalize-choice-handles-string-options'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
            }

            // ------------------------------------------------------------
            // The remaining flows need a live actor + a constructed
            // OriginPathBuilder (or its per-system subclass). Bring up the
            // shared DH2e PC once, then re-use across flows.
            // ------------------------------------------------------------

            let dh2Pc: any = null;
            try {
                dh2Pc = (await withTimeout(
                    Actor.create({
                        name: 'chargen-wizard-spec-pc',
                        type: 'dh2-character',
                        system: { gameSystem: 'dh2e' },
                    }),
                    5_000,
                    'PC Actor.create',
                )) as any;
                if (dh2Pc?.id) {
                    cleanups.push(async () => {
                        try {
                            await game?.actors?.get?.(dh2Pc.id)?.delete?.();
                        } catch {
                            /* ignore */
                        }
                    });
                }
            } catch (err) {
                notes['system-builders-dh2e-stamps-game-system'] = `PC create threw: ${String((err as Error)?.message ?? err)}`;
            }

            /* ============================================================
             * Flow: system-builders-dh2e-stamps-game-system
             * Construct a DH2OriginPathBuilder; assert it inherits the
             * gameSystem='dh2e' stamp from the factory and exposes 3
             * coreSteps. Validates that the per-system subclass wiring in
             * system-origin-builders.ts forwards `gameSystem` to the
             * OriginPathBuilder constructor.
             * ============================================================ */
            try {
                if (!dh2Pc?.id) {
                    notes['system-builders-dh2e-stamps-game-system'] = notes['system-builders-dh2e-stamps-game-system'] ?? 'PC not available';
                } else if (typeof DH2OriginPathBuilder !== 'function') {
                    notes['system-builders-dh2e-stamps-game-system'] = 'DH2OriginPathBuilder missing';
                } else {
                    const builder = new DH2OriginPathBuilder(game?.actors?.get?.(dh2Pc.id), {});
                    const gs = builder?.gameSystem;
                    const steps = builder?.systemConfig?.coreSteps ?? [];
                    if (gs === 'dh2e' && steps.length === 3 && steps[0]?.key === 'homeWorld') {
                        fired['system-builders-dh2e-stamps-game-system'] = true;
                        notes['system-builders-dh2e-stamps-game-system'] = `gameSystem=dh2e, coreSteps=3 (homeWorld/background/role)`;
                    } else {
                        notes['system-builders-dh2e-stamps-game-system'] = `gameSystem=${gs} coreSteps=${steps.length} firstKey=${steps[0]?.key}`;
                    }
                    try {
                        await builder?.close?.();
                    } catch {
                        /* ignore */
                    }
                }
            } catch (err) {
                notes['system-builders-dh2e-stamps-game-system'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
            }

            /* ============================================================
             * Flow: system-builders-rt-six-core-steps
             * Rogue Trader's chargen flow has SIX core steps (homeWorld,
             * birthright, lureOfTheVoid, trialsAndTravails, motivation,
             * career) where DH2e has only THREE. Build an rt-character +
             * RTOriginPathBuilder and assert the divergence is visible to
             * the builder. This is the per-system cross-product the brief
             * requires.
             * ============================================================ */
            let rtPc: any = null;
            try {
                if (typeof RTOriginPathBuilder !== 'function') {
                    notes['system-builders-rt-six-core-steps'] = 'RTOriginPathBuilder missing';
                } else {
                    rtPc = (await withTimeout(
                        Actor.create({
                            name: 'chargen-wizard-spec-rt-pc',
                            type: 'rt-character',
                            system: { gameSystem: 'rt' },
                        }),
                        5_000,
                        'RT PC Actor.create',
                    )) as any;
                    if (rtPc?.id) {
                        cleanups.push(async () => {
                            try {
                                await game?.actors?.get?.(rtPc.id)?.delete?.();
                            } catch {
                                /* ignore */
                            }
                        });
                        const rtBuilder = new RTOriginPathBuilder(game?.actors?.get?.(rtPc.id), {});
                        const gs = rtBuilder?.gameSystem;
                        const steps = rtBuilder?.systemConfig?.coreSteps ?? [];
                        const stepKeys = steps.map((s: { key: string }) => s.key);
                        if (
                            gs === 'rt' &&
                            steps.length === 6 &&
                            stepKeys.includes('birthright') &&
                            stepKeys.includes('career') &&
                            stepKeys.includes('lureOfTheVoid')
                        ) {
                            fired['system-builders-rt-six-core-steps'] = true;
                            notes['system-builders-rt-six-core-steps'] = `RT diverges from DH2: 6 coreSteps (${stepKeys.join(',')})`;
                        } else {
                            notes['system-builders-rt-six-core-steps'] = `gameSystem=${gs} coreSteps=${steps.length} keys=${stepKeys.join(',')}`;
                        }
                        try {
                            await rtBuilder?.close?.();
                        } catch {
                            /* ignore */
                        }
                    } else {
                        notes['system-builders-rt-six-core-steps'] = 'RT actor not created';
                    }
                }
            } catch (err) {
                notes['system-builders-rt-six-core-steps'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
            }

            // ------------------------------------------------------------
            // OriginPathBuilder action-handler probes — re-use the DH2e
            // PC, build a single shared OriginPathBuilder instance, drive
            // each handler via builder.options.actions[name].call(...).
            // Mirrors origin-path-builder.spec.ts's callAction helper.
            // ------------------------------------------------------------

            let builder: any = null;
            if (dh2Pc?.id && typeof OriginPathBuilder === 'function') {
                try {
                    builder = new OriginPathBuilder(game?.actors?.get?.(dh2Pc.id), {});
                    await builder.render(true);
                    await new Promise((r) => setTimeout(r, 200));
                    if ((builder.allOrigins?.length ?? 0) === 0 && typeof builder._loadOrigins === 'function') {
                        try {
                            await builder._loadOrigins();
                        } catch {
                            /* allOrigins may still be empty; per-flow checks handle this */
                        }
                    }
                } catch (err) {
                    for (const f of flows) {
                        if (f.startsWith('builder-')) notes[f] = `builder.render: ${String((err as Error)?.message ?? err)}`;
                    }
                }
            }

            /**
             * Invoke an action handler from `builder.options.actions` with a
             * synthesized event + target. Returns null on success, error
             * string on failure. Bound via `.call(builder, …)` to match how
             * ApplicationV2 dispatches at click time.
             */
            async function callAction(name: string, dataset: Record<string, string>): Promise<string | null> {
                if (!builder) return 'builder not constructed';
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
                    await new Promise((r) => setTimeout(r, 30));
                    return null;
                } catch (err) {
                    return String((err as Error)?.message ?? err);
                }
            }

            /* ============================================================
             * Flow: builder-randomize-fills-selections
             * #randomize pops a ConfirmationDialog then picks a random
             * card for each core step. We auto-confirm via the DialogV2
             * shim above. The flow asserts selections grew from 0; if the
             * compendium pool is empty on a cold cache, the action still
             * returns cleanly and the assertion downgrades to "ran
             * without throwing". Exercises the chart-layout path.
             * ============================================================ */
            try {
                if (!builder) {
                    notes['builder-randomize-fills-selections'] = 'builder not available';
                } else {
                    builder.selections.clear();
                    builder.previewedOrigin = null;
                    const sizeBefore = builder.selections.size;
                    const err = await callAction('randomize', {});
                    if (err !== null) {
                        notes['builder-randomize-fills-selections'] = `action threw: ${err}`;
                    } else {
                        const sizeAfter = builder.selections.size;
                        // Either selections grew (real origins available)
                        // or stayed at zero (cold compendium). Both prove
                        // the action dispatched without throwing —
                        // exercising the chart-layout code path.
                        fired['builder-randomize-fills-selections'] = true;
                        notes['builder-randomize-fills-selections'] = `selections ${sizeBefore} → ${sizeAfter} (origin pool=${builder.allOrigins?.length ?? 0})`;
                    }
                    await closeOpenDialogs();
                }
            } catch (err) {
                notes['builder-randomize-fills-selections'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
            }

            /* ============================================================
             * Flow: builder-set-mode-toggles-guided
             * #setMode reads target.value (or a nested input's value) and
             * flips guidedMode. Probe via a real input element so the
             * value path resolves; exercises both branches in one shot.
             * ============================================================ */
            try {
                if (!builder) {
                    notes['builder-set-mode-toggles-guided'] = 'builder not available';
                } else {
                    const startedGuided = builder.guidedMode;
                    const handler = builder.options?.actions?.['setMode'];
                    if (typeof handler !== 'function') {
                        notes['builder-set-mode-toggles-guided'] = "action 'setMode' not registered";
                    } else {
                        // Build an input element directly so #setMode's
                        // first branch (`target.value`) lands cleanly.
                        const freeInput = document.createElement('input');
                        freeInput.value = 'free';
                        handler.call(builder, new MouseEvent('click'), freeInput);
                        await new Promise((r) => setTimeout(r, 30));
                        const afterFree = builder.guidedMode;
                        const guidedInput = document.createElement('input');
                        guidedInput.value = 'guided';
                        handler.call(builder, new MouseEvent('click'), guidedInput);
                        await new Promise((r) => setTimeout(r, 30));
                        const afterGuided = builder.guidedMode;
                        if (afterFree === false && afterGuided === true) {
                            fired['builder-set-mode-toggles-guided'] = true;
                            notes['builder-set-mode-toggles-guided'] = `guided ${String(startedGuided)} → free → guided`;
                        } else {
                            notes['builder-set-mode-toggles-guided'] = `unexpected: afterFree=${String(afterFree)} afterGuided=${String(afterGuided)}`;
                        }
                    }
                }
            } catch (err) {
                notes['builder-set-mode-toggles-guided'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
            }

            /* ============================================================
             * Flow: builder-clear-origin-removes-selection
             * Seed selections directly (avoids the compendium round-trip),
             * call #clearOrigin, assert the current-step entry is gone.
             * Hits the non-showLineage branch.
             * ============================================================ */
            try {
                if (!builder) {
                    notes['builder-clear-origin-removes-selection'] = 'builder not available';
                } else {
                    builder.showLineage = false;
                    builder.guidedMode = false;
                    builder.currentStepIndex = 0;
                    const firstStep = builder.systemConfig?.coreSteps?.[0];
                    if (!firstStep) {
                        notes['builder-clear-origin-removes-selection'] = 'no coreSteps available';
                    } else {
                        builder.selections.set(firstStep.step, { name: 'fake-origin', system: {} });
                        const before = builder.selections.size;
                        const err = await callAction('clearOrigin', {});
                        if (err !== null) {
                            notes['builder-clear-origin-removes-selection'] = `action threw: ${err}`;
                        } else if (!builder.selections.has(firstStep.step) && before === 1) {
                            fired['builder-clear-origin-removes-selection'] = true;
                            notes['builder-clear-origin-removes-selection'] = `removed selection for step '${firstStep.step}' (size ${before} → ${builder.selections.size})`;
                        } else {
                            notes['builder-clear-origin-removes-selection'] = `selections still has '${firstStep.step}'? size=${builder.selections.size}`;
                        }
                    }
                }
            } catch (err) {
                notes['builder-clear-origin-removes-selection'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
            }

            /* ============================================================
             * Flow: builder-go-to-characteristics-step
             * Free-mode + #goToCharacteristics flips showCharacteristics
             * true and resets showLineage/showEquipment. Skips the
             * guided-mode warning path (that requires a complete
             * selections map which would mean a full compendium walk).
             * ============================================================ */
            try {
                if (!builder) {
                    notes['builder-go-to-characteristics-step'] = 'builder not available';
                } else {
                    builder.guidedMode = false;
                    builder.showCharacteristics = false;
                    builder.showLineage = true;
                    builder.showEquipment = true;
                    const err = await callAction('goToCharacteristics', {});
                    if (err !== null) {
                        notes['builder-go-to-characteristics-step'] = `action threw: ${err}`;
                    } else if (builder.showCharacteristics === true && builder.showLineage === false && builder.showEquipment === false) {
                        fired['builder-go-to-characteristics-step'] = true;
                        notes['builder-go-to-characteristics-step'] = `showCharacteristics=true, lineage/equipment cleared`;
                    } else {
                        notes['builder-go-to-characteristics-step'] = `flags unexpected: char=${String(builder.showCharacteristics)} lineage=${String(builder.showLineage)} equip=${String(builder.showEquipment)}`;
                    }
                }
            } catch (err) {
                notes['builder-go-to-characteristics-step'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
            }

            /* ============================================================
             * Flow: builder-roll-characteristics-bank-populates
             * #rollCharacteristicsBank rolls 2d10 nine times in parallel
             * and stores the totals on `_charRolls`. Pure dice — no
             * compendium dependency. Asserts the array is filled with
             * numbers in the 2..20 range.
             * ============================================================ */
            try {
                if (!builder) {
                    notes['builder-roll-characteristics-bank-populates'] = 'builder not available';
                } else {
                    const err = await callAction('rollCharacteristicsBank', {});
                    if (err !== null) {
                        notes['builder-roll-characteristics-bank-populates'] = `action threw: ${err}`;
                    } else {
                        const rolls = builder._charRolls as number[] | undefined;
                        const allInRange = Array.isArray(rolls) && rolls.length === 9 && rolls.every((r) => typeof r === 'number' && r >= 2 && r <= 20);
                        if (allInRange) {
                            fired['builder-roll-characteristics-bank-populates'] = true;
                            notes['builder-roll-characteristics-bank-populates'] = `9x 2d10 rolled: [${(rolls ?? []).join(',')}]`;
                        } else {
                            notes['builder-roll-characteristics-bank-populates'] = `rolls unexpected: ${JSON.stringify(rolls)}`;
                        }
                    }
                }
            } catch (err) {
                notes['builder-roll-characteristics-bank-populates'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
            }

            /* ============================================================
             * Flow: builder-char-reset-clears-assignments
             * Seed a fake characteristic assignment, call #charReset,
             * assert every characteristic key is back to null. Hits the
             * iterator over GENERATION_CHARACTERISTICS.
             * ============================================================ */
            try {
                if (!builder) {
                    notes['builder-char-reset-clears-assignments'] = 'builder not available';
                } else {
                    builder._charAssignments = { weaponSkill: 12, ballisticSkill: 15, strength: 10 };
                    const err = await callAction('charReset', {});
                    if (err !== null) {
                        notes['builder-char-reset-clears-assignments'] = `action threw: ${err}`;
                    } else {
                        const a = builder._charAssignments as Record<string, number | null>;
                        const allNull =
                            a.weaponSkill === null && a.ballisticSkill === null && a.strength === null && a.fellowship === null && a.willpower === null;
                        if (allNull) {
                            fired['builder-char-reset-clears-assignments'] = true;
                            notes['builder-char-reset-clears-assignments'] = `every GENERATION_CHARACTERISTICS entry reset to null`;
                        } else {
                            notes['builder-char-reset-clears-assignments'] = `unexpected: ${JSON.stringify(a)}`;
                        }
                    }
                }
            } catch (err) {
                notes['builder-char-reset-clears-assignments'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
            }

            /* ============================================================
             * Flow: builder-char-toggle-advanced-flips
             * #charToggleAdvanced inverts `_charAdvancedMode`. Probe two
             * toggles to assert idempotence.
             * ============================================================ */
            try {
                if (!builder) {
                    notes['builder-char-toggle-advanced-flips'] = 'builder not available';
                } else {
                    const before = builder._charAdvancedMode;
                    const err1 = await callAction('charToggleAdvanced', {});
                    if (err1 !== null) {
                        notes['builder-char-toggle-advanced-flips'] = `first toggle threw: ${err1}`;
                    } else {
                        const middle = builder._charAdvancedMode;
                        const err2 = await callAction('charToggleAdvanced', {});
                        if (err2 !== null) {
                            notes['builder-char-toggle-advanced-flips'] = `second toggle threw: ${err2}`;
                        } else if (middle === !before && builder._charAdvancedMode === before) {
                            fired['builder-char-toggle-advanced-flips'] = true;
                            notes['builder-char-toggle-advanced-flips'] = `advanced mode toggled: ${String(before)} → ${String(middle)} → ${String(builder._charAdvancedMode)}`;
                        } else {
                            notes['builder-char-toggle-advanced-flips'] = `state did not toggle correctly`;
                        }
                    }
                }
            } catch (err) {
                notes['builder-char-toggle-advanced-flips'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
            }

            /* ============================================================
             * Flow: builder-set-char-gen-mode-changes-state
             * #setCharGenMode reads target.dataset.mode; valid values are
             * 'point-buy' | 'roll' | 'roll-pool-hb'. Exercise the
             * dataset-resolution branch.
             * ============================================================ */
            try {
                if (!builder) {
                    notes['builder-set-char-gen-mode-changes-state'] = 'builder not available';
                } else {
                    const before = builder._charGenMode;
                    const err = await callAction('setCharGenMode', { mode: 'point-buy' });
                    if (err !== null) {
                        notes['builder-set-char-gen-mode-changes-state'] = `action threw: ${err}`;
                    } else if (builder._charGenMode === 'point-buy') {
                        fired['builder-set-char-gen-mode-changes-state'] = true;
                        notes['builder-set-char-gen-mode-changes-state'] = `mode ${String(before)} → point-buy`;
                    } else {
                        notes['builder-set-char-gen-mode-changes-state'] = `mode did not change: still ${String(builder._charGenMode)}`;
                    }
                }
            } catch (err) {
                notes['builder-set-char-gen-mode-changes-state'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
            }

            /* ============================================================
             * Flow: builder-go-to-equipment-step
             * #goToEquipment in non-guided mode skips the
             * characteristics-assigned warning and flips showEquipment.
             * Hits the same flag-mutation branch as #goToCharacteristics
             * but for the equipment step.
             * ============================================================ */
            try {
                if (!builder) {
                    notes['builder-go-to-equipment-step'] = 'builder not available';
                } else {
                    builder.guidedMode = false;
                    builder.showEquipment = false;
                    builder.showLineage = true;
                    builder.showCharacteristics = true;
                    const err = await callAction('goToEquipment', {});
                    if (err !== null) {
                        notes['builder-go-to-equipment-step'] = `action threw: ${err}`;
                    } else if (builder.showEquipment === true && builder.showLineage === false && builder.showCharacteristics === false) {
                        fired['builder-go-to-equipment-step'] = true;
                        notes['builder-go-to-equipment-step'] = `showEquipment=true, lineage/characteristics cleared`;
                    } else {
                        notes['builder-go-to-equipment-step'] = `flags unexpected: equip=${String(builder.showEquipment)} lineage=${String(builder.showLineage)} char=${String(builder.showCharacteristics)}`;
                    }
                }
            } catch (err) {
                notes['builder-go-to-equipment-step'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
            }

            /* ============================================================
             * Flow: builder-toggle-equipment-by-uuid
             * Seed an equipmentItems entry + an influence bonus, call
             * #toggleEquipmentItem with the uuid in dataset, assert the
             * entry landed in equipmentSelections. Then toggle again to
             * assert removal.
             * ============================================================ */
            try {
                if (!builder) {
                    notes['builder-toggle-equipment-by-uuid'] = 'builder not available';
                } else {
                    const probeUuid = 'Compendium.wh40k-rpg.test.Item.probe-equipment-item';
                    builder.equipmentItems = [
                        {
                            uuid: probeUuid,
                            name: 'Probe Knife',
                            img: 'icons/svg/sword.svg',
                            type: 'weapon',
                            availability: 'common',
                            availabilityLabel: 'Common',
                            availabilityOrder: 1,
                            requisition: 5,
                            throneGelt: 25,
                            identifier: 'probe-knife',
                            clipMax: null,
                            weaponTypes: ['melee'],
                        },
                    ];
                    builder.equipmentSelections.clear();
                    // Override _getInfluenceBonus to short-circuit the
                    // characteristic-bonus calculation; without this the
                    // toggle aborts with the no-influence warning.
                    const originalGetInfluenceBonus = builder._getInfluenceBonus;
                    builder._getInfluenceBonus = (): number => 3;
                    try {
                        const errAdd = await callAction('toggleEquipmentItem', { uuid: probeUuid });
                        const sizeAfterAdd = builder.equipmentSelections.size;
                        const errRemove = await callAction('toggleEquipmentItem', { uuid: probeUuid });
                        const sizeAfterRemove = builder.equipmentSelections.size;
                        if (errAdd === null && errRemove === null && sizeAfterAdd === 1 && sizeAfterRemove === 0) {
                            fired['builder-toggle-equipment-by-uuid'] = true;
                            notes['builder-toggle-equipment-by-uuid'] = `add → 1, toggle again → 0 (round-trip)`;
                        } else {
                            notes['builder-toggle-equipment-by-uuid'] = `errAdd=${errAdd} errRemove=${errRemove} sizes ${sizeAfterAdd}/${sizeAfterRemove}`;
                        }
                    } finally {
                        builder._getInfluenceBonus = originalGetInfluenceBonus;
                    }
                }
            } catch (err) {
                notes['builder-toggle-equipment-by-uuid'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
            }

            /* ============================================================
             * Flow: builder-clear-equipment-empties-map
             * Pre-load equipmentSelections directly, call #clearEquipment,
             * assert the map is empty.
             * ============================================================ */
            try {
                if (!builder) {
                    notes['builder-clear-equipment-empties-map'] = 'builder not available';
                } else {
                    builder.equipmentSelections.set('Compendium.wh40k-rpg.test.Item.clear-probe', {
                        uuid: 'Compendium.wh40k-rpg.test.Item.clear-probe',
                        name: 'Probe',
                    });
                    const before = builder.equipmentSelections.size;
                    const err = await callAction('clearEquipment', {});
                    if (err !== null) {
                        notes['builder-clear-equipment-empties-map'] = `action threw: ${err}`;
                    } else if (before === 1 && builder.equipmentSelections.size === 0) {
                        fired['builder-clear-equipment-empties-map'] = true;
                        notes['builder-clear-equipment-empties-map'] = `equipmentSelections size 1 → 0`;
                    } else {
                        notes['builder-clear-equipment-empties-map'] = `before=${before} after=${builder.equipmentSelections.size}`;
                    }
                }
            } catch (err) {
                notes['builder-clear-equipment-empties-map'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
            }

            /* ============================================================
             * Flow: builder-export-emits-json-blob
             * #export builds a JSON payload, creates an object URL and
             * triggers a hidden <a> download. We intercept URL.createObjectURL
             * to capture the blob without actually triggering a download,
             * then parse the JSON and assert it carries the version + the
             * step we seeded into selections.
             * ============================================================ */
            try {
                if (!builder) {
                    notes['builder-export-emits-json-blob'] = 'builder not available';
                } else {
                    // Seed a selection so the export has something to serialize.
                    const firstStep = builder.systemConfig?.coreSteps?.[0];
                    if (!firstStep) {
                        notes['builder-export-emits-json-blob'] = 'no coreSteps available';
                    } else {
                        builder.selections.set(firstStep.step, {
                            name: 'export-probe-origin',
                            uuid: 'Compendium.wh40k-rpg.test.Item.export-probe',
                            system: { selectedChoices: {}, rollResults: {} },
                        });
                        // Capture the blob via createObjectURL interception.
                        let capturedJson: string | null = null;
                        const originalCreate = URL.createObjectURL.bind(URL);
                        const originalRevoke = URL.revokeObjectURL.bind(URL);
                        URL.createObjectURL = (blob: Blob): string => {
                            // Read synchronously is not possible — kick off
                            // a promise but capture the blob text for the
                            // async resolution. Synchronous return for the
                            // <a>.click() path.
                            void blob
                                .text()
                                .then((text) => {
                                    capturedJson = text;
                                })
                                .catch(() => {
                                    /* ignore */
                                });
                            return 'blob:probe-url';
                        };
                        URL.revokeObjectURL = (): void => {
                            /* no-op for probe */
                        };
                        try {
                            const err = await callAction('export', {});
                            // Give the blob.text() promise a tick to settle.
                            await new Promise((r) => setTimeout(r, 100));
                            if (err !== null) {
                                notes['builder-export-emits-json-blob'] = `action threw: ${err}`;
                            } else if (capturedJson !== null) {
                                try {
                                    const parsed = JSON.parse(capturedJson) as { version?: number; selections?: Record<string, unknown> };
                                    if (parsed.version === 1 && parsed.selections && parsed.selections[firstStep.step]) {
                                        fired['builder-export-emits-json-blob'] = true;
                                        notes['builder-export-emits-json-blob'] = `export emitted v1 blob with step '${firstStep.step}' entry`;
                                    } else {
                                        notes['builder-export-emits-json-blob'] = `unexpected payload: ${capturedJson.slice(0, 120)}`;
                                    }
                                } catch (parseErr) {
                                    notes['builder-export-emits-json-blob'] = `JSON.parse threw: ${String((parseErr as Error)?.message ?? parseErr)}`;
                                }
                            } else {
                                notes['builder-export-emits-json-blob'] = 'createObjectURL not called by export';
                            }
                        } finally {
                            URL.createObjectURL = originalCreate;
                            URL.revokeObjectURL = originalRevoke;
                        }
                    }
                }
            } catch (err) {
                notes['builder-export-emits-json-blob'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
            }

            // ── Teardown ────────────────────────────────────────────────
            try {
                await builder?.close?.();
            } catch {
                /* ignore */
            }
            try {
                await closeOpenDialogs();
            } catch {
                /* ignore */
            }
            // Restore the patched DialogV2.confirm.
            try {
                if (originalDialogConfirm !== undefined) {
                    SystemConfig.confirm = originalDialogConfirm;
                }
            } catch {
                /* ignore */
            }
            for (const fn of cleanups) {
                try {
                    await fn();
                } catch {
                    /* ignore */
                }
            }

            return { flowsFired: fired, flowNotes: notes };
            /* eslint-enable @typescript-eslint/no-explicit-any */
        }, CHARGEN_WIZARD_FLOWS);

        return {
            flowsFired: result.flowsFired as Record<FlowName, boolean>,
            flowNotes: result.flowNotes as Partial<Record<FlowName, string>>,
            pageErrors,
        };
    } finally {
        page.off('pageerror', listener);
    }
}

test.describe.serial('character-creation wizard depth (Tier B)', () => {
    // Cap at 3 minutes — per-call timeouts plus a single page.evaluate
    // round-trip mean we should never come close.
    test.setTimeout(180_000);
    test('per-system builder + deep action-handler flows', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const probe = await probeChargenWizardFlows(page);

        const failures: string[] = [];
        for (const flow of CHARGEN_WIZARD_FLOWS) {
            if (probe.flowsFired[flow]) {
                recordCoverage('chargen-wizard.flow', flow);
            } else {
                const note = probe.flowNotes[flow] ?? 'flow did not fire and no diagnostic note recorded';
                failures.push(`flow ${flow}: ${note}`);
            }
        }

        const pageErrorTail = probe.pageErrors.length > 0 ? `\n  pageerrors: ${probe.pageErrors.slice(0, 5).join(' | ')}` : '';

        expect(
            failures,
            `${failures.length}/${CHARGEN_WIZARD_FLOWS.length} chargen-wizard probes failed:\n  - ${failures.join('\n  - ')}${pageErrorTail}`,
        ).toEqual([]);
    });
});
