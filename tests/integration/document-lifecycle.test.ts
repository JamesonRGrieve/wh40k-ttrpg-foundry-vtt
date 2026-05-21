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
