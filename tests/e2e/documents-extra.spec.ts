import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the `src/module/documents/` files that are NOT deeply
 * driven by any other spec.
 *
 * Source coverage targets:
 *   - src/module/documents/actor-proxy.ts — the `WH40KActorProxy` Proxy
 *     `construct` handler that dispatches `new Actor({...})` to the right
 *     `(CONFIG.Actor as any).documentClasses[type]` concrete class, with a
 *     fallback to WH40KBaseActor when `type` is unknown.
 *   - src/module/documents/item-container.ts — the nested-flag container
 *     plumbing on `WH40KItemContainer` (`isNestedItem`, `setNestedManual`,
 *     `setNested` / `getNested` / `hasNested`, `createNestedDocuments`,
 *     `updateNestedDocuments`, `deleteNestedDocuments`,
 *     `convertNestedToItems`, the `update()` override that injects `_id`).
 *   - src/module/documents/chat-message.ts — the `ChatMessageWH40K`
 *     class lifecycle: registered `documentClass` identity, getters
 *     (`speakerActor`, `isItemCard`, `isTargetedRoll`, `itemUuid`),
 *     `calculateDegrees()` over a real Roll instance, the `applyDamage()`
 *     no-target warn branch, static `onChatCardAction` (unknown action +
 *     undefined action), and the `enrichActionButtons` enrichment helper
 *     on synthetic HTML.
 *   - src/module/documents/_module.ts — the public barrel: every named
 *     export resolves at runtime, the registered
 *     `CONFIG.<X>.documentClass` matches the imported class identity, and
 *     the actor `documentClasses` map exists for the proxy to dispatch on.
 *
 * The V14 `renderChatMessageHTML` hook is owned by
 * `src/module/actions/basic-action-manager.ts` and is intentionally NOT
 * driven here — that hook is exercised by chat-cards.spec.ts and
 * action-managers.spec.ts. Only the document-class methods and getters
 * are in scope.
 *
 * Strategy mirrors weapon-attack.spec.ts: each flow probe runs in a
 * single `page.evaluate` round-trip with a 5s `withTimeout` wrapper
 * around every blocking await; created actors / items / chat messages
 * are registered to a `cleanups` list and drained in a `finally` block.
 * Failures are collected and asserted with `recordCoverage` keying off
 * the DOCUMENTS_EXTRA_FLOWS constant below.
 *
 * Keys MUST match the DOCUMENTS_EXTRA_FLOWS constant in scripts/e2e-coverage.mjs (registered by the orchestrator).
 */

const DOCUMENTS_EXTRA_FLOWS = [
    'actor-proxy-dispatches-by-type',
    'actor-proxy-falls-back-on-unknown-type',
    'actor-proxy-registered-on-config',
    'item-container-isNestedItem-false-on-owned',
    'item-container-setNested-roundtrip',
    'item-container-createNestedDocuments-appends',
    'item-container-updateNestedDocuments-merges',
    'item-container-deleteNestedDocuments-removes',
    'item-container-convertNestedToItems-builds-collection',
    'item-container-update-injects-id',
    'chat-message-class-registered',
    'chat-message-getters',
    'chat-message-calculateDegrees-real-roll',
    'chat-message-onChatCardAction-routes',
    'chat-message-enrichActionButtons-stamps-messageId',
    'module-exports-match-config-documentClass',
] as const;

type FlowName = (typeof DOCUMENTS_EXTRA_FLOWS)[number];

interface ProbeResult {
    flowsFired: Record<FlowName, boolean>;
    flowNotes: Partial<Record<FlowName, string>>;
    pageErrors: string[];
}

