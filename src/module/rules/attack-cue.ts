/**
 * @file Attack cues (#594): the animation and sound an attack plays on the canvas,
 * chosen from the attack's resolved outcome.
 *
 * The look and the sound of an attack are content: each weapon (or psychic power)
 * authors a `system.cue` profile in its compendium `_source` — a procedural preset,
 * an optional tint, and optional animation / sound files per cue event (Direction #7).
 * This module holds only what is not content: the cue vocabulary, the mapping from a
 * resolved outcome to an ordered list of cue steps, and the miss geometry. Nothing
 * here names a weapon.
 *
 * One vocabulary serves all six lines. The only per-line input is the outcome itself
 * (a critical is whatever the line's damage roll counts as Righteous Fury), so no line
 * diverges here.
 *
 * Everything in this module is pure; `canvas/attack-cue-canvas.ts` plays the steps.
 */

import { type CueAssetOf, type CueAssetSource, cueAssetSources, pickCueAsset, readCueAssets, readHexTint } from './cue-common.ts';

/** Every outcome a cue can be played for. One vocabulary for all six lines. */
export const CUE_EVENTS = [
    'fire',
    'hit',
    'miss',
    'critical',
    'jam',
    'overheat',
    'explode',
    'scatter',
    'blast',
    'spray',
    'melee-hit',
    'melee-miss',
    'parry',
    'dodge',
    'manifest',
    'phenomena',
    'perils',
] as const;
export type CueEvent = (typeof CUE_EVENTS)[number];

/**
 * The procedural looks the canvas renderer can draw without any art file. A weapon
 * picks one in its `cue.preset`; an empty preset falls back to the attack kind's.
 */
export const CUE_PRESETS = [
    'tracer',
    'las',
    'solid',
    'bolt',
    'plasma',
    'melta',
    'flame',
    'launcher',
    'arc',
    'blade',
    'chain',
    'power',
    'blunt',
    'warp',
] as const;
export type CuePreset = (typeof CUE_PRESETS)[number];

/** What kind of attack resolved: drawn as a shot, a swing, or a manifestation. */
export type CueAttackKind = 'ranged' | 'melee' | 'psychic';

/** An authored animation or sound file for one cue event. */
type CueAsset = CueAssetOf<CueEvent>;

/** A weapon's or power's cue profile, as authored on its compendium document. */
export interface CueProfile {
    /** Procedural preset; '' takes the attack kind's default. */
    preset: CuePreset | '';
    /** Colour override as `#rrggbb`; '' keeps the preset's own colour. */
    tint: string;
    /** Animation files (Sequencer) per event; empty plays the procedural preset. */
    animations: readonly CueAsset[];
    /** Sound files per event; an event without one plays no sound. */
    sounds: readonly CueAsset[];
}

/** A point on the canvas the cue plays at or travels to. */
export type CueAnchor =
    /** A token's centre. */
    | { kind: 'token'; tokenId: string }
    /** A point past a token and off to one side: where a missed shot goes. */
    | { kind: 'past'; tokenId: string; fromTokenId: string; side: 1 | -1 }
    /** A measured template's origin (an area attack's impact point or cone apex). */
    | { kind: 'template'; templateId: string };

/** One cue to play: a visual from an anchor (to another, for a travelling one), and its sound. */
export interface CueStep {
    event: CueEvent;
    from: CueAnchor;
    /** Where a travelling visual (a shot, a swing, a cone) goes; null for one that stays put. */
    to: CueAnchor | null;
    /** Delay from the start of the plan, in milliseconds. */
    delayMs: number;
    preset: CuePreset;
    /** `#rrggbb`, or '' for the preset's own colour. */
    tint: string;
    /** Animation file for a Sequencer, or '' to draw the procedural preset. */
    animation: string;
    /** Sound file, or '' for silence. */
    sound: string;
}

/** The ordered cues one resolved roll plays, on the scene it was rolled on. */
export interface CuePlan {
    sceneId: string;
    steps: CueStep[];
}

/** The area an attack's quality placed (#599): a cone from the firer, or a circle at the impact. */
export interface CueArea {
    templateId: string;
    shape: 'cone' | 'circle';
    /** The impact missed and the template scattered off the target. */
    scattered: boolean;
}

