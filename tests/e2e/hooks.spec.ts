import type { Page } from '@playwright/test';

import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Hook-fired coverage. Each entry in EXERCISED_HOOKS names a Foundry hook
 * the wh40k-rpg system registers in `src/module/`. The single test below
 * triggers each hook's underlying action, in-page, then asserts that the
 * fire was observed via a Hooks.on('<name>', …) tap installed at the top
 * of the run.
 *
 * Goal: drive source-code coverage on the registered handler bodies
 * themselves — HooksManager, CombatActionManager, BasicActionManager,
 * TargetedActionManager, CombatQuickPanel, base-actor-sheet,
 * chat-message renderChatMessageHTML, token render hook.
 *
 * Hooks that cannot be fired reliably in a headless world (no scene, no
 * token, no canvas) are SKIPPED with a recorded note rather than faked.
 *
 * Keep the EXERCISED_HOOKS list in sync with the EXERCISED_HOOKS const in
 * `scripts/e2e-coverage.mjs` — the denominator there must match the keys
 * recorded here.
 */
const EXERCISED_HOOKS = [
    'init',
    'ready',
    'renderChatMessageHTML',
    'updateActor',
    'updateItem',
    'combatStart',
    'combatTurn',
    'combatRound',
    'deleteCombat',
    'getSceneControlButtons',
] as const;

type HookName = (typeof EXERCISED_HOOKS)[number];

interface HookProbeResult {
    fired: Record<HookName, boolean>;
    notes: Partial<Record<HookName, string>>;
    pageErrors: string[];
}

