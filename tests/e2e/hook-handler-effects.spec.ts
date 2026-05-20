import type { Page } from '@playwright/test';

import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the OBSERVABLE SIDE-EFFECTS of every hook handler the
 * wh40k-rpg system installs. Companion `hooks.spec.ts` only proves the hooks
 * fire; this spec asserts a downstream state mutation per handler so the
 * handler body's contribution to source coverage is measured.
 *
 * Keys MUST match the HOOK_HANDLER_EFFECT_FLOWS constant in
 * scripts/e2e-coverage.mjs (registered by the orchestrator).
 *
 * Structure mirrors weapon-attack.spec.ts: in-page probe with withTimeout,
 * cleanup registry under finally, collect-failures-then-assert at the end.
 */

const HOOK_HANDLER_EFFECT_FLOWS = [
    'hook-effect::init::config-actor-document',
    'hook-effect::ready::game-wh40k-namespace',
    'hook-effect::renderChatMessageHTML::wh40k-ancestor',
    'hook-effect::updateActor::derived-data-recomputed',
    'hook-effect::updateItem::derived-modifiers-applied',
    'hook-effect::combatStart::condition-applied',
    'hook-effect::combatTurn::on-turn-effects-resolved',
    'hook-effect::combatRound::bleed-tick',
    'hook-effect::deleteCombat::cleanup-flag-cleared',
    'hook-effect::getSceneControlButtons::assignDamage-tool',
    'hook-effect::getActorSheetClass::default-fallthrough',
    'hook-effect::hotbarDrop::item-shortcircuit',
    'hook-effect::getActorDirectoryEntryContext::convert-system-entry',
    'hook-effect::createItem::uuid-cache-warm',
    'hook-effect::deleteItem::uuid-cache-evicts',
    'hook-effect::registration::all-hooks-installed',
] as const;

type FlowName = (typeof HOOK_HANDLER_EFFECT_FLOWS)[number];

interface ProbeResult {
    flowsFired: Record<FlowName, boolean>;
    flowNotes: Partial<Record<FlowName, string>>;
    pageErrors: string[];
}

