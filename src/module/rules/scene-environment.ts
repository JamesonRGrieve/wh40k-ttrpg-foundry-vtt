/**
 * Per-scene environment — gravity, harsh weather and vacuum — with each line's
 * printed effects (#604).
 *
 * The GM sets a scene's environment (the `flags.wh40k-rpg.environment` scene
 * flag, edited in the Scene Environment window); every effect below then applies
 * automatically to the actors standing in that scene, each against its OWN game
 * line. Only what a line's core rulebook prints is modelled, and a line that prints
 * nothing for an effect gets nothing — never another line's rule:
 *
 * - **Low / high gravity** (DH1 Core p. 213, DH2 Core p. 250, RT Core p. 269,
 *   DW Core p. 210, BC Core p. 43, OW Core p. 38). Every line: Agility Bonus ±2
 *   for movement (high: to a minimum of 1), Strength Bonus + Toughness Bonus ±4
 *   for carrying, lifting and pushing (high: to a minimum of 0), Strength Bonus ±2
 *   for throwing (high: to a minimum of 0), and jumping / leaping distances ×2 or
 *   ÷2 (DH2: halved rounding up). The Agility Bonus shift also sets Initiative in
 *   every line EXCEPT DH1, whose rule is "for the purposes of movement" alone.
 *   BC and OW word the carrying change as "Strength Bonus and Toughness Bonus
 *   increased by four points"; it is read as the SUM, as the other four lines
 *   print it, because the carrying table is indexed by that sum. The throwing
 *   change feeds the thrown-weapon range (`SBx3`), which `range.ts` resolves from
 *   the thrower's Strength Bonus via {@link environmentThrowStrengthBonus}.
 *   A printed (manual) NPC movement line takes the same Agility Bonus shift at
 *   data prep via {@link environmentPrintedMovementShift}, never into its source.
 * - **Zero gravity** (same pages; DH1 Core p. 212, Table 7-30: Treacherous
 *   Environments). Difficult terrain for movement — movement halved — and a Charge
 *   or Run needs a Hard (−20) Agility test or the character falls Prone. DH2, RT,
 *   DW, BC and OW add that a Move must start beside a surface to push off from; DH1
 *   prints zero gravity only as a −20 treacherous environment, so it has no
 *   push-off rule. "Difficult terrain" here is "for determining movement" (DH2, BC,
 *   OW) / "meaning movement is halved" (RT, DW), so the separate WS / Dodge penalty
 *   for STANDING in difficult terrain is deliberately not chained in.
 * - **Harsh weather or unnatural conditions** (DH1 Core p. 199, DH2 Core p. 231,
 *   RT Core p. 249, DW Core p. 249, BC Core p. 246, OW Core p. 255). Every line:
 *   Weapon Skill and Ballistic Skill tests made to attack are Hard (−20).
 * - **Vacuum** (DH1 Core p. 210, DH2 Core p. 243, RT Core p. 261, DW Core p. 261,
 *   BC Core p. 256, OW Core p. 268). Composes with the suffocation resolver in
 *   `hazards.ts` (#118). The lines print two shapes — see {@link VacuumRule}.
 *
 * Imperium Maledictum runs a different engine and is not modelled (`null`), the
 * same treatment `hazards.ts` gives it.
 *
 * Pure apart from the flag accessors: the roll path (Path B), the actor data
 * prep, the hazard dialog, the GM window and the HUD widget all read from here.
 */

import type { GameSystemId } from '../config/game-systems/types.ts';
import { SYSTEM_ID } from '../constants.ts';
import { computeMovement, type MovementRates, shiftMovementRates } from '../data/shared/movement-math.ts';
import type { I18nKey } from '../types/i18n-keys';
import { inferActiveGameLine } from '../utils/item-variant-utils.ts';
import { nonNegInt } from './_num.ts';
import { type BreathUnit, resolveSuffocation, type SuffocationEndgame } from './hazards.ts';

