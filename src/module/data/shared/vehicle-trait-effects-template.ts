/**
 * @file Shared vehicle-trait structured-effects schema + central aggregation.
 *
 * Vehicle traits historically carried only the flat
 * `{ speed, manoeuvrability, armour, integrity }` stat block
 * ({@link ./vehicle-stat-modifiers-template.ts}), which cannot express what most
 * traits actually DO in RAW: crit-damage mitigation (Reinforced Armour), crew
 * exposure (Open-Topped / Enclosed), per-test bonuses (Rugged → Repair +20;
 * Tracked → Difficult-Terrain +10), terrain and movement rules (Walker,
 * Amphibious) or orbital deployment. Left unmodelled, those traits are inert
 * prose labels the engine ignores.
 *
 * This template adds a structured, typed `effects` block so each mechanic lives
 * as DATA on the trait (Direction #7 — content mechanics are authored in
 * `_source`, never hardcoded in `src/`) and is evaluated CENTRALLY by
 * {@link aggregateVehicleTraitEffects}, which the vehicle DataModel folds into
 * derived data on every prepare.
 *
 * Authored vehicle stat lines are the FINAL printed values, which already
 * include their traits' effects (content#28): the Chimera prints Manoeuvrability
 * +0 although Tracked Vehicle says −10. So effects carry only what a stat line
 * cannot: test modifiers, crit handling, crew exposure, and rule flags. A
 * trait's "tests involving Manoeuvrability" modifier is that stat, and is not
 * authored as an effect.
 */

import type { IncomingToHitEntry } from '../../rules/vehicle-damage.ts';

/** How a trait exposes crew/passengers. `''` = the trait says nothing about it. */
const CREW_EXPOSURE_CHOICES = ['', 'open', 'enclosed'] as const;
type CrewExposure = (typeof CREW_EXPOSURE_CHOICES)[number];

/** How a trait treats the standard penalties for ground vehicles firing at aircraft. `''` = no change. */
const ANTI_AIR_CHOICES = ['', 'rudimentary', 'advanced'] as const;
type AntiAir = (typeof ANTI_AIR_CHOICES)[number];

/** When a trait's shooting penalty applies (see `rules/vehicle-damage.ts` IncomingCondition). `''` = always. */
const INCOMING_RANGED_CONDITION_CHOICES = ['', 'moving', 'mobile', 'airborne'] as const;
type IncomingRangedCondition = (typeof INCOMING_RANGED_CONDITION_CHOICES)[number];

/** One per-test modifier a trait grants (e.g. Rugged → `{ test: 'repair', value: 20 }`). */
interface VehicleTestModifier {
    /** Test category key: `'repair' | 'difficultTerrain' | 'floorIt' | 'command'`. */
    test: string;
    /** Signed modifier applied to that test. */
    value: number;
}

/** A test modifier in the aggregate, with the trait it came from (its provenance on a roll card). */
export interface SourcedVehicleTestModifier extends VehicleTestModifier {
    /** The granting trait's name. */
    source: string;
}

