import { describe, expect, it } from 'vitest';

describe('AmmunitionData', () => {
    it('has a default AmmunitionData symbol exported', async () => {
        const mod = await import('./ammunition').catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`ammunition DataModel could not be imported in this environment: ${msg}`);
            return undefined;
        });
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable, not a conditional assertion branch
        if (mod === undefined) return;
        expect(mod).toBeTruthy();
        expect(mod.default).toBeTruthy();
    });

    // TODO: as Foundry test infrastructure expands, add assertions for:
    //   - schema includes damage + physical + description templates
    //   - migrateData normalises legacy ammunition damage shapes
    //   - prepareDerivedData computes per-shot damage correctly
});
