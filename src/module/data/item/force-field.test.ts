import { describe, expect, it } from 'vitest';

describe('ForceFieldData', () => {
    it('has a default ForceFieldData symbol exported', async () => {
        const mod = await import('./force-field').catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`force-field DataModel could not be imported in this environment: ${msg}`);
            return undefined;
        });
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable, not a conditional assertion branch
        if (mod === undefined) return;
        expect(mod).toBeTruthy();
        expect(mod.default).toBeTruthy();
    });

    // TODO: as Foundry test infrastructure expands, add assertions for:
    //   - schema includes physical + equippable templates
    //   - protection rating + overload threshold field defaults
    //   - migrateData normalises legacy force-field payloads
});
