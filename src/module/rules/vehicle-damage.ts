/**
 * Damaging vehicles (content#28): which facing an attack strikes, where on the
 * vehicle it lands, which armour it meets, how the rest comes off Structural
 * Integrity, and what Critical damage it deals past it. Every line prints the
 * same model:
 *
 *   - DH2 core rules, "Attacking Vehicles": Front / Side / Rear facings are
 *     90° arcs measured from the vehicle's orientation; the Vehicle Hit
 *     Locations table on the reversed attack roll (a Turret hit uses Front armour; a
 *     Weapon or Turret hit on a vehicle without one strikes the Hull); extra hits
 *     on the same vehicle roll a fresh d100 on the table; damage less the
 *     facing's AP (after Penetration) comes off integrity, and damage past it is
 *     Critical damage read cumulatively on the struck location's Vehicle
 *     Critical Effects table. Righteous Fury instead rolls 1d5 on that
 *     table; it is not Critical damage and does not accumulate.
 *   - OW core rules: a hit-location table (the same bands) and four location charts;
 *     Righteous Fury must actually damage the vehicle.
 *   - RT and DW supplements: one Vehicle Critical Hit Chart and no hit-location
 *     table.
 *
 * Reinforced Armour / Reinforced Hull halve Critical damage, rounding up, and do
 * not touch Righteous Fury (DH2 and OW core rules; RT and DW supplements). That is read from the vehicle's aggregated
 * trait effects (`critDamageMultiplier` / `critExcludesRighteousFury`), never by
 * name.
 *
 * Pure: the chart rows come from the line's roll-table packs (see
 * `rolls/vehicle-critical-tables.ts`) and the vehicle's state from its actor.
 */

import type { I18nKey } from '../types/i18n-keys.d.ts';

/** Where on a vehicle a hit lands (the Vehicle Hit Locations table). A single-chart line resolves every hit to the Hull. */
export const VEHICLE_LOCATION_IDS = ['motive', 'hull', 'weapon', 'turret'] as const;
export type VehicleLocationId = (typeof VEHICLE_LOCATION_IDS)[number];

/** The four 90° arcs an attack can come from. */
export type VehicleFacing = 'front' | 'left' | 'right' | 'rear';

/** The armour value a facing reads (vehicles print one Side value for both flanks). */
export type VehicleArmourFacing = 'front' | 'side' | 'rear';

/** A crit chart's `vehicleCritical.location` flag: one hit location, or `any` for a single chart. */
export type VehicleCritChartLocation = VehicleLocationId | 'any';

/** One band of a printed vehicle hit-location table (`max` inclusive, bands ascending). */
export interface VehicleHitLocationBand {
    readonly max: number;
    readonly location: VehicleLocationId;
}

/** A line's printed rules for attacking vehicles. */
export interface VehicleCombatRules {
    /** The hit-location table on the reversed roll, or null for a line with one chart (every hit strikes the Hull). */
    readonly hitLocations: readonly VehicleHitLocationBand[] | null;
    /** The die Righteous Fury rolls on the vehicle chart (1d5 on every line). */
    readonly righteousFuryDie: string;
    /** Righteous Fury against a vehicle needs the hit to damage it (OW core rules, a DW supplement). */
    readonly righteousFuryNeedsDamage: boolean;
}

const LOCATION_LABEL_KEYS: Readonly<Record<VehicleLocationId, I18nKey>> = {
    motive: 'WH40K.Vehicle.Location.Motive',
    hull: 'WH40K.Vehicle.Location.Hull',
    weapon: 'WH40K.Vehicle.Location.Weapon',
    turret: 'WH40K.Vehicle.Location.Turret',
};

const FACING_LABEL_KEYS: Readonly<Record<VehicleFacing, I18nKey>> = {
    front: 'WH40K.Vehicle.Facing.Front',
    left: 'WH40K.Vehicle.Facing.Left',
    right: 'WH40K.Vehicle.Facing.Right',
    rear: 'WH40K.Vehicle.Facing.Rear',
};

/** Whether a string is a vehicle hit-location id. */
export function isVehicleLocationId(value: string): value is VehicleLocationId {
    return (VEHICLE_LOCATION_IDS as readonly string[]).includes(value);
}

/** The langpack key of a vehicle hit location. */
export function vehicleLocationLabelKey(location: VehicleLocationId): I18nKey {
    return LOCATION_LABEL_KEYS[location];
}

