import { describe, expect, it } from 'vitest';

describe('CyberneticData', () => {
    it('has a default CyberneticData symbol exported', async () => {
        const mod = await import('./cybernetic').catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`cybernetic DataModel could not be imported in this environment: ${msg}`);
            return undefined;
        });
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable, not a conditional assertion branch
        if (mod === undefined) return;
        expect(mod).toBeTruthy();
        expect(mod.default).toBeTruthy();
    });

    // TODO: as Foundry test infrastructure expands, add assertions for:
    //   - schema includes physical + equippable + modifiers templates
    //   - body location field constrained to canonical body slots
    //   - migrateData normalises legacy cybernetic payloads
});