/** The structured, enforceable effects a single vehicle trait declares. */
export interface VehicleTraitEffects {
    testModifiers: VehicleTestModifier[];
    /** Multiplier on critical damage taken (Reinforced Armour = 0.5). `null` = no effect. */
    critDamageMultiplier: number | null;
    /** Whether the crit multiplier is bypassed by Righteous Fury (Reinforced Armour: true). */
    critExcludesRighteousFury: boolean;
    /** Motive-system crit mitigation (Tracked: halve the speed-loss roll). */
    mitigatesMotiveCrit: boolean;
    crewExposure: CrewExposure;
    ignoresDifficultTerrain: boolean;
    amphibious: boolean;
    cannotRam: boolean;
    freeTurn: boolean;
    canParryWithMelee: boolean;
    enhancedMovement: boolean;
    orbitalDeployment: boolean;
    /** To-hit modifier against the vehicle while it is orbitally deploying (Orbital = -30). */
    deploymentIncomingToHitModifier: number;
    /** Full rounds the vehicle must wait after landing before acting (Orbital = 1). */
    postLandingDelayRounds: number;
    /** Hovers like the Hoverer trait and may move to Low Altitude (Skimmer). */
    hoverer: boolean;
    /** Follows the Flyer rules (must keep moving, altitude levels, crashes when destroyed airborne). */
    flyer: boolean;
    /** May exit the atmosphere and operate as a skimmer or flyer (Spacecraft). */
    spacecraft: boolean;
    /** A failed Operate test on a Ram! means it Crashed into the target (Skimmer). */
    crashesOnFailedRam: boolean;
    /** To-hit modifier on shooting at the vehicle under the trait's condition (Holofield −20 while moving). */
    incomingRangedToHitModifier: number;
    /** When that shooting penalty applies: `''` always, else while the vehicle is `moving`, `mobile` or `airborne`. */
    incomingRangedCondition: IncomingRangedCondition;
    /** Weapon Skill modifier on melee attacks against the vehicle (Skimmer −10). */
    incomingMeleeToHitModifier: number;
    /** In melee, attackers may choose the rider or the vehicle without a Called Shot (Bike). */
    riderTargetableInMelee: boolean;
    /** May make the Hit & Run action (Bike). */
    hitAndRun: boolean;
    /** Needs no pilot or gunners; fires every weapon in one attack and may make melee attacks (Daemonic Possession). */
    selfCrewed: boolean;
    /** Critical results that would damage the crew are ignored (Daemonic Possession). */
    ignoresCrewCritDamage: boolean;
    /** The commander may force the Righteous Fury critical 1d5 to be re-rolled (Damage Control). */
    rerollRighteousFuryCrit: boolean;
    /** Putting out a fire aboard is a Free Action (Damage Control). */
    extinguishAsFreeAction: boolean;
    /** Sealed from the outside world with its own life support (Environmentally Sealed). */
    environmentallySealed: boolean;
    /** Multiplier on the chance of exploding when on fire (Extremely Volatile = 2). `null` = no effect. */
    explosionChanceMultiplier: number | null;
    /** Agility test modifier to avoid catching fire from its explosion (Extremely Volatile = −10). */
    explosionIgnitionTestModifier: number;
    /** Cannot move under its own power and cannot Jink (Immobile). */
    immobile: boolean;
    /** No Floor It!, and moving Tactical Speed takes a Full Action (Ponderous). */
    ponderous: boolean;
    /** The die rolled for Righteous Fury against the vehicle (Ramshackle `1d10`); `''` = the normal die. */
    righteousFuryCritDie: string;
    /** Multiplier on damage the vehicle takes when it Rams something solid (Ramshackle = 2). */
    ramSelfDamageMultiplier: number | null;
    /** Multiplier on the time repairs take (Ramshackle = 0.5). */
    repairTimeMultiplier: number | null;
    /** Multiplier on the time Motive Systems repairs take (Tracked = 2, Wheeled = 0.5). */
    motiveRepairTimeMultiplier: number | null;
    /** Treated as Lightly Damaged unless it has taken Critical damage (Ramshackle). */
    alwaysLightlyDamaged: boolean;
    /** The commander's Command can affect squads or units up to his Fellowship bonus (Command and Control). */
    commandUnitsByFellowship: boolean;
    /** Failed Command tests may be re-rolled (Improved Command and Control). */
    rerollFailedCommand: boolean;
    antiAir: AntiAir;
    /** Machine-controlled, firing in Point Defence or Sentry Mode (Sentry). */
    sentry: boolean;
    /** A flesh-and-blood mount; Operate tests become Survival tests (Living). */
    living: boolean;
    /** Automatically passes the Bestial trait's tests to avoid fleeing (Bred for War). */
    ignoresBestialFlee: boolean;
    /** Protection Rating of a force field the trait gives (Daemon Engine 30). 0 = none. */
    forceFieldRating: number;
    /** That force field never Overloads (Daemon Engine). */
    forceFieldNeverOverloads: boolean;
    /** Structural Integrity regained each Round, or one Critical removed instead (Daemon Engine `1d5`); `''` = none. */
    structuralRegeneration: string;
}

/** A trait's effects with its name, as the aggregator reads them. */
export interface NamedVehicleTraitEffects {
    name: string;
    effects: VehicleTraitEffects;
}

/**
 * The aggregated, resolved effects across all of a vehicle's traits, folded onto
 * `system` derived data. `crewExposure` resolves with `enclosed` winning over
 * `open` (a sealed hull beats an open compartment); multipliers compose
 * multiplicatively; test modifiers concatenate (each naming its trait); booleans
 * OR together; incoming to-hit modifiers take the strongest penalty; a force
 * field takes the highest rating. Ponderous and Enhanced Motive Systems cancel
 * each other out (DH2 core p. 188, OW core p. 214).
 */
