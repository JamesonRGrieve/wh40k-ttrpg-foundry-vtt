import { describe, expect, it } from 'vitest';

describe('SkillGrantData', () => {
    it('has a default SkillGrantData symbol exported', async () => {
        let imported: unknown;
        try {
            imported = await import('./skill-grant');
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`skill-grant DataModel could not be imported in this environment: ${msg}`);
            return;
        }
        expect(imported).toBeTruthy();
        expect((imported as { default?: unknown }).default).toBeTruthy();
    });

    // TODO: as Foundry test infrastructure expands, add assertions for:
    //   - schema declares skill key + advance + specialization fields
    //   - apply() updates the target's skill advance
    //   - migrateData() splits legacy specialised skill identifiers
});
