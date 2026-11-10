/**
 * Default cue and condition sounds (#609).
 *
 * The system ships a CC0 sound set (`src/packs/sounds`, served at
 * `systems/wh40k-rpg/packs/sounds/…`, credited in its ATTRIBUTION.md). Sounds
 * are chosen per cue preset, never per weapon, so the table lives here with
 * the presets rather than copied onto every compendium document: a weapon,
 * power or condition whose own list has nothing for an event plays its
 * preset's default. A document's authored sounds still win for any event it
 * covers.
 *
 * Operator decision 2026-11-10: the system fills a blank list from the preset,
 * so neither the content packs nor the PDF converter carry sound lists.
 */

import type { CueAttackKind, CueEvent, CuePreset } from './attack-cue.ts';
import type { StatusSoundEvent, StatusVisualFilter, StatusVisualPreset } from './status-visual.ts';

const ROOT = 'systems/wh40k-rpg/packs/sounds/';

const files = (pack: string, ...names: string[]): readonly string[] => names.map((name) => `${ROOT}${pack}/${name}`);
const numbered = (pack: string, stem: string, count: number): readonly string[] =>
    files(pack, ...Array.from({ length: count }, (_, i) => `${stem}_${String(i).padStart(3, '0')}.ogg`));

const SCI = 'kenney-sci-fi';
const IMP = 'kenney-impact';
const RPG = 'kenney-rpg';

const GUNSHOT = files('rubberduck-100', 'shot_01.ogg', 'shot_02.ogg');
const LAS = numbered(SCI, 'laserSmall', 5);
const PLASMA = numbered(SCI, 'laserLarge', 5);
const ZAP = numbered(SCI, 'laserRetro', 5);
const CRUNCH = numbered(SCI, 'explosionCrunch', 5);
const FIELD = numbered(SCI, 'forceField', 5);
const ENERGY_HIT = numbered(SCI, 'impactMetal', 5);
const FLAME = numbered(SCI, 'thrusterFire', 5);
const BOOM = files(SCI, 'lowFrequency_explosion_000.ogg', 'lowFrequency_explosion_001.ogg');
const SLIME = numbered(SCI, 'slime', 2);
const DRONE = files(SCI, 'spaceEngineLow_000.ogg', 'computerNoise_001.ogg');
const BODY_HIT = numbered(IMP, 'impactPunch_medium', 5);
const HEAVY_PUNCH = numbered(IMP, 'impactPunch_heavy', 5);
const RICOCHET = numbered(IMP, 'impactTin_medium', 5);
const BELL = numbered(IMP, 'impactBell_heavy', 3);
const CLANG = numbered(IMP, 'impactMetal_heavy', 5);
const PARRY = numbered(IMP, 'impactMetal_medium', 5);
const THUD = numbered(IMP, 'impactSoft_heavy', 3);
const SHATTER = numbered(IMP, 'impactGlass_medium', 5);
const PLATE = numbered(IMP, 'impactPlate_heavy', 2);
const SLICE = files(RPG, 'knifeSlice.ogg', 'knifeSlice2.ogg', 'chop.ogg');
const WHOOSH = files(RPG, 'cloth1.ogg', 'cloth2.ogg', 'cloth3.ogg');
const DODGE = files(RPG, 'cloth4.ogg', 'cloth2.ogg');
const JAM = files(RPG, 'metalClick.ogg', 'metalLatch.ogg');
const DROP = files(RPG, 'dropLeather.ogg');
const VENT = files('rubberduck-100-2', 'sfx100v2_air_01.ogg', 'sfx100v2_air_02.ogg');
const SAW = files('rubberduck-loops', 'saw.ogg');

type SoundSet<E extends string> = Partial<Record<E, readonly string[]>>;

const first = (list: readonly string[], end: number): readonly string[] => list.slice(0, end);
const from = (list: readonly string[], start: number): readonly string[] => list.slice(start);
const pick = (list: readonly string[], ...indexes: number[]): readonly string[] => indexes.flatMap((i) => list.slice(i, i + 1));

const DEFENCE: SoundSet<CueEvent> = { parry: PARRY, dodge: DODGE };
const RANGED_COMMON: SoundSet<CueEvent> = {
    miss: RICOCHET,
    critical: BELL,
    jam: JAM,
    overheat: VENT,
    explode: first(BOOM, 1),
    blast: [...pick(BOOM, 1), ...pick(CRUNCH, 4)],
};
const MELEE_COMMON: SoundSet<CueEvent> = { 'melee-miss': WHOOSH, 'critical': BELL, 'explode': first(BOOM, 1), ...DEFENCE };

const ranged = (fire: readonly string[], hit: readonly string[]): SoundSet<CueEvent> => ({
    fire,
    hit,
    scatter: fire,
    spray: fire,
    ...RANGED_COMMON,
    ...DEFENCE,
});
const melee = (hit: readonly string[]): SoundSet<CueEvent> => ({ 'melee-hit': hit, ...MELEE_COMMON });

