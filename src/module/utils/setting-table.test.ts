import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    arraySetting,
    booleanSetting,
    choiceSetting,
    jsonSetting,
    numberSetting,
    readJsonSetting,
    readSetting,
    registerSettingTable,
    settingKeys,
    stringSetting,
    writeSetting,
} from './setting-table.ts';

/** Stub `game.settings` the way Foundry behaves: an unregistered key throws. */
function stubSettings(stored: Record<string, boolean | number | string | object>): { writes: Array<[string, string, object | string | number | boolean]> } {
    const writes: Array<[string, string, object | string | number | boolean]> = [];
    vi.stubGlobal('game', {
        settings: {
            get: (_ns: string, key: string): boolean | number | string | object => {
                const value = new Map(Object.entries(stored)).get(key);
                if (value === undefined) throw new Error(`"wh40k-rpg.${key}" is not a registered game setting`);
                return value;
            },
            set: (ns: string, key: string, value: object | string | number | boolean): void => {
                writes.push([ns, key, value]);
            },
        },
    });
    return { writes };
}

afterEach(() => {
    vi.unstubAllGlobals();
});

const spec = { name: 'WH40K.SETTINGS.WorldVersion.Name', hint: 'WH40K.SETTINGS.WorldVersion.Hint', scope: 'world', config: true } as const;

describe('readSetting (#712)', () => {
    const flag = booleanSetting({ ...spec, key: 'flag', default: true });
    const count = numberSetting({ ...spec, key: 'count', default: 60 });
    const mode = choiceSetting({ ...spec, key: 'mode', default: 'raw', choices: { raw: spec.name, gen1: spec.name } });

    it('returns the stored value when the entry accepts it', () => {
        stubSettings({ flag: false, count: 42, mode: 'gen1' });
        expect(readSetting(flag)).toBe(false);
        expect(readSetting(count)).toBe(42);
        expect(readSetting(mode)).toBe('gen1');
    });

    it('returns the default for a stored value of the wrong shape', () => {
        stubSettings({ flag: 'yes', count: Number.NaN, mode: 'gen9' });
        expect(readSetting(flag)).toBe(true);
        expect(readSetting(count)).toBe(60);
        expect(readSetting(mode)).toBe('raw');
    });

    it('returns the default before the setting is registered, and when game is not ready', () => {
        stubSettings({});
        expect(readSetting(count)).toBe(60);
        vi.unstubAllGlobals();
        expect(readSetting(flag)).toBe(true);
    });

    it('narrows an array setting through its guard', () => {
        const ids = arraySetting({
            ...spec,
            key: 'ids',
            default: [] as string[],
            accept: (stored): stored is string[] => Array.isArray(stored) && (stored as readonly string[]).every((id) => typeof id === 'string'),
        });
        stubSettings({ ids: ['a', 'b'] });
        expect(readSetting(ids)).toEqual(['a', 'b']);
        stubSettings({ ids: ['a', 3] });
        expect(readSetting(ids)).toEqual([]);
    });
});

describe('readJsonSetting (#712)', () => {
    const bodies = jsonSetting({
        ...spec,
        key: 'bodies',
        default: '{}',
        parse: (value): { names: string[] } => {
            if (value === null || typeof value !== 'object' || !Array.isArray((value as { names?: string[] }).names)) throw new Error('bad shape');
            return value as { names: string[] };
        },
        empty: { names: [] as string[] },
    });

    it('parses and validates the stored JSON', () => {
        stubSettings({ bodies: '{"names":["Solenne"]}' });
        expect(readJsonSetting(bodies)).toEqual({ names: ['Solenne'] });
    });

    it('reads blank, unparseable, rejected or unregistered JSON as the empty value', () => {
        for (const stored of ['', '   ', '{not json', '{"other":1}']) {
            stubSettings({ bodies: stored });
            expect(readJsonSetting(bodies)).toEqual({ names: [] });
        }
        stubSettings({});
        expect(readJsonSetting(bodies)).toEqual({ names: [] });
    });
});

describe('writeSetting, registerSettingTable and settingKeys (#712)', () => {
    const table = {
        first: numberSetting({ ...spec, key: 'first', default: 1, requiresReload: true, range: { min: 0, max: 1, step: 0.05 } }),
        second: stringSetting({ ...spec, key: 'second', scope: 'client', config: false, default: '' }),
        third: choiceSetting({ ...spec, key: 'third', default: 'a', choices: { a: spec.name, b: spec.hint } }),
    };

    it('writes the value under the system namespace and the entry key', async () => {
        const { writes } = stubSettings({});
        await writeSetting(table.second, 'hello');
        expect(writes).toEqual([['wh40k-rpg', 'second', 'hello']]);
    });

    it('registers every entry in order, with requiresReload, range and choices only where stated', () => {
        const calls: Array<[string, string, Record<string, object | string | number | boolean>]> = [];
        vi.stubGlobal('game', {
            settings: {
                register: (ns: string, key: string, data: Record<string, object | string | number | boolean>): void => {
                    calls.push([ns, key, data]);
                },
            },
        });
        registerSettingTable(table);
        expect(calls.map(([ns, key]) => `${ns}.${key}`)).toEqual(['wh40k-rpg.first', 'wh40k-rpg.second', 'wh40k-rpg.third']);
        const [first, second, third] = calls.map(([, , data]) => data);
        expect(first).toMatchObject({ type: Number, default: 1, requiresReload: true, range: { min: 0, max: 1, step: 0.05 }, scope: 'world' });
        expect(second).toMatchObject({ type: String, default: '', scope: 'client', config: false });
        expect(second).not.toHaveProperty('requiresReload');
        expect(second).not.toHaveProperty('choices');
        expect(third).toMatchObject({ choices: { a: spec.name, b: spec.hint } });
        // The guard is the read path's business, never registration data.
        expect(first).not.toHaveProperty('accept');
    });

    it('derives the property → key map from the table', () => {
        expect(settingKeys(table)).toEqual({ first: 'first', second: 'second', third: 'third' });
    });
});
