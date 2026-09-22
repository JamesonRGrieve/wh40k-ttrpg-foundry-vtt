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
 * derived data on every prepare. Runtime CONSUMPTION of the aggregated summary
 * (damage/crit application, test rolls, crew targeting, movement) is phased —
 * see content issue #28 — but the values are now real, typed and computed rather
 * than decorative zeroes.
 */

/** How a trait exposes crew/passengers. `''` = the trait says nothing about it. */
const CREW_EXPOSURE_CHOICES = ['', 'open', 'enclosed'] as const;
type CrewExposure = (typeof CREW_EXPOSURE_CHOICES)[number];

/** One per-test modifier a trait grants (e.g. Rugged → `{ test: 'repair', value: 20 }`). */
interface VehicleTestModifier {
    /** Test/category key: `'repair' | 'difficultTerrain' | 'manoeuvre'` or a skill id. */
    test: string;
    /** Signed modifier applied to that test. */
    value: number;
}

/** The structured, enforceable effects a single vehicle trait declares. */
export interface VehicleTraitEffects {
    testModifiers: VehicleTestModifier[];
    /** Multiplier on critical damage taken (Reinforced Armour = 0.5). `null` = no effect. */
    critDamageMultiplier: number | null;
    /** Whether the crit multiplier is bypassed by Righteous Fury (Reinforced Armour: true). */
    critExcludesRighteousFury: boolean;
    /** Motive-system crit mitigation (Tracked: halve the speed-loss roll, doubled duration). */
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
}

/**
 * The aggregated, resolved effects across all of a vehicle's traits, folded onto
 * `system` derived data. `crewExposure` resolves with `enclosed` winning over
 * `open` (a sealed hull beats an open compartment); `critDamageMultiplier`
 * composes multiplicatively; test modifiers concatenate; booleans OR together;
 * deployment modifiers take the strongest (most negative to-hit, longest delay).
 */
export interface AggregatedVehicleTraitEffects {
    testModifiers: VehicleTestModifier[];
    critDamageMultiplier: number | null;
    critExcludesRighteousFury: boolean;
    mitigatesMotiveCrit: boolean;
    crewExposure: CrewExposure;
    ignoresDifficultTerrain: boolean;
    amphibious: boolean;
    cannotRam: boolean;
    freeTurn: boolean;
    canParryWithMelee: boolean;
    enhancedMovement: boolean;
    orbitalDeployment: boolean;
    deploymentIncomingToHitModifier: number;
    postLandingDelayRounds: number;
}

/** Build the structured `effects` SchemaField for the vehicle-trait DataModel. */
export function vehicleTraitEffectsSchema(): foundry.data.fields.SchemaField.Any {
    const fields = foundry.data.fields;
    return new fields.SchemaField({
        testModifiers: new fields.ArrayField(
            new fields.SchemaField({
                test: new fields.StringField({ required: true, blank: false }),
                value: new fields.NumberField({ required: true, initial: 0, integer: true }),
            }),
            { required: true, initial: [] },
        ),
        critDamageMultiplier: new fields.NumberField({ required: false, nullable: true, initial: null, min: 0 }),
        critExcludesRighteousFury: new fields.BooleanField({ required: true, initial: false }),
        mitigatesMotiveCrit: new fields.BooleanField({ required: true, initial: false }),
        // `blank: true` is required: '' is the neutral default (a trait that
        // does not touch crew exposure) and is NOT one of the choices, so without
        // it V14 rejects the default with "may not be a blank string" and the item
        // fails to initialize (breaking actor hydration).
        crewExposure: new fields.StringField({ required: true, blank: true, initial: '', choices: [...CREW_EXPOSURE_CHOICES] }),
        ignoresDifficultTerrain: new fields.BooleanField({ required: true, initial: false }),
        amphibious: new fields.BooleanField({ required: true, initial: false }),
        cannotRam: new fields.BooleanField({ required: true, initial: false }),
        freeTurn: new fields.BooleanField({ required: true, initial: false }),
        canParryWithMelee: new fields.BooleanField({ required: true, initial: false }),
        // Enhanced Motive Systems: 2x Tactical Speed as a Half-Action, 3x as Full, triple on Floor It! (DH2 Core p.188).
        enhancedMovement: new fields.BooleanField({ required: true, initial: false }),
        orbitalDeployment: new fields.BooleanField({ required: true, initial: false }),
        deploymentIncomingToHitModifier: new fields.NumberField({ required: true, initial: 0, integer: true }),
        postLandingDelayRounds: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
    });
}

/** A fresh zero/empty aggregate (identity for {@link aggregateVehicleTraitEffects}). */
export function emptyAggregatedVehicleTraitEffects(): AggregatedVehicleTraitEffects {
    return {
        testModifiers: [],
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
    };
}

/**
 * Fold every trait's `effects` into one resolved summary. Pure and total so it
 * is unit-tested independently of the actor prepare cycle.
 * @param traitEffects the `effects` block of each vehicle-trait the actor owns
 */
export function aggregateVehicleTraitEffects(traitEffects: readonly VehicleTraitEffects[]): AggregatedVehicleTraitEffects {
    const out = emptyAggregatedVehicleTraitEffects();
    for (const e of traitEffects) {
        for (const tm of e.testModifiers) out.testModifiers.push({ test: tm.test, value: tm.value });
        if (e.critDamageMultiplier !== null) {
            out.critDamageMultiplier = (out.critDamageMultiplier ?? 1) * e.critDamageMultiplier;
        }
        out.critExcludesRighteousFury ||= e.critExcludesRighteousFury;
        out.mitigatesMotiveCrit ||= e.mitigatesMotiveCrit;
        // A sealed hull (enclosed) beats an open compartment.
        if (e.crewExposure === 'enclosed') out.crewExposure = 'enclosed';
        else if (e.crewExposure === 'open' && out.crewExposure !== 'enclosed') out.crewExposure = 'open';
        out.ignoresDifficultTerrain ||= e.ignoresDifficultTerrain;
        out.amphibious ||= e.amphibious;
        out.cannotRam ||= e.cannotRam;
        out.freeTurn ||= e.freeTurn;
        out.canParryWithMelee ||= e.canParryWithMelee;
        out.enhancedMovement ||= e.enhancedMovement;
        out.orbitalDeployment ||= e.orbitalDeployment;
        out.deploymentIncomingToHitModifier = Math.min(out.deploymentIncomingToHitModifier, e.deploymentIncomingToHitModifier);
        out.postLandingDelayRounds = Math.max(out.postLandingDelayRounds, e.postLandingDelayRounds);
    }
    return out;
}
