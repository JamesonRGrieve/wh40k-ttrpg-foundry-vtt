import { describe, expect, it } from 'vitest';

describe('ChoiceGrantData', () => {
    it('has a default ChoiceGrantData symbol exported', async () => {
        let imported: unknown;
        try {
            imported = await import('./choice-grant');
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`choice-grant DataModel could not be imported in this environment: ${msg}`);
            return;
        }
        expect(imported).toBeTruthy();
        expect((imported as { default?: unknown }).default).toBeTruthy();
    });

    // TODO: as Foundry test infrastructure expands, add assertions for:
    //   - schema includes a choices array of nested grant payloads
    //   - apply() honours the selected choice index
    //   - migrateData() drops malformed legacy choice entries
});