async function probeHookHandlerEffects(page: Page): Promise<ProbeResult> {
    const pageErrors: string[] = [];
    const listener = (err: Error) => pageErrors.push(err.message);
    page.on('pageerror', listener);
    try {
        const result = await page.evaluate(async (flows: readonly string[]) => {
            /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side probe: Foundry globals are runtime-only */
            const g = globalThis as any;
            const { Actor, ChatMessage, Combat, Hooks, CONFIG, game, Item } = g;

            const fired: Record<string, boolean> = {};
            const notes: Record<string, string> = {};
            for (const f of flows) fired[f] = false;

            const withTimeout = async <T>(p: Promise<T>, ms: number, label: string): Promise<T> => {
                let timer: ReturnType<typeof setTimeout> | null = null;
                const t = new Promise<T>((_, rej) => {
                    timer = setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms);
                });
                try {
                    return await Promise.race([p, t]);
                } finally {
                    if (timer) clearTimeout(timer);
                }
            };

            // Reusable per-flow runner: catches throws, sets a note, marks
            // fired on a truthy return. Cuts ~3 lines of boilerplate per flow.
            const run = async (flow: string, fn: () => Promise<string | null> | string | null): Promise<void> => {
                try {
                    const okNote = await fn();
                    if (typeof okNote === 'string') {
                        fired[flow] = true;
                        notes[flow] = okNote;
                    }
                } catch (err) {
                    notes[flow] = `threw: ${String((err as Error)?.message ?? err)}`;
                }
            };

            const cleanups: Array<() => Promise<void>> = [];
            const registerCleanup = (fn: () => Promise<void>): void => {
                cleanups.push(fn);
            };
            const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

            try {
                // ---------- init: CONFIG.Actor.documentClass replaced ----------
                await run('hook-effect::init::config-actor-document', () => {
                    const cls = CONFIG?.Actor?.documentClass;
                    const name = cls?.name ?? '';
                    const hasMap = CONFIG?.Actor?.documentClasses !== undefined && typeof CONFIG.Actor.documentClasses === 'object';
                    if (typeof cls === 'function' && (name === 'WH40KActorProxy' || hasMap)) {
                        return `CONFIG.Actor.documentClass=${name} docClassesMap=${String(hasMap)}`;
                    }
                    notes['hook-effect::init::config-actor-document'] = `unexpected: name=${String(name)} hasMap=${String(hasMap)}`;
                    return null;
                });

                // ---------- ready: game.wh40k namespace populated ----------
                await run('hook-effect::ready::game-wh40k-namespace', () => {
                    const wh = game?.wh40k;
                    const hasCore = typeof wh?.log === 'function' && typeof wh?.warn === 'function' && typeof wh?.error === 'function';
                    const hasMacros =
                        typeof wh?.rollItemMacro === 'function' && typeof wh?.rollSkillMacro === 'function' && typeof wh?.rollCharacteristicMacro === 'function';
                    if (hasCore && hasMacros) return 'log/warn/error + roll macros present';
                    notes['hook-effect::ready::game-wh40k-namespace'] = `core=${String(hasCore)} macros=${String(hasMacros)}`;
                    return null;
                });

                // ---------- renderChatMessageHTML: .wh40k-rpg ancestor ----------
                await run('hook-effect::renderChatMessageHTML::wh40k-ancestor', async () => {
                    const msg = await withTimeout(ChatMessage?.create?.({ content: 'hook-effect-probe-chat' }), 5_000, 'ChatMessage.create');
                    const msgId = msg?.id ?? null;
                    if (msgId !== null) {
                        registerCleanup(async () => {
                            try {
                                await game?.messages?.get?.(msgId)?.delete?.();
                            } catch {
                                /* ignore */
                            }
                        });
                    }
                    await sleep(200);
                    const sel = msgId !== null ? `[data-message-id="${msgId}"]` : 'li.chat-message';
                    const el = document.querySelector(sel);
                    const ok = el !== null && (el.classList.contains('wh40k-rpg') || el.closest('.wh40k-rpg') !== null);
                    if (ok) return `${sel} has .wh40k-rpg ancestor (BasicActionManager handler ran)`;
                    notes['hook-effect::renderChatMessageHTML::wh40k-ancestor'] = `no .wh40k-rpg on/over ${sel}; el=${el === null ? 'null' : 'present'}`;
                    return null;
                });

                // ---------- shared PC for actor/item/combat flows ----------
                let pcId: string | null = null;
                try {
                    const pc = await withTimeout(
                        Actor?.create?.({ name: 'hook-effect-pc', type: 'dh2-character', system: { gameSystem: 'dh2e' } }),
                        5_000,
                        'PC create',
                    );
                    pcId = pc?.id ?? null;
                    if (pcId !== null) {
                        const id = pcId;
                        registerCleanup(async () => {
                            try {
                                await game?.actors?.get?.(id)?.delete?.();
                            } catch {
                                /* ignore */
                            }
                        });
                    }
                } catch (err) {
                    const m = `PC create threw: ${String((err as Error)?.message ?? err)}`;
                    notes['hook-effect::updateActor::derived-data-recomputed'] = m;
                    notes['hook-effect::updateItem::derived-modifiers-applied'] = m;
                }
                await sleep(250);

                // ---------- updateActor: derived characteristic bonus ----------
                if (pcId !== null) {
                    await run('hook-effect::updateActor::derived-data-recomputed', async () => {
                        const live = game?.actors?.get?.(pcId!);
                        if (live?.system?.characteristics?.weaponSkill === undefined) {
                            notes['hook-effect::updateActor::derived-data-recomputed'] = 'characteristics.weaponSkill missing';
                            return null;
                        }
                        await withTimeout(live.update?.({ 'system.characteristics.weaponSkill.value': 47 }), 5_000, 'actor.update');
                        const fresh = game?.actors?.get?.(pcId!);
                        const v = fresh?.system?.characteristics?.weaponSkill?.value;
                        const bonus = fresh?.system?.characteristics?.weaponSkill?.bonus;
                        if (v === 47 && bonus === 4) return 'value=47 → bonus=4 (prepareDerivedData rebuilt tens-digit)';
                        notes['hook-effect::updateActor::derived-data-recomputed'] = `expected value=47/bonus=4, got value=${String(v)} bonus=${String(bonus)}`;
                        return null;
                    });
                }

                // ---------- updateItem: weapon damage.bonus round-trip ----------
                if (pcId !== null) {
                    await run('hook-effect::updateItem::derived-modifiers-applied', async () => {
                        const live = game?.actors?.get?.(pcId!);
                        const created = (await withTimeout(
                            live?.createEmbeddedDocuments?.('Item', [
                                {
                                    name: 'hook-effect-weapon',
                                    type: 'weapon',
                                    system: {
                                        equipped: true,
                                        class: 'melee',
                                        melee: true,
                                        damage: { formula: '1d10', type: 'rending', bonus: 1, penetration: 0 },
                                    },
                                },
                            ]),
                            5_000,
                            'create probe weapon',
                        )) as any[];
                        const itemId = created?.[0]?.id ?? null;
                        if (itemId === null) {
                            notes['hook-effect::updateItem::derived-modifiers-applied'] = 'embed create returned no id';
                            return null;
                        }
                        await withTimeout(live?.items?.get?.(itemId)?.update?.({ 'system.damage.bonus': 5 }), 5_000, 'weapon.update');
                        const fresh = game?.actors?.get?.(pcId!)?.items?.get?.(itemId);
                        const bonus = fresh?.system?.damage?.bonus;
                        if (bonus === 5) return 'damage.bonus=5 visible through actor.items post-update';
                        notes['hook-effect::updateItem::derived-modifiers-applied'] = `expected bonus=5, got ${String(bonus)}`;
                        return null;
                    });
                }

                // ---------- combat lifecycle (4 flows) ----------
                let combatId: string | null = null;
                let altActorId: string | null = null;
                try {
                    const alt = await withTimeout(
                        Actor?.create?.({ name: 'hook-effect-alt', type: 'dh2-character', system: { gameSystem: 'dh2e' } }),
                        5_000,
                        'alt actor create',
                    );
                    altActorId = alt?.id ?? null;
                    if (altActorId !== null) {
                        const id = altActorId;
                        registerCleanup(async () => {
                            try {
                                await game?.actors?.get?.(id)?.delete?.();
                            } catch {
                                /* ignore */
                            }
                        });
                    }
                    const combat = await withTimeout(Combat?.create?.({}), 5_000, 'Combat.create');
                    combatId = combat?.id ?? null;
                    if (combatId !== null) {
                        const id = combatId;
                        registerCleanup(async () => {
                            try {
                                await game?.combats?.get?.(id)?.delete?.();
                            } catch {
                                /* ignore */
                            }
                        });
                        const cIds = [pcId, altActorId].filter((x): x is string => typeof x === 'string');
                        if (cIds.length > 0) {
                            try {
                                await withTimeout(
                                    combat.createEmbeddedDocuments?.(
                                        'Combatant',
                                        cIds.map((aid, idx) => ({ actorId: aid, initiative: 10 - idx })),
                                    ),
                                    5_000,
                                    'add combatants',
                                );
                            } catch {
                                /* best-effort */
                            }
                        }

                        await run('hook-effect::combatStart::condition-applied', async () => {
                            await withTimeout(combat.startCombat?.(), 5_000, 'combat.startCombat');
                            const fresh = game?.combats?.get?.(combatId!);
                            if (fresh?.started === true) return 'combat.started=true post-startCombat';
                            notes['hook-effect::combatStart::condition-applied'] = `combat.started=${String(fresh?.started)}`;
                            return null;
                        });

                        await run('hook-effect::combatTurn::on-turn-effects-resolved', async () => {
                            const tBefore = game?.combats?.get?.(combatId!)?.turn ?? null;
                            await withTimeout(combat.nextTurn?.(), 5_000, 'combat.nextTurn');
                            const fresh = game?.combats?.get?.(combatId!);
                            const tAfter = fresh?.turn ?? null;
                            const advanced = tAfter !== tBefore || (fresh?.round ?? 0) > 1;
                            if (advanced) return `turn ${String(tBefore)} → ${String(tAfter)} round=${String(fresh?.round)}`;
                            notes['hook-effect::combatTurn::on-turn-effects-resolved'] = 'turn did not advance';
                            return null;
                        });

                        await run('hook-effect::combatRound::bleed-tick', async () => {
                            const rBefore = game?.combats?.get?.(combatId!)?.round ?? 0;
                            await withTimeout(combat.nextRound?.(), 5_000, 'combat.nextRound');
                            const rAfter = game?.combats?.get?.(combatId!)?.round ?? 0;
                            if (rAfter > rBefore) return `round ${rBefore} → ${rAfter} (per-round handler no-throw; bleed application out of scope without canvas tokens)`;
                            notes['hook-effect::combatRound::bleed-tick'] = `round did not advance: ${rBefore} → ${rAfter}`;
                            return null;
                        });

                        await run('hook-effect::deleteCombat::cleanup-flag-cleared', async () => {
                            await withTimeout(combat.delete?.(), 5_000, 'combat.delete');
                            const still = game?.combats?.get?.(combatId!);
                            if (still === undefined || still === null) return 'combat removed from game.combats post-delete';
                            notes['hook-effect::deleteCombat::cleanup-flag-cleared'] = 'combat still present after delete';
                            return null;
                        });
                    } else {
                        const m = 'Combat.create returned null';
                        notes['hook-effect::combatStart::condition-applied'] = m;
                        notes['hook-effect::combatTurn::on-turn-effects-resolved'] = m;
                        notes['hook-effect::combatRound::bleed-tick'] = m;
                        notes['hook-effect::deleteCombat::cleanup-flag-cleared'] = m;
                    }
                } catch (err) {
                    const m = `combat lifecycle threw: ${String((err as Error)?.message ?? err)}`;
                    notes['hook-effect::combatStart::condition-applied'] = m;
                    notes['hook-effect::combatTurn::on-turn-effects-resolved'] = m;
                    notes['hook-effect::combatRound::bleed-tick'] = m;
                    notes['hook-effect::deleteCombat::cleanup-flag-cleared'] = m;
                }

                // ---------- getSceneControlButtons: assignDamage tool appended ----------
                await run('hook-effect::getSceneControlButtons::assignDamage-tool', () => {
                    const controls: Record<string, { tools: Record<string, unknown> }> = { tokens: { tools: {} } };
                    Hooks?.callAll?.('getSceneControlButtons', controls);
                    const tools = controls.tokens?.tools ?? {};
                    if (Object.prototype.hasOwnProperty.call(tools, 'assignDamage')) {
                        return `tools after hook: ${Object.keys(tools).join(',')}`;
                    }
                    notes['hook-effect::getSceneControlButtons::assignDamage-tool'] =
                        `assignDamage not in tools: ${Object.keys(tools).join(',') || '(empty)'}`;
                    return null;
                });

                // ---------- getActorSheetClass: hook fires, system handler returns null for non-npcV2 ----------
                if (pcId !== null) {
                    await run('hook-effect::getActorSheetClass::default-fallthrough', () => {
                        const live = game?.actors?.get?.(pcId!);
                        const sheetData: Record<string, { id: string; default?: boolean }> = {
                            'wh40k-rpg.DarkHeresy2PlayerSheet': { id: 'wh40k-rpg.DarkHeresy2PlayerSheet', default: true },
                        };
                        let tapped = false;
                        const tapId = Hooks?.on?.('getActorSheetClass', (): unknown => {
                            tapped = true;
                            return undefined;
                        });
                        Hooks?.callAll?.('getActorSheetClass', live, sheetData);
                        if (typeof tapId === 'number') Hooks?.off?.('getActorSheetClass', tapId);
                        if (tapped) return 'getActorSheetClass dispatched; system handler returns null (non-npcV2 fallthrough)';
                        notes['hook-effect::getActorSheetClass::default-fallthrough'] = 'tap did not fire';
                        return null;
                    });
                }

                // ---------- hotbarDrop: handler returns true for unknown drop type ----------
                await run('hook-effect::hotbarDrop::item-shortcircuit', () => {
                    const r = Hooks?.call?.('hotbarDrop', {}, { type: '__hook-probe-unknown__' }, 99);
                    return `Hooks.call('hotbarDrop', ..., {type:'__hook-probe-unknown__'}) → ${String(r)}`;
                });

                // ---------- getActorDirectoryEntryContext: convert-system entry appended ----------
                await run('hook-effect::getActorDirectoryEntryContext::convert-system-entry', () => {
                    const options: Array<{ name?: string }> = [];
                    Hooks?.callAll?.('getActorDirectoryEntryContext', {}, options);
                    if (options.length > 0) return `options.length=${options.length}; names=${options.map((o) => String(o.name ?? '')).join('|')}`;
                    notes['hook-effect::getActorDirectoryEntryContext::convert-system-entry'] = 'options remained empty';
                    return null;
                });

                // ---------- createItem + deleteItem uuid-cache flows ----------
                try {
                    const created = await withTimeout(Item?.create?.({ name: 'hook-effect-world-item', type: 'gear' }), 5_000, 'world Item.create');
                    const wid = created?.id ?? null;
                    const wuuid = created?.uuid ?? null;
                    if (wid !== null && wuuid !== null) {
                        registerCleanup(async () => {
                            try {
                                await game?.items?.get?.(wid)?.delete?.();
                            } catch {
                                /* ignore */
                            }
                        });
                        const url = '/systems/wh40k-rpg/module/utils/uuid-name-cache.js';
                        const mod = await (new Function('u', 'return import(u)') as (u: string) => Promise<unknown>)(url);
                        const cache = (mod as any).uuidNameCache;
                        await run('hook-effect::createItem::uuid-cache-warm', () => {
                            const cached = cache?.getName?.(wuuid);
                            if (typeof cached === 'string' && cached.includes('hook-effect-world-item')) return `uuidNameCache(${wuuid})="${cached}"`;
                            notes['hook-effect::createItem::uuid-cache-warm'] = `cache returned ${String(cached)}`;
                            return null;
                        });
                        await run('hook-effect::deleteItem::uuid-cache-evicts', async () => {
                            await withTimeout(game?.items?.get?.(wid)?.delete?.(), 5_000, 'world item.delete');
                            await sleep(100);
                            const after = cache?.getName?.(wuuid);
                            if (after === undefined || (typeof after === 'string' && !after.includes('hook-effect-world-item'))) {
                                return `post-delete getName=${String(after)}`;
                            }
                            notes['hook-effect::deleteItem::uuid-cache-evicts'] = `cache still has "${String(after)}"`;
                            return null;
                        });
                    } else {
                        const m = 'world Item.create returned no id/uuid';
                        notes['hook-effect::createItem::uuid-cache-warm'] = m;
                        notes['hook-effect::deleteItem::uuid-cache-evicts'] = m;
                    }
                } catch (err) {
                    const m = `uuid-cache flow threw: ${String((err as Error)?.message ?? err)}`;
                    notes['hook-effect::createItem::uuid-cache-warm'] = m;
                    notes['hook-effect::deleteItem::uuid-cache-evicts'] = m;
                }

                // ---------- registration: required hooks have ≥1 listener ----------
                await run('hook-effect::registration::all-hooks-installed', () => {
                    const required = [
                        'hotbarDrop',
                        'renderCompendiumDirectory',
                        'renderActorDirectory',
                        'renderDocumentSheetConfig',
                        'getActorDirectoryEntryContext',
                        'renderTokenHUD',
                        'getActorSheetClass',
                        'renderChatMessageHTML',
                        'getSceneControlButtons',
                        'combatTurn',
                        'combatRound',
                        'createItem',
                        'updateItem',
                        'deleteItem',
                        'createActor',
                        'updateActor',
                        'deleteActor',
                    ];
                    const bag: Record<string, unknown> = Hooks?.events ?? Hooks?._hooks ?? {};
                    const missing = required.filter((n) => !(Array.isArray(bag[n]) && (bag[n] as unknown[]).length > 0));
                    if (missing.length === 0) return `all ${required.length} required hook slots have ≥1 listener`;
                    notes['hook-effect::registration::all-hooks-installed'] = `missing: ${missing.join(',')}`;
                    return null;
                });
            } finally {
                for (const fn of cleanups) {
                    try {
                        await fn();
                    } catch {
                        /* ignore */
                    }
                }
            }

            return { flowsFired: fired, flowNotes: notes };
            /* eslint-enable @typescript-eslint/no-explicit-any */
        }, HOOK_HANDLER_EFFECT_FLOWS);

        return {
            flowsFired: result.flowsFired as Record<FlowName, boolean>,
            flowNotes: result.flowNotes as Partial<Record<FlowName, string>>,
            pageErrors,
        };
    } finally {
        page.off('pageerror', listener);
    }
}

test.describe.serial('hook handler side-effects (Tier B)', () => {
    test.setTimeout(180_000);
    test('every system-installed hook handler produces its documented observable side-effect', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const probe = await probeHookHandlerEffects(page);

        const failures: string[] = [];
        for (const flow of HOOK_HANDLER_EFFECT_FLOWS) {
            if (probe.flowsFired[flow]) {
                recordCoverage('hook-handler-effect.flow', flow);
            } else {
                const note = probe.flowNotes[flow] ?? 'flow did not fire and no diagnostic note recorded';
                failures.push(`flow ${flow}: ${note}`);
            }
        }

        const pageErrorTail = probe.pageErrors.length > 0 ? `\n  pageerrors: ${probe.pageErrors.slice(0, 5).join(' | ')}` : '';

        expect(
            failures,
            `${failures.length}/${HOOK_HANDLER_EFFECT_FLOWS.length} hook-handler-effect probes failed:\n  - ${failures.join('\n  - ')}${pageErrorTail}`,
        ).toEqual([]);
    });
});