/** The langpack key of a facing. */
export function vehicleFacingLabelKey(facing: VehicleFacing): I18nKey {
    return FACING_LABEL_KEYS[facing];
}

/** Half the width of the Front and Rear arcs, in degrees. */
const HALF_ARC_DEGREES = 45;

function normaliseDegrees(deg: number): number {
    return ((deg % 360) + 360) % 360;
}

/**
 * The facing an attack from `attackerBearing` strikes on a vehicle pointing along
 * `vehicleBearing` (both in scene degrees, 0° along +x, clockwise as the screen's y
 * runs down). Within 45° of the nose is Front, within 45° of the tail Rear, and
 * the rest the Side on that flank: clockwise of the nose is the vehicle's right.
 * An attack from above or below reads Rear instead (see {@link isAttackFromAboveOrBelow}).
 * @param vehicleBearing  The direction the vehicle points.
 * @param attackerBearing  The direction from the vehicle's centre to the attacker.
 */
export function vehicleFacingFromBearings(vehicleBearing: number, attackerBearing: number): VehicleFacing {
    const offset = normaliseDegrees(attackerBearing - vehicleBearing);
    if (offset <= HALF_ARC_DEGREES || offset >= 360 - HALF_ARC_DEGREES) return 'front';
    if (offset >= 180 - HALF_ARC_DEGREES && offset <= 180 + HALF_ARC_DEGREES) return 'rear';
    return offset < 180 ? 'right' : 'left';
}

/**
 * Whether an attack comes from above or below the vehicle: the attacker is
 * further off vertically than horizontally, steeper than 45° (the same half-arc
 * the facings use). Such an attack strikes the Rear facing's armour.
 * @param horizontalMetres  Ground distance between the two.
 * @param verticalMetres  The attacker's elevation less the vehicle's.
 */
export function isAttackFromAboveOrBelow(horizontalMetres: number, verticalMetres: number): boolean {
    return Math.abs(verticalMetres) > Math.max(0, horizontalMetres);
}

/** The armour value a facing reads. */
export function armourFacingOf(facing: VehicleFacing): VehicleArmourFacing {
    return facing === 'left' || facing === 'right' ? 'side' : facing;
}

/** What a vehicle carries that decides whether a Weapon or Turret hit lands there. */
export interface VehicleMountProfile {
    /** It carries a turret-mounted weapon. */
    readonly hasTurret: boolean;
    /** The facings its other mounted weapons sit on (`all` / `''` cover every facing). */
    readonly weaponFacings: readonly string[];
}

/** Whether the vehicle carries a non-turret weapon on the struck facing. */
function hasWeaponOn(profile: VehicleMountProfile, facing: VehicleFacing): boolean {
    const flank = armourFacingOf(facing);
    return profile.weaponFacings.some(
        (weaponFacing) => weaponFacing === '' || weaponFacing === 'all' || weaponFacing === facing || (flank === 'side' && weaponFacing === 'side'),
    );
}

/** Where a hit lands, and the number the table read. */
export interface VehicleHitLocation {
    readonly location: VehicleLocationId;
    /** The value compared against the table; 0 when the line has no table. */
    readonly tableRoll: number;
    /** The table named a Weapon or Turret the vehicle does not carry, so the hit struck the Hull instead. */
    readonly redirectedFrom: VehicleLocationId | null;
}

/**
 * Where a hit lands on the vehicle.
 * @param tableRoll  The reversed attack roll for the first hit, a fresh d100 for each extra hit.
 * @param bands  The line's table, or null (every hit strikes the Hull).
 * @param mounts  What the vehicle carries.
 * @param facing  The struck facing (a Weapon hit needs a weapon on it).
 */
export function vehicleHitLocation(
    tableRoll: number,
    bands: readonly VehicleHitLocationBand[] | null,
    mounts: VehicleMountProfile,
    facing: VehicleFacing,
): VehicleHitLocation {
    if (bands === null || bands.length === 0) return { location: 'hull', tableRoll: 0, redirectedFrom: null };
    const rolled = bands.find((band) => tableRoll <= band.max)?.location ?? bands.at(-1)?.location ?? 'hull';
    const missing = (rolled === 'turret' && !mounts.hasTurret) || (rolled === 'weapon' && !hasWeaponOn(mounts, facing));
    return missing ? { location: 'hull', tableRoll, redirectedFrom: rolled } : { location: rolled, tableRoll, redirectedFrom: null };
}

