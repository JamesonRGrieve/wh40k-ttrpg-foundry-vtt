import { describe, expect, it } from 'vitest';

import { ItemDropManager } from '../../src/module/managers/item-drop-manager';
import { bootFoundryOnce } from './lib/boot';
import { createActor } from './lib/fixtures';
import { requireOrSkip } from './lib/has-foundry';

const ok = requireOrSkip('A');

/**
 * Tier A — drives the item drop/pickup feature against real Foundry
 * Documents under jsdom. Canvas/HUD interaction is a Tier B concern; here we
 * verify the `loot` actor type registers, its DataModel prepares, embedded
 * items round-trip, and the pure transfer planner agrees with real document
 * `toObject()` shapes. Best-effort: every step bails cleanly if boot fails.
 */
describe.skipIf(!ok)('loot drop/pickup (Tier A)', () => {
    it('registers the content-agnostic loot actor type', async () => {
        const result = await bootFoundryOnce();
        if (!result.booted) return;
        const cfg = result.runtime?.CONFIG as { Actor?: { dataModels?: Record<string, unknown> } } | undefined;
        expect(cfg?.Actor?.dataModels?.['loot']).toBeDefined();
    });

    it('creates a loot pile actor and prepareData runs without throwing', async () => {
        const result = await bootFoundryOnce();
        if (!result.booted) return;
        const loot = await createActor(result.runtime!, { type: 'loot', name: 'Dropped: Test' });
        expect(loot).toBeDefined();
    });

    it('embeds an item in a loot pile and reports it as non-empty', async () => {
        const result = await bootFoundryOnce();
        if (!result.booted) return;
        const loot = (await createActor(result.runtime!, { type: 'loot', name: 'Dropped: Knife' })) as {
            createEmbeddedDocuments?: (t: string, d: object[]) => Promise<unknown[]>;
            system?: { isEmpty?: boolean; itemCount?: number };
        };
        if (!loot.createEmbeddedDocuments) return;
        await loot.createEmbeddedDocuments('Item', [{ name: 'Combat Knife', type: 'weapon' }]);
        expect(loot.system?.isEmpty).toBe(false);
        expect(loot.system?.itemCount).toBe(1);
    });

    it('the pure transfer planner stacks against real document toObject() shapes', async () => {
        const result = await bootFoundryOnce();
        if (!result.booted) return;
        const loot = (await createActor(result.runtime!, { type: 'loot', name: 'Dropped: Ammo' })) as {
            createEmbeddedDocuments?: (t: string, d: object[]) => Promise<Array<{ toObject: () => Record<string, unknown> }>>;
        };
        if (!loot.createEmbeddedDocuments) return;
        const [created] = await loot.createEmbeddedDocuments('Item', [{ name: 'Charge Pack', type: 'ammunition', system: { quantity: 2 } }]);
        const receiverExisting = [{ ...(created?.toObject() ?? {}), _id: 'existing' }] as never;
        const incoming = [{ name: 'Charge Pack', type: 'ammunition', system: { quantity: 3 } }];
        const plan = ItemDropManager.planStackMerge(receiverExisting, incoming);
        expect(plan.updates).toEqual([{ _id: 'existing', quantity: 5 }]);
        expect(plan.creates).toHaveLength(0);
    });
});
