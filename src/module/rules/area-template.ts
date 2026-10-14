/**
 * @file Area-attack templates for weapon qualities (#599, #600).
 *
 * A quality whose compendium document declares an area template (`system.mechanics.template`)
 * turns an attack into an area attack: a cone from the firer (Spray) or a circle at the
 * impact point (Blast (X)). Shape, angle, size, anchor, what happens to the creatures
 * inside, and the avoidance test's modifiers are all content data on the quality
 * (Direction #7), so nothing here names a quality.
 *
 * Everything in this module is pure. Geometry works in scene units (metres) with the
 * Foundry screen convention for bearings: 0° points along +x and angles grow clockwise
 * (y grows downward), which is what `MeasuredTemplate#direction` uses.
 */

import { aggregateRollTarget } from '../rolls/aggregate-target.ts';
import type { I18nKey } from '../types/i18n-keys';
import { parseQualityLevel } from '../utils/quality-id.ts';
import { isD100Success } from './_dice.ts';
import type { ScatterDirection, ScatterVector } from './scatter.ts';
import { resolveTemplateRadius } from './weapon-quality-effects.ts';
import { getWeaponQualityMechanicsForId } from './weapon-quality-payloads.ts';

/** Placeable template shapes. Foundry draws `cone` and `circle` natively. */
export type AreaShape = 'cone' | 'circle';

/** Authored shape vocabulary → the placeable shape it is drawn as. Smoke's `concealment-cloud` is not a targeting area. */
const AREA_SHAPE_BY_AUTHORED: ReadonlyMap<string, AreaShape> = new Map<string, AreaShape>([
    ['cone', 'cone'],
    ['sphere', 'circle'],
    ['circle', 'circle'],
]);

/** Where the template sits: on the firer (Spray) or on the point of impact (Blast). */
type AreaAnchor = 'firer' | 'impact';

/** What the area does to each creature inside: they test to avoid a hit, or they are hit. */
type AreaResolution = 'avoid' | 'hit';

/** The avoidance test a creature caught in an `avoid` area makes, as authored on the quality. */
export interface AreaAvoidanceRule {
    /** Difficulty modifier of the test (Challenging = 0). */
    modifier: number;
    /** Bonus the creature gains when the wielder lacks the weapon's training. */
    untrainedBonus: number;
    /** Bonus the creature gains when the weapon is Heavy and fired unbraced. */
    unbracedHeavyBonus: number;
}

/** A resolved area template for one attack. */
export interface AreaTemplateSpec {
    /** The base id of the quality that declared the area (`spray`, `blast`). */
    qualityId: string;
    /** The quality's level as carried by the weapon (`3` for Blast (3)), or null. */
    level: number | null;
    shape: AreaShape;
    /** Cone opening in degrees; 0 for a circle. */
    angle: number;
    /** Cone length or circle radius, in metres. */
    distance: number;
    anchor: AreaAnchor;
    resolution: AreaResolution;
    /** The avoidance rule for an `avoid` area; null for a `hit` area. */
    avoid: AreaAvoidanceRule | null;
    /** Hit location every hit from the area strikes (`body`), or '' to roll it. */
    hitLocation: string;
}

/** The slice of a roll's attack special the resolver reads. */
export interface AreaAttackSpecial {
    name: string;
    level?: number | boolean | string;
}

