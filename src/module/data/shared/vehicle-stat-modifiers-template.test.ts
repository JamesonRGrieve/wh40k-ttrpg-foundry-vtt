/**
 * Unit tests for the shared vehicle-stat modifier helpers.
 *
 * `vehicleHasModifiers` / `vehicleModifiersList` are pure functions over a
 * `{ modifiers }` map, so they are exercised directly (no Foundry runtime).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VEHICLE_STAT_KEYS, vehicleHasModifiers, vehicleModifiersList, type VehicleStatModifiers } from './vehicle-stat-modifiers-template.ts';

describe('VEHICLE_STAT_KEYS', () => {
    it('lists the four canonical vehicle stats in order', () => {
        expect(VEHICLE_STAT_KEYS).toEqual(['speed', 'manoeuvrability', 'armour', 'integrity']);
    });

    it('has no duplicate keys', () => {
        expect(new Set(VEHICLE_STAT_KEYS).size).toBe(VEHICLE_STAT_KEYS.length);
    });
});

describe('vehicle-stat modifier helpers', () => {
    beforeEach(() => {
        vi.stubGlobal('game', { i18n: { localize: (k: string) => k } });
    });
    afterEach(() => vi.unstubAllGlobals());

    it('vehicleHasModifiers is false when all stats are zero', () => {
        expect(vehicleHasModifiers({ speed: 0, armour: 0 } as VehicleStatModifiers)).toBe(false);
    });

    it('vehicleHasModifiers is true when any stat is non-zero', () => {
        expect(vehicleHasModifiers({ speed: 0, integrity: -1 } as VehicleStatModifiers)).toBe(true);
    });

    it('vehicleModifiersList includes the signed formatted string for non-zero stats', () => {
        const list = vehicleModifiersList({ speed: 2, armour: 0, integrity: -1 } as VehicleStatModifiers);
        expect(list).toEqual([
            { key: 'speed', label: 'WH40K.VehicleStat.Speed', value: 2, formatted: '+2' },
            { key: 'integrity', label: 'WH40K.VehicleStat.Integrity', value: -1, formatted: '-1' },
        ]);
    });
});