export interface AggregatedVehicleTraitEffects extends Omit<VehicleTraitEffects, 'testModifiers' | 'incomingRangedCondition'> {
    testModifiers: SourcedVehicleTestModifier[];
    /** Every trait's to-hit penalty on attacks against the vehicle, with its condition — the attack applies those that hold. */
    incomingToHit: IncomingToHitEntry[];
    /** Which traits the damage-facing effects came from — their provenance rows on attack and damage cards. */
    sources: VehicleEffectSources;
}

/** The traits behind the aggregated effects a roll or damage card attributes ('' / [] = none). */
interface VehicleEffectSources {
    /** Every trait whose multiplier composed into `critDamageMultiplier`. */
    critDamageMultiplier: string[];
    /** The trait giving the strongest incoming ranged penalty. */
    incomingRangedToHitModifier: string;
    /** The trait giving the strongest incoming melee penalty. */
    incomingMeleeToHitModifier: string;
    /** The trait giving the highest-rated force field. */
    forceFieldRating: string;
    /** The trait that changed the Righteous Fury die. */
    righteousFuryCritDie: string;
    /** The trait that set the crew exposure. */
    crewExposure: string;
}

/** Build the structured `effects` SchemaField for the vehicle-trait DataModel. */
export function vehicleTraitEffectsSchema(): foundry.data.fields.SchemaField.Any {
    const fields = foundry.data.fields;
    const flag = (): foundry.data.fields.BooleanField<{ required: true; initial: false }> => new fields.BooleanField({ required: true, initial: false });
    const multiplier = (): foundry.data.fields.NumberField<{ required: false; nullable: true; initial: null; min: 0 }> =>
        new fields.NumberField({ required: false, nullable: true, initial: null, min: 0 });
    const modifier = (): foundry.data.fields.NumberField<{ required: true; initial: 0; integer: true }> =>
        new fields.NumberField({ required: true, initial: 0, integer: true });
    return new fields.SchemaField({
        testModifiers: new fields.ArrayField(
            new fields.SchemaField({
                test: new fields.StringField({ required: true, blank: false }),
                value: new fields.NumberField({ required: true, initial: 0, integer: true }),
            }),
            { required: true, initial: [] },
        ),
        critDamageMultiplier: multiplier(),
        critExcludesRighteousFury: flag(),
        mitigatesMotiveCrit: flag(),
        // `blank: true` is required: '' is the neutral default (a trait that
        // does not touch crew exposure) and is NOT one of the choices, so without
        // it V14 rejects the default with "may not be a blank string" and the item
        // fails to initialize (breaking actor hydration).
        crewExposure: new fields.StringField({ required: true, blank: true, initial: '', choices: [...CREW_EXPOSURE_CHOICES] }),
        ignoresDifficultTerrain: flag(),
        amphibious: flag(),
        cannotRam: flag(),
        freeTurn: flag(),
        canParryWithMelee: flag(),
        // Enhanced Motive Systems: 2x Tactical Speed as a Half-Action, 3x as Full, triple on Floor It! (DH2 Core p.188).
        enhancedMovement: flag(),
        orbitalDeployment: flag(),
        deploymentIncomingToHitModifier: modifier(),
        postLandingDelayRounds: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
        hoverer: flag(),
        flyer: flag(),
        spacecraft: flag(),
        crashesOnFailedRam: flag(),
        incomingRangedToHitModifier: modifier(),
        // `blank: true`: '' (always) is the neutral default and not one of the conditions.
        incomingRangedCondition: new fields.StringField({ required: true, blank: true, initial: '', choices: [...INCOMING_RANGED_CONDITION_CHOICES] }),
        incomingMeleeToHitModifier: modifier(),
        riderTargetableInMelee: flag(),
        hitAndRun: flag(),
        selfCrewed: flag(),
        ignoresCrewCritDamage: flag(),
        rerollRighteousFuryCrit: flag(),
        extinguishAsFreeAction: flag(),
        environmentallySealed: flag(),
        explosionChanceMultiplier: multiplier(),
        explosionIgnitionTestModifier: modifier(),
        immobile: flag(),
        ponderous: flag(),
        righteousFuryCritDie: new fields.StringField({ required: true, blank: true, initial: '' }),
        ramSelfDamageMultiplier: multiplier(),
        repairTimeMultiplier: multiplier(),
        motiveRepairTimeMultiplier: multiplier(),
        alwaysLightlyDamaged: flag(),
        commandUnitsByFellowship: flag(),
        rerollFailedCommand: flag(),
        antiAir: new fields.StringField({ required: true, blank: true, initial: '', choices: [...ANTI_AIR_CHOICES] }),
        sentry: flag(),
        living: flag(),
        ignoresBestialFlee: flag(),
        forceFieldRating: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
        forceFieldNeverOverloads: flag(),
        structuralRegeneration: new fields.StringField({ required: true, blank: true, initial: '' }),
    });
}

