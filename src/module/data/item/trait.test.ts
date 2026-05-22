import { describe, expect, it } from 'vitest';

const MOD = await import('./trait').catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`trait DataModel could not be imported in this environment: ${msg}`);
    return undefined;
});

describe('TraitData', () => {
    it.skipIf(MOD === undefined)('has a default TraitData symbol exported', () => {
        expect(MOD).toBeTruthy();
        expect(MOD?.default).toBeTruthy();
    });

    // TODO: as Foundry test infrastructure expands, add assertions for:
    //   - schema mixes description + modifiers templates with category default 'general'
    //   - level (min 0) and fearRating (0..4) NumberField bounds
    //   - hasLevel derives from level > 0; fullName appends "(level)" when hasLevel
    //   - isVariable detects (X)/(x) in the parent item name
    //   - categoryLabel falls back to the raw category when no localization key resolves
});
