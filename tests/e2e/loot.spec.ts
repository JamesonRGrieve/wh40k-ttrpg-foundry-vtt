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
            /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side probe: Foundry globals + dynamic-imported modules are runtime-only */
            const g = globalThis as any;
            const out: FlowResult[] = [];
            const record = (name: FlowName, ok: boolean, detail: string | null = null): void => {
                out.push({ name, ok, detail });
            };
            const trash: any[] = [];

            // 1 — actor type registered
            try {
                const ok = !!g.CONFIG?.Actor?.dataModels?.loot;
                record('loot-actor-type-registered', ok, ok ? null : 'CONFIG.Actor.dataModels.loot missing');
            } catch (err) {
                record('loot-actor-type-registered', false, String((err as Error)?.message ?? err));
            }

            // 2 — DataModel prepares on a real loot Actor
            let loot: any;
            try {
                loot = await g.Actor.create({ type: 'loot', name: 'Dropped: E2E' });
                trash.push(loot);
                record('loot-datamodel-prepares', !!loot && loot.system?.isEmpty === true, `isEmpty=${loot?.system?.isEmpty}`);
            } catch (err) {
                record('loot-datamodel-prepares', false, String((err as Error)?.message ?? err));
            }

            // 3 — embedded item makes the pile report contents
            try {
                if (loot?.createEmbeddedDocuments) {
                    await loot.createEmbeddedDocuments('Item', [{ name: 'E2E Knife', type: 'weapon', system: { weight: 2, quantity: 1 } }]);
                    const ok = loot.system?.isEmpty === false && loot.system?.itemCount === 1 && typeof loot.system?.totalWeight === 'number';
                    record('loot-pile-reports-contents', ok, `itemCount=${loot.system?.itemCount} weight=${loot.system?.totalWeight}`);
                } else {
                    record('loot-pile-reports-contents', false, 'loot actor lacks createEmbeddedDocuments');
                }
            } catch (err) {
                record('loot-pile-reports-contents', false, String((err as Error)?.message ?? err));
            }

            // 4 — pure manager helpers (module loaded under coverage)
            let mgr: any;
            try {
                // Non-static specifier so knip doesn't try to resolve a
                // browser runtime URL (mirrors canvas-ruler.spec.ts).
                const base = `${'/systems/wh40k-rpg'}/module/managers`;
                mgr = await import(`${base}/item-drop-manager.js`);
                const M = mgr.ItemDropManager;
                const snap = M.snapToGrid({ x: 137, y: 268 }, 100);
                const plan = M.planStackMerge(
                    [{ _id: 'a', name: 'Charge Pack', type: 'ammunition', system: { quantity: 2 } }],
                    [{ name: 'Charge Pack', type: 'ammunition', system: { quantity: 3 } }],
                );
                const ok =
                    M.isDroppable('weapon') === true &&
                    M.isDroppable('talent') === false &&
                    snap.x === 100 &&
                    snap.y === 200 &&
                    plan.updates.length === 1 &&
                    plan.updates[0].quantity === 5;
                record('manager-pure-helpers', ok, ok ? null : `snap=${JSON.stringify(snap)} plan=${JSON.stringify(plan)}`);
            } catch (err) {
                record('manager-pure-helpers', false, String((err as Error)?.message ?? err));
            }

            // 5 — loot sheet renders
            try {
                if (loot?.sheet?.render) {
                    await loot.sheet.render(true);
                    await new Promise((r) => setTimeout(r, 250));
                    const el = loot.sheet.element;
                    const ok = !!el && (el instanceof HTMLElement || !!el[0]);
                    record('loot-sheet-renders', ok, ok ? null : 'sheet element absent after render');
                    await loot.sheet.close?.();
                } else {
                    record('loot-sheet-renders', false, 'loot.sheet.render unavailable');
                }
            } catch (err) {
                record('loot-sheet-renders', false, String((err as Error)?.message ?? err));
            }

            // 6 — pickup transfers items between two real actors and deletes the pile
            try {
                const M = mgr.ItemDropManager;
                const receiver = await g.Actor.create({ type: 'dh2-character', name: 'E2E Receiver' });
                trash.push(receiver);
                const pile = await g.Actor.create({ type: 'loot', name: 'Dropped: Bolt Pistol' });
                const pileId = pile.id;
                await pile.createEmbeddedDocuments('Item', [{ name: 'Bolt Pistol', type: 'weapon', system: { weight: 5, quantity: 1 } }]);
                const before = receiver.items.size;
                const ok = await M.pickupLoot(receiver, pile);
                const transferred = receiver.items.size === before + 1;
                const pileGone = !g.game.actors.get(pileId);
                record('pickup-transfers-items', ok === true && transferred && pileGone, `ok=${ok} transferred=${transferred} pileGone=${pileGone}`);
            } catch (err) {
                record('pickup-transfers-items', false, String((err as Error)?.message ?? err));
            }

            // 7 — non-droppable items are rejected (no token / canvas needed)
            try {
                const M = mgr.ItemDropManager;
                const owner = await g.Actor.create({ type: 'dh2-character', name: 'E2E Dropper' });
                trash.push(owner);
                const [talent] = await owner.createEmbeddedDocuments('Item', [{ name: 'Quick Draw', type: 'talent' }]);
                const result = await M.dropItemFromActor(owner, talent);
                record('drop-non-droppable-rejected', result === null, `result=${String(result)}`);
            } catch (err) {
                record('drop-non-droppable-rejected', false, String((err as Error)?.message ?? err));
            }

            // Cleanup world documents created by the probe.
            for (const doc of trash) {
                try {
                    await doc?.delete?.();
                } catch {
                    /* best-effort */
                }
            }

            return out;
            /* eslint-enable @typescript-eslint/no-explicit-any */
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
