import type { Page } from '@playwright/test';

import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the full Combat tracker lifecycle and the system's
 * combat-aware ApplicationV2 surfaces.
 *
 * Source coverage targets:
 *   - src/module/actions/combat-action-manager.ts (combatTurn / combatRound
 *     hook handlers)
 *   - src/module/applications/hud/combat-quick-panel.ts (constructor +
 *     render + combatRound listener registration)
 *   - src/module/applications/npc/encounter-builder.ts (singleton + render +
 *     _prepareContext walking #npcs / party config)
 *   - src/module/applications/npc/combat-preset-dialog.ts (library mode
 *     render, _prepareContext)
 *   - src/module/applications/npc/difficulty-calculator-dialog.ts (NPC-bound
 *     render, _prepareContext)
 *   - src/module/applications/npc/threat-scaler-dialog.ts (NPC-bound
 *     render, _prepareContext)
 *
 * Strategy: join as GM, create three NPC actors (one per system that
 * currently exposes an `<id>-npc` data model — bc-npc is the safest
 * canonical), build a scene-less Combat, add combatants, roll initiative,
 * advance turn/round, mutate initiative, drop a combatant, end the combat.
 * Record one `combat.flow` coverage key per successful step. Then construct
 * each Combat-adjacent ApplicationV2 directly, render it, close it, and
 * record one `combat.ui` coverage key per class.
 *
 * Collect-failures-then-assert pattern matches sheet-interactions.spec.ts.
 *
 * Keep COMBAT_FLOWS and COMBAT_UI_CLASSES in sync with the equivalent
 * constants in `scripts/e2e-coverage.mjs` — those are the coverage
 * denominators and must agree with the recordCoverage keys here.
 */

const COMBAT_FLOWS = [
    'create',
    'addCombatants',
    'rollAll',
    'activate',
    'startCombat',
    'nextTurn',
    'nextRound',
    'setInitiative',
    'deleteCombatant',
    'endCombat',
] as const;

const COMBAT_UI_CLASSES = [
    'CombatQuickPanel',
    'EncounterBuilder',
    'CombatPresetDialog',
    'DifficultyCalculatorDialog',
    'NPCThreatScalerDialog',
] as const;

type FlowName = (typeof COMBAT_FLOWS)[number];
type UIClassName = (typeof COMBAT_UI_CLASSES)[number];

interface FlowProbeResult {
    flowsFired: Record<FlowName, boolean>;
    flowNotes: Partial<Record<FlowName, string>>;
    npcActorIds: string[];
    combatId: string | null;
    setupError: string | null;
}

interface UIProbeResult {
    rendered: Record<UIClassName, boolean>;
    uiNotes: Partial<Record<UIClassName, string>>;
}

async function probeCombatLifecycle(page: Page): Promise<FlowProbeResult & { pageErrors: string[] }> {
    const pageErrors: string[] = [];
    const listener = (err: Error) => pageErrors.push(err.message);
    page.on('pageerror', listener);
    try {
        const result = await page.evaluate(async (flows: readonly string[]) => {
            /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side probe: Foundry globals are runtime-only */
            const g = globalThis as any;
            const Actor = g.Actor;
            const Combat = g.Combat;
            const game = g.game;

            const fired: Record<string, boolean> = {};
            const notes: Record<string, string> = {};
            for (const f of flows) fired[f] = false;

            if (!Actor?.create || !Combat?.create) {
                return {
                    flowsFired: fired,
                    flowNotes: { create: 'Actor.create or Combat.create unavailable' } as Record<string, string>,
                    npcActorIds: [] as string[],
                    combatId: null as string | null,
                    setupError: 'Actor.create or Combat.create unavailable',
                };
            }

            // ---- create 3 NPCs ----
            const npcIds: string[] = [];
            // bc-npc is the most stable NPC type for headless creation in the
            // current build. Three copies are enough to exercise initiative
            // sorting + a removable combatant without depending on any one to
            // succeed.
            for (let i = 0; i < 3; i++) {
                try {
                    const actor = await Actor.create({
                        name: `combat-spec-npc-${i}`,
                        type: 'bc-npc',
                        system: { gameSystem: 'bc' },
                    });
                    if (actor?.id) npcIds.push(actor.id);
                } catch (err) {
                    // best effort; we'll proceed if we got at least one
                    notes['addCombatants'] = `npc create ${i} threw: ${String((err as Error)?.message ?? err)}`;
                }
            }

            if (npcIds.length === 0) {
                return {
                    flowsFired: fired,
                    flowNotes: { ...notes, create: 'no NPC actors could be created' } as Record<string, string>,
                    npcActorIds: npcIds,
                    combatId: null as string | null,
                    setupError: 'no NPC actors could be created',
                };
            }

            // ---- create scene-less combat ----
            let combat: any = null;
            try {
                combat = await Combat.create({});
                if (combat?.id) {
                    fired['create'] = true;
                } else {
                    notes['create'] = 'Combat.create returned null';
                }
            } catch (err) {
                notes['create'] = `Combat.create threw: ${String((err as Error)?.message ?? err)}`;
            }

            if (!combat?.id) {
                // Cleanup actors before bailing.
                for (const id of npcIds) {
                    try { await game?.actors?.get?.(id)?.delete?.(); } catch { /* ignore */ }
                }
                return {
                    flowsFired: fired,
                    flowNotes: notes,
                    npcActorIds: npcIds,
                    combatId: null,
                    setupError: notes['create'] ?? 'combat not created',
                };
            }

            // ---- add combatants ----
            let combatantIds: string[] = [];
            try {
                const created = await combat.createEmbeddedDocuments?.(
                    'Combatant',
                    npcIds.map((id) => ({ actorId: id })),
                );
                if (Array.isArray(created) && created.length > 0) {
                    combatantIds = created.map((c: any) => c?.id).filter((id: unknown): id is string => typeof id === 'string');
                    fired['addCombatants'] = true;
                } else {
                    notes['addCombatants'] = 'createEmbeddedDocuments returned empty';
                }
            } catch (err) {
                notes['addCombatants'] = `createEmbeddedDocuments threw: ${String((err as Error)?.message ?? err)}`;
            }

            // ---- roll initiative for all ----
            try {
                if (typeof combat.rollAll === 'function') {
                    await combat.rollAll();
                    fired['rollAll'] = true;
                } else {
                    notes['rollAll'] = 'combat.rollAll is not a function';
                }
            } catch (err) {
                notes['rollAll'] = `rollAll threw: ${String((err as Error)?.message ?? err)}`;
            }

            // ---- activate combat (scene-less combat is activatable in V14) ----
            try {
                if (typeof combat.activate === 'function') {
                    await combat.activate();
                    fired['activate'] = true;
                } else {
                    notes['activate'] = 'combat.activate is not a function';
                }
            } catch (err) {
                notes['activate'] = `activate threw: ${String((err as Error)?.message ?? err)}`;
            }

            // ---- startCombat ----
            try {
                if (typeof combat.startCombat === 'function') {
                    await combat.startCombat();
                    fired['startCombat'] = true;
                } else {
                    notes['startCombat'] = 'combat.startCombat is not a function';
                }
            } catch (err) {
                notes['startCombat'] = `startCombat threw: ${String((err as Error)?.message ?? err)}`;
            }

            // ---- nextTurn x3 ----
            try {
                let turnOk = true;
                for (let i = 0; i < 3; i++) {
                    if (typeof combat.nextTurn === 'function') {
                        await combat.nextTurn();
                    } else {
                        turnOk = false;
                        notes['nextTurn'] = 'combat.nextTurn is not a function';
                        break;
                    }
                }
                if (turnOk) fired['nextTurn'] = true;
            } catch (err) {
                notes['nextTurn'] = `nextTurn threw: ${String((err as Error)?.message ?? err)}`;
            }

            // ---- nextRound x2 ----
            try {
                let roundOk = true;
                for (let i = 0; i < 2; i++) {
                    if (typeof combat.nextRound === 'function') {
                        await combat.nextRound();
                    } else {
                        roundOk = false;
                        notes['nextRound'] = 'combat.nextRound is not a function';
                        break;
                    }
                }
                if (roundOk) fired['nextRound'] = true;
            } catch (err) {
                notes['nextRound'] = `nextRound threw: ${String((err as Error)?.message ?? err)}`;
            }

            // ---- setInitiative on a combatant ----
            try {
                if (combatantIds.length > 0 && typeof combat.setInitiative === 'function') {
                    await combat.setInitiative(combatantIds[0], 99);
                    fired['setInitiative'] = true;
                } else {
                    notes['setInitiative'] = combatantIds.length === 0
                        ? 'no combatants available'
                        : 'combat.setInitiative is not a function';
                }
            } catch (err) {
                notes['setInitiative'] = `setInitiative threw: ${String((err as Error)?.message ?? err)}`;
            }

            // ---- delete a combatant ----
            try {
                if (combatantIds.length > 1) {
                    const removed = await combat.deleteEmbeddedDocuments?.('Combatant', [combatantIds[1]]);
                    if (Array.isArray(removed)) {
                        fired['deleteCombatant'] = true;
                    } else {
                        notes['deleteCombatant'] = 'deleteEmbeddedDocuments returned non-array';
                    }
                } else {
                    notes['deleteCombatant'] = 'insufficient combatants to delete one safely';
                }
            } catch (err) {
                notes['deleteCombatant'] = `deleteEmbeddedDocuments threw: ${String((err as Error)?.message ?? err)}`;
            }

            // ---- endCombat (falls back to combat.delete) ----
            try {
                if (typeof combat.endCombat === 'function') {
                    await combat.endCombat();
                    fired['endCombat'] = true;
                } else if (typeof combat.delete === 'function') {
                    await combat.delete();
                    fired['endCombat'] = true;
                } else {
                    notes['endCombat'] = 'neither endCombat nor delete available';
                }
            } catch (err) {
                // endCombat may prompt; fall back to delete.
                try {
                    await combat.delete?.();
                    fired['endCombat'] = true;
                } catch (err2) {
                    notes['endCombat'] = `endCombat/delete threw: ${String((err2 as Error)?.message ?? err2)}`;
                }
            }

            // ---- cleanup actors ----
            for (const id of npcIds) {
                try { await game?.actors?.get?.(id)?.delete?.(); } catch { /* ignore */ }
            }

            return {
                flowsFired: fired,
                flowNotes: notes,
                npcActorIds: npcIds,
                combatId: combat.id ?? null,
                setupError: null as string | null,
            };
            /* eslint-enable @typescript-eslint/no-explicit-any */
        }, COMBAT_FLOWS);

        return {
            flowsFired: result.flowsFired as Record<FlowName, boolean>,
            flowNotes: result.flowNotes as Partial<Record<FlowName, string>>,
            npcActorIds: result.npcActorIds,
            combatId: result.combatId,
            setupError: result.setupError,
            pageErrors,
        };
    } finally {
        page.off('pageerror', listener);
    }
}

async function probeCombatUI(page: Page): Promise<UIProbeResult & { pageErrors: string[] }> {
    const pageErrors: string[] = [];
    const listener = (err: Error) => pageErrors.push(err.message);
    page.on('pageerror', listener);
    try {
        const result = await page.evaluate(async (classNames: readonly string[]) => {
            /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side probe: Foundry globals are runtime-only */
            const g = globalThis as any;
            const rendered: Record<string, boolean> = {};
            const notes: Record<string, string> = {};
            for (const n of classNames) rendered[n] = false;

            // Resolve the module exports through the game.wh40k namespace if
            // surfaced, otherwise via dynamic import.
            // The system exposes its app classes on globals for testing
            // (game.wh40k.applications / game.wh40k.combat etc). Where that
            // is unavailable, fall back to dynamic ESM import.
            async function loadClass(name: string): Promise<any> {
                // First, walk known surfaces.
                const candidates: Array<any> = [
                    g.game?.wh40k?.applications?.[name],
                    g.game?.wh40k?.[name],
                    g.wh40k?.[name],
                    g[name],
                ];
                for (const c of candidates) {
                    if (typeof c === 'function') return c;
                }
                // Dynamic import fallback. Module path is stable per the
                // build's emitted dist layout.
                const PATHS: Record<string, string> = {
                    CombatQuickPanel: '/systems/wh40k-rpg/module/applications/hud/combat-quick-panel.js',
                    EncounterBuilder: '/systems/wh40k-rpg/module/applications/npc/encounter-builder.js',
                    CombatPresetDialog: '/systems/wh40k-rpg/module/applications/npc/combat-preset-dialog.js',
                    DifficultyCalculatorDialog: '/systems/wh40k-rpg/module/applications/npc/difficulty-calculator-dialog.js',
                    NPCThreatScalerDialog: '/systems/wh40k-rpg/module/applications/npc/threat-scaler-dialog.js',
                };
                const path = PATHS[name];
                if (!path) return null;
                try {
                    const mod = await import(/* @vite-ignore */ path);
                    return mod?.default ?? mod?.[name] ?? null;
                } catch (err) {
                    notes[name] = `dynamic import failed: ${String((err as Error)?.message ?? err)}`;
                    return null;
                }
            }

            // For NPC-bound dialogs, create one transient NPC.
            let npcId: string | null = null;
            try {
                const a = await g.Actor?.create?.({
                    name: 'combat-ui-probe-npc',
                    type: 'bc-npc',
                    system: { gameSystem: 'bc' },
                });
                npcId = a?.id ?? null;
            } catch {
                /* ignore — UI probes that need an NPC will note missing */
            }
            const npc = npcId ? g.game?.actors?.get?.(npcId) : null;

            for (const name of classNames) {
                const Cls = await loadClass(name);
                if (typeof Cls !== 'function') {
                    notes[name] ??= 'class not resolvable';
                    continue;
                }
                try {
                    let instance: any;
                    switch (name) {
                        case 'CombatQuickPanel':
                            instance = new Cls();
                            break;
                        case 'EncounterBuilder':
                            // Singleton pattern — prefer .instance/.show, fall through to ctor.
                            instance = typeof Cls.instance !== 'undefined'
                                ? Cls.instance
                                : new Cls();
                            break;
                        case 'CombatPresetDialog':
                            instance = new Cls(null, 'library');
                            break;
                        case 'DifficultyCalculatorDialog':
                            if (!npc) { notes[name] = 'NPC not available for dialog ctor'; continue; }
                            instance = new Cls(npc);
                            break;
                        case 'NPCThreatScalerDialog':
                            if (!npc) { notes[name] = 'NPC not available for dialog ctor'; continue; }
                            instance = new Cls(npc);
                            break;
                        default:
                            notes[name] = 'unknown class in probe table';
                            continue;
                    }

                    if (instance && typeof instance.render === 'function') {
                        await instance.render(true);
                        // Allow render microtasks to flush.
                        await new Promise((r) => setTimeout(r, 50));
                        rendered[name] = true;
                        try { await instance.close?.(); } catch { /* ignore */ }
                    } else {
                        notes[name] = 'instance has no render method';
                    }
                } catch (err) {
                    notes[name] = `construction/render threw: ${String((err as Error)?.message ?? err)}`;
                }
            }

            if (npcId) {
                try { await g.game?.actors?.get?.(npcId)?.delete?.(); } catch { /* ignore */ }
            }

            return { rendered, notes };
            /* eslint-enable @typescript-eslint/no-explicit-any */
        }, COMBAT_UI_CLASSES);

        return {
            rendered: result.rendered as Record<UIClassName, boolean>,
            uiNotes: result.notes as Partial<Record<UIClassName, string>>,
            pageErrors,
        };
    } finally {
        page.off('pageerror', listener);
    }
}

test.describe.serial('combat lifecycle (Tier B)', () => {
    test('combat tracker drives full encounter lifecycle and renders combat UIs', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const flowProbe = await probeCombatLifecycle(page);
        const uiProbe = await probeCombatUI(page);

        const failures: string[] = [];

        for (const flow of COMBAT_FLOWS) {
            if (flowProbe.flowsFired[flow]) {
                recordCoverage('combat.flow', flow);
            } else {
                const note = flowProbe.flowNotes[flow] ?? 'flow did not fire and no diagnostic note recorded';
                failures.push(`flow ${flow}: ${note}`);
            }
        }

        for (const cls of COMBAT_UI_CLASSES) {
            if (uiProbe.rendered[cls]) {
                recordCoverage('combat.ui', cls);
            } else {
                const note = uiProbe.uiNotes[cls] ?? 'class did not render and no diagnostic note recorded';
                failures.push(`ui ${cls}: ${note}`);
            }
        }

        const pageErrorTail =
            flowProbe.pageErrors.length + uiProbe.pageErrors.length > 0
                ? `\n  pageerrors: ${[...flowProbe.pageErrors, ...uiProbe.pageErrors].slice(0, 5).join(' | ')}`
                : '';

        const totalAttempts = COMBAT_FLOWS.length + COMBAT_UI_CLASSES.length;
        expect(
            failures,
            `${failures.length}/${totalAttempts} combat probes failed:\n  - ${failures.join('\n  - ')}${pageErrorTail}`,
        ).toEqual([]);
    });
});