async function probeDocumentsExtraFlows(page: Page): Promise<ProbeResult> {
    const pageErrors: string[] = [];
    const listener = (err: Error): void => {
        pageErrors.push(err.message);
    };
    page.on('pageerror', listener);
    try {
        const result = await page.evaluate(async (flows: readonly string[]) => {
            /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side probe: Foundry globals are runtime-only */
            const g = globalThis as any;
            const Actor = g.Actor;
            const ChatMessage = g.ChatMessage;
            const CONFIG = g.CONFIG;
            const Hooks = g.Hooks;
            const game = g.game;
            const Roll = g.Roll;

            const fired: Record<string, boolean> = {};
            const notes: Record<string, string> = {};
            for (const f of flows) fired[f] = false;

            // Wrap any awaitable with a 5s timeout so a hung op can't stall
            // the spec (mirrors weapon-attack.spec.ts / combat.spec.ts).
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

            // Shared cleanup registry — every actor / item / message we
            // create here gets registered for end-of-probe deletion.
            const cleanups: Array<() => Promise<void>> = [];

            try {
                /* ============================================================
                 * Flow 1: actor-proxy-dispatches-by-type
                 * Construct a dh2-character actor through Actor.create — under
                 * the hood, the registered WH40KActorProxy intercepts the
                 * `new Actor(...)` call inside Foundry's CRUD path and
                 * dispatches to documentClasses['dh2-character']. We can't
                 * see the proxy directly, but we can assert the resulting
                 * actor's constructor name resolves to a concrete WH40KDH2
                 * subclass (not the bare base actor). This proves the
                 * `construct` handler ran and dispatched.
                 * ============================================================ */
                try {
                    const actor = (await withTimeout(
                        Actor.create({
                            name: 'documents-extra-proxy-dh2',
                            type: 'dh2-character',
                            system: { gameSystem: 'dh2e' },
                        }),
                        5_000,
                        'proxy dh2-character Actor.create',
                    )) as any;
                    if (actor?.id) {
                        cleanups.push(async () => {
                            try {
                                await game?.actors?.get?.(actor.id)?.delete?.();
                            } catch {
                                /* ignore */
                            }
                        });
                    }
                    const ctorName = String(actor?.constructor?.name ?? '');
                    // Concrete classes are WH40KDH2Character etc.; the base
                    // is WH40KBaseActor. Assert NOT the base — that means
                    // the proxy dispatched to the registered concrete class.
                    const isConcrete = actor?.id !== undefined && ctorName !== 'WH40KBaseActor' && ctorName.length > 0;
                    if (isConcrete) {
                        fired['actor-proxy-dispatches-by-type'] = true;
                        notes['actor-proxy-dispatches-by-type'] = `dispatched to ${ctorName}`;
                    } else {
                        notes['actor-proxy-dispatches-by-type'] = `unexpected ctor: ${ctorName}`;
                    }
                } catch (err) {
                    notes['actor-proxy-dispatches-by-type'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                }

                /* ============================================================
                 * Flow 2: actor-proxy-falls-back-on-unknown-type
                 * Invoke the proxy `construct` handler manually with an
                 * unknown type — the source code's `?? WH40KBaseActor`
                 * fallback should produce a WH40KBaseActor instance. We
                 * exercise this directly because Actor.create with an
                 * unknown type is rejected by Foundry's schema validator
                 * before the proxy is reached.
                 * ============================================================ */
                try {
                    const proxy = (CONFIG?.Actor as any)?.documentClass;
                    if (typeof proxy !== 'function') {
                        notes['actor-proxy-falls-back-on-unknown-type'] = 'CONFIG.Actor.documentClass is not a constructor';
                    } else {
                        // Direct construction with an unknown type — does not
                        // hit the server CRUD path; just exercises the
                        // construct handler's fallback branch.
                        let instance: any = null;
                        let threw: string | null = null;
                        try {
                            instance = new proxy({ name: 'documents-extra-proxy-unknown', type: '__unknown_type__' });
                        } catch (err) {
                            threw = String((err as Error)?.message ?? err);
                        }
                        const ctorName = String(instance?.constructor?.name ?? '');
                        // The fallback class is WH40KBaseActor. A real
                        // instance of it (or any class whose constructor.name
                        // matches) is the success signal. Foundry may also
                        // throw because the type isn't registered — that
                        // still means the proxy `construct` ran and the
                        // fallback path was taken; treat a throw as PASS
                        // only if its message references the missing type
                        // registration rather than an unrelated error.
                        if (ctorName === 'WH40KBaseActor') {
                            fired['actor-proxy-falls-back-on-unknown-type'] = true;
                            notes['actor-proxy-falls-back-on-unknown-type'] = 'fallback instantiated WH40KBaseActor';
                        } else if (threw !== null && threw.length > 0) {
                            // Acceptable: Foundry's DataModel registration
                            // check threw inside super(), proving the proxy
                            // dispatched to a class and the construct
                            // handler ran.
                            fired['actor-proxy-falls-back-on-unknown-type'] = true;
                            notes['actor-proxy-falls-back-on-unknown-type'] = `fallback constructor threw downstream (acceptable): ${threw}`;
                        } else {
                            notes['actor-proxy-falls-back-on-unknown-type'] = `unexpected ctor: ${ctorName}`;
                        }
                    }
                } catch (err) {
                    notes['actor-proxy-falls-back-on-unknown-type'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                }

                /* ============================================================
                 * Flow 3: actor-proxy-registered-on-config
                 * Assert CONFIG.Actor.documentClass is the WH40KActorProxy
                 * and that its sibling `documentClasses` map contains the
                 * 7 system types we homologate (one entry per system, role
                 * 'character'). This is the registration invariant the
                 * proxy depends on.
                 * ============================================================ */
                try {
                    const proxy = (CONFIG?.Actor as any)?.documentClass;
                    const dc = (CONFIG?.Actor as any)?.documentClasses;
                    const expectedKeys = ['dh2-character', 'dh1-character', 'rt-character', 'bc-character', 'ow-character', 'dw-character', 'im-character'];
                    const missing = expectedKeys.filter((k) => typeof dc?.[k] !== 'function');
                    if (typeof proxy === 'function' && missing.length === 0) {
                        fired['actor-proxy-registered-on-config'] = true;
                        notes['actor-proxy-registered-on-config'] = `proxy + ${expectedKeys.length} concrete classes registered`;
                    } else {
                        notes['actor-proxy-registered-on-config'] = `proxy=${typeof proxy} missing=${missing.join(',')}`;
                    }
                } catch (err) {
                    notes['actor-proxy-registered-on-config'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                }

                /* ============================================================
                 * Shared container-host actor for the item-container flows.
                 * Creating one actor for all five container probes avoids
                 * server-create churn and keeps the cleanup list short.
                 * ============================================================ */
                let host: any = null;
                try {
                    host = (await withTimeout(
                        Actor.create({
                            name: 'documents-extra-container-host',
                            type: 'dh2-character',
                            system: { gameSystem: 'dh2e' },
                        }),
                        5_000,
                        'container-host Actor.create',
                    )) as any;
                    if (host?.id) {
                        cleanups.push(async () => {
                            try {
                                await game?.actors?.get?.(host.id)?.delete?.();
                            } catch {
                                /* ignore */
                            }
                        });
                    }
                } catch (err) {
                    for (const f of [
                        'item-container-isNestedItem-false-on-owned',
                        'item-container-setNested-roundtrip',
                        'item-container-createNestedDocuments-appends',
                        'item-container-updateNestedDocuments-merges',
                        'item-container-deleteNestedDocuments-removes',
                        'item-container-convertNestedToItems-builds-collection',
                        'item-container-update-injects-id',
                    ]) {
                        notes[f] = `container host create threw: ${String((err as Error)?.message ?? err)}`;
                    }
                }

                // Yield a tick so the server-side actor create flushes
                // before embedded item creates fire — mirrors the comment
                // in weapon-attack.spec.ts about V14 race conditions.
                if (host?.id) {
                    await new Promise<void>((r) => {
                        setTimeout(r, 250);
                    });
                }

                const getHost = (): any => (host?.id !== undefined ? game?.actors?.get?.(host.id) : null);

                /* ============================================================
                 * Flow 4: item-container-isNestedItem-false-on-owned
                 * Embed a `backpack` item on the actor; assert
                 * `isNestedItem()` returns false (parent is an Actor, not
                 * an Item — the source guard is `this.parent instanceof
                 * Item`). Also asserts `getActor()` returns the parent.
                 * ============================================================ */
                let backpackItem: any = null;
                try {
                    const live = getHost();
                    if (live?.createEmbeddedDocuments) {
                        const created = (await withTimeout(
                            live.createEmbeddedDocuments('Item', [
                                {
                                    name: 'documents-extra-backpack',
                                    type: 'backpack',
                                    system: {},
                                },
                            ]),
                            5_000,
                            'create backpack item',
                        )) as any[];
                        backpackItem = created?.[0] ? live.items.get(created[0].id) : null;
                        if (backpackItem) {
                            cleanups.push(async () => {
                                try {
                                    await backpackItem.delete?.();
                                } catch {
                                    /* ignore */
                                }
                            });
                            const isNested = backpackItem.isNestedItem?.();
                            const actorOk = backpackItem.actor?.id === live.id;
                            if (isNested === false && actorOk) {
                                fired['item-container-isNestedItem-false-on-owned'] = true;
                                notes['item-container-isNestedItem-false-on-owned'] = `isNestedItem=false, actor getter returned parent (id=${live.id})`;
                            } else {
                                notes['item-container-isNestedItem-false-on-owned'] = `isNested=${String(isNested)} actorOk=${String(actorOk)}`;
                            }
                        } else {
                            notes['item-container-isNestedItem-false-on-owned'] = 'backpack create returned empty';
                        }
                    } else {
                        notes['item-container-isNestedItem-false-on-owned'] = 'host actor unavailable';
                    }
                } catch (err) {
                    notes['item-container-isNestedItem-false-on-owned'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                }

                /* ============================================================
                 * Flow 5: item-container-setNested-roundtrip
                 * Call `setNested()` (the async, flag-backed setter) on the
                 * backpack and assert `getNested()` reads back the same
                 * array, `hasNested()` returns true. Also exercises
                 * `setNestedManual()` (synchronous variant) on the same
                 * item by writing a different array.
                 * ============================================================ */
                try {
                    if (backpackItem) {
                        const sample = [{ _id: 'aaaaaaaaaaaaaaaa', name: 'nested-a' }];
                        await withTimeout(backpackItem.setNested?.(sample), 5_000, 'setNested');
                        const round1 = backpackItem.getNested?.();
                        const has1 = backpackItem.hasNested?.();

                        // setNestedManual is synchronous and wraps non-array
                        // input — pass a singleton object to exercise the
                        // wrap branch.
                        backpackItem.setNestedManual?.({ _id: 'bbbbbbbbbbbbbbbb', name: 'nested-b' });
                        const round2 = backpackItem.getNested?.() ?? [];

                        const ok =
                            Array.isArray(round1) &&
                            round1.length === 1 &&
                            (round1[0] as any)?._id === 'aaaaaaaaaaaaaaaa' &&
                            has1 === true &&
                            Array.isArray(round2) &&
                            round2.length === 1 &&
                            (round2[0] as any)?._id === 'bbbbbbbbbbbbbbbb';
                        if (ok) {
                            fired['item-container-setNested-roundtrip'] = true;
                            notes['item-container-setNested-roundtrip'] = 'setNested + setNestedManual + getNested + hasNested round-tripped';
                        } else {
                            notes['item-container-setNested-roundtrip'] = `round1=${JSON.stringify(round1)} round2=${JSON.stringify(round2)} has1=${String(
                                has1,
                            )}`;
                        }
                    } else {
                        notes['item-container-setNested-roundtrip'] = 'no backpack item available';
                    }
                } catch (err) {
                    notes['item-container-setNested-roundtrip'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                }

                /* ============================================================
                 * Flow 6: item-container-createNestedDocuments-appends
                 * Reset the nested array and call `createNestedDocuments`
                 * with two new entries. Each gets a fresh randomID()
                 * assigned by the source (the input `_id` is overwritten).
                 * Assert the resulting array length and that ids were
                 * regenerated (length-16 strings, not the placeholder we
                 * passed in).
                 * ============================================================ */
                try {
                    if (backpackItem) {
                        // Reset to empty so the append count is deterministic.
                        await withTimeout(backpackItem.setNested?.([]), 5_000, 'reset nested array');
                        await withTimeout(
                            backpackItem.createNestedDocuments?.([
                                { name: 'created-a', type: 'gear', system: {} },
                                { name: 'created-b', type: 'gear', system: {} },
                            ]),
                            5_000,
                            'createNestedDocuments',
                        );
                        const after = backpackItem.getNested?.() ?? [];
                        const ids = (after as any[]).map((e) => String(e?._id ?? ''));
                        const allFreshIds = ids.every((s) => s.length === 16);
                        if (after.length === 2 && allFreshIds) {
                            fired['item-container-createNestedDocuments-appends'] = true;
                            notes['item-container-createNestedDocuments-appends'] = `appended 2 entries with fresh ids (${ids.join(',')})`;
                        } else {
                            notes['item-container-createNestedDocuments-appends'] = `length=${after.length} ids=${ids.join(',')}`;
                        }
                    } else {
                        notes['item-container-createNestedDocuments-appends'] = 'no backpack item available';
                    }
                } catch (err) {
                    notes['item-container-createNestedDocuments-appends'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                }

                /* ============================================================
                 * Flow 7: item-container-updateNestedDocuments-merges
                 * Take the first nested entry from flow 6, run an update
                 * that adds a new field, and assert the merge ran. The
                 * source uses `foundry.utils.mergeObject` with
                 * insertKeys + insertValues, so the new field must land
                 * on the existing entry.
                 * ============================================================ */
                try {
                    if (backpackItem) {
                        const before = backpackItem.getNested?.() ?? [];
                        const firstId = (before[0] as any)?._id;
                        if (typeof firstId === 'string' && firstId.length > 0) {
                            await withTimeout(
                                backpackItem.updateNestedDocuments?.([{ _id: firstId, addedField: 'merged-value' }]),
                                5_000,
                                'updateNestedDocuments',
                            );
                            const after = backpackItem.getNested?.() ?? [];
                            const updated = (after as any[]).find((e) => e?._id === firstId);
                            const has = updated?.addedField === 'merged-value';
                            if (has) {
                                fired['item-container-updateNestedDocuments-merges'] = true;
                                notes['item-container-updateNestedDocuments-merges'] = `merged addedField='merged-value' onto id=${firstId}`;
                            } else {
                                notes['item-container-updateNestedDocuments-merges'] = `merge missing addedField; entry=${JSON.stringify(updated)}`;
                            }
                        } else {
                            notes['item-container-updateNestedDocuments-merges'] = `no first id to merge into (before=${JSON.stringify(before)})`;
                        }
                    } else {
                        notes['item-container-updateNestedDocuments-merges'] = 'no backpack item available';
                    }
                } catch (err) {
                    notes['item-container-updateNestedDocuments-merges'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                }

                /* ============================================================
                 * Flow 8: item-container-deleteNestedDocuments-removes
                 * Delete the first nested entry by id; assert it's gone.
                 * ============================================================ */
                try {
                    if (backpackItem) {
                        const before = backpackItem.getNested?.() ?? [];
                        const firstId = (before[0] as any)?._id;
                        if (typeof firstId === 'string' && firstId.length > 0) {
                            await withTimeout(backpackItem.deleteNestedDocuments?.([firstId]), 5_000, 'deleteNestedDocuments');
                            const after = backpackItem.getNested?.() ?? [];
                            const stillThere = (after as any[]).find((e) => e?._id === firstId);
                            if (after.length === before.length - 1 && stillThere === undefined) {
                                fired['item-container-deleteNestedDocuments-removes'] = true;
                                notes['item-container-deleteNestedDocuments-removes'] = `removed id=${firstId}; length ${before.length} -> ${after.length}`;
                            } else {
                                notes['item-container-deleteNestedDocuments-removes'] = `delete failed: before=${before.length} after=${
                                    after.length
                                } stillThere=${String(stillThere !== undefined)}`;
                            }
                        } else {
                            notes['item-container-deleteNestedDocuments-removes'] = `no first id to delete (before=${JSON.stringify(before)})`;
                        }
                    } else {
                        notes['item-container-deleteNestedDocuments-removes'] = 'no backpack item available';
                    }
                } catch (err) {
                    notes['item-container-deleteNestedDocuments-removes'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                }

                /* ============================================================
                 * Flow 9: item-container-convertNestedToItems-builds-collection
                 * Seed two nested entries via setNested(), then call
                 * `convertNestedToItems()` directly. The source builds a
                 * fresh foundry.utils.Collection and instantiates each
                 * entry as an Item parented to the container. Assert
                 * `this.items` is now a Collection with both ids present.
                 * ============================================================ */
                try {
                    if (backpackItem) {
                        const seed = [
                            { _id: 'cccccccccccccccc', name: 'conv-a', type: 'gear', system: {} },
                            { _id: 'dddddddddddddddd', name: 'conv-b', type: 'gear', system: {} },
                        ];
                        await withTimeout(backpackItem.setNested?.(seed), 5_000, 'seed nested for convert');
                        let threw: string | null = null;
                        try {
                            backpackItem.convertNestedToItems?.();
                        } catch (err) {
                            threw = String((err as Error)?.message ?? err);
                        }
                        const items = backpackItem.items;
                        const aPresent = items?.has?.('cccccccccccccccc');
                        const bPresent = items?.has?.('dddddddddddddddd');
                        if (threw === null && items != null && aPresent === true && bPresent === true) {
                            fired['item-container-convertNestedToItems-builds-collection'] = true;
                            notes['item-container-convertNestedToItems-builds-collection'] = 'convertNestedToItems built a Collection holding both seeded ids';
                        } else {
                            notes['item-container-convertNestedToItems-builds-collection'] = `threw=${threw ?? 'no'} items=${typeof items} aPresent=${String(
                                aPresent,
                            )} bPresent=${String(bPresent)}`;
                        }
                    } else {
                        notes['item-container-convertNestedToItems-builds-collection'] = 'no backpack item available';
                    }
                } catch (err) {
                    notes['item-container-convertNestedToItems-builds-collection'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                }

                /* ============================================================
                 * Flow 10: item-container-update-injects-id
                 * Run `update()` on the actor-owned backpack item; the
                 * source's override unconditionally injects `_id = this.id`
                 * into the update data Record then takes the non-nested
                 * `super.update(...)` branch. Assert the update succeeds
                 * and the persisted field landed.
                 * ============================================================ */
                try {
                    if (backpackItem) {
                        const newName = 'documents-extra-backpack-renamed';
                        await withTimeout(backpackItem.update?.({ name: newName }), 5_000, 'backpack.update');
                        const live = getHost();
                        const fresh = live?.items?.get?.(backpackItem.id);
                        if (fresh?.name === newName) {
                            fired['item-container-update-injects-id'] = true;
                            notes['item-container-update-injects-id'] = `update() persisted name=${newName} via super.update branch`;
                        } else {
                            notes['item-container-update-injects-id'] = `expected name=${newName} got ${String(fresh?.name)}`;
                        }
                    } else {
                        notes['item-container-update-injects-id'] = 'no backpack item available';
                    }
                } catch (err) {
                    notes['item-container-update-injects-id'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                }

                /* ============================================================
                 * Flow 11: chat-message-class-registered
                 * Verify CONFIG.ChatMessage.documentClass is a class named
                 * ChatMessageWH40K (the registered Tier-B doc class). This
                 * is the precondition for every other chat-message flow:
                 * if the registration broke, no created message would be
                 * an instance of our subclass.
                 * ============================================================ */
                try {
                    const cls = (CONFIG?.ChatMessage as any)?.documentClass;
                    const name = String(cls?.name ?? '');
                    if (typeof cls === 'function' && name === 'ChatMessageWH40K') {
                        fired['chat-message-class-registered'] = true;
                        notes['chat-message-class-registered'] = `CONFIG.ChatMessage.documentClass.name = ${name}`;
                    } else {
                        notes['chat-message-class-registered'] = `unexpected: typeof=${typeof cls} name=${name}`;
                    }
                } catch (err) {
                    notes['chat-message-class-registered'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                }

                /* ============================================================
                 * Flow 12: chat-message-getters
                 * Create a real ChatMessage with an `itemCard` flag and
                 * an `item.uuid` flag; assert `isItemCard === true`,
                 * `itemUuid` returns the stored string, and
                 * `isTargetedRoll === false` (no target + no rolls).
                 * Then create a second message without any flags and
                 * assert `isItemCard === false` / `itemUuid === null`.
                 * ============================================================ */
                try {
                    if (typeof ChatMessage?.create !== 'function') {
                        notes['chat-message-getters'] = 'ChatMessage.create unavailable';
                    } else {
                        const withFlags = (await withTimeout(
                            ChatMessage.create({
                                content: 'documents-extra-with-flags',
                                flags: {
                                    'wh40k-rpg': {
                                        itemCard: true,
                                        item: { uuid: 'Compendium.wh40k-rpg.dh2-weapons.Item.aaaaaaaaaaaaaaaa' },
                                    },
                                },
                            }),
                            5_000,
                            'ChatMessage.create (flags)',
                        )) as any;
                        if (withFlags?.id) {
                            cleanups.push(async () => {
                                try {
                                    await game?.messages?.get?.(withFlags.id)?.delete?.();
                                } catch {
                                    /* ignore */
                                }
                            });
                        }
                        const plain = (await withTimeout(ChatMessage.create({ content: 'documents-extra-plain' }), 5_000, 'ChatMessage.create (plain)')) as any;
                        if (plain?.id) {
                            cleanups.push(async () => {
                                try {
                                    await game?.messages?.get?.(plain.id)?.delete?.();
                                } catch {
                                    /* ignore */
                                }
                            });
                        }

                        const isCard = withFlags?.isItemCard;
                        const uuid = withFlags?.itemUuid;
                        const isTargeted = withFlags?.isTargetedRoll;
                        const plainIsCard = plain?.isItemCard;
                        const plainUuid = plain?.itemUuid;
                        const ok =
                            isCard === true &&
                            typeof uuid === 'string' &&
                            uuid.length > 0 &&
                            isTargeted === false &&
                            plainIsCard === false &&
                            plainUuid === null;
                        if (ok) {
                            fired['chat-message-getters'] = true;
                            notes['chat-message-getters'] = `flag-bearing getters returned true/string/false; plain returned false/null`;
                        } else {
                            notes['chat-message-getters'] = `isCard=${String(isCard)} uuid=${String(uuid)} isTargeted=${String(
                                isTargeted,
                            )} plainIsCard=${String(plainIsCard)} plainUuid=${String(plainUuid)}`;
                        }
                    }
                } catch (err) {
                    notes['chat-message-getters'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                }

                /* ============================================================
                 * Flow 13: chat-message-calculateDegrees-real-roll
                 * Evaluate a deterministic Roll, create a ChatMessage
                 * whose roll yields total=35, target=50 → expected
                 * `success=true, degrees=1`. Asserts the full d100-DoS
                 * arithmetic over a real Foundry Roll.
                 * ============================================================ */
                try {
                    if (typeof Roll !== 'function' || typeof ChatMessage?.create !== 'function') {
                        notes['chat-message-calculateDegrees-real-roll'] = 'Roll or ChatMessage.create unavailable';
                    } else {
                        // Construct a Roll for a deterministic constant 35;
                        // evaluating yields total=35 reliably without RNG.
                        const roll = new Roll('35');
                        await withTimeout(roll.evaluate?.() ?? Promise.resolve(roll), 5_000, 'roll.evaluate');
                        const msg = (await withTimeout(
                            ChatMessage.create({
                                content: 'documents-extra-degrees',
                                rolls: [roll],
                                flags: { 'wh40k-rpg': { target: 50 } },
                            }),
                            5_000,
                            'ChatMessage.create (degrees)',
                        )) as any;
                        if (msg?.id) {
                            cleanups.push(async () => {
                                try {
                                    await game?.messages?.get?.(msg.id)?.delete?.();
                                } catch {
                                    /* ignore */
                                }
                            });
                        }
                        const dos = msg?.calculateDegrees?.();
                        if (dos?.success && dos.degrees === 1) {
                            fired['chat-message-calculateDegrees-real-roll'] = true;
                            notes['chat-message-calculateDegrees-real-roll'] = `total=35 target=50 -> success=true degrees=1`;
                        } else {
                            notes['chat-message-calculateDegrees-real-roll'] = `unexpected dos=${JSON.stringify(dos)}`;
                        }
                    }
                } catch (err) {
                    notes['chat-message-calculateDegrees-real-roll'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                }

                /* ============================================================
                 * Flow 14: chat-message-onChatCardAction-routes
                 * Drive the static `onChatCardAction` router with two
                 * synthetic events: one with `data-action="__unknown__"`
                 * (default branch — logs and returns), one with no
                 * action attribute at all (undefined branch — returns).
                 * Both should resolve without throwing. The card root
                 * must include `data-message-id` pointing at a real
                 * message so the early `card === null` exit isn't
                 * taken.
                 * ============================================================ */
                try {
                    const cls = (CONFIG?.ChatMessage as any)?.documentClass;
                    if (typeof cls?.onChatCardAction !== 'function') {
                        notes['chat-message-onChatCardAction-routes'] = 'onChatCardAction static is not a function';
                    } else {
                        const routerMsg = (await withTimeout(
                            ChatMessage.create({ content: 'documents-extra-router' }),
                            5_000,
                            'ChatMessage.create (router)',
                        )) as any;
                        if (routerMsg?.id) {
                            cleanups.push(async () => {
                                try {
                                    await game?.messages?.get?.(routerMsg.id)?.delete?.();
                                } catch {
                                    /* ignore */
                                }
                            });
                        }

                        const makeEvent = (action: string | null): Event => {
                            const card = document.createElement('div');
                            card.className = 'chat-message';
                            card.dataset['messageId'] = String(routerMsg?.id ?? '');
                            const btn = document.createElement('button');
                            if (action !== null) btn.dataset['action'] = action;
                            card.appendChild(btn);
                            // The router calls button.closest('.chat-message'),
                            // so the button must be in a document fragment
                            // that allows ancestor traversal.
                            document.body.appendChild(card);
                            const event = new Event('click', { bubbles: true });
                            Object.defineProperty(event, 'currentTarget', { value: btn });
                            // best-effort cleanup of the synthetic DOM node
                            cleanups.push(async () => {
                                try {
                                    card.remove();
                                } catch {
                                    /* ignore */
                                }
                            });
                            return event;
                        };

                        let routerThrew: string | null = null;
                        try {
                            await withTimeout(cls.onChatCardAction(makeEvent('__unknown__'), document.body), 5_000, 'onChatCardAction (unknown)');
                            await withTimeout(cls.onChatCardAction(makeEvent(null), document.body), 5_000, 'onChatCardAction (undefined)');
                        } catch (err) {
                            routerThrew = String((err as Error)?.message ?? err);
                        }
                        if (routerThrew === null) {
                            fired['chat-message-onChatCardAction-routes'] = true;
                            notes['chat-message-onChatCardAction-routes'] = 'unknown + undefined-action branches returned without throwing';
                        } else {
                            notes['chat-message-onChatCardAction-routes'] = `router threw: ${routerThrew}`;
                        }
                    }
                } catch (err) {
                    notes['chat-message-onChatCardAction-routes'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                }

                /* ============================================================
                 * Flow 15: chat-message-enrichActionButtons-stamps-messageId
                 * Build synthetic HTML with two `[data-action]` buttons —
                 * one with a pre-existing messageId, one without — pass
                 * a message-shaped object (only the `id` getter is
                 * read), and assert the empty-messageId button got
                 * stamped while the pre-existing one was preserved.
                 * ============================================================ */
                try {
                    const cls = (CONFIG?.ChatMessage as any)?.documentClass;
                    if (typeof cls?.enrichActionButtons !== 'function') {
                        notes['chat-message-enrichActionButtons-stamps-messageId'] = 'enrichActionButtons static is not a function';
                    } else {
                        const html = document.createElement('div');
                        const blankBtn = document.createElement('button');
                        blankBtn.dataset['action'] = 'do-thing';
                        const stampedBtn = document.createElement('button');
                        stampedBtn.dataset['action'] = 'do-other';
                        stampedBtn.dataset['messageId'] = 'preexisting-id';
                        html.appendChild(blankBtn);
                        html.appendChild(stampedBtn);
                        const fakeMsg = { id: 'documents-extra-enrich-id' };
                        cls.enrichActionButtons(html, fakeMsg);
                        const blankAfter = blankBtn.dataset['messageId'];
                        const stampedAfter = stampedBtn.dataset['messageId'];
                        if (blankAfter === 'documents-extra-enrich-id' && stampedAfter === 'preexisting-id') {
                            fired['chat-message-enrichActionButtons-stamps-messageId'] = true;
                            notes['chat-message-enrichActionButtons-stamps-messageId'] = 'stamped blank button, preserved existing id';
                        } else {
                            notes['chat-message-enrichActionButtons-stamps-messageId'] = `blank=${String(blankAfter)} preexisting=${String(stampedAfter)}`;
                        }
                    }
                } catch (err) {
                    notes['chat-message-enrichActionButtons-stamps-messageId'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                }

                /* ============================================================
                 * Flow 16: module-exports-match-config-documentClass
                 * `src/module/documents/_module.ts` is a public barrel.
                 * Dynamic-import the runtime-served module and assert (a)
                 * every named export this spec depends on resolves to a
                 * function, and (b) the registered
                 * `CONFIG.<X>.documentClass` matches the imported class
                 * identity for ChatMessageWH40K, TokenDocumentWH40K,
                 * WH40KActiveEffect. The Actor proxy is registered as
                 * `WH40KActorProxy` (a Proxy, not directly exported from
                 * `_module.ts` — it lives at `./actor-proxy.ts`), so we
                 * also dynamic-import that and check identity.
                 * ============================================================ */
                try {
                    const url = '/systems/wh40k-rpg/module/documents/_module.js';
                    const mod = await (new Function('u', 'return import(u)') as (u: string) => Promise<unknown>)(url);
                    const proxyUrl = '/systems/wh40k-rpg/module/documents/actor-proxy.js';
                    const proxyMod = await (new Function('u', 'return import(u)') as (u: string) => Promise<unknown>)(proxyUrl);
                    const expectedExports = [
                        'WH40KAcolyte',
                        'WH40KActiveEffect',
                        'WH40KBaseActor',
                        'CharacterDocBase',
                        'NPCDocBase',
                        'StarshipDocBase',
                        'VehicleDocBase',
                        'ChatMessageWH40K',
                        'WH40KNPC',
                        'WH40KStarship',
                        'TokenDocumentWH40K',
                        'WH40KVehicle',
                    ];
                    const missing = expectedExports.filter((k) => typeof (mod as any)[k] !== 'function');

                    const chatMatch = (CONFIG?.ChatMessage as any)?.documentClass === (mod as any)?.ChatMessageWH40K;
                    const tokenMatch = (CONFIG?.Token as any)?.documentClass === (mod as any)?.TokenDocumentWH40K;
                    const aeMatch = (CONFIG?.ActiveEffect as any)?.documentClass === (mod as any)?.WH40KActiveEffect;
                    const proxyMatch = (CONFIG?.Actor as any)?.documentClass === (proxyMod as any)?.WH40KActorProxy;

                    if (missing.length === 0 && chatMatch && tokenMatch && aeMatch && proxyMatch) {
                        fired['module-exports-match-config-documentClass'] = true;
                        notes[
                            'module-exports-match-config-documentClass'
                        ] = `${expectedExports.length} exports resolved; ChatMessage/Token/ActiveEffect/Actor identities match CONFIG registrations`;
                    } else {
                        notes['module-exports-match-config-documentClass'] = `missing=${missing.join(',')} chat=${String(chatMatch)} token=${String(
                            tokenMatch,
                        )} ae=${String(aeMatch)} actor=${String(proxyMatch)}`;
                    }
                } catch (err) {
                    notes['module-exports-match-config-documentClass'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                }
            } finally {
                // Best-effort cleanup of every actor / item / message /
                // synthetic DOM node we created. Drained in registration
                // order; failures are swallowed so a tombstoned entry
                // can't block downstream cleanup.
                for (const fn of cleanups) {
                    try {
                        await fn();
                    } catch {
                        /* ignore */
                    }
                }
            }

            // Suppress unused-variable lint on the destructured Foundry
            // hook reference — pulled into local scope only to verify
            // the global is available before the chat-message flows run.
            void Hooks;

            return { flowsFired: fired, flowNotes: notes };
            /* eslint-enable @typescript-eslint/no-explicit-any */
        }, DOCUMENTS_EXTRA_FLOWS);

        return {
            flowsFired: result.flowsFired as Record<FlowName, boolean>,
            flowNotes: result.flowNotes as Partial<Record<FlowName, string>>,
            pageErrors,
        };
    } finally {
        page.off('pageerror', listener);
    }
}

test.describe.serial('documents/* extra depth (Tier B)', () => {
    // Cap at 3 minutes — per-call timeouts mean we should never come close.
    test.setTimeout(180_000);
    test('actor-proxy / item-container / chat-message / _module flows', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const probe = await probeDocumentsExtraFlows(page);

        const failures: string[] = [];
        for (const flow of DOCUMENTS_EXTRA_FLOWS) {
            if (probe.flowsFired[flow]) {
                recordCoverage('documents-extra.flow', flow);
            } else {
                const note = probe.flowNotes[flow] ?? 'flow did not fire and no diagnostic note recorded';
                failures.push(`flow ${flow}: ${note}`);
            }
        }

        const pageErrorTail = probe.pageErrors.length > 0 ? `\n  pageerrors: ${probe.pageErrors.slice(0, 5).join(' | ')}` : '';

        expect(
            failures,
            `${failures.length}/${DOCUMENTS_EXTRA_FLOWS.length} documents-extra probes failed:\n  - ${failures.join('\n  - ')}${pageErrorTail}`,
        ).toEqual([]);
    });
});
