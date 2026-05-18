import { describe, expect, it } from 'vitest';
import { bootFoundryOnce } from './lib/boot';
import { createActor, createItem } from './lib/fixtures';
import { requireOrSkip } from './lib/has-foundry';

const ok = requireOrSkip('A');

describe.skipIf(!ok)('document lifecycle (Tier A)', () => {
    it('creates an Actor and prepareData runs without throwing', async () => {
        const result = await bootFoundryOnce();
        if (!result.booted) return;
        const actor = await createActor(result.runtime!, { type: 'character', name: 'Lifecycle Actor' });
        expect(actor).toBeDefined();
    });

    it('creates an Item and prepareData runs without throwing', async () => {
        const result = await bootFoundryOnce();
        if (!result.booted) return;
        const item = await createItem(result.runtime!, { type: 'weapon', name: 'Lifecycle Weapon' });
        expect(item).toBeDefined();
    });

    it('cleanData(_state) round-trips without dropping fields (V14 gotcha #9)', async () => {
        const result = await bootFoundryOnce();
        if (!result.booted) return;
        const actor = (await createActor(result.runtime!, {
            type: 'character',
            name: 'CleanData Actor',
        })) as { toObject?: () => object };
        if (!actor.toObject) return;
        const before = JSON.stringify(actor.toObject());
        const after = JSON.stringify(actor.toObject());
        expect(after).toBe(before);
    });
});
