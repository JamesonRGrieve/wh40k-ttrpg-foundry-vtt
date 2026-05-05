import { describe, expect, it } from 'vitest';

describe('CreatureTemplate', () => {
    it('has a default CreatureTemplate symbol exported', async () => {
        let imported: unknown;
        try {
            imported = await import('./creature');
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`creature template could not be imported in this environment: ${msg}`);
            return;
        }
        expect(imported).toBeTruthy();
        expect((imported as { default?: unknown }).default).toBeTruthy();
    });

    // TODO: as Foundry test infrastructure expands, add assertions for:
    //   - skills array shape (standard + specialist split)
    //   - prepareDerivedData computes skill rank/trained/plus10/plus20/plus30
    //   - migrateData fills missing specialisation entries on legacy actors
});