/* -------------------------------------------- */
/*  The scene setting                           */
/* -------------------------------------------- */

export const GRAVITY_KINDS = ['standard', 'low', 'high', 'zero'] as const;
export type GravityKind = (typeof GRAVITY_KINDS)[number];

/**
 * The scene's air: breathable, the vacuum of space (sudden exposure, with the
 * extreme cold), or a gradually worsening atmosphere (a venting voidship).
 */
export const ATMOSPHERE_KINDS = ['breathable', 'vacuum', 'venting'] as const;
export type AtmosphereKind = (typeof ATMOSPHERE_KINDS)[number];

export interface SceneEnvironment {
    gravity: GravityKind;
    /** Harsh weather or unnatural conditions (heavy rain, an ash storm, waves of fungus). */
    harshConditions: boolean;
    atmosphere: AtmosphereKind;
}

export const DEFAULT_SCENE_ENVIRONMENT: Readonly<SceneEnvironment> = Object.freeze({ gravity: 'standard', harshConditions: false, atmosphere: 'breathable' });

/** Scene flag key under the system's flag namespace. */
export const SCENE_ENVIRONMENT_FLAG = 'environment';

export function isGravityKind(value: string): value is GravityKind {
    return (GRAVITY_KINDS as readonly string[]).includes(value);
}

export function isAtmosphereKind(value: string): value is AtmosphereKind {
    return (ATMOSPHERE_KINDS as readonly string[]).includes(value);
}

/**
 * Validate a stored environment flag. Each field falls back to its default on
 * its own, so one bad field never discards the others; anything that is not an
 * object reads as the default environment.
 * @param raw  The stored flag value.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: a scene flag value is untyped until the per-field validation below
export function parseSceneEnvironment(raw: unknown): SceneEnvironment {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ...DEFAULT_SCENE_ENVIRONMENT };
    const gravity = 'gravity' in raw && typeof raw.gravity === 'string' && isGravityKind(raw.gravity) ? raw.gravity : DEFAULT_SCENE_ENVIRONMENT.gravity;
    const atmosphere =
        'atmosphere' in raw && typeof raw.atmosphere === 'string' && isAtmosphereKind(raw.atmosphere) ? raw.atmosphere : DEFAULT_SCENE_ENVIRONMENT.atmosphere;
    const harshConditions = 'harshConditions' in raw && raw.harshConditions === true;
    return { gravity, harshConditions, atmosphere };
}

/** True when nothing about the environment departs from the default. */
export function isDefaultEnvironment(env: SceneEnvironment): boolean {
    return env.gravity === 'standard' && !env.harshConditions && env.atmosphere === 'breathable';
}

/** Minimal Scene read-surface, structurally satisfied by a Foundry Scene document. */
interface EnvironmentScene {
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry Document#getFlag is typed as returning unknown; parseSceneEnvironment narrows it
    getFlag: (scope: typeof SYSTEM_ID, key: string) => unknown;
}

/** The environment a scene is set to (the default when unset or no scene). */
export function readSceneEnvironment(scene: EnvironmentScene | null | undefined): SceneEnvironment {
    if (scene === null || scene === undefined) return { ...DEFAULT_SCENE_ENVIRONMENT };
    return parseSceneEnvironment(scene.getFlag(SYSTEM_ID, SCENE_ENVIRONMENT_FLAG));
}

/** The actor read-surface {@link actorSceneEnvironment} needs, structurally satisfied by a Foundry Actor. */
interface EnvironmentActor {
    /** A synthetic (unlinked) token actor's token; its parent is the token's scene. */
    token?: { parent?: EnvironmentScene | null } | null;
    getActiveTokens?: () => ReadonlyArray<{ document?: { parent?: EnvironmentScene | null } | null }>;
}

/** Whether the canvas has a scene drawn, so `getActiveTokens` can be asked. */
function canvasIsReady(): boolean {
    // eslint-disable-next-line no-restricted-syntax -- boundary: `canvas` is the Foundry runtime global; actor data prep also runs at boot and under unit tests, where it is absent
    return (globalThis as { canvas?: { ready?: boolean } }).canvas?.ready === true;
}

