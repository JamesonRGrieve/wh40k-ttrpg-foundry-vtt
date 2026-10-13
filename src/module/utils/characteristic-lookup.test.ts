import { describe, expect, it } from 'vitest';
import { findCharacteristic } from './characteristic-lookup.ts';

const CHARACTERISTICS = {
    weaponSkill: { short: 'WS', total: 30 },
    intelligence: { short: 'Int', total: 50 },
    agility: { short: 'Ag', total: 40 },
};

describe('findCharacteristic', () => {
    it('matches the key in any case', () => {
        expect(findCharacteristic(CHARACTERISTICS, 'intelligence')?.total).toBe(50);
        expect(findCharacteristic(CHARACTERISTICS, 'WEAPONSKILL')?.total).toBe(30);
    });

    it('matches the mixed-case short name a skill definition carries (Medicae → "Int")', () => {
        // Regression: the short name was compared against its upper-cased form without
        // upper-casing the input, so "Int" and "Ag" never matched and Field Vivisection's
        // Medicae offset read the characteristic as 0 (#101).
        expect(findCharacteristic(CHARACTERISTICS, 'Int')?.total).toBe(50);
        expect(findCharacteristic(CHARACTERISTICS, 'Ag')?.total).toBe(40);
        expect(findCharacteristic(CHARACTERISTICS, 'int')?.total).toBe(50);
        expect(findCharacteristic(CHARACTERISTICS, 'WS')?.total).toBe(30);
    });

    it('is undefined for a name that is neither', () => {
        expect(findCharacteristic(CHARACTERISTICS, 'Fellowship')).toBeUndefined();
        expect(findCharacteristic(CHARACTERISTICS, '')).toBeUndefined();
    });
});
