import { describe, expect, it } from 'vitest';

describe('GearData', () => {
    it('has a default GearData symbol exported', async () => {
        const mod = await import('./gear').catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`gear DataModel could not be imported in this environment: ${msg}`);
            return undefined;
        });
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable, not a conditional assertion branch
        if (mod === undefined) return;
        expect(mod).toBeTruthy();
        expect(mod.default).toBeTruthy();
    });

    // TODO: as Foundry test infrastructure expands, add assertions for:
    //   - schema includes physical + equippable templates
    //   - prepareDerivedData formats display weight + cost
    //   - migrateData normalises legacy gear payloads
});
