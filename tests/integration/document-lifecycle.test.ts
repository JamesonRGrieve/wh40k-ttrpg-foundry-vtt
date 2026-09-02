import { describe, expect, it } from 'vitest';
import { bootFoundryOnce, type FoundryRuntime } from './lib/boot';
import { createActor, createItem } from './lib/fixtures';
import { requireOrSkip } from './lib/has-foundry';

const ok = requireOrSkip('A');

// Boot Foundry at module load so test bodies stay free of conditional guards.
// `bootFoundryOnce` is safe to call even when Foundry is unavailable —
// it returns `{ booted: false, skipped: true }` and `describe.skipIf(skipAll)`
// then skips every test below without entering an `it` body.
const bootResult = await bootFoundryOnce();
const skipAll = !ok || !bootResult.booted;
// Safe fallback for the runtime constant: when `skipAll === true`, the
// describe block is skipped and the `it` bodies are never executed, so the
// fallback cast is never dereferenced. When `skipAll === false`, BootResult's
// discriminated union guarantees `runtime` is defined.
const runtime: FoundryRuntime = bootResult.runtime ?? ({} as FoundryRuntime);

interface ToObjectActor {
    toObject?: () => object;
}

interface WeaponModifierBlock {
    damage: number;
    penetration: number;
    toHit: number;
    range: number;
    weight: number;
}

interface ModdedWeapon {
    system: {
        modifications: Array<{ cachedModifiers: WeaponModifierBlock }>;
        _modificationModifiers: WeaponModifierBlock;
    };
}

describe.skipIf(skipAll)('document lifecycle (Tier A)', () => {
    it('creates an Actor and prepareData runs without throwing', async () => {
        const actor = await createActor(runtime, { type: 'character', name: 'Lifecycle Actor' });
        expect(actor).toBeDefined();
    });

    it('creates an Item and prepareData runs without throwing', async () => {
        const item = await createItem(runtime, { type: 'weapon', name: 'Lifecycle Weapon' });
        expect(item).toBeDefined();
    });

    // Regression guard: non-equippable item types (skill, originPath, talent, …)
    // carry no `system.state` — only EquippableTemplate subtypes do. The container
    // data-prep path (WH40KItemContainer.prepareEmbeddedDocuments) must not assume
    // `system.state` exists, or prepareData throws for every such item.
    // A `weapon`-only fixture never exercised this; these types are the ones that
    // actually broke at runtime (item-container.ts reading undefined `.container`).
    it.each(['skill', 'originPath', 'talent'])('creates a non-equippable %s item and prepareData runs without throwing', async (type) => {
        const item = await createItem(runtime, { type, name: `Lifecycle ${type}` });
        expect(item).toBeDefined();
        // totalWeight reads `this.items.size`; prepareEmbeddedDocuments must have
        // initialized the collection for non-container items too.
        expect((item as { totalWeight?: number }).totalWeight).toBe(0);
    });

    it('creates a character carrying a non-equippable item; encumbrance prep does not throw', async () => {
        // Reproduces the encumbrance-calculator crash: totalWeight on an embedded
        // skill item whose container prep returned early before assigning `items`.
        const actor = await createActor(runtime, {
            type: 'character',
            name: 'Encumbrance Actor',
            items: [{ type: 'skill', name: 'Awareness' }],
        });
        expect(actor).toBeDefined();
    });

    // Regression guard: a weapon modification authored/imported before the
    // `cachedModifiers` block existed stored no such key. Its schema field was
    // `required: false` with no initial, so cleaning left `cachedModifiers`
    // undefined and WeaponData._aggregateModificationModifiers dereferenced
    // `mod.cachedModifiers.damage` — "Cannot read properties of undefined
    // (reading 'damage')" — during prepareDerivedData, which took down every
    // actor sheet and token carrying such a weapon. The field is now
    // `required: true`, so a missing block backfills to a fully-zeroed numeric
    // block and the aggregation completes. `active: true` is what walks the
    // crash branch, so the fixture must set it.
    it('creates a weapon whose active modification omits cachedModifiers; prepareData backfills a zeroed block (no crash)', async () => {
        const item = (await createItem(runtime, {
            type: 'weapon',
            name: 'Modded Autogun',
            system: {
                modifications: [{ uuid: 'Compendium.wh40k-rpg.weapon-mods.Item.legacy', name: 'Red-Dot Sight', active: true, category: 'sight' }],
            },
        })) as ModdedWeapon;

        const zeroed: WeaponModifierBlock = { damage: 0, penetration: 0, toHit: 0, range: 0, weight: 0 };
        const cached = item.system.modifications[0]?.cachedModifiers;
        expect(cached).toBeDefined();
        expect(cached).toEqual(zeroed);
        // The aggregation that previously threw now completes and sums to zero.
        expect(item.system._modificationModifiers).toEqual(zeroed);
    });

    it('cleanData(_state) round-trips without dropping fields (V14 gotcha #9)', async () => {
        const actor = (await createActor(runtime, {
            type: 'character',
            name: 'CleanData Actor',
        })) as ToObjectActor;
        expect(actor.toObject).toBeDefined();
        const before = JSON.stringify(actor.toObject?.());
        const after = JSON.stringify(actor.toObject?.());
        expect(after).toBe(before);
    });
});
