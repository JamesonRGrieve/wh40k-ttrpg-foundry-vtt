/**
 * Horde mixin derived-data tests (#166).
 *
 * The mixin's `_prepareHordeData()` reads from the RAW resolver to
 * populate `bonusDamageDice`, `toHitBonus`, `sizeKeyword`, and
 * `tierDescriptor` from the live Magnitude. The legacy
 * `damageMultiplier` / `sizeModifier` fields are preserved for the
 * other six systems and not asserted here.
 *
 * Constructing the actual DataModel requires a fully booted Foundry
 * environment (CONFIG.Actor.dataModels, field validators, etc.), so
 * we re-implement the prepare path inline with the canonical inputs
 * the mixin reads, then assert the resolver wiring. Integration with
 * the live Actor is exercised in the e2e suite
 * (`tests/e2e/dw-horde-magnitude.spec.ts`).
 */
import { describe, expect, it } from 'vitest';
import { bonusDamageDiceForMagnitude, getHordeTier, toHitBonusForMagnitude } from '../../../rules/dw-horde-magnitude';

interface HordePrepShape {
    enabled: boolean;
    magnitude: { current: number; max: number };
    bonusDamageDice: number;
    toHitBonus: number;
    sizeKeyword: string;
    tierDescriptor: string;
}

/** Mirror of `_prepareHordeData` for the RAW fields the resolver populates. */
function prepareRawHordeFields(horde: HordePrepShape): HordePrepShape {
    if (!horde.enabled) return horde;
    const tier = getHordeTier(horde.magnitude.current);
    return {
        ...horde,
        bonusDamageDice: bonusDamageDiceForMagnitude(horde.magnitude.current),
        toHitBonus: toHitBonusForMagnitude(horde.magnitude.current),
        sizeKeyword: tier.sizeKeyword,
        tierDescriptor: tier.descriptor,
    };
}

function freshHorde(magnitude: number): HordePrepShape {
    return {
        enabled: true,
        magnitude: { current: magnitude, max: magnitude },
        bonusDamageDice: 0,
        toHitBonus: 0,
        sizeKeyword: '',
        tierDescriptor: '',
    };
}

describe('HordeTemplate — RAW derived fields per Magnitude tier (#166)', () => {
    it('Magnitude 30 (Mob) → +30 to hit, Massive, +0 bonus dice', () => {
        const prepared = prepareRawHordeFields(freshHorde(30));
        expect(prepared.toHitBonus).toBe(30);
        expect(prepared.sizeKeyword).toBe('Massive');
        expect(prepared.tierDescriptor).toBe('A mob');
        // Magnitude 30 — +3d10 floor but capped at +2d10 per RAW.
        expect(prepared.bonusDamageDice).toBe(2);
    });

    it('Magnitude 60 (Throng) → +40 to hit, Immense, +2d10 bonus dice', () => {
        const prepared = prepareRawHordeFields(freshHorde(60));
        expect(prepared.toHitBonus).toBe(40);
        expect(prepared.sizeKeyword).toBe('Immense');
        expect(prepared.tierDescriptor).toBe('A thronged phalanx');
        expect(prepared.bonusDamageDice).toBe(2);
    });

    it('Magnitude 90 (Massed assault) → +50 to hit, Monumental', () => {
        const prepared = prepareRawHordeFields(freshHorde(90));
        expect(prepared.toHitBonus).toBe(50);
        expect(prepared.sizeKeyword).toBe('Monumental');
        expect(prepared.tierDescriptor).toBe('A massed assault');
    });

    it('Magnitude 120 (Serried tide) → +60 to hit, Titanic', () => {
        const prepared = prepareRawHordeFields(freshHorde(120));
        expect(prepared.toHitBonus).toBe(60);
        expect(prepared.sizeKeyword).toBe('Titanic');
        expect(prepared.tierDescriptor).toBe('A serried tide of foes');
    });

    it('low Magnitude (small mob, e.g. 9) — capped at +0 bonus dice, Massive tier', () => {
        const prepared = prepareRawHordeFields(freshHorde(9));
        expect(prepared.bonusDamageDice).toBe(0);
        expect(prepared.sizeKeyword).toBe('Massive');
    });

    it('disabled horde → derived fields unchanged', () => {
        const horde = freshHorde(30);
        horde.enabled = false;
        const prepared = prepareRawHordeFields(horde);
        expect(prepared.toHitBonus).toBe(0);
        expect(prepared.bonusDamageDice).toBe(0);
        expect(prepared.sizeKeyword).toBe('');
    });
});