/**
 * The environment of the scene an actor stands in: a synthetic actor's own
 * token's scene, else the scene of the actor's token on the viewed canvas. An
 * actor with no token in view reads as the default environment.
 */
export function actorSceneEnvironment(actor: EnvironmentActor | null | undefined): SceneEnvironment {
    if (actor === null || actor === undefined) return { ...DEFAULT_SCENE_ENVIRONMENT };
    const ownScene = actor.token?.parent;
    if (ownScene !== null && ownScene !== undefined) return readSceneEnvironment(ownScene);
    if (!canvasIsReady() || typeof actor.getActiveTokens !== 'function') return { ...DEFAULT_SCENE_ENVIRONMENT };
    return readSceneEnvironment(actor.getActiveTokens().at(0)?.document?.parent);
}

/**
 * The pair every environmental derived-stat change resolves against: the
 * environment of the scene an actor stands in, and the actor's own game line.
 */
export function actorEnvironmentContext(actor: (EnvironmentActor & { type?: string }) | null | undefined): { env: SceneEnvironment; line: GameSystemId } {
    return { env: actorSceneEnvironment(actor), line: inferActiveGameLine({ actor }) };
}

/* -------------------------------------------- */
/*  Per-line printed rules                      */
/* -------------------------------------------- */

/** The low- or high-gravity changes, as one line prints them. */
interface GravityWorldRule {
    /** Agility Bonus change for movement (and Initiative, where the line says so). */
    agilityBonus: number;
    /** The floor the reduced Agility Bonus cannot go below (`null` = none printed). */
    agilityBonusFloor: number | null;
    /** Change to Strength Bonus + Toughness Bonus for carrying, lifting and pushing. */
    liftingSum: number;
    liftingSumFloor: number | null;
    /** Strength Bonus change for throwing. */
    throwStrengthBonus: number;
    throwStrengthBonusFloor: number | null;
    /** Multiplier on every jumping and leaping distance. */
    jumpFactor: number;
    /** Whether a halved jump rounds up (DH2 prints "rounding up"). */
    jumpRoundsUp: boolean;
}

interface ZeroGravityRule {
    /** Difficult terrain for movement: every movement rate is halved, rounding up. */
    halvesMovement: boolean;
    /** Modifier to the Agility test a Charge or Run demands (Hard, −20). */
    manoeuvreTestModifier: number;
    /** Whether a Move must start adjacent to a surface to push off from. */
    pushOffRequired: boolean;
}

interface GravityRules {
    low: GravityWorldRule;
    high: GravityWorldRule;
    zero: ZeroGravityRule;
    /** Whether the low/high Agility Bonus change also sets Initiative. */
    affectsInitiative: boolean;
}

/** Harsh weather / unnatural conditions: Weapon Skill and Ballistic Skill attack tests. */
interface WeatherRule {
    attackModifier: number;
}

/** What a gradually worsening atmosphere does once its allotment runs out. */
type GradualVacuumRule =
    /** DH2 / BC / OW: the sudden-exposure damage, on a smaller die. */
    | { kind: 'reducedDie'; damage: string }
    /** DH1 / RT / DW: a Toughness test each round with a cumulative penalty; success takes the small die, failure the large. */
    | { kind: 'cumulativeTest'; penaltyStep: number; successDamage: string; failureDamage: string };

/**
 * One line's vacuum rule. Two printed shapes:
 * - DH2, BC, OW: depressurisation is 1d10 Explosive a round, and both it and the
 *   cold ignore Armour AND Toughness Bonus; a worsening atmosphere deals 1d5.
 * - DH1, RT, DW: depressurisation is 1d10+3 Explosive a round, and armour does not
 *   reduce it or the cold (Toughness Bonus still does); a worsening atmosphere
 *   calls for a Toughness test each round at a cumulative −10.
 * Every line: sudden exposure is survived for Toughness Bonus rounds, a worsening
 * atmosphere for twice that; in the vacuum of space a Challenging (+0) Toughness
 * test each round or 1d10 Energy damage from the cold; and the subject begins to
 * suffocate unless he has an oxygen source.
 */