/** The armour a hit meets: a Turret hit always meets Front armour (DH2 core rules). */
export function struckArmourFacing(facing: VehicleFacing, location: VehicleLocationId): VehicleArmourFacing {
    return location === 'turret' ? 'front' : armourFacingOf(facing);
}

/** The Structural Integrity / Critical damage a hit deals, and how. */
export interface VehicleDamageOutcome {
    /** Damage past the facing's armour (after Penetration). */
    readonly damage: number;
    /** Structural Integrity the hit removes. */
    readonly integrityLoss: number;
    /** Integrity after the hit. */
    readonly integrityAfter: number;
    /** Damage that went past integrity, before any trait halves it. */
    readonly excess: number;
    /** The crit multiplier applied to `excess`, or null for none. */
    readonly critMultiplier: number | null;
    /** Critical damage the hit adds (the excess, multiplied and rounded up). */
    readonly criticalTaken: number;
    /** The vehicle's cumulative Critical damage after the hit — the chart row it suffers. */
    readonly criticalAfter: number;
}

/** What {@link resolveVehicleDamage} reads. */
export interface VehicleDamageInput {
    readonly damage: number;
    readonly penetration: number;
    readonly armour: number;
    readonly integrity: number;
    readonly critical: number;
    /** Reinforced Armour / Hull's multiplier on Critical damage, or null. */
    readonly critMultiplier: number | null;
}

/**
 * Damage less the facing's armour (Penetration reducing that armour, never below 0)
 * comes off integrity; whatever passes it is Critical damage, multiplied by the
 * vehicle's crit multiplier and rounded up, and added to what it has already taken.
 */
export function resolveVehicleDamage(input: VehicleDamageInput): VehicleDamageOutcome {
    const usableArmour = Math.max(0, input.armour - Math.max(0, input.penetration));
    const damage = Math.max(0, input.damage - usableArmour);
    const integrity = Math.max(0, input.integrity);
    const integrityLoss = Math.min(damage, integrity);
    const excess = damage - integrityLoss;
    const criticalTaken = excess > 0 && input.critMultiplier !== null ? Math.ceil(excess * input.critMultiplier) : excess;
    return {
        damage,
        integrityLoss,
        integrityAfter: integrity - integrityLoss,
        excess,
        critMultiplier: excess > 0 ? input.critMultiplier : null,
        criticalTaken,
        criticalAfter: Math.max(0, input.critical) + criticalTaken,
    };
}

/**
 * The value a Righteous Fury roll reads on the chart: the roll itself, unless a
 * crit multiplier that does NOT exclude Righteous Fury applies (rounded up).
 */
export function righteousFuryChartValue(rolled: number, critMultiplier: number | null, excludesRighteousFury: boolean): number {
    if (critMultiplier === null || excludesRighteousFury) return rolled;
    return Math.ceil(rolled * critMultiplier);
}

/** One row of a vehicle critical chart. */
export interface VehicleCritRow {
    readonly min: number;
    readonly max: number;
    /** The row's effect text (HTML from the table). */
    readonly text: string;
}

/**
 * The row a value lands on. A value past the last row lands on the last (the
 * vehicle is destroyed); below the first, on the first.
 */
export function vehicleCritRowFor(rows: readonly VehicleCritRow[], value: number): VehicleCritRow | null {
    const sorted = [...rows].sort((a, b) => a.min - b.min);
    const first = sorted.at(0);
    const last = sorted.at(-1);
    if (first === undefined || last === undefined) return null;
    if (value > last.max) return last;
    if (value < first.min) return first;
    return sorted.find((row) => value >= row.min && value <= row.max) ?? last;
}

/** The chart that covers a hit location: its own, else the line's single chart. */
export function chartLocationsFor(location: VehicleLocationId): readonly VehicleCritChartLocation[] {
    return [location, 'any'];
}

/* -------------------------------------------- */
/*  Attacking a vehicle                         */
/* -------------------------------------------- */

/** The bucket an attack's target-vehicle trait modifiers fold into (one sourced row per trait). */
export const VEHICLE_TRAIT_BUCKET = 'vehicle-traits';

