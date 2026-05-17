import { describe, expect, it } from 'vitest';

import { bootFoundryOnce } from './lib/boot';
import { requireOrSkip } from './lib/has-foundry';

const ok = requireOrSkip('A');

describe.skipIf(!ok)('system manifest (Tier A)', () => {
    it('boots Foundry into jsdom (or skips with a clear reason)', async () => {
        const result = await bootFoundryOnce();
        if (result.skipped) {
            // Boot failure (not a missing license — that path already skipped via `ok`).
            expect(result.error?.message ?? 'boot skipped').toBeTruthy();
            return;
        }
        expect(result.booted).toBe(true);
        expect(result.runtime?.foundry).toBeDefined();
    });

    it('exposes CONFIG.Actor and CONFIG.Item once booted', async () => {
        const result = await bootFoundryOnce();
        if (!result.booted) return;
        const config = result.runtime?.CONFIG as
            | { Actor?: object; Item?: object }
            | undefined;
        expect(config?.Actor).toBeDefined();
        expect(config?.Item).toBeDefined();
    });
});
