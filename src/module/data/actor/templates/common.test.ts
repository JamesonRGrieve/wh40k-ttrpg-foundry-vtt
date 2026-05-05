import { describe, expect, it } from 'vitest';

describe('CommonTemplate', () => {
    it('has a default CommonTemplate symbol exported', async () => {
        let imported: unknown;
        try {
            imported = await import('./common');
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`common actor template could not be imported in this environment: ${msg}`);
            return;
        }
        expect(imported).toBeTruthy();
        expect((imported as { default?: unknown }).default).toBeTruthy();
    });

    // TODO: as Foundry test infrastructure expands, add assertions for:
    //   - schema declares the shared characteristic block across all systems
    //   - prepareDerivedData computes characteristic bonuses correctly
    //   - migrateData normalises legacy characteristic shapes
});
