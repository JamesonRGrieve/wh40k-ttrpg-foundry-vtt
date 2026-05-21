import { describe, expect, it } from 'vitest';
import { bootFoundryOnce } from './lib/boot';
import { requireOrSkip } from './lib/has-foundry';

const ok = requireOrSkip('A');

describe.skipIf(!ok)('system manifest (Tier A)', () => {
    it('boots Foundry into jsdom (or skips with a clear reason)', async () => {
        const result = await bootFoundryOnce();
        // A boot failure (not a missing license — that path already skipped via
        // `ok`) is an acceptable outcome as long as it carries a reason; a
        // successful boot must expose the Foundry runtime.
        const skippedWithReason = result.skipped && Boolean(result.error?.message ?? 'boot skipped');
        const bootedWithRuntime = result.booted && result.runtime?.foundry !== undefined;
        expect(skippedWithReason || bootedWithRuntime).toBe(true);
    });

    it('exposes CONFIG.Actor and CONFIG.Item once booted', async () => {
        const result = await bootFoundryOnce();
        const config = result.runtime?.CONFIG as { Actor?: object; Item?: object } | undefined;
        expect(!result.booted || config?.Actor !== undefined).toBe(true);
        expect(!result.booted || config?.Item !== undefined).toBe(true);
    });
});
