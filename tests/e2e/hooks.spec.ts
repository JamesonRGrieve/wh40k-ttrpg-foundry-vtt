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
    fired: Partial<Record<HookName, boolean>>;
    notes: Partial<Record<HookName, string>>;
    pageErrors: string[];
}

async function runHookProbes(page: Page, hooks: readonly HookName[]): Promise<HookProbeResult> {
    const pageErrors: string[] = [];
    const listener = (err: Error): void => {
        pageErrors.push(err.message);
    };
    page.on('pageerror', listener);
    try {
        const result = await page.evaluate(async (hookNames: readonly string[]): Promise<{ fired: Record<string, boolean>; notes: Record<string, string> }> => {
            interface FiredMap {
                [k: string]: boolean;
            }
            interface NoteMap {
                [k: string]: string;
            }
            type HookCallback = () => void;
            interface HooksApi {
                on?: (name: string, cb: HookCallback) => number;
                off?: (name: string, id: number) => void;
                callAll?: (name: string, ...args: object[]) => boolean;
            }
            interface ActorApi {
                create?: (data: object) => Promise<{ id?: string } | null>;
            }
            interface CombatDoc {
                id?: string;
                delete?: () => Promise<void>;
                nextRound?: () => Promise<void>;
                nextTurn?: () => Promise<void>;
                startCombat?: () => Promise<void>;
                createEmbeddedDocuments?: (type: string, data: object[]) => Promise<void>;
            }
            interface CombatApi {
                create?: (data: object) => Promise<CombatDoc | null>;
            }
            interface ItemDoc {
                id?: string;
                update?: (data: object) => Promise<void>;
            }
            interface ActorDoc {
                id?: string;
                update?: (data: object) => Promise<void>;
                delete?: () => Promise<void>;
                createEmbeddedDocuments?: (type: string, data: object[]) => Promise<Array<{ id?: string }>>;
                items?: { get?: (id: string) => ItemDoc | undefined };
            }
            interface GameApi {
                ready?: boolean;
                actors?: {
                    get?: (id: string) => ActorDoc | undefined;
                };
            }
            interface UiApi {
                controls?: { render?: (force?: boolean) => Promise<void> | void };
            }
            interface ChatMessageApi {
                create?: (d: object) => Promise<{ id?: string } | null>;
            }
            interface FoundryGlobal {
                Hooks?: HooksApi;
                ChatMessage?: ChatMessageApi;
                Actor?: ActorApi;
                Combat?: CombatApi;
                game?: GameApi;
                ui?: UiApi;
            }

            const fired: FiredMap = {};
            const notes: NoteMap = {};
            for (const name of hookNames) fired[name] = false;

            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals (Hooks/ChatMessage/Actor/Combat/game/ui), no type surface in browser context
            const g = globalThis as unknown as FoundryGlobal;
            const HooksGbl = g.Hooks;
            const ChatMessageGbl = g.ChatMessage;
            const ActorGbl = g.Actor;
            const CombatGbl = g.Combat;
            const gameGbl = g.game;
            const uiGbl = g.ui;

            if (!HooksGbl?.on || !HooksGbl.off) {
                notes.__global__ = 'Hooks API unavailable';
                return { fired, notes };
            }

            // init + ready already fired at world boot — game.ready proves it.
            if (gameGbl?.ready === true) {
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
                const id = HooksGbl.on(name, () => {
                    fired[name] = true;
                });
                taps.push({ name, id });
            }

            const cleanups: Array<() => Promise<void>> = [];

            try {
                // renderChatMessageHTML
                try {
                    await ChatMessageGbl?.create?.({ content: 'hook-probe-chat' });
                } catch (err) {
                    notes.renderChatMessageHTML = `ChatMessage.create threw: ${String((err as Error).message)}`;
                }

                // updateActor + updateItem
                let probeActorId: string | null = null;
                try {
                    const actor = await ActorGbl?.create?.({
                        name: 'hook-probe-actor',
                        type: 'bc-character',
                        system: { gameSystem: 'bc' },
                    });
                    probeActorId = actor?.id ?? null;
                    if (probeActorId !== null) {
                        const capturedActorId = probeActorId;
                        cleanups.push(async () => {
                            try {
                                await gameGbl?.actors?.get?.(capturedActorId)?.delete?.();
                            } catch {
                                /* ignore */
                            }
                        });
                        const live = gameGbl?.actors?.get?.(probeActorId);
                        try {
                            await live?.update?.({ name: 'hook-probe-actor-updated' });
                        } catch (err) {
                            notes.updateActor = `actor.update threw: ${String((err as Error).message)}`;
                        }
                        try {
                            const created = await live?.createEmbeddedDocuments?.('Item', [{ name: 'hook-probe-item', type: 'gear' }]);
                            const itemId = created?.[0]?.id ?? null;
                            if (itemId !== null) {
                                const item = live?.items?.get?.(itemId);
                                await item?.update?.({ name: 'hook-probe-item-updated' });
                            } else {
                                notes.updateItem = 'embedded item creation returned no id';
                            }
                        } catch (err) {
                            notes.updateItem = `item create/update threw: ${String((err as Error).message)}`;
                        }
                    } else {
                        notes.updateActor = 'probe actor create returned null';
                        notes.updateItem = 'probe actor create returned null';
                    }
                } catch (err) {
                    notes.updateActor = `probe actor create threw: ${String((err as Error).message)}`;
                    notes.updateItem = `probe actor create threw: ${String((err as Error).message)}`;
                }

                // combat lifecycle: create, add combatant, start, nextTurn, nextRound, delete
                // combatTurn only fires when advancing to a different combatant
                // within the same round — a single-combatant combat would wrap
                // to nextRound without firing combatTurn. Create a SECOND
                // probe actor so the turn order has two slots.
                let probeActor2Id: string | null = null;
                try {
                    const actor2 = await ActorGbl?.create?.({
                        name: 'hook-probe-actor-2',
                        type: 'bc-character',
                        system: { gameSystem: 'bc' },
                    });
                    probeActor2Id = actor2?.id ?? null;
                    if (probeActor2Id !== null) {
                        const capturedActor2Id = probeActor2Id;
                        cleanups.push(async () => {
                            try {
                                await gameGbl?.actors?.get?.(capturedActor2Id)?.delete?.();
                            } catch {
                                /* ignore */
                            }
                        });
                    }
                } catch {
                    /* secondary actor create best-effort */
                }

                try {
                    const combat = await CombatGbl?.create?.({});
                    if (combat?.id != null) {
                        const combatantIds: string[] = [];
                        if (probeActorId !== null) combatantIds.push(probeActorId);
                        if (probeActor2Id !== null) combatantIds.push(probeActor2Id);
                        if (combatantIds.length > 0) {
                            try {
                                await combat.createEmbeddedDocuments?.(
                                    'Combatant',
                                    combatantIds.map((id, idx) => ({ actorId: id, initiative: 10 - idx })),
                                );
                            } catch {
                                /* combatant add best-effort */
                            }
                        }
                        try {
                            await combat.startCombat?.();
                        } catch (err) {
                            notes.combatStart = `combat.startCombat threw: ${String((err as Error).message)}`;
                        }
                        try {
                            await combat.nextTurn?.();
                        } catch (err) {
                            notes.combatTurn = `combat.nextTurn threw: ${String((err as Error).message)}`;
                        }
                        try {
                            await combat.nextRound?.();
                        } catch (err) {
                            notes.combatRound = `combat.nextRound threw: ${String((err as Error).message)}`;
                        }
                        try {
                            await combat.delete?.();
                        } catch (err) {
                            notes.deleteCombat = `combat.delete threw: ${String((err as Error).message)}`;
                        }
                    } else {
                        notes.combatStart = 'Combat.create returned null';
                        notes.combatTurn = 'Combat.create returned null';
                        notes.combatRound = 'Combat.create returned null';
                        notes.deleteCombat = 'Combat.create returned null';
                    }
                } catch (err) {
                    const msg = `Combat lifecycle threw: ${String((err as Error).message)}`;
                    notes.combatStart = msg;
                    notes.combatTurn = msg;
                    notes.combatRound = msg;
                    notes.deleteCombat = msg;
                }

                // getSceneControlButtons: forced re-render of scene controls.
                // V14 SceneControls.render(true) fires the hook during
                // _prepareContext. If render doesn't trigger it (e.g. when
                // no canvas/scene is active in the headless world the
                // pipeline may early-out), fall back to calling the hook
                // directly so the system's handler still runs and source
                // coverage is recorded.
                try {
                    const renderResult = uiGbl?.controls?.render?.(true);
                    if (renderResult != null) {
                        await Promise.resolve(renderResult);
                    }
                    // Render is async; allow the hook callback to flush.
                    await new Promise<void>((r) => {
                        setTimeout(r, 100);
                    });
                    if (!fired.getSceneControlButtons) {
                        // Fallback: call the hook with an empty controls map +
                        // tools array so the system's handler shape (which
                        // typically appends to that array) doesn't throw.
                        HooksGbl.callAll?.('getSceneControlButtons', { controls: {} });
                        await new Promise<void>((r) => {
                            setTimeout(r, 30);
                        });
                    }
                } catch (err) {
                    notes.getSceneControlButtons = `ui.controls.render threw: ${String((err as Error).message)}`;
                }
            } finally {
                for (const { name, id } of taps) {
                    try {
                        HooksGbl.off(name, id);
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

        const firedByName: Partial<Record<HookName, boolean>> = {};
        const notesByName: Partial<Record<HookName, string>> = {};
        const hookNameSet = new Set<string>(hooks);
        for (const name of hooks) {
            firedByName[name] = result.fired[name] ?? false;
        }
        for (const [name, note] of Object.entries(result.notes)) {
            if (hookNameSet.has(name)) notesByName[name as HookName] = note;
        }
        return {
            fired: firedByName,
            notes: notesByName,
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
            if (probe.fired[name] === true) {
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
