import { describe, expect, it } from 'vitest';
import { checkWeaponTraining, getWeaponTrainingDescription, getWeaponTrainingModifier } from './weapon-training.ts';

/**
 * Coverage for the Weapon Training gate (untrained → -20 to the attack). Pure
 * logic over the actor's talents + the weapon's requiredTraining. The params are
 * full Document types carrying Foundry-runtime deps unavailable under vitest, so
 * structural mocks are cast to the param types at the call site (the established
 * idiom — see combat-actions-throw.test.ts).
 */

type ChkActor = Parameters<typeof checkWeaponTraining>[0];
type ChkWeapon = Parameters<typeof checkWeaponTraining>[1];

interface MockTalent {
    type: string;
    name: string;
}

function actorWith(talents: string[]): ChkActor {
    const a = { items: talents.map((name): MockTalent => ({ type: 'talent', name })) };
    // eslint-disable-next-line no-restricted-syntax -- structural mock of the narrow actor surface checkWeaponTraining reads (items → type/name); full WH40KBaseActorDocument carries Foundry-runtime deps unavailable under vitest.
    return a as unknown as ChkActor;
}

function weaponNeeding(requiredTraining?: string, special?: string): ChkWeapon {
    const w = {
        system: {
            ...(requiredTraining === undefined ? {} : { requiredTraining }),
            ...(special === undefined ? {} : { special }),
        },
    };
    // eslint-disable-next-line no-restricted-syntax -- structural mock of the narrow weapon surface checkWeaponTraining reads (system.requiredTraining/special); full WH40KItemDocument carries Foundry-runtime deps unavailable under vitest.
    return w as unknown as ChkWeapon;
}

describe('checkWeaponTraining', () => {
    it('is trained when the weapon requires no training', () => {
        expect(checkWeaponTraining(actorWith([]), weaponNeeding(undefined)).trained).toBe(true);
        expect(checkWeaponTraining(actorWith([]), weaponNeeding('')).trained).toBe(true);
        expect(checkWeaponTraining(actorWith([]), weaponNeeding('-')).trained).toBe(true);
    });

    it('treats grenades as needing no training regardless of requiredTraining', () => {
        const result = checkWeaponTraining(actorWith([]), weaponNeeding('Las', 'grenade, blast'));
        expect(result.trained).toBe(true);
        expect(result.talent).toBeNull();
    });

    it('matches a "Weapon Training (X)" talent against the required specialization', () => {
        const result = checkWeaponTraining(actorWith(['Weapon Training (Las)']), weaponNeeding('Las'));
        expect(result.trained).toBe(true);
        expect(result.talent?.name).toBe('Weapon Training (Las)');
    });

    it('accepts a universal training talent (Weapon Master)', () => {
        expect(checkWeaponTraining(actorWith(['Weapon Master']), weaponNeeding('Las')).trained).toBe(true);
    });

    it('is untrained when no talent covers the required training', () => {
        const result = checkWeaponTraining(actorWith(['Weapon Training (SP)']), weaponNeeding('Las'));
        expect(result.trained).toBe(false);
        expect(result.talent).toBeNull();
    });
});

describe('getWeaponTrainingModifier', () => {
    it('is 0 when trained and -20 when untrained', () => {
        expect(getWeaponTrainingModifier(actorWith(['Weapon Training (Las)']), weaponNeeding('Las'))).toBe(0);
        expect(getWeaponTrainingModifier(actorWith([]), weaponNeeding('Las'))).toBe(-20);
    });
});

describe('getWeaponTrainingDescription', () => {
    it('names the covering talent when trained via a talent', () => {
        expect(getWeaponTrainingDescription(actorWith(['Weapon Training (Las)']), weaponNeeding('Las'))).toBe('Trained (Weapon Training (Las))');
    });

    it('says no training required when the weapon needs none', () => {
        expect(getWeaponTrainingDescription(actorWith([]), weaponNeeding(undefined))).toBe('No training required');
    });

    it('reports the -20 penalty and the required training when untrained', () => {
        expect(getWeaponTrainingDescription(actorWith([]), weaponNeeding('Las'))).toBe('Untrained (-20 penalty, requires: Las)');
    });
});