/** The resolved outcome of one attack, as the cue mapping reads it. */
export interface AttackCueOutcome {
    kind: CueAttackKind;
    sourceTokenId: string;
    /** The declared target's token, or null for an attack at no token. */
    targetTokenId: string | null;
    success: boolean;
    /** Hits landed: one per tracer or impact. At least one on a success. */
    hits: number;
    area: CueArea | null;
    jammed: boolean;
    overheated: boolean;
    /** The weapon was destroyed by the attack (an unmodified 00 on a weapon that breaks). */
    exploded: boolean;
    /** Psychic Phenomena manifested (and were not negated). */
    phenomena: boolean;
    /** The Phenomena escalated to Perils of the Warp. */
    perils: boolean;
}

/** A defender's reaction test (Dodge / Parry), cued only when it succeeds. */
export interface ReactionCueOutcome {
    reaction: 'parry' | 'dodge';
    defenderTokenId: string;
    success: boolean;
}

/** One hit after its damage was rolled: the token it landed on, and whether it was a critical. */
export interface HitCue {
    tokenId: string;
    critical: boolean;
}

/** Gap between successive shots of a semi-auto burst or swings of a multi-attack (ms). */
const SHOT_STAGGER_MS = 150;
/** Gap between full-auto shots, in rapid succession (ms). */
const RAPID_STAGGER_MS = 80;
/** At or above this many shots the gap tightens into rapid succession. */
const RAPID_FIRE_THRESHOLD = 5;
/** How long a shot takes to cross to its target, before its impact plays (ms). */
const TRAVEL_MS = 250;
/** Hard cap on shots per plan so a malformed hit count cannot flood the canvas. */
const MAX_SHOTS = 24;
/** Psychic manifestation lead-in before the power reaches its target (ms). */
const MANIFEST_LEAD_MS = 300;

/** The preset an attack plays when its item authors none. */
export function defaultCuePreset(kind: CueAttackKind): CuePreset {
    if (kind === 'melee') return 'blade';
    if (kind === 'psychic') return 'warp';
    return 'tracer';
}

/** Is this one of the cue events? */
function isCueEvent(value: string): value is CueEvent {
    return (CUE_EVENTS as readonly string[]).includes(value);
}

/** Is this one of the procedural presets? */
function isCuePreset(value: string): value is CuePreset {
    return (CUE_PRESETS as readonly string[]).includes(value);
}

/** The authored-profile shape as the item's DataModel holds it (before narrowing). */
export interface CueProfileSource {
    preset?: string | undefined;
    tint?: string | undefined;
    animations?: readonly CueAssetSource[] | undefined;
    sounds?: readonly CueAssetSource[] | undefined;
}

/**
 * Narrow an item's authored `cue` block to a profile. Unknown presets, malformed
 * tints and assets with an unknown event or no file are dropped, never guessed.
 */
export function readCueProfile(source: CueProfileSource | null | undefined): CueProfile {
    const preset = source?.preset ?? '';
    return {
        preset: isCuePreset(preset) ? preset : '',
        tint: readHexTint(source?.tint),
        animations: readCueAssets(source?.animations, isCueEvent),
        sounds: readCueAssets(source?.sounds, isCueEvent),
    };
}

/**
 * Read the `cue` block off an item's `system` payload, which Foundry hands over
 * untyped on an owned item. Anything that is not the authored shape reads as empty.
 */
export function cueProfileOf(system: object | null | undefined): CueProfile {
    if (system === null || system === undefined || !('cue' in system)) return readCueProfile(null);
    const raw = system.cue;
    if (typeof raw !== 'object' || raw === null) return readCueProfile(null);
    return readCueProfile({
        ...('preset' in raw && typeof raw.preset === 'string' ? { preset: raw.preset } : {}),
        ...('tint' in raw && typeof raw.tint === 'string' ? { tint: raw.tint } : {}),
        animations: 'animations' in raw ? cueAssetSources(raw.animations) : [],
        sounds: 'sounds' in raw ? cueAssetSources(raw.sounds) : [],
    });
}

/** Builds steps for one plan, filling the preset, tint and authored files from the profile. */
class StepBuilder {
    readonly steps: CueStep[] = [];

    constructor(private readonly profile: CueProfile, private readonly preset: CuePreset, private readonly rng: () => number) {}

