import { describe, expect, it, vi } from 'vitest';
import {
    bodiesFromRows,
    bodyKeyFor,
    buildCelestialBodyField,
    buildLatitudeField,
    CELESTIAL_BODY_INPUT_NAME,
    type CelestialBodies,
    type CelestialBodyRow,
    DAY_PHASE_LABEL_KEYS,
    DAY_PHASES,
    darknessChanged,
    dayPhase,
    daylight,
    type LitScene,
    parseCelestialBodies,
    rowsFromBodies,
    SCENE_LATITUDE_INPUT_NAME,
    sceneBodyKey,
    sceneDarkness,
    sceneLatitude,
    sceneLightingUpdate,
    syncSceneLighting,
    weatherLabelKey,
} from './scene-lighting.ts';

const BODIES: CelestialBodies = {
    minoris: { name: 'Minoris', rotationHours: 20, orbitalDays: 340, axialTilt: 5, weather: 'clear' },
    majoris: { name: 'Majoris', rotationHours: 24, weather: 'storm' },
};

describe('daylight / sceneDarkness', () => {
    it('is fully dark at local midnight and fully lit at local noon', () => {
        expect(daylight(0, 20)).toBe(0);
        expect(daylight(10, 20)).toBe(1);
        expect(sceneDarkness(0, 20, 'clear')).toBe(1);
        expect(sceneDarkness(10, 20, 'clear')).toBe(0);
    });

    it('ramps through dawn and dusk symmetrically', () => {
        const dawn = sceneDarkness(5, 20, 'clear'); // a quarter rotation: sun on the horizon
        expect(dawn).toBeGreaterThan(0);
        expect(dawn).toBeLessThan(1);
        expect(sceneDarkness(15, 20, 'clear')).toBe(dawn);
    });

    it('scales to the body rotation (noon is half a rotation after midnight)', () => {
        expect(sceneDarkness(13, 26, 'clear')).toBe(0);
        expect(sceneDarkness(26, 26, 'clear')).toBe(1); // wraps to midnight
    });

    it('lets weather block daylight but never lightens night', () => {
        expect(sceneDarkness(10, 20, 'overcast')).toBeCloseTo(0.35, 6);
        expect(sceneDarkness(10, 20, 'ash')).toBeCloseTo(0.7, 6);
        expect(sceneDarkness(0, 20, 'storm')).toBe(1);
    });

    it('treats a non-positive rotation as permanent day', () => {
        expect(daylight(3, 0)).toBe(1);
    });
});

describe('dayPhase', () => {
    it('walks a Terran day through every phase in order', () => {
        expect(dayPhase(0, 24)).toBe('night');
        expect(dayPhase(3, 24)).toBe('night');
        expect(dayPhase(6, 24)).toBe('dawn');
        expect(dayPhase(9, 24)).toBe('morning');
        expect(dayPhase(12, 24)).toBe('midday');
        expect(dayPhase(15, 24)).toBe('afternoon');
        expect(dayPhase(18, 24)).toBe('dusk');
        expect(dayPhase(19.5, 24)).toBe('evening');
        expect(dayPhase(23, 24)).toBe('night');
    });

    it('puts dawn and dusk exactly on the darkness ramp', () => {
        const band = (lit: number): string => (lit === 0 ? 'dark' : lit === 1 ? 'lit' : 'ramp');
        const PHASE_BAND = { night: 'dark', evening: 'dark', dawn: 'ramp', dusk: 'ramp', morning: 'lit', midday: 'lit', afternoon: 'lit' };
        const hours = Array.from({ length: 96 }, (_, i) => i / 4);
        const mismatches = hours.filter((hour) => {
            const lit = daylight(hour, 24);
            const expected = PHASE_BAND[dayPhase(hour, 24)];
            // Dawn/dusk start where the ramp leaves full dark (lit 0) and end before full day.
            return expected === 'ramp' ? lit === 1 : band(lit) !== expected;
        });
        expect(mismatches).toEqual([]);
    });

    it('scales to the body rotation', () => {
        expect(dayPhase(10, 20)).toBe('midday');
        expect(dayPhase(5, 20)).toBe('dawn');
        expect(dayPhase(15, 20)).toBe('dusk');
        expect(dayPhase(30, 20)).toBe('midday'); // wraps into the next day
    });

    it('treats a non-positive rotation as permanent midday, matching daylight', () => {
        expect(dayPhase(3, 0)).toBe('midday');
    });

    it('names every phase in the langpack', () => {
        for (const phase of DAY_PHASES) expect(DAY_PHASE_LABEL_KEYS[phase]).toMatch(/^WH40K\.WorldTime\.Phase\./);
    });
});

