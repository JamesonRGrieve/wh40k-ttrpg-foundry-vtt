import { describe, expect, it } from 'vitest';
import { ItemDropManager } from '../../src/module/managers/item-drop-manager';
import { bootFoundryOnce, type FoundryRuntime } from './lib/boot';
import { createActor } from './lib/fixtures';
import { requireOrSkip } from './lib/has-foundry';

const ok = requireOrSkip('A');

interface EmbeddedDocSnapshot {
    name?: string;
    type?: string;
    _id?: string;
    system?: { quantity?: number };
}

interface EmbeddedDoc {
    toObject: () => EmbeddedDocSnapshot;
}

interface LootActor {
    createEmbeddedDocuments?: (t: string, d: object[]) => Promise<EmbeddedDoc[]>;
    system?: { isEmpty?: boolean; itemCount?: number };
}

interface DataModelClass {
    name: string;
}

interface FoundryConfigSurface {
    Actor?: { dataModels?: Record<string, DataModelClass> };
}

// Boot once at module load so test bodies stay free of guard conditionals.
const bootResult = await bootFoundryOnce();
const skipAll = !ok || !bootResult.booted;
// When `skipAll === true` the describe is skipped before any `it` runs, so
// this fallback is never observed; when false, BootResult's discriminated
// union guarantees `runtime` is defined.
const runtime: FoundryRuntime = bootResult.runtime ?? ({} as FoundryRuntime);

/**
 * Tier A — drives the item drop/pickup feature against real Foundry
 * Documents under jsdom. Canvas/HUD interaction is a Tier B concern; here we
 * verify the `loot` actor type registers, its DataModel prepares, embedded
 * items round-trip, and the pure transfer planner agrees with real document
 * `toObject()` shapes. Best-effort: every step bails cleanly if boot fails.
 */
describe.skipIf(skipAll)('loot drop/pickup (Tier A)', () => {
    it('registers the content-agnostic loot actor type', () => {
        const cfg = runtime.CONFIG as FoundryConfigSurface;
        expect(cfg.Actor?.dataModels?.['loot']).toBeDefined();
    });

    it('creates a loot pile actor and prepareData runs without throwing', async () => {
        const loot = await createActor(runtime, { type: 'loot', name: 'Dropped: Test' });
        expect(loot).toBeDefined();
    });

    it('embeds an item in a loot pile and reports it as non-empty', async () => {
        const loot = (await createActor(runtime, { type: 'loot', name: 'Dropped: Knife' })) as LootActor;
        expect(loot.createEmbeddedDocuments).toBeDefined();
        await loot.createEmbeddedDocuments?.('Item', [{ name: 'Combat Knife', type: 'weapon' }]);
        expect(loot.system?.isEmpty).toBe(false);
        expect(loot.system?.itemCount).toBe(1);
    });

    it('the pure transfer planner stacks against real document toObject() shapes', async () => {
        const loot = (await createActor(runtime, { type: 'loot', name: 'Dropped: Ammo' })) as LootActor;
        expect(loot.createEmbeddedDocuments).toBeDefined();
        const embedded = await loot.createEmbeddedDocuments?.('Item', [{ name: 'Charge Pack', type: 'ammunition', system: { quantity: 2 } }]);
        const [created] = embedded ?? [];
        expect(created).toBeDefined();
        const receiverExisting = [{ ...created.toObject(), _id: 'existing' }] as never;
        const incoming = [{ name: 'Charge Pack', type: 'ammunition', system: { quantity: 3 } }];
        const plan = ItemDropManager.planStackMerge(receiverExisting, incoming);
        expect(plan.updates).toEqual([{ _id: 'existing', quantity: 5 }]);
        expect(plan.creates).toHaveLength(0);
    });
});
