import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WH40K } from '../config.ts';
import { hullTypeLabelKey, shipAvailabilityChoices, shipComponentTypeLabelKey, shipHullTypeChoices, voidcraftHullTypeOptions } from './ship-choices.ts';

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

describe('voidcraft hull type (#647)', () => {
    it('names the label key of each WH40K.hullTypes id, and null for anything else', () => {
        expect(hullTypeLabelKey('light-cruiser')).toBe('WH40K.HullType.LightCruiser');
        expect(hullTypeLabelKey('transport')).toBe('WH40K.HullType.Transport');
        for (const offEnum of ['escort', 'heavy-cruiser', '', 'toString']) expect(hullTypeLabelKey(offEnum)).toBeNull();
    });

    it('knows the hull types the RT books print for unique vessels (content#31)', () => {
        // Kroot Warsphere, Wayfarer Station, the Bulwark and the Ork Rok, across the RT
        // core rules and its supplements.
        expect(hullTypeLabelKey('battleship')).toBe('WH40K.HullType.Battleship');
        expect(hullTypeLabelKey('space-station')).toBe('WH40K.HullType.SpaceStation');
        expect(hullTypeLabelKey('repurposed-asteroid')).toBe('WH40K.HullType.RepurposedAsteroid');
        // No generic Space or Speed is printed for these types, so none is set.
        expect(WH40K.hullTypes['battleship']).toEqual({ label: 'WH40K.HullType.Battleship' });
        expect(WH40K.hullTypes['space-station']).toEqual({ label: 'WH40K.HullType.SpaceStation' });
        expect(WH40K.hullTypes['repurposed-asteroid']).toEqual({ label: 'WH40K.HullType.RepurposedAsteroid' });
    });

    it('offers "not set" then every hull type, with the stored one selected', () => {
        const options = voidcraftHullTypeOptions('cruiser');
        expect(options.map((o) => o.value)).toEqual(['', ...Object.keys(WH40K.hullTypes)]);
        expect(options.filter((o) => o.selected).map((o) => o.value)).toEqual(['cruiser']);
        expect(options[0]?.labelKey).toBe('WH40K.Voidcraft.HullTypeUnset');
    });

    it('selects "not set" for a ship with no hull type, so a save never assigns the first type', () => {
        expect(
            voidcraftHullTypeOptions('')
                .filter((o) => o.selected)
                .map((o) => o.value),
        ).toEqual(['']);
    });

    it('keeps a stored value outside the hull types as its own selected option, so a save never rewrites it', () => {
        const options = voidcraftHullTypeOptions('escort');
        expect(options.filter((o) => o.selected)).toEqual([{ value: 'escort', labelKey: null, selected: true }]);
        expect(options).toHaveLength(Object.keys(WH40K.hullTypes).length + 2);
    });

    it('the voidcraft hullTypeLabel getter reads its label through hullTypeLabelKey (no key built from the id)', () => {
        const model = readFileSync(resolve(__dirname, '../data/actor/voidcraft.ts'), 'utf8');
        expect(model).toContain('const key = hullTypeLabelKey(this.hullType);');
        expect(model).toContain('return key === null ? this.hullType : game.i18n.localize(key);');
        expect(model).not.toContain('`WH40K.HullType.${');
    });

    it('the langpack carries every hull type label and the "not set" label', () => {
        // Every label here is a two-level WH40K key: WH40K.<Group>.<Name>.
        interface LangGroups {
            WH40K: { [group: string]: { [name: string]: string | object } | undefined };
        }
        const lang = JSON.parse(readFileSync(resolve(__dirname, '../../lang/en.json'), 'utf8')) as LangGroups;
        const labelOf = (key: string): string | object | undefined => {
            const [, group = '', name = ''] = key.split('.');
            return lang.WH40K[group]?.[name];
        };
        const keys = voidcraftHullTypeOptions('').map((o) => o.labelKey ?? '');
        expect(keys.filter((key) => typeof labelOf(key) !== 'string')).toEqual([]);
    });
});

describe('ship component type label (#662)', () => {
    /** Resolve a dotted langpack key against en.json, to its string or undefined. */
    function langValue(key: string): string | undefined {
        interface LangNode {
            [name: string]: LangNode | string | undefined;
        }
        const lang = JSON.parse(readFileSync(resolve(__dirname, '../../lang/en.json'), 'utf8')) as LangNode;
        let node: LangNode | string | undefined = lang;
        for (const part of key.split('.')) node = typeof node === 'object' ? node[part] : undefined;
        return typeof node === 'string' ? node : undefined;
    }

    it('names the label key of each component type, under the Type group the langpack uses', () => {
        expect(shipComponentTypeLabelKey('auger')).toBe('WH40K.ShipComponent.Type.Auger');
        expect(shipComponentTypeLabelKey('gellarField')).toBe('WH40K.ShipComponent.Type.GellarField');
        for (const offEnum of ['', 'Auger', 'toString']) expect(shipComponentTypeLabelKey(offEnum)).toBeNull();
    });

    it('resolves every component type the schema offers to a langpack string', () => {
        const model = readFileSync(resolve(__dirname, '../data/item/ship-component.ts'), 'utf8');
        const choices = /componentType: new fields\.StringField\(\{[\s\S]*?choices: \[([\s\S]*?)\]/.exec(model)?.[1] ?? '';
        const ids = Array.from(choices.matchAll(/'([^']+)'/g), (match) => String(match[1]));
        expect(ids.length).toBeGreaterThan(10);
        expect(ids.filter((id) => langValue(shipComponentTypeLabelKey(id) ?? '') === undefined)).toEqual([]);
    });

    it('the componentTypeLabel getter reads its key through shipComponentTypeLabelKey (no key built from the id)', () => {
        const model = readFileSync(resolve(__dirname, '../data/item/ship-component.ts'), 'utf8');
        expect(model).toContain('const key = shipComponentTypeLabelKey(this.componentType);');
        expect(model).not.toContain('`WH40K.ShipComponent.${');
    });
});

describe('shipAvailabilityChoices', () => {
    it('mirrors the CONFIG availability map key-for-key', () => {
        stubLocalize();
        expect(Object.keys(shipAvailabilityChoices())).toEqual(Object.keys(WH40K.availabilities));
    });
});