describe('darknessChanged', () => {
    it('ignores sub-epsilon drift', () => {
        expect(darknessChanged(0.5, 0.505)).toBe(false);
        expect(darknessChanged(0.5, 0.52)).toBe(true);
    });
});

describe('parseCelestialBodies', () => {
    it('accepts valid bodies and defaults weather to clear', () => {
        expect(parseCelestialBodies({ moon: { name: 'Moon', rotationHours: 30 } })).toEqual({ moon: { name: 'Moon', rotationHours: 30, weather: 'clear' } });
    });

    it('reads invalid data as no bodies rather than throwing', () => {
        expect(parseCelestialBodies({ moon: { name: '', rotationHours: -1 } })).toEqual({});
        expect(parseCelestialBodies('nonsense')).toEqual({});
        expect(parseCelestialBodies({ 'Bad Key': { name: 'X', rotationHours: 10 } })).toEqual({});
        expect(parseCelestialBodies({ moon: { name: 'Moon', rotationHours: 10, weather: 'blizzard' } })).toEqual({});
    });
});

describe('bodyKeyFor', () => {
    it('slugs a name', () => {
        expect(bodyKeyFor('Solenne Minoris')).toBe('solenne-minoris');
        expect(bodyKeyFor('  Ghoul Stars IV! ')).toBe('ghoul-stars-iv');
        expect(bodyKeyFor('***')).toBe('body');
    });
});

describe('bodiesFromRows / rowsFromBodies', () => {
    const row = (overrides: Partial<CelestialBodyRow>): CelestialBodyRow => ({
        key: '',
        name: 'Body',
        rotationHours: '24',
        orbitalDays: '',
        axialTilt: '',
        weather: 'clear',
        ...overrides,
    });

    it('round-trips configured bodies', () => {
        expect(bodiesFromRows(rowsFromBodies(BODIES))).toEqual(BODIES);
    });

    it('keeps an existing slug across a rename so scene bindings survive', () => {
        expect(Object.keys(bodiesFromRows([row({ key: 'minoris', name: 'Renamed Moon' })]))).toEqual(['minoris']);
    });

    it('slugs and de-duplicates new rows', () => {
        expect(Object.keys(bodiesFromRows([row({ name: 'Moon' }), row({ name: 'Moon' })]))).toEqual(['moon', 'moon-2']);
    });

    it('drops rows without a name or a valid rotation, and blank optionals', () => {
        const bodies = bodiesFromRows([row({ name: '' }), row({ name: 'Bad', rotationHours: '0' }), row({ name: 'Good', orbitalDays: '', axialTilt: '' })]);
        expect(bodies).toEqual({ good: { name: 'Good', rotationHours: 24, weather: 'clear' } });
    });

    it('falls back to clear for an unknown weather value', () => {
        expect(Object.values(bodiesFromRows([row({ name: 'Moon', weather: 'blizzard' })])).at(0)?.weather).toBe('clear');
    });
});

describe('weatherLabelKey', () => {
    it('names the langpack key', () => {
        expect(weatherLabelKey('overcast')).toBe('WH40K.Weather.Overcast');
    });
});

function scene(
    body: string | undefined,
    darknessLevel: number,
    globalLight: boolean,
): LitScene & { updates: Array<[Record<string, number | boolean>, object]> } {
    const updates: Array<[Record<string, number | boolean>, object]> = [];
    return {
        getFlag: (_scope, key) => (key === 'celestialBody' ? body : undefined),
        environment: { darknessLevel, globalLight: { enabled: globalLight } },
        update: vi.fn(async (data: Record<string, number | boolean>, options: object = {}) => {
            updates.push([data, options]);
            return Promise.resolve(null);
        }),
        updates,
    };
}

describe('sceneBodyKey', () => {
    it('reads the binding, treating blank as unbound', () => {
        expect(sceneBodyKey(scene('minoris', 0, true))).toBe('minoris');
        expect(sceneBodyKey(scene('', 0, true))).toBeNull();
        expect(sceneBodyKey(scene(undefined, 0, true))).toBeNull();
        expect(sceneBodyKey(null)).toBeNull();
    });
});

