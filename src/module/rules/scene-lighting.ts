/**
 * Scene lighting from in-universe time and weather (#588).
 *
 * A scene bound to a celestial body (the `flags.wh40k-rpg.celestialBody` key)
 * has its darkness driven by that body's LOCAL time of day — computed from the
 * world clock and the body's rotation period by `planetary-calendar.ts` — dimmed
 * further by the body's current weather. An unbound scene (an interior, a
 * voidship, a hand-lit battlemap) is never touched.
 *
 * The bodies themselves (name, rotation, orbit, tilt, current weather) are WORLD
 * data — the GM's campaign, edited through the Celestial Bodies menu and stored in
 * the `celestial-bodies` world setting — never constants in `src/`. What lives
 * here is content-agnostic: the weather scale, the dawn/dusk curve, and the
 * flag plumbing.
 */

import { SYSTEM_ID } from '../constants.ts';

/* -------------------------------------------- */
/*  Weather                                     */
/* -------------------------------------------- */

/** Weather states, lightest to heaviest. Labels live under `WH40K.Weather.*`. */
export const WEATHER_KINDS = ['clear', 'haze', 'overcast', 'rain', 'fog', 'dust', 'smog', 'storm', 'ash'] as const;
export type WeatherKind = (typeof WEATHER_KINDS)[number];

/** Fraction of daylight each weather state blocks (0 = none, 1 = all). */
const WEATHER_DIMMING: Readonly<Record<WeatherKind, number>> = {
    clear: 0,
    haze: 0.15,
    overcast: 0.35,
    rain: 0.45,
    fog: 0.5,
    dust: 0.5,
    smog: 0.55,
    storm: 0.65,
    ash: 0.7,
};

/** The langpack key naming a weather state. */
export function weatherLabelKey(weather: WeatherKind): string {
    return `WH40K.Weather.${weather.charAt(0).toUpperCase()}${weather.slice(1)}`;
}

/* -------------------------------------------- */
/*  Celestial bodies (world data)               */
/* -------------------------------------------- */

/** One celestial body as the GM configured it. */
export interface CelestialBodyRecord {
    name: string;
    /** Local day length in Terran hours (> 0). */
    rotationHours: number;
    /** Local year in Terran days (> 0), when known. */
    orbitalDays?: number | undefined;
    /** Axial tilt in degrees (0–90), when known. */
    axialTilt?: number | undefined;
    weather: WeatherKind;
}

/** Every configured body, keyed by slug. */
export type CelestialBodies = Record<string, CelestialBodyRecord>;

/** Body keys are slugs, so they are stable scene-flag values. */
const BODY_KEY = /^[a-z0-9][a-z0-9-]*$/;

/*
 * Validation is hand-written, not Zod: this module is runtime code, and the system
 * ships unbundled tsc output, so a bare `import … from 'zod'` fails to resolve in
 * the browser and takes the whole system's module graph down with it.
 */

function isWeatherKind(value: string): value is WeatherKind {
    return (WEATHER_KINDS as readonly string[]).includes(value);
}

/** A body entry with its fields' types checked (ranges are checked by {@link toBody}). */
interface StoredBody {
    name?: string;
    rotationHours?: number;
    orbitalDays?: number;
    axialTilt?: number;
    weather?: string;
}

/** Does this object carry only correctly-typed body fields (each optional)? */
function isStoredBody(value: object): value is StoredBody {
    if ('name' in value && typeof value.name !== 'string') return false;
    if ('rotationHours' in value && typeof value.rotationHours !== 'number') return false;
    if ('orbitalDays' in value && value.orbitalDays !== undefined && typeof value.orbitalDays !== 'number') return false;
    if ('axialTilt' in value && value.axialTilt !== undefined && typeof value.axialTilt !== 'number') return false;
    return !('weather' in value) || typeof value.weather === 'string';
}