interface VacuumRule {
    depressurisationDamage: string;
    /** Whether depressurisation and cold damage also ignore Toughness Bonus (they always ignore Armour). */
    ignoresToughnessBonus: boolean;
    coldTestModifier: number;
    coldDamage: string;
    gradual: GradualVacuumRule;
}

interface EnvironmentLineRules {
    gravity: GravityRules;
    weather: WeatherRule;
    vacuum: VacuumRule;
}

/** Low gravity reads identically in all six lines. */
const LOW_GRAVITY: GravityWorldRule = {
    agilityBonus: 2,
    agilityBonusFloor: null,
    liftingSum: 4,
    liftingSumFloor: null,
    throwStrengthBonus: 2,
    throwStrengthBonusFloor: null,
    jumpFactor: 2,
    jumpRoundsUp: false,
};

/** High gravity, as DH1 / RT / DW / BC / OW print it. */
const HIGH_GRAVITY: GravityWorldRule = {
    agilityBonus: -2,
    agilityBonusFloor: 1,
    liftingSum: -4,
    liftingSumFloor: 0,
    throwStrengthBonus: -2,
    throwStrengthBonusFloor: 0,
    jumpFactor: 0.5,
    jumpRoundsUp: false,
};

/** DH2 prints the same high-gravity rule, but halves jumps "rounding up". */
const DH2_HIGH_GRAVITY: GravityWorldRule = { ...HIGH_GRAVITY, jumpRoundsUp: true };

/** The zero-gravity Charge / Run test is Hard (−20) in every line. */
const ZERO_GRAVITY_MANOEUVRE = -20;

const ZERO_GRAVITY: ZeroGravityRule = { halvesMovement: true, manoeuvreTestModifier: ZERO_GRAVITY_MANOEUVRE, pushOffRequired: true };

/** DH1 prints zero gravity only as a treacherous environment (Table 7-30). */
const DH1_ZERO_GRAVITY: ZeroGravityRule = { ...ZERO_GRAVITY, pushOffRequired: false };

/** Harsh weather makes WS / BS attack tests Hard (−20) in every line. */
const HARSH_WEATHER: WeatherRule = { attackModifier: -20 };

/** DH2 / BC / OW vacuum. */
const VACUUM_IGNORES_TB: VacuumRule = {
    depressurisationDamage: '1d10',
    ignoresToughnessBonus: true,
    coldTestModifier: 0,
    coldDamage: '1d10',
    gradual: { kind: 'reducedDie', damage: '1d5' },
};

/** DH1 / RT / DW vacuum. */
const VACUUM_ARMOUR_ONLY: VacuumRule = {
    depressurisationDamage: '1d10+3',
    ignoresToughnessBonus: false,
    coldTestModifier: 0,
    coldDamage: '1d10',
    gradual: { kind: 'cumulativeTest', penaltyStep: -10, successDamage: '1d5', failureDamage: '1d10' },
};

