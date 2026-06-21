/**
 * Unit tests for the shared vehicle-stat modifiers mixin.
 *
 * `VehicleStatModifiersTemplate` extends `SystemDataModel` (needs a Foundry
 * runtime to instantiate), so we test the exported const directly and exercise
 * the `hasModifiers` / `modifiersList` getters via their prototype descriptors
 * bound to a plain `{ modifiers }` stub — they only read `this.modifiers`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { importModelOrSkip } from '../../testing/model-import.ts';
import { VEHICLE_STAT_KEYS } from './vehicle-stat-modifiers-template.ts';

interface ModifierHost {
    modifiers: Record<string, number>;
}

function getter<T>(proto: object, name: string, host: ModifierHost): T {
    const desc = Object.getOwnPropertyDescriptor(proto, name);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- test: getter is known to exist on the prototype under test
    return desc!.get!.call(host) as T;
}

describe('VEHICLE_STAT_KEYS', () => {
    it('lists the four canonical vehicle stats in order', () => {
        expect(VEHICLE_STAT_KEYS).toEqual(['speed', 'manoeuvrability', 'armour', 'integrity']);
    });

    it('has no duplicate keys', () => {
        expect(new Set(VEHICLE_STAT_KEYS).size).toBe(VEHICLE_STAT_KEYS.length);
    });
});

describe('VehicleStatModifiersTemplate getters', () => {
    beforeEach(() => {
        vi.stubGlobal('game', { i18n: { localize: (k: string) => k } });
    });
    afterEach(() => vi.unstubAllGlobals());

    it('hasModifiers is false when all stats are zero', async () => {
        const mod = await importModelOrSkip(import('./vehicle-stat-modifiers-template.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom
        if (mod === undefined) return;
        const host: ModifierHost = { modifiers: { speed: 0, armour: 0 } };
        expect(getter<boolean>(mod.default.prototype, 'hasModifiers', host)).toBe(false);
    });

    it('hasModifiers is true when any stat is non-zero', async () => {
        const mod = await importModelOrSkip(import('./vehicle-stat-modifiers-template.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom
        if (mod === undefined) return;
        const host: ModifierHost = { modifiers: { speed: 0, integrity: -1 } };
        expect(getter<boolean>(mod.default.prototype, 'hasModifiers', host)).toBe(true);
    });

    it('modifiersList includes the signed formatted string for non-zero stats', async () => {
        const mod = await importModelOrSkip(import('./vehicle-stat-modifiers-template.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom
        if (mod === undefined) return;
        const host: ModifierHost = { modifiers: { speed: 2, armour: 0, integrity: -1 } };
        const list = getter<Array<{ key: string; label: string; value: number; formatted: string }>>(mod.default.prototype, 'modifiersList', host);
        expect(list).toEqual([
            { key: 'speed', label: 'WH40K.VehicleStat.Speed', value: 2, formatted: '+2' },
            { key: 'integrity', label: 'WH40K.VehicleStat.Integrity', value: -1, formatted: '-1' },
        ]);
    });
});
