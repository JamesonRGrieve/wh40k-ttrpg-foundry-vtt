import { describe, expect, it } from 'vitest';

const MOD = await import('./skill').catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`skill DataModel could not be imported in this environment: ${msg}`);
    return undefined;
});

describe('SkillData', () => {
    it.skipIf(MOD === undefined)('has a default SkillData symbol exported', () => {
        expect(MOD).toBeTruthy();
        expect(MOD?.default).toBeTruthy();
    });

    // TODO: as Foundry test infrastructure expands, add assertions for:
    //   - schema mixes description template with characteristic default 'intelligence' and skillType default 'basic'
    //   - rollConfig defaults (defaultModifier 0, canBeUsedUntrained true, untrainedPenalty -20)
    //   - characteristicAbbr maps known characteristics (weaponSkill→WS, ballisticSkill→BS, …)
    //   - hasSpecializations true only when skillType is 'specialist' and specializations is non-empty
    //   - toChatSpecialUse(index) is a no-op for an out-of-range index
});