/** The printed environment rules of each line; `null` = not modelled (IM). */
const ENVIRONMENT_RULES: Readonly<Record<GameSystemId, EnvironmentLineRules | null>> = {
    dh1: {
        gravity: { low: LOW_GRAVITY, high: HIGH_GRAVITY, zero: DH1_ZERO_GRAVITY, affectsInitiative: false },
        weather: HARSH_WEATHER,
        vacuum: VACUUM_ARMOUR_ONLY,
    },
    dh2: {
        gravity: { low: LOW_GRAVITY, high: DH2_HIGH_GRAVITY, zero: ZERO_GRAVITY, affectsInitiative: true },
        weather: HARSH_WEATHER,
        vacuum: VACUUM_IGNORES_TB,
    },
    rt: { gravity: { low: LOW_GRAVITY, high: HIGH_GRAVITY, zero: ZERO_GRAVITY, affectsInitiative: true }, weather: HARSH_WEATHER, vacuum: VACUUM_ARMOUR_ONLY },
    dw: { gravity: { low: LOW_GRAVITY, high: HIGH_GRAVITY, zero: ZERO_GRAVITY, affectsInitiative: true }, weather: HARSH_WEATHER, vacuum: VACUUM_ARMOUR_ONLY },
    bc: { gravity: { low: LOW_GRAVITY, high: HIGH_GRAVITY, zero: ZERO_GRAVITY, affectsInitiative: true }, weather: HARSH_WEATHER, vacuum: VACUUM_IGNORES_TB },
    ow: { gravity: { low: LOW_GRAVITY, high: HIGH_GRAVITY, zero: ZERO_GRAVITY, affectsInitiative: true }, weather: HARSH_WEATHER, vacuum: VACUUM_IGNORES_TB },
    im: null,
};

/** The environment rules of a line, or null when the line is not modelled. */
export function environmentRulesFor(line: GameSystemId): EnvironmentLineRules | null {
    return ENVIRONMENT_RULES[line];
}

/** The low- or high-gravity rule in force, or null in standard / zero gravity or an unmodelled line. */
function gravityWorldRule(env: SceneEnvironment, line: GameSystemId): GravityWorldRule | null {
    const rules = environmentRulesFor(line);
    if (rules === null) return null;
    if (env.gravity === 'low') return rules.gravity.low;
    if (env.gravity === 'high') return rules.gravity.high;
    return null;
}

/** The zero-gravity rule in force, or null outside zero gravity or in an unmodelled line. */
function zeroGravityRule(env: SceneEnvironment, line: GameSystemId): ZeroGravityRule | null {
    if (env.gravity !== 'zero') return null;
    return environmentRulesFor(line)?.gravity.zero ?? null;
}

/** Apply a signed shift with an optional floor that a reduction cannot cross (and never raises a value already below it). */
function shiftWithFloor(value: number, shift: number, floor: number | null): number {
    const shifted = value + shift;
    if (shift >= 0 || floor === null) return shifted;
    return Math.max(Math.min(value, floor), shifted);
}

/* -------------------------------------------- */
/*  Derived stats                               */
/* -------------------------------------------- */

/** What the Agility Bonus is being read for. */
type AgilityPurpose = 'movement' | 'initiative';

/**
 * The Agility Bonus a character uses for movement or Initiative under the
 * scene's gravity. Initiative is unchanged in a line whose rule names movement
 * alone (DH1).
 */
export function environmentAgilityBonus(agilityBonus: number, env: SceneEnvironment, line: GameSystemId, purpose: AgilityPurpose): number {
    const rule = gravityWorldRule(env, line);
    if (rule === null) return agilityBonus;
    if (purpose === 'initiative' && environmentRulesFor(line)?.gravity.affectsInitiative !== true) return agilityBonus;
    return shiftWithFloor(agilityBonus, rule.agilityBonus, rule.agilityBonusFloor);
}

/**
 * The Agility Bonus shift a printed movement line takes under the scene's
 * gravity: the difference the low/high-gravity rule makes to the creature's own
 * Agility Bonus for movement (so the high-gravity floor of 1 is honoured). Zero
 * in standard or zero gravity, and in an unmodelled line.
 */
export function environmentPrintedMovementShift(agilityBonus: number, env: SceneEnvironment, line: GameSystemId): number {
    return environmentAgilityBonus(agilityBonus, env, line, 'movement') - agilityBonus;
}

/**
 * An NPC's movement rates under the scene's gravity. With no printed line they
 * are derived from the gravity-shifted Agility Bonus; a printed statblock line is
 * kept and takes the same shift (times each rate's multiple). Zero gravity then
 * halves either. The NPC 1/2/3/6 floors apply throughout.
 */