/** A fresh zero/empty aggregate (identity for {@link aggregateVehicleTraitEffects}). */
export function emptyAggregatedVehicleTraitEffects(): AggregatedVehicleTraitEffects {
    return {
        testModifiers: [],
        incomingToHit: [],
        critDamageMultiplier: null,
        critExcludesRighteousFury: false,
        mitigatesMotiveCrit: false,
        crewExposure: '',
        ignoresDifficultTerrain: false,
        amphibious: false,
        cannotRam: false,
        freeTurn: false,
        canParryWithMelee: false,
        enhancedMovement: false,
        orbitalDeployment: false,
        deploymentIncomingToHitModifier: 0,
        postLandingDelayRounds: 0,
        hoverer: false,
        flyer: false,
        spacecraft: false,
        crashesOnFailedRam: false,
        incomingRangedToHitModifier: 0,
        incomingMeleeToHitModifier: 0,
        riderTargetableInMelee: false,
        hitAndRun: false,
        selfCrewed: false,
        ignoresCrewCritDamage: false,
        rerollRighteousFuryCrit: false,
        extinguishAsFreeAction: false,
        environmentallySealed: false,
        explosionChanceMultiplier: null,
        explosionIgnitionTestModifier: 0,
        immobile: false,
        ponderous: false,
        righteousFuryCritDie: '',
        ramSelfDamageMultiplier: null,
        repairTimeMultiplier: null,
        motiveRepairTimeMultiplier: null,
        alwaysLightlyDamaged: false,
        commandUnitsByFellowship: false,
        rerollFailedCommand: false,
        antiAir: '',
        sentry: false,
        living: false,
        ignoresBestialFlee: false,
        forceFieldRating: 0,
        forceFieldNeverOverloads: false,
        structuralRegeneration: '',
        sources: {
            critDamageMultiplier: [],
            incomingRangedToHitModifier: '',
            incomingMeleeToHitModifier: '',
            forceFieldRating: '',
            righteousFuryCritDie: '',
            crewExposure: '',
        },
    };
}

/** One trait's effects at their neutral defaults: a trait that does nothing (the base callers override). */
export function neutralVehicleTraitEffects(): VehicleTraitEffects {
    return { ...emptyAggregatedVehicleTraitEffects(), testModifiers: [], incomingRangedCondition: '' };
}

/** Compose two optional multipliers (`null` = no effect). */
function composeMultiplier(current: number | null, next: number | null): number | null {
    if (next === null) return current;
    return (current ?? 1) * next;
}

/** The boolean flags, which OR together across traits. */
const OR_FLAGS = [
    'critExcludesRighteousFury',
    'mitigatesMotiveCrit',
    'ignoresDifficultTerrain',
    'amphibious',
    'cannotRam',
    'freeTurn',
    'canParryWithMelee',
    'enhancedMovement',
    'orbitalDeployment',
    'hoverer',
    'flyer',
    'spacecraft',
    'crashesOnFailedRam',
    'riderTargetableInMelee',
    'hitAndRun',
    'selfCrewed',
    'ignoresCrewCritDamage',
    'rerollRighteousFuryCrit',
    'extinguishAsFreeAction',
    'environmentallySealed',
    'immobile',
    'ponderous',
    'alwaysLightlyDamaged',
    'commandUnitsByFellowship',
    'rerollFailedCommand',
    'sentry',
    'living',
    'ignoresBestialFlee',
    'forceFieldNeverOverloads',
] as const satisfies ReadonlyArray<keyof VehicleTraitEffects>;