/**
 * What must be true of the vehicle for a trait's to-hit penalty to apply. `''`
 * always; `moving` while it moves (Holofield: "a moving Darkstar", an RT
 * supplement); `mobile` while it can move under its own power (Feral Machine
 * Spirit: "as long as it is mobile"); `airborne` while it flies (Flyer:
 * "an airborne flyer", a DH2 supplement); `deploying` while it is in
 * flight on an Orbital Deployment (OW core rules: −30 "whilst it is in flight").
 */
export type IncomingCondition = '' | 'moving' | 'mobile' | 'airborne' | 'deploying';

/** One trait's to-hit penalty on attacks against the vehicle, and when it applies. */
export interface IncomingToHitEntry {
    readonly value: number;
    /** Shooting or melee attacks. */
    readonly attack: 'ranged' | 'melee';
    readonly condition: IncomingCondition;
    readonly trait: string;
}

/** What the attack path knows of the vehicle's motion when it is attacked. */
export interface VehicleMotionState {
    /** It moved on its most recent turn. */
    readonly moving: boolean;
    /** It is above the ground (its token's elevation is above 0). */
    readonly airborne: boolean;
    /** It can move under its own power (no Immobile trait). */
    readonly mobile: boolean;
}

/** Whether a penalty's condition holds. Orbital deployment is in flight while the vehicle is above the ground. */
function conditionHolds(condition: IncomingCondition, state: VehicleMotionState): boolean {
    if (condition === '') return true;
    if (condition === 'deploying') return state.airborne;
    return state[condition];
}

/** One trait's modifier to an attack on the vehicle. */
export interface IncomingVehicleModifier {
    readonly value: number;
    readonly trait: string;
}

/** The strongest penalty among `entries`, as a modifier row; none when there are none. */
function strongest(entries: readonly IncomingToHitEntry[]): IncomingVehicleModifier[] {
    const best = entries.reduce<IncomingToHitEntry | null>((found, entry) => (found === null || entry.value < found.value ? entry : found), null);
    return best === null || best.value === 0 ? [] : [{ value: best.value, trait: best.trait }];
}

/**
 * The to-hit modifier a vehicle's traits impose on an attack against it: the
 * strongest whose condition holds — on shooting, Holofield, Flyer, Feral Machine
 * Spirit or an Orbital Deployment in flight; on melee, Skimmer. They do not stack:
 * Feral Machine Spirit "does not stack with the penalty from Dreadclaw Assault"
 * (an RT supplement), the one place a book says.
 */
export function incomingVehicleModifiers(entries: readonly IncomingToHitEntry[], isMelee: boolean, state: VehicleMotionState): IncomingVehicleModifier[] {
    return strongest(entries.filter((entry) => entry.attack === (isMelee ? 'melee' : 'ranged') && conditionHolds(entry.condition, state)));
}

/* -------------------------------------------- */
/*  Crew exposure                               */
/* -------------------------------------------- */

/** How an attack from outside may reach someone aboard a vehicle. */
export type CrewTargeting = 'free' | 'calledShot' | 'sheltered';

/** What {@link crewTargeting} reads. */
export interface CrewTargetingInput {
    /** The vehicle's aggregated crew exposure (`open` from Open-Topped / Bike; `enclosed` wins over it). */
    readonly exposure: string;
    /** In melee, attackers may pick the rider without a Called Shot (Bike). */
    readonly riderTargetableInMelee: boolean;
    readonly isMelee: boolean;
    /** The attacker is aboard the same vehicle, so it is not attacking from outside. */
    readonly attackerAboard: boolean;
}

/**
 * Whether an attack can single out someone aboard. Only an open vehicle exposes
 * its crew, and then only to a Called Shot (DH2 core rules Open-Topped, OW core
 * rules); a Bike's rider is open to any melee attack (DH2 core rules). A sealed
 * vehicle, or one whose traits say nothing of exposure, shelters them.
 */
export function crewTargeting(input: CrewTargetingInput): CrewTargeting {
    if (input.attackerAboard) return 'free';
    if (input.exposure !== 'open') return 'sheltered';
    return input.riderTargetableInMelee && input.isMelee ? 'free' : 'calledShot';
}

/** Whether an area attack (Blast, Spray) catches those aboard: only an open vehicle exposes them. */
export function crewExposedToArea(exposure: string): boolean {
    return exposure === 'open';
}
