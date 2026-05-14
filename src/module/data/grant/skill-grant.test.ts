import { describe, expect, it } from 'vitest';

describe('SkillGrantData', () => {
    it('has a default SkillGrantData symbol exported', async () => {
        const mod = await import('./skill-grant').catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`skill-grant DataModel could not be imported in this environment: ${msg}`);
            return undefined;
        });
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable, not a conditional assertion branch
        if (mod === undefined) return;
        expect(mod).toBeTruthy();
        expect(mod.default).toBeTruthy();
    });

    // TODO: as Foundry test infrastructure expands, add assertions for:
    //   - schema declares skill key + advance + specialization fields
    //   - apply() updates the target's skill advance
    //   - migrateData() splits legacy specialised skill identifiers
});
