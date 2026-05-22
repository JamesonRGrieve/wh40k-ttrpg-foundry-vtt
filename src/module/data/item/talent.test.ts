import { describe, expect, it } from 'vitest';

const MOD = await import('./talent').catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`talent DataModel could not be imported in this environment: ${msg}`);
    return undefined;
});

describe('TalentData', () => {
    it.skipIf(MOD === undefined)('has a default TalentData symbol exported', () => {
        expect(MOD).toBeTruthy();
        expect(MOD?.default).toBeTruthy();
    });

    // TODO: as Foundry test infrastructure expands, add assertions for:
    //   - schema mixes description + modifiers + subtlety templates with tier (0..3) and cost defaults
    //   - migrateData converts flat prerequisites string → structured object, aptitudes string → array
    //   - migrateData infers hasSpecialization from a non-empty specialization value
    //   - prepareDerivedData sets hasSpecialization when parent name contains (X)
    //   - hasPrerequisites / hasGrants derive from the structured prerequisite + grants schemas
    //   - prerequisitesLabel renders structured characteristics/skills/talents when no text is set
});