    add(event: CueEvent, from: CueAnchor, to: CueAnchor | null, delayMs: number): void {
        this.steps.push({
            event,
            from,
            to,
            delayMs,
            preset: this.preset,
            tint: this.profile.tint,
            animation: pickCueAsset(this.profile.animations, event, this.rng),
            sound: pickCueAsset(this.profile.sounds, event, this.rng),
        });
    }
}

function builderFor(profile: CueProfile, kind: CueAttackKind, rng: () => number): StepBuilder {
    return new StepBuilder(profile, profile.preset === '' ? defaultCuePreset(kind) : profile.preset, rng);
}

/** Shots to draw for a hit count: at least one, at most {@link MAX_SHOTS}. */
function shotCount(hits: number): number {
    const whole = Number.isFinite(hits) ? Math.trunc(hits) : 1;
    return Math.max(1, Math.min(MAX_SHOTS, whole));
}

/** Gap between shots: rapid succession for a long burst. */
function staggerFor(shots: number): number {
    return shots >= RAPID_FIRE_THRESHOLD ? RAPID_STAGGER_MS : SHOT_STAGGER_MS;
}

/** The side a missed shot passes the target on. */
function missSide(rng: () => number): 1 | -1 {
    return rng() < 0.5 ? -1 : 1;
}

function planRanged(outcome: AttackCueOutcome, build: StepBuilder, rng: () => number): number {
    const source: CueAnchor = { kind: 'token', tokenId: outcome.sourceTokenId };
    if (outcome.area !== null) {
        const impact: CueAnchor = { kind: 'template', templateId: outcome.area.templateId };
        if (outcome.area.shape === 'cone') {
            build.add('spray', source, impact, 0);
            return TRAVEL_MS;
        }
        build.add(outcome.area.scattered ? 'scatter' : 'fire', source, impact, 0);
        build.add('blast', impact, null, TRAVEL_MS);
        return TRAVEL_MS;
    }
    if (outcome.targetTokenId === null) {
        build.add('fire', source, null, 0);
        return 0;
    }
    if (!outcome.success) {
        const past: CueAnchor = { kind: 'past', tokenId: outcome.targetTokenId, fromTokenId: outcome.sourceTokenId, side: missSide(rng) };
        build.add('fire', source, past, 0);
        build.add('miss', past, null, TRAVEL_MS);
        return TRAVEL_MS;
    }
    const target: CueAnchor = { kind: 'token', tokenId: outcome.targetTokenId };
    const shots = shotCount(outcome.hits);
    const stagger = staggerFor(shots);
    for (let shot = 0; shot < shots; shot++) {
        build.add('fire', source, target, shot * stagger);
        build.add('hit', target, null, shot * stagger + TRAVEL_MS);
    }
    return (shots - 1) * stagger + TRAVEL_MS;
}

function planMelee(outcome: AttackCueOutcome, build: StepBuilder): number {
    const source: CueAnchor = { kind: 'token', tokenId: outcome.sourceTokenId };
    const target: CueAnchor | null = outcome.targetTokenId === null ? null : { kind: 'token', tokenId: outcome.targetTokenId };
    if (!outcome.success) {
        build.add('melee-miss', source, target, 0);
        return 0;
    }
    const swings = shotCount(outcome.hits);
    for (let swing = 0; swing < swings; swing++) {
        build.add('melee-hit', source, target, swing * SHOT_STAGGER_MS);
    }
    return (swings - 1) * SHOT_STAGGER_MS;
}

function planPsychic(outcome: AttackCueOutcome, build: StepBuilder): number {
    const source: CueAnchor = { kind: 'token', tokenId: outcome.sourceTokenId };
    build.add('manifest', source, null, 0);
    if (!outcome.success || outcome.targetTokenId === null) return 0;
    const target: CueAnchor = { kind: 'token', tokenId: outcome.targetTokenId };
    const bolts = shotCount(outcome.hits);
    for (let bolt = 0; bolt < bolts; bolt++) {
        const at = MANIFEST_LEAD_MS + bolt * SHOT_STAGGER_MS;
        build.add('fire', source, target, at);
        build.add('hit', target, null, at + TRAVEL_MS);
    }
    return MANIFEST_LEAD_MS + (bolts - 1) * SHOT_STAGGER_MS + TRAVEL_MS;
}