export function environmentNpcMovementRates(
    npc: { agilityBonus: number; size: number; printed: Readonly<MovementRates> | null },
    env: SceneEnvironment,
    line: GameSystemId,
): MovementRates {
    const base =
        npc.printed === null
            ? computeMovement(environmentAgilityBonus(npc.agilityBonus, env, line, 'movement'), npc.size, true)
            : shiftMovementRates(npc.printed, environmentPrintedMovementShift(npc.agilityBonus, env, line), true);
    return environmentMovementRates(base, env, line);
}

/**
 * The Strength Bonus a character throws with under the scene's gravity: ±2 in
 * low / high gravity (high: to a minimum of 0). Unchanged otherwise.
 */
export function environmentThrowStrengthBonus(strengthBonus: number, env: SceneEnvironment, line: GameSystemId): number {
    const rule = gravityWorldRule(env, line);
    if (rule === null) return strengthBonus;
    return shiftWithFloor(strengthBonus, rule.throwStrengthBonus, rule.throwStrengthBonusFloor);
}

/** Strength Bonus + Toughness Bonus for carrying, lifting and pushing under the scene's gravity. */
export function environmentLiftingSum(sum: number, env: SceneEnvironment, line: GameSystemId): number {
    const rule = gravityWorldRule(env, line);
    if (rule === null) return sum;
    return shiftWithFloor(sum, rule.liftingSum, rule.liftingSumFloor);
}

/** A jumping or leaping distance under the scene's gravity. */
export function environmentJumpDistance(distance: number, env: SceneEnvironment, line: GameSystemId): number {
    const rule = gravityWorldRule(env, line);
    if (rule === null) return distance;
    const scaled = distance * rule.jumpFactor;
    return rule.jumpRoundsUp ? Math.ceil(scaled) : scaled;
}

/** Movement rates, keyed by mode. */
interface EnvironmentMovementRates {
    half: number;
    full: number;
    charge: number;
    run: number;
}

/** Movement rates under the scene's gravity: halved, rounding up, in zero gravity. */
export function environmentMovementRates<T extends EnvironmentMovementRates>(rates: T, env: SceneEnvironment, line: GameSystemId): T {
    if (zeroGravityRule(env, line)?.halvesMovement !== true) return rates;
    return { ...rates, half: Math.ceil(rates.half / 2), full: Math.ceil(rates.full / 2), charge: Math.ceil(rates.charge / 2), run: Math.ceil(rates.run / 2) };
}

/* -------------------------------------------- */
/*  Path B roll-time collectors                 */
/* -------------------------------------------- */

/** The roll-modifier bucket the environment components are summed under. */
export const ENVIRONMENT_BUCKET = 'environment';

/** One sourced contribution — structurally a `RollModifierComponent`. */
interface EnvironmentComponent {
    key: string;
    label: string;
    value: number;
    source: string;
}

/** Resolves a langpack key; injected so the collectors stay pure. */
type EnvironmentLocalize = (key: string) => string;

/** The attack test the weather collector filters against. */
interface EnvironmentAttackContext {
    /** A Weapon Skill or Ballistic Skill test made to attack. */
    isWeaponAttack: boolean;
}

/**
 * Path B: the scene environment's modifiers to an attack test — harsh weather or
 * unnatural conditions make WS and BS attack tests Hard (−20) in every line.
 */
export function collectEnvironmentAttackModifiers(
    env: SceneEnvironment,
    line: GameSystemId,
    ctx: EnvironmentAttackContext,
    localize: EnvironmentLocalize,
): EnvironmentComponent[] {
    const rules = environmentRulesFor(line);
    if (rules === null || !ctx.isWeaponAttack || !env.harshConditions) return [];
    return [
        {
            key: `${ENVIRONMENT_BUCKET}.harsh-conditions`,
            label: localize('WH40K.Environment.Weather.Harsh'),
            value: rules.weather.attackModifier,
            source: localize('WH40K.Environment.Source'),
        },
    ];
}

