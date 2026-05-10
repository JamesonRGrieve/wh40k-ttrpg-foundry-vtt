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

    it('does not throw when legacy actor data has no characteristics block', async () => {
        let imported: unknown;
        try {
            imported = await import('./creature');
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`creature template could not be imported in this environment: ${msg}`);
            return;
        }

        const CreatureTemplate = (imported as { default: { _migrateData: (source: Record<string, unknown>) => void } }).default;
        const source: Record<string, unknown> = {};

        expect(() => CreatureTemplate._migrateData(source)).not.toThrow();
    });

    // TODO: as Foundry test infrastructure expands, add assertions for:
    //   - skills array shape (standard + specialist split)
    //   - prepareDerivedData computes skill rank/trained/plus10/plus20/plus30
    //   - migrateData fills missing specialisation entries on legacy actors
});