describe('sceneLightingUpdate', () => {
    it('darkens a bound scene at night and turns global light off', () => {
        expect(sceneLightingUpdate(scene('minoris', 0, true), BODIES, () => 0)).toEqual({
            'environment.darknessLevel': 1,
            'environment.globalLight.enabled': false,
        });
    });

    it('lights a bound scene by day and turns global light on', () => {
        expect(sceneLightingUpdate(scene('minoris', 1, false), BODIES, () => 10)).toEqual({
            'environment.darknessLevel': 0,
            'environment.globalLight.enabled': true,
        });
    });

    it('is null for an unbound scene, an unknown body, or no material change', () => {
        expect(sceneLightingUpdate(scene(undefined, 0.3, true), BODIES, () => 0)).toBeNull();
        expect(sceneLightingUpdate(scene('nowhere', 0.3, true), BODIES, () => 0)).toBeNull();
        expect(sceneLightingUpdate(scene('minoris', 0, true), BODIES, () => 10)).toBeNull();
    });

    it('reads the bound body weather', () => {
        expect(sceneLightingUpdate(scene('majoris', 0, true), BODIES, () => 12)?.['environment.darknessLevel']).toBeCloseTo(0.65, 6);
    });
});

describe('syncSceneLighting', () => {
    it('updates only the scenes that need it, animating the viewed one', async () => {
        const viewed = scene('minoris', 0, true);
        const other = scene('minoris', 0, true);
        const settled = scene('minoris', 1, false);
        const manual = scene(undefined, 0.5, true);
        await syncSceneLighting([viewed, other, settled, manual], BODIES, () => 0, viewed);
        expect(viewed.updates).toEqual([[{ 'environment.darknessLevel': 1, 'environment.globalLight.enabled': false }, { animateDarkness: 2000 }]]);
        expect(other.updates).toEqual([[{ 'environment.darknessLevel': 1, 'environment.globalLight.enabled': false }, {}]]);
        expect(settled.updates).toEqual([]);
        expect(manual.updates).toEqual([]);
    });
});

describe('buildCelestialBodyField', () => {
    it('builds a select of bodies behind a "not driven" option, preselecting the binding', () => {
        const group = buildCelestialBodyField(document, { label: 'Body', hint: 'Hint', none: 'Manual' }, BODIES, 'majoris');
        const select = group.querySelector('select');
        expect(select?.name).toBe(CELESTIAL_BODY_INPUT_NAME);
        expect([...(select?.options ?? [])].map((o) => [o.value, o.textContent])).toEqual([
            ['', 'Manual'],
            ['minoris', 'Minoris'],
            ['majoris', 'Majoris'],
        ]);
        expect(select?.value).toBe('majoris');
    });

    it('selects "not driven" for an unbound scene', () => {
        expect(buildCelestialBodyField(document, { label: 'Body', hint: 'Hint', none: 'Manual' }, BODIES, null).querySelector('select')?.value).toBe('');
    });

    it('labels the group and carries its hint', () => {
        const group = buildCelestialBodyField(document, { label: 'Body', hint: 'Hint', none: 'Manual' }, BODIES, null);
        expect(group.className).toBe('form-group');
        expect(group.querySelector('label')?.textContent).toBe('Body');
        expect(group.querySelector('p.hint')?.textContent).toBe('Hint');
    });
});

function latitudeScene(latitude: number | string | undefined): { getFlag: (scope: string, key: string) => number | string | undefined } {
    return { getFlag: (_scope, key) => (key === 'latitude' ? latitude : undefined) };
}

describe('sceneLatitude', () => {
    it('reads a latitude within the poles', () => {
        expect(sceneLatitude(latitudeScene(45))).toBe(45);
        expect(sceneLatitude(latitudeScene(-90))).toBe(-90);
        expect(sceneLatitude(latitudeScene(0))).toBe(0);
    });

    it('is null when unset, not a number, past a pole, or with no scene', () => {
        expect(sceneLatitude(latitudeScene(undefined))).toBeNull();
        expect(sceneLatitude(latitudeScene('45'))).toBeNull();
        expect(sceneLatitude(latitudeScene(91))).toBeNull();
        expect(sceneLatitude(latitudeScene(Number.NaN))).toBeNull();
        expect(sceneLatitude(null)).toBeNull();
    });
});

describe('buildLatitudeField', () => {
    it('builds a number input bounded at the poles, posting under the scene flag', () => {
        const input = buildLatitudeField(document, { label: 'Latitude', hint: 'Hint' }, 52.5).querySelector('input');
        expect(input?.name).toBe(SCENE_LATITUDE_INPUT_NAME);
        expect([input?.type, input?.min, input?.max, input?.step, input?.value]).toEqual(['number', '-90', '90', 'any', '52.5']);
    });

    it('is empty for a scene with no latitude', () => {
        expect(buildLatitudeField(document, { label: 'Latitude', hint: 'Hint' }, null).querySelector('input')?.value).toBe('');
    });
});