/**
 * Path B: the modifier to the Agility test a Charge or Run demands in zero
 * gravity (Hard, −20). Empty outside zero gravity.
 */
export function collectZeroGravityManoeuvreModifiers(env: SceneEnvironment, line: GameSystemId, localize: EnvironmentLocalize): EnvironmentComponent[] {
    const rule = zeroGravityRule(env, line);
    if (rule === null) return [];
    return [
        {
            key: `${ENVIRONMENT_BUCKET}.zero-gravity`,
            label: localize('WH40K.Environment.Gravity.Zero'),
            value: rule.manoeuvreTestModifier,
            source: localize('WH40K.Environment.Source'),
        },
    ];
}

/** Sum of a component list (the bucket total the roll's modifier map carries). */
export function sumEnvironmentComponents(components: readonly EnvironmentComponent[]): number {
    return components.reduce((total, component) => total + component.value, 0);
}

/* -------------------------------------------- */
/*  Vacuum                                      */
/* -------------------------------------------- */

/** How a subject is exposed: suddenly (airlock, hull breach) or to a worsening atmosphere. */
export type VacuumExposure = 'sudden' | 'gradual';

export interface VacuumOutcome {
    /** Rounds survived unharmed before the damage begins. */
    safeRounds: number;
    /** The per-round damage once the safe rounds are spent (the success die for a `cumulativeTest`). */
    damage: string;
    /** Set for a worsening atmosphere in DH1 / RT / DW: the per-round test's damage on a failure. */
    failureDamage: string;
    /** Set for a worsening atmosphere in DH1 / RT / DW: the cumulative per-round Toughness penalty. */
    testPenaltyStep: number;
    /** Whether the damage also ignores Toughness Bonus (it always ignores Armour). */
    ignoresToughnessBonus: boolean;
    /** In the vacuum of space: the per-round Toughness test against the cold and its damage. */
    cold: { testModifier: number; damage: string } | null;
    /** The suffocation the subject begins to suffer; null with an oxygen source. */
    suffocation: { count: number; unit: BreathUnit; endgame: SuffocationEndgame; roundsUntilDeath: number } | null;
}

/**
 * Resolve a subject's exposure to vacuum, composed with the line's suffocation
 * rule. Returns null when the line is not modelled.
 */
export function resolveVacuum(input: {
    toughnessBonus: number;
    exposure: VacuumExposure;
    inSpace: boolean;
    oxygenSource: boolean;
    strenuous: boolean;
    line: GameSystemId;
}): VacuumOutcome | null {
    const rules = environmentRulesFor(input.line);
    const suffocation = resolveSuffocation({ toughnessBonus: input.toughnessBonus, strenuous: input.strenuous, line: input.line });
    if (rules === null || suffocation === null) return null;
    const vacuum = rules.vacuum;
    const tb = nonNegInt(input.toughnessBonus);
    const gradual = input.exposure === 'gradual';
    const cumulative = gradual && vacuum.gradual.kind === 'cumulativeTest' ? vacuum.gradual : null;
    let damage = vacuum.depressurisationDamage;
    if (gradual) damage = vacuum.gradual.kind === 'reducedDie' ? vacuum.gradual.damage : vacuum.gradual.successDamage;
    return {
        safeRounds: gradual ? tb * 2 : tb,
        damage,
        failureDamage: cumulative?.failureDamage ?? '',
        testPenaltyStep: cumulative?.penaltyStep ?? 0,
        ignoresToughnessBonus: vacuum.ignoresToughnessBonus,
        cold: input.inSpace ? { testModifier: vacuum.coldTestModifier, damage: vacuum.coldDamage } : null,
        suffocation: input.oxygenSource
            ? null
            : {
                  count: suffocation.allotment.count,
                  unit: suffocation.allotment.unit,
                  endgame: suffocation.endgame,
                  roundsUntilDeath: suffocation.roundsUntilDeath,
              },
    };
}

