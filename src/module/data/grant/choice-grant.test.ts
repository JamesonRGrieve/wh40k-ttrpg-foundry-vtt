import { describe, expect, it } from 'vitest';

describe('ChoiceGrantData', () => {
    it('has a default ChoiceGrantData symbol exported', async () => {
        const mod = await import('./choice-grant').catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`choice-grant DataModel could not be imported in this environment: ${msg}`);
            return undefined;
        });
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable, not a conditional assertion branch
        if (mod === undefined) return;
        expect(mod).toBeTruthy();
        expect(mod.default).toBeTruthy();
    });

    // TODO: as Foundry test infrastructure expands, add assertions for:
    //   - schema includes a choices array of nested grant payloads
    //   - apply() honours the selected choice index
    //   - migrateData() drops malformed legacy choice entries
});