/** A finite number above `min` (or at it, when `inclusiveMin`) and at most `max`, else null. */
function boundedNumber(
    value: number | undefined,
    { min, max = Infinity, inclusiveMin = false }: { min: number; max?: number; inclusiveMin?: boolean },
): number | null {
    if (value === undefined || !Number.isFinite(value)) return null;
    if (inclusiveMin ? value < min : value <= min) return null;
    return value > max ? null : value;
}

/**
 * Validate one body. A missing weather defaults to `clear`; any present but
 * invalid field rejects the body.
 */
function toBody(value: object): CelestialBodyRecord | null {
    if (!isStoredBody(value)) return null;
    const name = (value.name ?? '').trim();
    const rotationHours = boundedNumber(value.rotationHours, { min: 0 });
    if (name === '' || rotationHours === null) return null;
    const body: CelestialBodyRecord = { name, rotationHours, weather: 'clear' };
    if (value.orbitalDays !== undefined) {
        const orbitalDays = boundedNumber(value.orbitalDays, { min: 0 });
        if (orbitalDays === null) return null;
        body.orbitalDays = orbitalDays;
    }
    if (value.axialTilt !== undefined) {
        const axialTilt = boundedNumber(value.axialTilt, { min: 0, max: 90, inclusiveMin: true });
        if (axialTilt === null) return null;
        body.axialTilt = axialTilt;
    }
    if (value.weather !== undefined) {
        if (!isWeatherKind(value.weather)) return null;
        body.weather = value.weather;
    }
    return body;
}

/**
 * Validate the raw `celestial-bodies` world setting. Anything that does not
 * parse reads as no bodies (lighting stays manual) rather than throwing.
 * @param raw  The stored setting value.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: a world setting value is untyped until the per-entry validation below
export function parseCelestialBodies(raw: unknown): CelestialBodies {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
    const bodies: CelestialBodies = {};
    // The setting is parsed JSON, so each entry is a JSON value (Object.entries types it `any`).
    const entries = Object.entries(raw) as Array<[string, string | number | boolean | object | null]>;
    for (const [key, value] of entries) {
        const body = BODY_KEY.test(key) && typeof value === 'object' && value !== null ? toBody(value) : null;
        if (body === null) return {};
        bodies[key] = body;
    }
    return bodies;
}

/** A stable slug for a body name (`"Solenne Minoris"` → `solenne-minoris`). */
export function bodyKeyFor(name: string): string {
    const slug = name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return slug === '' ? 'body' : slug;
}

/** One editable row of the Celestial Bodies form (strings, as inputs post them). */
export interface CelestialBodyRow {
    /** The body's existing slug ('' for a new row). Kept across renames so scene bindings survive. */
    key: string;
    name: string;
    rotationHours: string;
    orbitalDays: string;
    axialTilt: string;
    weather: string;
}

/** Optional positive/ranged number from a form string ('' → undefined). */
function optionalNumber(value: string): number | undefined {
    if (value.trim() === '') return undefined;
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
}

/**
 * Turn the form's rows into validated bodies. A row keeps its existing slug (so a
 * renamed body stays bound to its scenes); a new row gets one from its name,
 * de-duplicated. Rows with no name or an invalid rotation are dropped.
 * @param rows  The submitted rows.
 */
export function bodiesFromRows(rows: readonly CelestialBodyRow[]): CelestialBodies {
    const bodies: CelestialBodies = {};
    for (const row of rows) {
        const parsed = toBody({
            name: row.name,
            rotationHours: optionalNumber(row.rotationHours),
            orbitalDays: optionalNumber(row.orbitalDays),
            axialTilt: optionalNumber(row.axialTilt),
            weather: isWeatherKind(row.weather) ? row.weather : 'clear',
        });
        if (parsed === null) continue;
        const base = row.key !== '' ? row.key : bodyKeyFor(parsed.name);
        let key = base;
        for (let n = 2; key in bodies; n++) key = `${base}-${n}`;
        bodies[key] = parsed;
    }
    return bodies;
}