/** A ranged weapon's set per preset; a preset with no shot sound fires as `tracer`. */
const RANGED_SETS: Partial<Record<CuePreset, SoundSet<CueEvent>>> = {
    tracer: ranged(GUNSHOT, BODY_HIT),
    solid: ranged(GUNSHOT, BODY_HIT),
    las: ranged(LAS, ENERGY_HIT),
    bolt: ranged(first(CRUNCH, 3), from(CRUNCH, 3)),
    plasma: ranged(PLASMA, ENERGY_HIT),
    melta: ranged(first(FLAME, 2), ENERGY_HIT),
    flame: ranged(from(FLAME, 2), ENERGY_HIT),
    launcher: ranged(THUD, from(CRUNCH, 3)),
    arc: ranged(ZAP, ENERGY_HIT),
    warp: ranged(from(FIELD, 3), SHATTER),
};

/** A melee weapon's hit sound per preset; an unlisted preset cuts as a blade. */
const MELEE_HIT: ReadonlyMap<CuePreset, readonly string[]> = new Map<CuePreset, readonly string[]>([
    ['blade', SLICE],
    ['chain', [...SAW, ...first(CLANG, 2)]],
    ['power', CLANG],
    ['blunt', HEAVY_PUNCH],
    ['arc', ZAP],
    ['warp', [...from(FIELD, 3), ...first(SHATTER, 2)]],
    ['flame', from(FLAME, 2)],
    ['melta', first(FLAME, 2)],
    ['plasma', PLASMA],
]);

const PSYCHIC_COMMON: SoundSet<CueEvent> = { manifest: first(FIELD, 3), phenomena: DRONE, perils: BOOM, critical: BELL };
/** A psychic power's set per preset; an unlisted preset manifests as `warp`. */
const PSYCHIC_SETS: Partial<Record<CuePreset, SoundSet<CueEvent>>> = {
    warp: { fire: from(FIELD, 3), hit: SHATTER, ...PSYCHIC_COMMON },
    flame: { fire: from(FLAME, 2), hit: ENERGY_HIT, ...PSYCHIC_COMMON },
    arc: { fire: ZAP, hit: ENERGY_HIT, ...PSYCHIC_COMMON },
};

const REMOVE = first(WHOOSH, 1);
const STATUS_SETS: Record<StatusVisualPreset, SoundSet<StatusSoundEvent>> = {
    burning: { apply: pick(FLAME, 2), remove: first(SLIME, 1) },
    bleeding: { apply: SLIME, remove: REMOVE },
    stunned: { apply: BELL, remove: REMOVE },
    pinned: { apply: PLATE, remove: REMOVE },
    prone: { apply: DROP, remove: REMOVE },
    frightened: { apply: first(DRONE, 1), remove: REMOVE },
    poisoned: { apply: SLIME, remove: REMOVE },
    warp: { apply: first(FIELD, 1), remove: REMOVE },
};
/** A condition drawn only as a filter on the token's art. */
const FILTER_SETS: Record<StatusVisualFilter, SoundSet<StatusSoundEvent>> = {
    desaturate: { apply: first(THUD, 1), remove: REMOVE },
    dim: { apply: first(PLATE, 1), remove: REMOVE },
    blur: { apply: first(DRONE, 1), remove: REMOVE },
};

/** The default sound files for one attack cue event, for the resolved preset and attack kind. */
export function defaultCueSounds(preset: CuePreset, kind: CueAttackKind, event: CueEvent): readonly string[] {
    if (kind === 'psychic') return (PSYCHIC_SETS[preset] ?? PSYCHIC_SETS.warp)?.[event] ?? [];
    if (kind === 'melee') return melee(MELEE_HIT.get(preset) ?? SLICE)[event] ?? [];
    const set = RANGED_SETS[preset]?.fire !== undefined ? RANGED_SETS[preset] : RANGED_SETS.tracer;
    return set?.[event] ?? [];
}

/** The default apply / remove sound files for a condition's look: its preset, else its filter. */
export function defaultStatusSounds(preset: StatusVisualPreset | '', filter: StatusVisualFilter | '', event: StatusSoundEvent): readonly string[] {
    const set = preset !== '' ? STATUS_SETS[preset] : filter !== '' ? FILTER_SETS[filter] : undefined;
    return set?.[event] ?? [];
}

/** Every file the defaults name, for the attribution guard. */
export function allDefaultSoundFiles(): ReadonlySet<string> {
    const out = new Set<string>();
    const add = (set: SoundSet<string> | undefined): void => {
        for (const list of Object.values(set ?? {})) for (const src of list ?? []) out.add(src);
    };
    for (const set of Object.values(RANGED_SETS)) add(set);
    for (const hit of MELEE_HIT.values()) add(melee(hit));
    for (const set of Object.values(PSYCHIC_SETS)) add(set);
    for (const set of Object.values(STATUS_SETS)) add(set);
    for (const set of Object.values(FILTER_SETS)) add(set);
    return out;
}

/** One default file for an event, picked at random; '' when the defaults have none. */
export function pickDefaultSound(list: readonly string[], rng: () => number): string {
    if (list.length === 0) return '';
    return list[Math.min(list.length - 1, Math.max(0, Math.floor(rng() * list.length)))] ?? '';
}
