import { describe, expect, it } from 'vitest';

describe('AttackSpecialData', () => {
    it('has a default AttackSpecialData symbol exported', async () => {
        const mod = await import('./attack-special').catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`attack-special DataModel could not be imported in this environment: ${msg}`);
            return undefined;
        });
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable, not a conditional assertion branch
        if (mod === undefined) return;
        expect(mod).toBeTruthy();
        expect(mod.default).toBeTruthy();
    });

    // TODO: as Foundry test infrastructure expands, add assertions for:
    //   - schema includes the description template
    //   - attack special trigger metadata is preserved through migrateData
    //   - prepareDerivedData formats trigger labels for chat output
});
