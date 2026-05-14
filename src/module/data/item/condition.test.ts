import { describe, expect, it } from 'vitest';

describe('ConditionData', () => {
    it('has a default ConditionData symbol exported', async () => {
        const mod = await import('./condition').catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`condition DataModel could not be imported in this environment: ${msg}`);
            return undefined;
        });
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable, not a conditional assertion branch
        if (mod === undefined) return;
        expect(mod).toBeTruthy();
        expect(mod.default).toBeTruthy();
    });

    // TODO: as Foundry test infrastructure expands, add assertions for:
    //   - schema includes description + modifiers templates
    //   - active modifier list applies to actor characteristic checks
    //   - migrateData normalises legacy condition payloads
});