/** The form rows for a set of bodies (the inverse of {@link bodiesFromRows}). */
export function rowsFromBodies(bodies: CelestialBodies): CelestialBodyRow[] {
    return Object.entries(bodies).map(([key, body]) => ({
        key,
        name: body.name,
        rotationHours: String(body.rotationHours),
        orbitalDays: body.orbitalDays === undefined ? '' : String(body.orbitalDays),
        axialTilt: body.axialTilt === undefined ? '' : String(body.axialTilt),
        weather: body.weather,
    }));
}

/* -------------------------------------------- */
/*  Darkness curve                              */
/* -------------------------------------------- */

/** Sun-elevation half-width (in −1…1 sine units) of the dawn/dusk ramp. */
const TWILIGHT_BAND = 0.2;
/** Smallest darkness change worth a scene update (avoids write spam). */
const DARKNESS_EPSILON = 0.01;

function smoothstep(edge0: number, edge1: number, x: number): number {
    const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
}

/**
 * Daylight (0 = night, 1 = full day) at a local hour on a body with the given
 * rotation period. Local midnight is hour 0 and noon half a rotation later; the
 * sun's elevation follows a cosine and dawn/dusk ramp smoothly through
 * {@link TWILIGHT_BAND}.
 */
export function daylight(localHour: number, rotationHours: number): number {
    if (!(rotationHours > 0)) return 1;
    const phase = (((localHour / rotationHours) % 1) + 1) % 1;
    const elevation = -Math.cos(2 * Math.PI * phase);
    return smoothstep(-TWILIGHT_BAND, TWILIGHT_BAND, elevation);
}

/**
 * The scene darkness level (Foundry `environment.darknessLevel`, 0–1) for a local
 * hour, rotation period and weather: night is fully dark, and weather blocks a
 * share of the daylight. Rounded to two decimals.
 */
export function sceneDarkness(localHour: number, rotationHours: number, weather: WeatherKind): number {
    const lit = daylight(localHour, rotationHours) * (1 - WEATHER_DIMMING[weather]);
    return Math.round(Math.min(1, Math.max(0, 1 - lit)) * 100) / 100;
}

/** Is the change from `current` to `next` darkness worth writing? */
export function darknessChanged(current: number, next: number): boolean {
    return Math.abs(current - next) >= DARKNESS_EPSILON;
}

/* -------------------------------------------- */
/*  Scene binding                               */
/* -------------------------------------------- */

/** Scene flag key holding the bound body's slug. */
const CELESTIAL_BODY_FLAG = 'celestialBody';

/** Name the Scene Config select posts under, so the flag round-trips on submit. */
export const CELESTIAL_BODY_INPUT_NAME = `flags.${SYSTEM_ID}.${CELESTIAL_BODY_FLAG}`;

/** Minimal scene read-surface for the binding. */
export interface BodyBoundScene {
    // eslint-disable-next-line no-restricted-syntax -- boundary: mirrors Foundry Document#getFlag, typed as returning unknown; narrowed by sceneBodyKey
    getFlag: (scope: typeof SYSTEM_ID, key: string) => unknown;
}

/** The body slug a scene is bound to, or null when its lighting is manual. */
export function sceneBodyKey(scene: BodyBoundScene | null | undefined): string | null {
    if (scene == null) return null;
    const key = scene.getFlag(SYSTEM_ID, CELESTIAL_BODY_FLAG);
    return typeof key === 'string' && key !== '' ? key : null;
}

/**
 * Build the Scene Config form-group for the body binding: a select of every
 * configured body plus a leading "not driven" option. Returned as a detached
 * element (never an HTML string — labels come from the langpack and body names
 * from the GM, and neither may reach a markup-parsing sink).
 */
