import { describe, expect, it } from 'vitest';
import { ItemDropManager } from '../../src/module/managers/item-drop-manager';
import { bootFoundryOnce, type FoundryRuntime } from './lib/boot';
import { createActor } from './lib/fixtures';
import { requireOrSkip } from './lib/has-foundry';

const ok = requireOrSkip('A');

interface DataModelClass {
    name: string;
}

interface FoundryConfigSurface {
    Actor?: { dataModels?: Record<string, DataModelClass> };
}

interface LootActorSystem {
    isEmpty?: boolean;
    itemCount?: number;
}

interface LootActor {
    system?: LootActorSystem;
    items?: { size: number; contents: Array<{ toObject: () => object }> };
}

const bootResult = await bootFoundryOnce();
const skipAll = !ok || !bootResult.booted;
const runtime: FoundryRuntime = bootResult.runtime ?? ({} as FoundryRuntime);

describe.skipIf(skipAll)('loot drop/pickup (Tier A)', () => {
    it('registers the content-agnostic loot actor type', () => {
        const cfg = runtime.CONFIG as FoundryConfigSurface;
        expect(cfg.Actor?.dataModels?.['loot']).toBeDefined();
    });

    it('creates a loot pile actor and prepareData runs without throwing', async () => {
        const loot = await createActor(runtime, { type: 'loot', name: 'Dropped: Test' });
        expect(loot).toBeDefined();
    });

    it('constructs a loot pile with embedded items and reports non-empty', async () => {
        const loot = (await createActor(runtime, {
            type: 'loot',
            name: 'Dropped: Knife',
            items: [{ name: 'Combat Knife', type: 'weapon' }],
        })) as LootActor;
        expect(loot.items).toBeDefined();
        expect(loot.items?.size).toBeGreaterThanOrEqual(1);
    });

    it('the pure transfer planner stacks matching items', () => {
        const existing = [{ name: 'Charge Pack', type: 'ammunition', _id: 'existing', system: { quantity: 2 } }] as never;
        const incoming = [{ name: 'Charge Pack', type: 'ammunition', system: { quantity: 3 } }];
        const plan = ItemDropManager.planStackMerge(existing, incoming);
        expect(plan.updates).toEqual([{ _id: 'existing', quantity: 5 }]);
        expect(plan.creates).toHaveLength(0);
    });
});