/**
 * Map one resolved attack to its cues.
 *
 * - A jam plays only the jam (no round leaves the barrel); a weapon that breaks plays
 *   only its explosion.
 * - A ranged hit draws one shot and one impact per hit landed; a miss draws one shot
 *   aimed past the target. An area attack draws its cone, or its shot to the impact
 *   point (scattered on a miss) and the blast there.
 * - A melee attack draws one swing per hit landed, or a whiff.
 * - A power manifests on the psyker and, when it succeeds against a target, reaches it.
 * - Overheating, Phenomena and Perils play on the attacker once the attack has played.
 */
export function planAttackCues(outcome: AttackCueOutcome, profile: CueProfile, rng: () => number = Math.random): CueStep[] {
    const build = builderFor(profile, outcome.kind, rng);
    const source: CueAnchor = { kind: 'token', tokenId: outcome.sourceTokenId };
    if (outcome.exploded) {
        build.add('explode', source, null, 0);
        return build.steps;
    }
    if (outcome.jammed) {
        build.add('jam', source, null, 0);
        return build.steps;
    }
    let end = 0;
    if (outcome.kind === 'ranged') end = planRanged(outcome, build, rng);
    else if (outcome.kind === 'melee') end = planMelee(outcome, build);
    else end = planPsychic(outcome, build);
    if (outcome.overheated) build.add('overheat', source, null, end);
    if (outcome.perils) build.add('perils', source, null, end);
    else if (outcome.phenomena) build.add('phenomena', source, null, end);
    return build.steps;
}

/** A successful Dodge or Parry plays on the defender; a failed one plays nothing (the hit already did). */
export function planReactionCues(outcome: ReactionCueOutcome, profile: CueProfile, rng: () => number = Math.random): CueStep[] {
    if (!outcome.success) return [];
    const build = builderFor(profile, 'melee', rng);
    build.add(outcome.reaction, { kind: 'token', tokenId: outcome.defenderTokenId }, null, 0);
    return build.steps;
}

/**
 * Cues once an attack's damage is rolled: a critical (the line's Righteous Fury) on
 * each hit that rolled one. An area attack's hits are also each drawn on the creature
 * they landed on, and each creature that avoided the area dodges, since the attack cue
 * only knew the template.
 */
export function planHitCues(
    hits: readonly HitCue[],
    avoided: readonly string[],
    kind: CueAttackKind,
    profile: CueProfile,
    area: boolean,
    rng: () => number = Math.random,
): CueStep[] {
    const build = builderFor(profile, kind, rng);
    hits.slice(0, MAX_SHOTS).forEach((hit, index) => {
        const at: CueAnchor = { kind: 'token', tokenId: hit.tokenId };
        const delay = index * SHOT_STAGGER_MS;
        if (hit.critical) build.add('critical', at, null, delay);
        else if (area) build.add('hit', at, null, delay);
    });
    if (area) {
        for (const tokenId of avoided.slice(0, MAX_SHOTS)) build.add('dodge', { kind: 'token', tokenId }, null, 0);
    }
    return build.steps;
}

/** A canvas point in pixels. */
export interface CuePoint {
    x: number;
    y: number;
}

/** How far past the target a missed shot travels, in grid squares. */
const MISS_OVERSHOOT_SQUARES = 1.5;
/** How far to the side of the target a missed shot passes, in grid squares. */
const MISS_OFFSET_SQUARES = 0.6;

/**
 * Where a missed shot ends: past the target along the line of fire and off to one
 * side, so it reads as aimed at the target and passing it. Firer and target on the
 * same point have no line of fire; the shot then passes to the target's right.
 */
export function missPoint(from: CuePoint, target: CuePoint, gridSize: number, side: 1 | -1): CuePoint {
    const dx = target.x - from.x;
    const dy = target.y - from.y;
    const length = Math.hypot(dx, dy);
    const ux = length === 0 ? 1 : dx / length;
    const uy = length === 0 ? 0 : dy / length;
    const overshoot = gridSize * MISS_OVERSHOOT_SQUARES;
    const offset = gridSize * MISS_OFFSET_SQUARES * side;
    return {
        x: target.x + ux * overshoot - uy * offset,
        y: target.y + uy * overshoot + ux * offset,
    };
}
