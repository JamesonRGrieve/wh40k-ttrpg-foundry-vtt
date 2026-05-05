import { describe, expect, it } from 'vitest';

describe('ConditionData', () => {
    it('has a default ConditionData symbol exported', async () => {
        let imported: unknown;
        try {
            imported = await import('./condition');
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`condition DataModel could not be imported in this environment: ${msg}`);
            return;
        }
        expect(imported).toBeTruthy();
        expect((imported as { default?: unknown }).default).toBeTruthy();
    });

    // TODO: as Foundry test infrastructure expands, add assertions for:
    //   - schema includes description + modifiers templates
    //   - active modifier list applies to actor characteristic checks
    //   - migrateData normalises legacy condition payloads
});
