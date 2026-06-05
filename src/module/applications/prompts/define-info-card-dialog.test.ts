import { describe, expect, it } from 'vitest';
import { importModelOrSkip } from '../../testing/model-import.ts';

describe('defineInfoCardDialog', () => {
    it('exports a factory function (skips when the Foundry ApplicationV2 runtime is unavailable)', async () => {
        // The module evaluates foundry.applications.api at import time, so under happy-dom
        // (no Foundry global) the import rejects — skip rather than fail in that environment.
        const mod = await importModelOrSkip(import('./define-info-card-dialog.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        expect(typeof mod.defineInfoCardDialog).toBe('function');
    });
});
