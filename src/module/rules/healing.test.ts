import { describe, expect, it } from 'vitest';
import { DAMAGE_TIER_LABEL_KEYS, type DamageTier, getDamageTier, getNaturalHealingDays, MEDICAE_ACTIONS } from './healing';

describe('getDamageTier', () => {
    it('returns unharmed when wounds == max', () => {
        expect(getDamageTier(10, 10)).toBe('unharmed');
    });
    it('returns lightlyDamaged when wounds are between half and full', () => {
        expect(getDamageTier(8, 10)).toBe('lightlyDamaged');
        expect(getDamageTier(5, 10)).toBe('lightlyDamaged');
    });
    it('returns heavilyDamaged when wounds are below half', () => {
        expect(getDamageTier(4, 10)).toBe('heavilyDamaged');
        expect(getDamageTier(0, 10)).toBe('heavilyDamaged');
    });
    it('returns unharmed when max is 0', () => {
        expect(getDamageTier(0, 0)).toBe('unharmed');
    });
    it('rounds the half-max threshold up', () => {
        // max 7 → half 4 (ceil). 4 wounds = lightly; 3 = heavily.
        expect(getDamageTier(4, 7)).toBe('lightlyDamaged');
        expect(getDamageTier(3, 7)).toBe('heavilyDamaged');
    });
    it('returns critical when the patient carries critical damage (#432)', () => {
        // Critical outranks the wound-based tiers regardless of remaining wounds.
        expect(getDamageTier(0, 10, 1)).toBe('critical');
        expect(getDamageTier(6, 10, 3)).toBe('critical');
    });
    it('ignores zero/absent critical damage', () => {
        expect(getDamageTier(8, 10, 0)).toBe('lightlyDamaged');
        expect(getDamageTier(8, 10)).toBe('lightlyDamaged');
    });
});

describe('DAMAGE_TIER_LABEL_KEYS', () => {
    it('has a label key for every tier', () => {
        const tiers: DamageTier[] = ['unharmed', 'lightlyDamaged', 'heavilyDamaged', 'critical'];
        for (const tier of tiers) {
            expect(DAMAGE_TIER_LABEL_KEYS[tier]).toMatch(/^WH40K\.SkillUse\.Tier\./);
        }
    });
});

describe('getNaturalHealingDays', () => {
    it('returns 0 for unharmed', () => {
        expect(getNaturalHealingDays('unharmed')).toBe(0);
    });
    it('returns 1 day for lightly damaged', () => {
        expect(getNaturalHealingDays('lightlyDamaged')).toBe(1);
    });
    it('returns 7 days for heavily damaged', () => {
        expect(getNaturalHealingDays('heavilyDamaged')).toBe(7);
    });
    it('returns 7 days for critical (no faster than heavily damaged)', () => {
        expect(getNaturalHealingDays('critical')).toBe(7);
    });
});

describe('MEDICAE_ACTIONS registry', () => {
    it('has the five canonical Medicae uses', () => {
        for (const key of ['firstAid', 'extendedCare', 'surgery', 'diagnose', 'extractBullet']) {
            expect(MEDICAE_ACTIONS).toHaveProperty(key);
        }
    });
    it('First Aid is Ordinary, Extended Care is Difficult, Surgery is Hard', () => {
        expect(MEDICAE_ACTIONS.firstAid.difficulty).toBe(0);
        expect(MEDICAE_ACTIONS.extendedCare.difficulty).toBe(-10);
        expect(MEDICAE_ACTIONS.surgery.difficulty).toBe(-20);
    });
});