async function runHookProbes(page: Page, hooks: readonly HookName[]): Promise<HookProbeResult> {
    const pageErrors: string[] = [];
    const listener = (err: Error) => pageErrors.push(err.message);
    page.on('pageerror', listener);
    try {
        const result = await page.evaluate(async (hookNames: readonly string[]) => {
            interface FiredMap {
                [k: string]: boolean;
            }
            interface NoteMap {
                [k: string]: string;
            }
            interface HooksApi {
                on?: (name: string, cb: (...args: unknown[]) => unknown) => number;
                off?: (name: string, id: number) => void;
            }
            interface ActorApi {
                create?: (data: object) => Promise<{ id?: string } | null>;
            }
            interface ItemApi {
                create?: (data: object, options?: object) => Promise<{ id?: string } | null>;
            }
            interface CombatApi {
                create?: (data: object) => Promise<{
                    id?: string;
                    delete?: () => Promise<unknown>;
                    nextRound?: () => Promise<unknown>;
                    nextTurn?: () => Promise<unknown>;
                    startCombat?: () => Promise<unknown>;
                    createEmbeddedDocuments?: (type: string, data: object[]) => Promise<unknown>;
                } | null>;
            }
            interface GameApi {
                ready?: boolean;
                actors?: {
                    get?: (id: string) =>
                        | {
                              id?: string;
                              update?: (data: object) => Promise<unknown>;
                              delete?: () => Promise<unknown>;
                              createEmbeddedDocuments?: (type: string, data: object[]) => Promise<Array<{ id?: string }>>;
                              items?: { get?: (id: string) => { id?: string; update?: (data: object) => Promise<unknown> } | undefined };
                          }
                        | undefined;
                };
            }
            interface UiApi {
                controls?: { render?: (force?: boolean) => unknown };
            }

            const fired: FiredMap = {};
            const notes: NoteMap = {};
            for (const name of hookNames) fired[name] = false;

            const Hooks = (globalThis as unknown as { Hooks?: HooksApi }).Hooks;
            const ChatMessage = (globalThis as unknown as { ChatMessage?: { create?: (d: object) => Promise<{ id?: string } | null> } }).ChatMessage;
            const Actor = (globalThis as unknown as { Actor?: ActorApi }).Actor;
            const Combat = (globalThis as unknown as { Combat?: CombatApi }).Combat;
            const game = (globalThis as unknown as { game?: GameApi }).game;
            const ui = (globalThis as unknown as { ui?: UiApi }).ui;

            if (!Hooks?.on || !Hooks?.off) {
                notes.__global__ = 'Hooks API unavailable';
                return { fired, notes };
            }

            // init + ready already fired at world boot — game.ready proves it.
            if (game?.ready === true) {
                fired.init = true;
                fired.ready = true;
            } else {
                notes.init = 'game.ready is not true; cannot prove init/ready fired';
                notes.ready = 'game.ready is not true; cannot prove init/ready fired';
            }

            // Subscribe taps for the remaining hooks before triggering.
            const taps: Array<{ name: string; id: number }> = [];
            const tapNames = hookNames.filter((n) => n !== 'init' && n !== 'ready');
            for (const name of tapNames) {
                const id = Hooks.on(name, () => {
                    fired[name] = true;
                });
                taps.push({ name, id });
            }

            const cleanups: Array<() => Promise<void>> = [];

            try {
                // renderChatMessageHTML
                try {
                    await ChatMessage?.create?.({ content: 'hook-probe-chat' });
                } catch (err) {
                    notes.renderChatMessageHTML = `ChatMessage.create threw: ${String((err as Error)?.message ?? err)}`;
                }

                // updateActor + updateItem
                let probeActorId: string | null = null;
                try {
                    const actor = await Actor?.create?.({
                        name: 'hook-probe-actor',
                        type: 'bc-character',
                        system: { gameSystem: 'bc' },
                    });
                    probeActorId = actor?.id ?? null;
                    if (probeActorId) {
                        cleanups.push(async () => {
                            try {
                                await game?.actors?.get?.(probeActorId!)?.delete?.();
                            } catch {
                                /* ignore */
                            }
                        });
                        const live = game?.actors?.get?.(probeActorId);
                        try {
                            await live?.update?.({ name: 'hook-probe-actor-updated' });
                        } catch (err) {
                            notes.updateActor = `actor.update threw: ${String((err as Error)?.message ?? err)}`;
                        }
                        try {
                            const created = await live?.createEmbeddedDocuments?.('Item', [{ name: 'hook-probe-item', type: 'gear' }]);
                            const itemId = created?.[0]?.id ?? null;
                            if (itemId) {
                                const item = live?.items?.get?.(itemId);
                                await item?.update?.({ name: 'hook-probe-item-updated' });
                            } else {
                                notes.updateItem = 'embedded item creation returned no id';
                            }
                        } catch (err) {
                            notes.updateItem = `item create/update threw: ${String((err as Error)?.message ?? err)}`;
                        }
                    } else {
                        notes.updateActor = 'probe actor create returned null';
                        notes.updateItem = 'probe actor create returned null';
                    }
                } catch (err) {
                    notes.updateActor = `probe actor create threw: ${String((err as Error)?.message ?? err)}`;
                    notes.updateItem = `probe actor create threw: ${String((err as Error)?.message ?? err)}`;
                }

                // combat lifecycle: create, add combatant, start, nextTurn, nextRound, delete
                try {
                    const combat = await Combat?.create?.({});
                    if (combat?.id) {
                        if (probeActorId) {
                            try {
                                await combat.createEmbeddedDocuments?.('Combatant', [{ actorId: probeActorId }]);
                            } catch {
                                /* combatant add best-effort */
                            }
                        }
                        try {
                            await combat.startCombat?.();
                        } catch (err) {
                            notes.combatStart = `combat.startCombat threw: ${String((err as Error)?.message ?? err)}`;
                        }
                        try {
                            await combat.nextTurn?.();
                        } catch (err) {
                            notes.combatTurn = `combat.nextTurn threw: ${String((err as Error)?.message ?? err)}`;
                        }
                        try {
                            await combat.nextRound?.();
                        } catch (err) {
                            notes.combatRound = `combat.nextRound threw: ${String((err as Error)?.message ?? err)}`;
                        }
                        try {
                            await combat.delete?.();
                        } catch (err) {
                            notes.deleteCombat = `combat.delete threw: ${String((err as Error)?.message ?? err)}`;
                        }
                    } else {
                        notes.combatStart = 'Combat.create returned null';
                        notes.combatTurn = 'Combat.create returned null';
                        notes.combatRound = 'Combat.create returned null';
                        notes.deleteCombat = 'Combat.create returned null';
                    }
                } catch (err) {
                    const msg = `Combat lifecycle threw: ${String((err as Error)?.message ?? err)}`;
                    notes.combatStart = msg;
                    notes.combatTurn = msg;
                    notes.combatRound = msg;
                    notes.deleteCombat = msg;
                }

                // getSceneControlButtons: forced re-render of scene controls.
                try {
                    ui?.controls?.render?.(true);
                    // Render is sync-trigger but the hook fires on next microtask.
                    await new Promise((r) => setTimeout(r, 50));
                } catch (err) {
                    notes.getSceneControlButtons = `ui.controls.render threw: ${String((err as Error)?.message ?? err)}`;
                }
            } finally {
                for (const { name, id } of taps) {
                    try {
                        Hooks.off?.(name, id);
                    } catch {
                        /* ignore */
                    }
                }
                for (const fn of cleanups) {
                    await fn();
                }
            }

            return { fired, notes };
        }, hooks);

        return {
            fired: result.fired as Record<HookName, boolean>,
            notes: result.notes as Partial<Record<HookName, string>>,
            pageErrors,
        };
    } finally {
        page.off('pageerror', listener);
    }
}

test.describe.serial('hook-fired coverage (Tier B)', () => {
    test('every registered Foundry hook the system listens on fires when triggered', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'no Gamemaster option appeared in the join select within 30s');

        const probe = await runHookProbes(page, EXERCISED_HOOKS);

        const failures: string[] = [];
        for (const name of EXERCISED_HOOKS) {
            if (probe.fired[name]) {
                recordCoverage('hook.fired', name);
            } else {
                const note = probe.notes[name] ?? 'hook did not fire and no diagnostic note recorded';
                failures.push(`${name}: ${note}`);
            }
        }

        // Page errors during hook probes are useful diagnostic signal but
        // should not in themselves fail the test — handlers occasionally log
        // benign warnings to the console. Surface them as part of the
        // failure message when at least one hook failed to fire.
        const pageErrorTail = probe.pageErrors.length > 0 ? `\n  pageerrors: ${probe.pageErrors.slice(0, 3).join(' | ')}` : '';

        expect(failures, `${failures.length}/${EXERCISED_HOOKS.length} hooks failed to fire:\n  - ${failures.join('\n  - ')}${pageErrorTail}`).toEqual([]);
    });
});