/** A trait's to-hit penalties on attacks against the vehicle: shooting under its condition, melee, and Orbital Deployment's in flight. */
function incomingEntriesOf(trait: string, e: VehicleTraitEffects): IncomingToHitEntry[] {
    const entries: IncomingToHitEntry[] = [];
    if (e.incomingRangedToHitModifier !== 0)
        entries.push({ value: e.incomingRangedToHitModifier, attack: 'ranged', condition: e.incomingRangedCondition, trait });
    if (e.incomingMeleeToHitModifier !== 0) entries.push({ value: e.incomingMeleeToHitModifier, attack: 'melee', condition: '', trait });
    if (e.deploymentIncomingToHitModifier !== 0) entries.push({ value: e.deploymentIncomingToHitModifier, attack: 'ranged', condition: 'deploying', trait });
    return entries;
}

/**
 * Fold every trait's `effects` into one resolved summary. Pure and total so it
 * is unit-tested independently of the actor prepare cycle.
 * @param traits each vehicle-trait the actor owns: its name and `effects` block
 */
export function aggregateVehicleTraitEffects(traits: readonly NamedVehicleTraitEffects[]): AggregatedVehicleTraitEffects {
    const out = emptyAggregatedVehicleTraitEffects();
    const sources = out.sources;
    for (const { name, effects: e } of traits) {
        for (const tm of e.testModifiers) out.testModifiers.push({ test: tm.test, value: tm.value, source: name });
        out.incomingToHit.push(...incomingEntriesOf(name, e));
        if (e.critDamageMultiplier !== null) sources.critDamageMultiplier.push(name);
        if (e.incomingRangedToHitModifier < out.incomingRangedToHitModifier) sources.incomingRangedToHitModifier = name;
        if (e.incomingMeleeToHitModifier < out.incomingMeleeToHitModifier) sources.incomingMeleeToHitModifier = name;
        if (e.forceFieldRating > out.forceFieldRating) sources.forceFieldRating = name;
        if (out.righteousFuryCritDie === '' && e.righteousFuryCritDie !== '') sources.righteousFuryCritDie = name;
        if (e.crewExposure === 'enclosed' || (e.crewExposure === 'open' && out.crewExposure !== 'enclosed')) sources.crewExposure = name;
        out.critDamageMultiplier = composeMultiplier(out.critDamageMultiplier, e.critDamageMultiplier);
        out.explosionChanceMultiplier = composeMultiplier(out.explosionChanceMultiplier, e.explosionChanceMultiplier);
        out.ramSelfDamageMultiplier = composeMultiplier(out.ramSelfDamageMultiplier, e.ramSelfDamageMultiplier);
        out.repairTimeMultiplier = composeMultiplier(out.repairTimeMultiplier, e.repairTimeMultiplier);
        out.motiveRepairTimeMultiplier = composeMultiplier(out.motiveRepairTimeMultiplier, e.motiveRepairTimeMultiplier);
        for (const key of OR_FLAGS) out[key] ||= e[key];
        // A sealed hull (enclosed) beats an open compartment.
        if (e.crewExposure === 'enclosed') out.crewExposure = 'enclosed';
        else if (e.crewExposure === 'open' && out.crewExposure !== 'enclosed') out.crewExposure = 'open';
        // Advanced anti-air (ignore the penalties) beats rudimentary (halve them).
        if (e.antiAir === 'advanced') out.antiAir = 'advanced';
        else if (e.antiAir === 'rudimentary' && out.antiAir === '') out.antiAir = 'rudimentary';
        out.deploymentIncomingToHitModifier = Math.min(out.deploymentIncomingToHitModifier, e.deploymentIncomingToHitModifier);
        out.postLandingDelayRounds = Math.max(out.postLandingDelayRounds, e.postLandingDelayRounds);
        out.incomingRangedToHitModifier = Math.min(out.incomingRangedToHitModifier, e.incomingRangedToHitModifier);
        out.incomingMeleeToHitModifier = Math.min(out.incomingMeleeToHitModifier, e.incomingMeleeToHitModifier);
        out.explosionIgnitionTestModifier = Math.min(out.explosionIgnitionTestModifier, e.explosionIgnitionTestModifier);
        out.forceFieldRating = Math.max(out.forceFieldRating, e.forceFieldRating);
        if (out.righteousFuryCritDie === '') out.righteousFuryCritDie = e.righteousFuryCritDie;
        if (out.structuralRegeneration === '') out.structuralRegeneration = e.structuralRegeneration;
    }
    // "If a vehicle has both the Enhanced Motive Systems Vehicle Trait and the Ponderous
    // Vehicle Trait, then these two Traits cancel each other out" (OW core p. 213–214).
    if (out.enhancedMovement && out.ponderous) {
        out.enhancedMovement = false;
        out.ponderous = false;
    }
    return out;
}
