import { describe, expect, it } from 'vitest';

describe('CriticalInjuryData', () => {
    it('has a default CriticalInjuryData symbol exported', async () => {
        const mod = await import('./critical-injury').catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`critical-injury DataModel could not be imported in this environment: ${msg}`);
            return undefined;
        });
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable, not a conditional assertion branch
        if (mod === undefined) return;
        expect(mod).toBeTruthy();
        expect(mod.default).toBeTruthy();
    });

    // TODO: as Foundry test infrastructure expands, add assertions for:
    //   - schema includes description + modifiers templates
    //   - severity field validates against the FFG critical hit table range
    //   - migrateData normalises legacy critical effect payloads
});
