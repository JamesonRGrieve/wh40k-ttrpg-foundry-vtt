import { describe, expect, it } from 'vitest';
import { WEAPON_FACING_CHOICES, WEAPON_MOUNTING_CHOICES, type WeaponFacing, type WeaponMounting } from './vehicle-mounting.ts';

/**
 * The mounting vocabulary is RAW (Only War core p.211-212) and shared verbatim
 * by all six FFG lines, so these assertions pin the printed set. A mounting
 * added or renamed here silently changes what every vehicle weapon can declare.
 */
describe('WEAPON_MOUNTING_CHOICES', () => {
    it('covers the six printed mountings plus the unmounted blank', () => {
        expect([...WEAPON_MOUNTING_CHOICES]).toEqual(['', 'fixed', 'hull', 'turret', 'sponson', 'coaxial', 'pintle']);
    });

    it('leads with the blank so a personal-scale weapon is the default', () => {
        expect(WEAPON_MOUNTING_CHOICES[0]).toBe('');
    });

    it('names each mounting exactly once', () => {
        expect(new Set(WEAPON_MOUNTING_CHOICES).size).toBe(WEAPON_MOUNTING_CHOICES.length);
    });

    it('narrows to the WeaponMounting union', () => {
        const turret: WeaponMounting = 'turret';
        expect(WEAPON_MOUNTING_CHOICES).toContain(turret);
    });
});

describe('WEAPON_FACING_CHOICES', () => {
    it('measures arcs from a craft facing, with `all` for 360-degree mounts', () => {
        expect([...WEAPON_FACING_CHOICES]).toEqual(['', 'front', 'rear', 'left', 'right', 'all']);
    });

    it('distinguishes left from right', () => {
        // RAW is explicit that the two side facings are tracked separately: a
        // weapon on the right sponson cannot be damaged by a hit from the left.
        expect(WEAPON_FACING_CHOICES).toContain('left');
        expect(WEAPON_FACING_CHOICES).toContain('right');
    });

    it('narrows to the WeaponFacing union', () => {
        const front: WeaponFacing = 'front';
        expect(WEAPON_FACING_CHOICES).toContain(front);
    });
});
