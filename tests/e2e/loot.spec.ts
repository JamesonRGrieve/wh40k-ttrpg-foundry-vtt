import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the item drop/pickup feature:
 *   - src/module/data/actor/loot.ts          (LootData DataModel)
 *   - src/module/managers/item-drop-manager.ts (ItemDropManager)
 *   - src/module/applications/actor/loot-sheet.ts (LootActorSheet render)
 *   - src/module/hooks-manager.ts            (loot type + sheet registration)
 *
 * Canvas/HUD token PLACEMENT needs a rendered WebGL canvas (same constraint
 * as canvas-ruler.spec.ts), so the spec drives the document layer instead:
 * real `loot` Actors, embedded-item round-trips, the DataModel getters, the
 * pure transfer planner, the loot sheet render, and a full pickup transfer
 * between two real actors. Created world docs are cleaned up at the end.
 *
 * Each flow records under `loot.flow`. Keys MUST match the LOOT_FLOWS
 * constant in scripts/e2e-coverage.mjs.
 */

const LOOT_FLOWS = [
    'loot-actor-type-registered',
    'loot-datamodel-prepares',
    'loot-pile-reports-contents',
    'manager-pure-helpers',
    'loot-sheet-renders',
    'pickup-transfers-items',
    'drop-non-droppable-rejected',
] as const;

type FlowName = (typeof LOOT_FLOWS)[number];

interface FlowResult {
    name: FlowName;
    ok: boolean;
    detail: string | null;
}

