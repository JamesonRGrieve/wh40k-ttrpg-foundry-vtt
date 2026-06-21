/**
 * Unit tests for the shared ship-stat modifier helpers.
 *
 * `shipHasModifiers` / `shipModifiersList` are pure functions over a
 * `{ modifiers }` map, so they are exercised directly (no Foundry runtime).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SHIP_STAT_KEYS, shipHasModifiers, shipModifiersList, type ShipStatModifiers } from './ship-stat-modifiers-template.ts';

describe('SHIP_STAT_KEYS', () => {
    it('lists the nine canonical ship stats in order', () => {
        expect(SHIP_STAT_KEYS).toEqual([
            'speed',
            'manoeuvrability',
            'detection',
            'armour',
            'hullIntegrity',
            'turretRating',
            'voidShields',
            'morale',
            'crewRating',
        ]);
    });

    it('has no duplicate keys', () => {
        expect(new Set(SHIP_STAT_KEYS).size).toBe(SHIP_STAT_KEYS.length);
    });
});

describe('ship-stat modifier helpers', () => {
    // shipModifiersList uses Foundry's String.prototype.capitalize extension,
    // which is absent under happy-dom. Install a minimal polyfill for the test only.
    let installedCapitalize = false;
    beforeEach(() => {
        vi.stubGlobal('game', { i18n: { localize: (k: string) => k } });
        if (!('capitalize' in String.prototype)) {
            Object.defineProperty(String.prototype, 'capitalize', {
                value(this: string): string {
                    return this.charAt(0).toUpperCase() + this.slice(1);
                },
                configurable: true,
                writable: true,
            });
            installedCapitalize = true;
        }
    });
    afterEach(() => {
        vi.unstubAllGlobals();
        if (installedCapitalize) {
            // Remove the polyfill we installed in beforeEach.
            Reflect.deleteProperty(String.prototype, 'capitalize');
            installedCapitalize = false;
        }
    });

    it('shipHasModifiers is false when all stats are zero', () => {
        expect(shipHasModifiers({ speed: 0, armour: 0 } as ShipStatModifiers)).toBe(false);
    });

    it('shipHasModifiers is true when any stat is non-zero', () => {
        expect(shipHasModifiers({ speed: 0, armour: 2 } as ShipStatModifiers)).toBe(true);
    });

    it('shipModifiersList includes only non-zero stats with localized labels', () => {
        const list = shipModifiersList({ speed: 1, armour: 0, morale: -3 } as ShipStatModifiers);
        expect(list).toEqual([
            { key: 'speed', label: 'WH40K.ShipStat.Speed', value: 1 },
            { key: 'morale', label: 'WH40K.ShipStat.Morale', value: -3 },
        ]);
    });
});
