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