/** The exposure a scene's atmosphere implies (`null` when it is breathable). */
export function exposureForAtmosphere(atmosphere: AtmosphereKind): { exposure: VacuumExposure; inSpace: boolean } | null {
    if (atmosphere === 'vacuum') return { exposure: 'sudden', inSpace: true };
    if (atmosphere === 'venting') return { exposure: 'gradual', inSpace: false };
    return null;
}

/* -------------------------------------------- */
/*  Summary (HUD widget + GM window)            */
/* -------------------------------------------- */

/** One active effect of the environment, as langpack keys + format data. */
interface EnvironmentEffectLine {
    key: string;
    labelKey: string;
    data: Record<string, string>;
}

export const GRAVITY_LABEL_KEYS: Readonly<Record<GravityKind, I18nKey>> = {
    standard: 'WH40K.Environment.Gravity.Standard',
    low: 'WH40K.Environment.Gravity.Low',
    high: 'WH40K.Environment.Gravity.High',
    zero: 'WH40K.Environment.Gravity.Zero',
};

export const ATMOSPHERE_LABEL_KEYS: Readonly<Record<AtmosphereKind, I18nKey>> = {
    breathable: 'WH40K.Environment.Atmosphere.Breathable',
    vacuum: 'WH40K.Environment.Atmosphere.Vacuum',
    venting: 'WH40K.Environment.Atmosphere.Venting',
};

/** Signed display of a modifier (`+2`, `−20`). */
function signed(value: number): string {
    return value >= 0 ? `+${value}` : `${value}`;
}

/**
 * The effects a line applies under an environment, for the HUD widget and the GM
 * window's preview — each is a langpack key with its printed numbers. Empty for
 * the default environment, and for an unmodelled line.
 */
export function environmentEffectLines(env: SceneEnvironment, line: GameSystemId): EnvironmentEffectLine[] {
    const rules = environmentRulesFor(line);
    if (rules === null) return [];
    const lines: EnvironmentEffectLine[] = [];
    const world = gravityWorldRule(env, line);
    if (world !== null) {
        lines.push({
            key: 'gravity-agility',
            labelKey: rules.gravity.affectsInitiative ? 'WH40K.Environment.Effect.AgilityMoveInit' : 'WH40K.Environment.Effect.AgilityMove',
            data: { value: signed(world.agilityBonus) },
        });
        lines.push({ key: 'gravity-lifting', labelKey: 'WH40K.Environment.Effect.Lifting', data: { value: signed(world.liftingSum) } });
        lines.push({ key: 'gravity-throw', labelKey: 'WH40K.Environment.Effect.Throw', data: { value: signed(world.throwStrengthBonus) } });
        lines.push({
            key: 'gravity-jump',
            labelKey: world.jumpFactor > 1 ? 'WH40K.Environment.Effect.JumpDoubled' : 'WH40K.Environment.Effect.JumpHalved',
            data: {},
        });
    }
    const zero = zeroGravityRule(env, line);
    if (zero !== null) {
        lines.push({ key: 'zero-movement', labelKey: 'WH40K.Environment.Effect.ZeroMovement', data: {} });
        lines.push({ key: 'zero-manoeuvre', labelKey: 'WH40K.Environment.Effect.ZeroManoeuvre', data: { value: signed(zero.manoeuvreTestModifier) } });
        if (zero.pushOffRequired) lines.push({ key: 'zero-push-off', labelKey: 'WH40K.Environment.Effect.ZeroPushOff', data: {} });
    }
    if (env.harshConditions) {
        lines.push({ key: 'weather-attack', labelKey: 'WH40K.Environment.Effect.WeatherAttack', data: { value: signed(rules.weather.attackModifier) } });
    }
    const exposure = exposureForAtmosphere(env.atmosphere);
    if (exposure !== null) {
        lines.push({
            key: 'vacuum',
            labelKey: exposure.exposure === 'sudden' ? 'WH40K.Environment.Effect.VacuumSudden' : 'WH40K.Environment.Effect.VacuumGradual',
            data: {},
        });
    }
    return lines;
}
