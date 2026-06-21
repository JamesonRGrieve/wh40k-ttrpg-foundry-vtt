import { afterEach, describe, expect, it, vi } from 'vitest';
import { WH40K } from '../config.ts';
import { shipAvailabilityChoices, shipHullTypeChoices } from './ship-choices.ts';

/**
 * Ship dropdown choices derive from the canonical `WH40K.hullTypes` /
 * `WH40K.availabilities` CONFIG maps (#336). `game.i18n.localize` is stubbed to
 * tag each key so the join is observable.
 */
function stubLocalize(): void {
    vi.stubGlobal('game', {
        i18n: { localize: (key: string): string => `loc:${key.split('.').pop() ?? key}` },
    });
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('shipHullTypeChoices', () => {
    it('prepends the "All" sentinel ahead of every CONFIG hull type', () => {
        stubLocalize();
        const choices = shipHullTypeChoices();
        expect(Object.keys(choices)[0]).toBe('all');
        for (const key of Object.keys(WH40K.hullTypes)) {
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess parser mismatch: tsconfig.test.json (flag off) vs tsconfig.json (flag on)
            expect(choices[key]).toBe(`loc:${WH40K.hullTypes[key]?.label.split('.').pop() ?? ''}`);
        }
    });

    it('offers exactly the CONFIG hull types plus the sentinel', () => {
        stubLocalize();
        expect(Object.keys(shipHullTypeChoices())).toEqual(['all', ...Object.keys(WH40K.hullTypes)]);
    });
});

describe('shipAvailabilityChoices', () => {
    it('mirrors the CONFIG availability map key-for-key', () => {
        stubLocalize();
        expect(Object.keys(shipAvailabilityChoices())).toEqual(Object.keys(WH40K.availabilities));
    });
});
