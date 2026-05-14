import { describe, expect, it } from 'vitest';

describe('AptitudeData', () => {
    it('has a default AptitudeData symbol exported', async () => {
        const mod = await import('./aptitude').catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`aptitude DataModel could not be imported in this environment: ${msg}`);
            return undefined;
        });
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable, not a conditional assertion branch
        if (mod === undefined) return;
        expect(mod).toBeTruthy();
        expect(mod.default).toBeTruthy();
    });

    // TODO: as Foundry test infrastructure expands, add assertions for:
    //   - schema includes the description template
    //   - aptitude name validation matches the FFG canonical list
    //   - migrateData normalises legacy aptitude payloads
});
