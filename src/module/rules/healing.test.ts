import { describe, expect, it } from 'vitest';
import { getDamageTier, getNaturalHealingDays, MEDICAE_ACTIONS } from './healing';

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