async function probeLoot(page: Page): Promise<{ results: FlowResult[]; pageErrors: string[] }> {
    const pageErrors: string[] = [];
    const listener = (err: Error): void => {
        pageErrors.push(err.message);
    };
    page.on('pageerror', listener);
    try {
        const results = await page.evaluate(async (): Promise<FlowResult[]> => {
            interface LootSystem {
                isEmpty?: boolean;
                itemCount?: number;
                totalWeight?: number;
            }
            interface SheetRef {
                render?: (force?: boolean) => Promise<void>;
                close?: () => Promise<void>;
                element?: HTMLElement | { 0?: HTMLElement } | null;
            }
            interface ItemRef {
                _id?: string;
                name?: string;
                type?: string;
                system?: { quantity?: number; weight?: number };
            }
            interface ActorRef {
                id?: string;
                system?: LootSystem;
                sheet?: SheetRef;
                items?: { size: number };
                createEmbeddedDocuments?: (collection: string, data: ItemRef[]) => Promise<ItemRef[]>;
                delete?: () => Promise<void>;
            }
            interface ActorCls {
                create: (data: { type: string; name: string }) => Promise<ActorRef>;
            }
            interface PlanStackMergeUpdate {
                quantity: number;
            }
            interface PlanStackMergeResult {
                updates: PlanStackMergeUpdate[];
            }
            interface ItemDropManagerCls {
                snapToGrid: (point: { x: number; y: number }, size: number) => { x: number; y: number };
                planStackMerge: (existing: ItemRef[], incoming: ItemRef[]) => PlanStackMergeResult;
                isDroppable: (type: string) => boolean;
                pickupLoot: (receiver: ActorRef, pile: ActorRef) => Promise<boolean>;
                dropItemFromActor: (owner: ActorRef, item: ItemRef) => Promise<ActorRef | null>;
            }
            interface ManagerModule {
                ItemDropManager: ItemDropManagerCls;
            }
            interface FoundryGlobal {
                CONFIG?: { Actor?: { dataModels?: { loot?: object } } };
                Actor: ActorCls;
                game: { actors: { get: (id: string) => ActorRef | undefined } };
            }
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry browser-side globals have no shipped types
            const g = globalThis as unknown as FoundryGlobal;
            const out: FlowResult[] = [];
            const record = (name: FlowName, ok: boolean, detail: string | null = null): void => {
                out.push({ name, ok, detail });
            };
            const trash: ActorRef[] = [];
            let mgr: ManagerModule | undefined;

            // 1 — actor type registered
            try {
                const ok = Boolean(g.CONFIG?.Actor?.dataModels?.loot);
                record('loot-actor-type-registered', ok, ok ? null : 'CONFIG.Actor.dataModels.loot missing');
            } catch (err) {
                record('loot-actor-type-registered', false, String((err as Error).message));
            }

            // 2 — DataModel prepares on a real loot Actor
            let loot: ActorRef | undefined;
            try {
                loot = await g.Actor.create({ type: 'loot', name: 'Dropped: E2E' });
                trash.push(loot);
                record('loot-datamodel-prepares', loot.system?.isEmpty === true, `isEmpty=${String(loot.system?.isEmpty)}`);
            } catch (err) {
                record('loot-datamodel-prepares', false, String((err as Error).message));
            }

            // 3 — embedded item makes the pile report contents
            try {
                if (loot?.createEmbeddedDocuments != null) {
                    await loot.createEmbeddedDocuments('Item', [{ name: 'E2E Knife', type: 'weapon', system: { weight: 2, quantity: 1 } }]);
                    const ok = loot.system?.isEmpty === false && loot.system.itemCount === 1 && typeof loot.system.totalWeight === 'number';
                    record('loot-pile-reports-contents', ok, `itemCount=${String(loot.system?.itemCount)} weight=${String(loot.system?.totalWeight)}`);
                } else {
                    record('loot-pile-reports-contents', false, 'loot actor lacks createEmbeddedDocuments');
                }
            } catch (err) {
                record('loot-pile-reports-contents', false, String((err as Error).message));
            }

            // 4 — pure manager helpers (module loaded under coverage)
            async function probeManagerHelpers(): Promise<void> {
                try {
                    // Non-static specifier so knip doesn't try to resolve a
                    // browser runtime URL (mirrors canvas-ruler.spec.ts).
                    const base = `${'/systems/wh40k-rpg'}/module/managers`;
                    mgr = (await import(`${base}/item-drop-manager.js`)) as ManagerModule;
                    const M = mgr.ItemDropManager;
                    const snap = M.snapToGrid({ x: 137, y: 268 }, 100);
                    const plan = M.planStackMerge(
                        [{ _id: 'a', name: 'Charge Pack', type: 'ammunition', system: { quantity: 2 } }],
                        [{ name: 'Charge Pack', type: 'ammunition', system: { quantity: 3 } }],
                    );
                    const ok =
                        M.isDroppable('weapon') &&
                        !M.isDroppable('talent') &&
                        snap.x === 100 &&
                        snap.y === 200 &&
                        plan.updates.length === 1 &&
                        plan.updates[0]?.quantity === 5;
                    record('manager-pure-helpers', ok, ok ? null : `snap=${JSON.stringify(snap)} plan=${JSON.stringify(plan)}`);
                } catch (err) {
                    record('manager-pure-helpers', false, String((err as Error).message));
                }
            }

            // 5 — loot sheet renders
            async function probeSheetRender(): Promise<void> {
                try {
                    if (loot?.sheet?.render != null) {
                        await loot.sheet.render(true);
                        await new Promise<void>((r) => {
                            setTimeout(r, 250);
                        });
                        const el = loot.sheet.element;
                        const ok = Boolean(el) && (el instanceof HTMLElement || Boolean((el as { 0?: HTMLElement } | null)?.[0]));
                        record('loot-sheet-renders', ok, ok ? null : 'sheet element absent after render');
                        await loot.sheet.close?.();
                    } else {
                        record('loot-sheet-renders', false, 'loot.sheet.render unavailable');
                    }
                } catch (err) {
                    record('loot-sheet-renders', false, String((err as Error).message));
                }
            }

            // 6 — pickup transfers items between two real actors and deletes the pile
            async function probePickup(): Promise<void> {
                try {
                    if (mgr == null) throw new Error('manager not loaded');
                    const M = mgr.ItemDropManager;
                    const receiver = await g.Actor.create({ type: 'dh2-character', name: 'E2E Receiver' });
                    trash.push(receiver);
                    const pile = await g.Actor.create({ type: 'loot', name: 'Dropped: Bolt Pistol' });
                    const pileId = pile.id;
                    await pile.createEmbeddedDocuments?.('Item', [{ name: 'Bolt Pistol', type: 'weapon', system: { weight: 5, quantity: 1 } }]);
                    const before = receiver.items?.size ?? 0;
                    const ok = await M.pickupLoot(receiver, pile);
                    const transferred = (receiver.items?.size ?? 0) === before + 1;
                    const pileGone = pileId == null || g.game.actors.get(pileId) == null;
                    record(
                        'pickup-transfers-items',
                        ok && transferred && pileGone,
                        `ok=${String(ok)} transferred=${String(transferred)} pileGone=${String(pileGone)}`,
                    );
                } catch (err) {
                    record('pickup-transfers-items', false, String((err as Error).message));
                }
            }

            // 7 — non-droppable items are rejected (no token / canvas needed)
            async function probeNonDroppable(): Promise<void> {
                try {
                    if (mgr == null) throw new Error('manager not loaded');
                    const M = mgr.ItemDropManager;
                    const owner = await g.Actor.create({ type: 'dh2-character', name: 'E2E Dropper' });
                    trash.push(owner);
                    const created = (await owner.createEmbeddedDocuments?.('Item', [{ name: 'Quick Draw', type: 'talent' }])) ?? [];
                    if (created.length === 0) throw new Error('talent creation returned empty');
                    const talent = created[0];
                    const result = await M.dropItemFromActor(owner, talent);
                    record('drop-non-droppable-rejected', result === null, `result=${result == null ? 'null' : 'object'}`);
                } catch (err) {
                    record('drop-non-droppable-rejected', false, String((err as Error).message));
                }
            }

            await probeManagerHelpers();
            await probeSheetRender();
            await probePickup();
            await probeNonDroppable();

            // Cleanup world documents created by the probe.
            for (const doc of trash) {
                try {
                    // eslint-disable-next-line no-await-in-loop -- best-effort serial cleanup; parallel deletes race on Foundry's collection writes
                    await doc.delete?.();
                } catch {
                    /* best-effort */
                }
            }

            return out;
        });
        return { results, pageErrors };
    } finally {
        page.off('pageerror', listener);
    }
}

test.describe.serial('loot drop/pickup (Tier B)', () => {
    test('loot pile actor, DataModel, manager, sheet, and pickup transfer', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const probe = await probeLoot(page);
        const seen = new Set<string>();
        const failures: string[] = [];
        for (const r of probe.results) {
            seen.add(r.name);
            if (r.ok) {
                recordCoverage('loot.flow', r.name);
            } else {
                failures.push(`${r.name}: ${r.detail ?? 'failed'}`);
            }
        }
        for (const expected of LOOT_FLOWS) {
            if (!seen.has(expected)) failures.push(`${expected}: flow did not run`);
        }
        if (probe.pageErrors.length > 0) {
            failures.push(`page errors: ${probe.pageErrors.slice(0, 5).join(' | ')}`);
        }

        expect(failures, `${failures.length}/${LOOT_FLOWS.length} loot flows failed:\n  - ${failures.join('\n  - ')}`).toEqual([]);
    });
});
