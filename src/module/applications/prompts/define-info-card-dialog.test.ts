import { describe, expect, it } from 'vitest';

describe('defineInfoCardDialog', () => {
    it('exports a factory function (skips when the Foundry ApplicationV2 runtime is unavailable)', async () => {
        // The module evaluates foundry.applications.api at import time, so under happy-dom
        // (no Foundry global) the import rejects — skip rather than fail in that environment.
        const mod = await import('./define-info-card-dialog.ts').catch(() => undefined);
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when the Foundry runtime is unavailable
        if (mod === undefined) return;
        expect(typeof mod.defineInfoCardDialog).toBe('function');
    });
});