/** Turn an attack-special display name into its quality id (`Twin-Linked` → `twin-linked`). */
export function qualityIdForAttackSpecial(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/** A numeric quality level, or null when the special carries none (or a dice rating). */
function numericLevel(level: AreaAttackSpecial['level']): number | null {
    if (typeof level === 'number') return Number.isFinite(level) ? level : null;
    if (typeof level !== 'string' || level.trim() === '') return null;
    // A dice rating (`10+1d10`) parses to NaN and has no fixed size.
    const parsed = Number(level);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

/**
 * Resolve the area template an attack's qualities declare. The first quality whose
 * mechanics carry a placeable shape and a resolution wins. Returns null when no quality
 * declares one, or when the size cannot be resolved (a dice-rated Blast, a zero range).
 *
 * @param specials     The roll's attack specials (embedded + bridged weapon qualities).
 * @param weaponRange  The weapon's maximum range in metres, for `distanceSource: 'range'`.
 * @param systemId     The rolling actor's game line.
 */
export function resolveAreaTemplate(specials: readonly AreaAttackSpecial[], weaponRange: number, systemId?: string): AreaTemplateSpec | null {
    for (const special of specials) {
        const qualityId = qualityIdForAttackSpecial(special.name);
        const mechanics = getWeaponQualityMechanicsForId(qualityId, systemId);
        if (mechanics === null) continue;
        const tpl = mechanics.template;
        const shape = AREA_SHAPE_BY_AUTHORED.get(tpl.shape);
        if (shape === undefined || tpl.resolution === '') continue;
        const level = numericLevel(special.level);
        const rawDistance = tpl.distanceSource === 'level' ? level : tpl.distanceSource === 'range' ? weaponRange : null;
        if (rawDistance === null) continue;
        const distance = resolveTemplateRadius(rawDistance);
        if (distance <= 0) continue;
        return {
            qualityId: parseQualityLevel(qualityId).baseId,
            level,
            shape,
            angle: shape === 'cone' ? tpl.angle ?? 0 : 0,
            distance,
            anchor: tpl.anchor === 'impact' ? 'impact' : 'firer',
            resolution: tpl.resolution,
            avoid:
                tpl.resolution === 'avoid'
                    ? { modifier: tpl.avoidModifier ?? 0, untrainedBonus: tpl.avoidUntrainedBonus ?? 0, unbracedHeavyBonus: tpl.avoidUnbracedHeavyBonus ?? 0 }
                    : null,
            hitLocation: tpl.hitLocation,
        };
    }
    return null;
}

/** Whether any of the attack's qualities removes the attack roll (Spray: no BS test). */
export function attackHasNoAttackRoll(specials: readonly AreaAttackSpecial[], systemId?: string): boolean {
    return specials.some((special) => getWeaponQualityMechanicsForId(qualityIdForAttackSpecial(special.name), systemId)?.noAttackRoll === true);
}

/* -------------------------------------------- */
/*  Geometry                                    */
/* -------------------------------------------- */

/** A point in scene units (metres). */
export interface AreaPoint {
    x: number;
    y: number;
}

/** A template as placed on the scene, in scene units. */
export interface PlacedArea {
    shape: AreaShape;
    origin: AreaPoint;
    distance: number;
    /** Bearing of the cone's axis in degrees (Foundry convention). Ignored for a circle. */
    direction: number;
    /** Cone opening in degrees. Ignored for a circle. */
    angle: number;
}

/** Float slack so a token centred exactly on the edge counts as inside. */
const EDGE_EPSILON = 1e-6;

/** Normalise an angle to [0, 360). */
function normaliseDegrees(deg: number): number {
    return ((deg % 360) + 360) % 360;
}

/** Bearing from one point to another, degrees in [0, 360), Foundry convention. */
export function bearingDegrees(from: AreaPoint, to: AreaPoint): number {
    return normaliseDegrees((Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI);
}

/** Smallest unsigned difference between two bearings, in [0, 180]. */
function bearingDelta(a: number, b: number): number {
    const d = Math.abs(normaliseDegrees(a) - normaliseDegrees(b));
    return d > 180 ? 360 - d : d;
}

/** Whether a point lies inside a placed area (edges included). */
export function isPointInArea(area: PlacedArea, point: AreaPoint): boolean {
    const dx = point.x - area.origin.x;
    const dy = point.y - area.origin.y;
    const dist = Math.hypot(dx, dy);
    if (dist > area.distance + EDGE_EPSILON) return false;
    if (area.shape === 'circle') return true;
    // The cone's apex is the firer's own position; nothing else can sit there.
    if (dist <= EDGE_EPSILON) return false;
    return bearingDelta(bearingDegrees(area.origin, point), area.direction) <= area.angle / 2 + EDGE_EPSILON;
}

/** The candidates whose centre lies inside the area, minus the excluded ids (the firer). */
export function collectInArea<T extends { id: string; center: AreaPoint }>(area: PlacedArea, candidates: readonly T[], exclude: ReadonlySet<string>): T[] {
    return candidates.filter((c) => !exclude.has(c.id) && isPointInArea(area, c.center));
}

/** Foundry tokens face down the screen at rotation 0; template bearings put 0° along +x. */
const TOKEN_FACING_OFFSET_DEGREES = 90;

/** Where an attack's template goes, in scene units. */
export interface AreaPlacementInput {
    anchor: AreaAnchor;
    /** The firer's token centre. */
    firer: AreaPoint;
    /** The firer token's rotation, used as its facing when there is no target. */
    firerRotation: number;
    /** The declared target's token centre, or null. */
    target: AreaPoint | null;
    /** The scatter a missed impact template rolled, or null when it landed true. */
    scatter: ScatterVector | null;
}

/**
 * The template's origin and axis. A firer-anchored cone sits on the firer and points at
 * the target, or along the firer's facing when nothing is targeted. An impact template
 * sits on the target, moved by any scatter; with no target it starts on the firer for
 * the user to drag into place.
 */
export function areaPlacement(input: AreaPlacementInput): { origin: AreaPoint; direction: number } {
    const direction = input.target === null ? normaliseDegrees(input.firerRotation + TOKEN_FACING_OFFSET_DEGREES) : bearingDegrees(input.firer, input.target);
    if (input.anchor === 'firer') return { origin: input.firer, direction };
    const impact = input.target ?? input.firer;
    const shift = input.scatter === null ? { x: 0, y: 0 } : scatterOffset(input.scatter.direction, input.scatter.metres, direction);
    return { origin: { x: impact.x + shift.x, y: impact.y + shift.y }, direction };
}

/** Degrees per step on the 10-point scatter diagram. */
const SCATTER_STEP_DEGREES = 30;
/** Bearing of scatter direction 1 relative to the line of fire: straight behind. */
const SCATTER_DIRECTION_ONE_OFFSET = 180;

/**
 * Where a scattered shot lands, relative to the intended point. The diagram is relative
 * to the firer's line of fire: 1 is behind, 4 right, 7 forward, 10 left, 30° apart.
 */
export function scatterOffset(direction: ScatterDirection, metres: number, lineOfFire: number): AreaPoint {
    const bearing = lineOfFire + SCATTER_DIRECTION_ONE_OFFSET - (direction - 1) * SCATTER_STEP_DEGREES;
    const rad = (bearing * Math.PI) / 180;
    return { x: metres * Math.cos(rad), y: metres * Math.sin(rad) };
}

/* -------------------------------------------- */
/*  Avoidance modifiers                         */
/* -------------------------------------------- */

/** One provenance-bearing component of an avoidance test target. */
export interface AvoidanceComponent {
    /** Langpack key for the component's label. */
    label: I18nKey;
    value: number;
    /** Provenance tag for the modifier tooltip. */
    source: 'difficulty' | 'weapon-training' | 'heavy-unbraced';
}

/** The wielder's state the avoidance bonuses read. */
export interface AvoidanceWielder {
    /** The wielder has the weapon's training. */
    trained: boolean;
    /** The weapon is Heavy and the wielder is not braced. */
    heavyUnbraced: boolean;
}

/**
 * The modifiers on an avoidance test, each with its provenance; only the ones that
 * change the target. The wielder bonus does not stack: it is the untrained bonus,
 * rising to the unbraced-Heavy bonus when that applies.
 */
export function areaAvoidanceComponents(rule: AreaAvoidanceRule, wielder: AvoidanceWielder): AvoidanceComponent[] {
    // A Challenging (+0) difficulty changes nothing; the card's statement already
    // names the test's difficulty, so a zero row would only be noise (#616).
    const components: AvoidanceComponent[] =
        rule.modifier === 0 ? [] : [{ label: 'WH40K.AreaAttack.Avoid.Difficulty', value: rule.modifier, source: 'difficulty' }];
    const untrained = wielder.trained ? 0 : rule.untrainedBonus;
    const unbraced = wielder.heavyUnbraced ? rule.unbracedHeavyBonus : 0;
    if (unbraced > 0 && unbraced >= untrained) {
        components.push({ label: 'WH40K.AreaAttack.Avoid.UnbracedHeavy', value: unbraced, source: 'heavy-unbraced' });
    } else if (untrained > 0) {
        components.push({ label: 'WH40K.AreaAttack.Avoid.Untrained', value: untrained, source: 'weapon-training' });
    }
    return components;
}

/* -------------------------------------------- */
/*  Per-target results                          */
/* -------------------------------------------- */

/** The tests a creature can make to avoid an area: its Agility, or Dodge with Leaping Dodge. */
export type AvoidanceSkill = 'agility' | 'dodge';

/** Langpack keys naming each avoidance test. */
export const AVOIDANCE_TEST_LABEL_KEYS: Readonly<Record<AvoidanceSkill, I18nKey>> = {
    agility: 'WH40K.Characteristic.Agility',
    dodge: 'WH40K.Combat.Dodge',
};

/** The test a creature rolled to avoid the area. */
interface AreaAvoidanceTest {
    /** Which test it rolled: its Agility, or Dodge with Leaping Dodge. */
    skill: AvoidanceSkill;
    /** The characteristic / skill total before modifiers. */
    base: number;
    /** The final target after the ±60-capped modifiers. */
    target: number;
    /** The d100 result. */
    roll: number;
    components: AvoidanceComponent[];
}

/** One creature caught in the area. */
export interface AreaTargetResult {
    tokenId: string;
    /** The creature's actor UUID, so its hit can be assigned to it. */
    actorUuid: string;
    name: string;
    /** Whether the area hits it. */
    hit: boolean;
    /** The avoidance test it rolled, or null for an area that simply hits. */
    test: AreaAvoidanceTest | null;
}

/** Inputs for one creature's avoidance result. */
export interface AvoidanceResultInput {
    tokenId: string;
    actorUuid: string;
    name: string;
    skill: AvoidanceSkill;
    base: number;
    components: AvoidanceComponent[];
    roll: number;
}

/** Score one creature's avoidance test: the target is base + the capped modifier sum, and a failure is a hit. */
export function avoidanceResult(input: AvoidanceResultInput): AreaTargetResult {
    const modifiers: Record<string, number> = {};
    for (const c of input.components) modifiers[c.source] = c.value;
    const target = aggregateRollTarget(input.base, modifiers);
    return {
        tokenId: input.tokenId,
        actorUuid: input.actorUuid,
        name: input.name,
        hit: !isD100Success(input.roll, target),
        test: { skill: input.skill, base: input.base, target, roll: input.roll, components: input.components },
    };
}

/** A creature an area that simply hits catches. */
export function areaHitResult(tokenId: string, actorUuid: string, name: string): AreaTargetResult {
    return { tokenId, actorUuid, name, hit: true, test: null };
}

/* -------------------------------------------- */
/*  Card statement                              */
/* -------------------------------------------- */

/** A langpack key with its format parameters. */
export interface AreaPhrase {
    key: I18nKey;
    params: Record<string, string | number>;
}

/** Langpack key naming the area's shape on the card. */
export function areaShapeLabelKey(shape: AreaShape): I18nKey {
    return shape === 'cone' ? 'WH40K.AreaAttack.Area.Cone' : 'WH40K.AreaAttack.Area.Circle';
}

/** A signed modifier as printed on a card: `+0`, `+20`, `-10`. */
export function signedModifier(value: number): string {
    return value < 0 ? String(value) : `+${value}`;
}

/** Already-localized labels the statement interpolates. */
export interface AreaStatementLabels {
    /** The quality's display label (`Spray`, `Blast (3)`). */
    quality: string;
    /** The area's shape label (`cone`, `blast`). */
    area: string;
    /** The avoidance test's label (`Agility`). */
    test: string;
}

/**
 * The phrases that state an area attack's mechanic in place of a roll readout: the
 * lead ("Spray: no attack roll." or "Blast (3):") and what the area does to those
 * inside it. The caller localizes each phrase and joins them.
 */
export function areaStatementPhrases(spec: AreaTemplateSpec, noAttackRoll: boolean, labels: AreaStatementLabels): AreaPhrase[] {
    const lead: AreaPhrase = noAttackRoll
        ? { key: 'WH40K.AreaAttack.Summary.NoAttackRoll', params: { quality: labels.quality } }
        : { key: 'WH40K.AreaAttack.Summary.Quality', params: { quality: labels.quality } };
    const effect: AreaPhrase =
        spec.avoid !== null
            ? { key: 'WH40K.AreaAttack.Summary.Avoid', params: { area: labels.area, test: labels.test, modifier: signedModifier(spec.avoid.modifier) } }
            : { key: 'WH40K.AreaAttack.Summary.Hit', params: { area: labels.area, distance: spec.distance } };
    return [lead, effect];
}
