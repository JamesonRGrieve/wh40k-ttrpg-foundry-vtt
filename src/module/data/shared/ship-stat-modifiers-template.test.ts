/**
 * Unit tests for the shared ship-stat modifiers mixin.
 *
 * `ShipStatModifiersTemplate` extends `SystemDataModel` (needs a Foundry
 * runtime to instantiate), so we test the exported const directly and exercise
 * the `hasModifiers` / `modifiersList` getters via their prototype descriptors
 * bound to a plain `{ modifiers }` stub — they only read `this.modifiers`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { importModelOrSkip } from '../../testing/model-import.ts';
import { SHIP_STAT_KEYS } from './ship-stat-modifiers-template.ts';

interface ModifierHost {
    modifiers: Record<string, number>;
}

function getter<T>(proto: object, name: string, host: ModifierHost): T {
    const desc = Object.getOwnPropertyDescriptor(proto, name);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- test: getter is known to exist on the prototype under test
    return desc!.get!.call(host) as T;
}

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

describe('ShipStatModifiersTemplate getters', () => {
    // The getter uses Foundry's String.prototype.capitalize extension, which is
    // absent under happy-dom. Install a minimal polyfill for the test only.
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
            // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- test cleanup: remove the polyfill we installed in beforeEach
            delete (String.prototype as unknown as Record<string, unknown>)['capitalize'];
            installedCapitalize = false;
        }
    });

    it('hasModifiers is false when all stats are zero', async () => {
        const mod = await importModelOrSkip(import('./ship-stat-modifiers-template.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom
        if (mod === undefined) return;
        const host: ModifierHost = { modifiers: { speed: 0, armour: 0 } };
        expect(getter<boolean>(mod.default.prototype, 'hasModifiers', host)).toBe(false);
    });

    it('hasModifiers is true when any stat is non-zero', async () => {
        const mod = await importModelOrSkip(import('./ship-stat-modifiers-template.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom
        if (mod === undefined) return;
        const host: ModifierHost = { modifiers: { speed: 0, armour: 2 } };
        expect(getter<boolean>(mod.default.prototype, 'hasModifiers', host)).toBe(true);
    });

    it('modifiersList includes only non-zero stats with localized labels', async () => {
        const mod = await importModelOrSkip(import('./ship-stat-modifiers-template.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom
        if (mod === undefined) return;
        const host: ModifierHost = { modifiers: { speed: 1, armour: 0, morale: -3 } };
        const list = getter<Array<{ key: string; label: string; value: number }>>(mod.default.prototype, 'modifiersList', host);
        expect(list).toEqual([
            { key: 'speed', label: 'WH40K.ShipStat.Speed', value: 1 },
            { key: 'morale', label: 'WH40K.ShipStat.Morale', value: -3 },
        ]);
    });
});