export function buildCelestialBodyField(
    doc: Document,
    labels: { label: string; hint: string; none: string },
    bodies: CelestialBodies,
    selected: string | null,
): HTMLElement {
    const group = doc.createElement('div');
    group.className = 'form-group';

    const label = doc.createElement('label');
    label.textContent = labels.label;

    const fields = doc.createElement('div');
    fields.className = 'form-fields';
    const select = doc.createElement('select');
    select.name = CELESTIAL_BODY_INPUT_NAME;
    const options: Array<[string, string]> = [['', labels.none], ...Object.entries(bodies).map(([key, body]): [string, string] => [key, body.name])];
    for (const [value, text] of options) {
        const option = doc.createElement('option');
        option.value = value;
        option.textContent = text;
        select.appendChild(option);
    }
    // A binding to a body that no longer exists falls back to "not driven".
    select.value = selected !== null && selected in bodies ? selected : '';
    fields.appendChild(select);

    const hint = doc.createElement('p');
    hint.className = 'hint';
    hint.textContent = labels.hint;

    group.append(label, fields, hint);
    return group;
}

/* -------------------------------------------- */
/*  Driver                                      */
/* -------------------------------------------- */

/** The scene surface the driver reads and writes. */
export interface LitScene extends BodyBoundScene {
    environment: { darknessLevel: number; globalLight: { enabled: boolean } };
    // eslint-disable-next-line no-restricted-syntax -- boundary: mirrors Foundry Document#update, whose resolved value is the untyped document
    update: (data: Record<string, number | boolean>, options?: { animateDarkness?: number }) => Promise<unknown>;
}

/** How long a darkness change animates on the viewed scene, in ms. */
const DARKNESS_ANIMATION_MS = 2000;

/** Darkness at or above which global illumination switches off (night): past it,
 *  tokens need darkvision or a light source to see, which is the point of night. */
const GLOBAL_LIGHT_MAX_DARKNESS = 0.6;

/**
 * The lighting update a bound scene needs right now, or null when it is unbound,
 * its body is unknown, or nothing changed materially. Global illumination is on
 * while it is light enough ({@link GLOBAL_LIGHT_MAX_DARKNESS}) and off at night.
 * @param scene           The scene.
 * @param bodies          The configured bodies.
 * @param localHourOf     The body's local hour for a given body (from the world clock).
 */
export function sceneLightingUpdate(
    scene: LitScene,
    bodies: CelestialBodies,
    localHourOf: (body: CelestialBodyRecord) => number,
): Record<string, number | boolean> | null {
    const key = sceneBodyKey(scene);
    const body = key === null ? undefined : bodies[key];
    if (body === undefined) return null;
    const darkness = sceneDarkness(localHourOf(body), body.rotationHours, body.weather);
    const update: Record<string, number | boolean> = {};
    if (darknessChanged(scene.environment.darknessLevel, darkness)) update['environment.darknessLevel'] = darkness;
    const globalLight = darkness < GLOBAL_LIGHT_MAX_DARKNESS;
    if (scene.environment.globalLight.enabled !== globalLight) update['environment.globalLight.enabled'] = globalLight;
    return Object.keys(update).length > 0 ? update : null;
}

/**
 * Apply {@link sceneLightingUpdate} to every scene, animating the change on the
 * scene being viewed. Run by one GM client only.
 */
export async function syncSceneLighting(
    scenes: Iterable<LitScene>,
    bodies: CelestialBodies,
    localHourOf: (body: CelestialBodyRecord) => number,
    viewed: LitScene | null,
): Promise<void> {
    const writes: Array<Promise<void>> = [];
    for (const scene of scenes) {
        const update = sceneLightingUpdate(scene, bodies, localHourOf);
        if (update === null) continue;
        writes.push(scene.update(update, scene === viewed ? { animateDarkness: DARKNESS_ANIMATION_MS } : {}).then(() => undefined));
    }
    await Promise.all(writes);
}
