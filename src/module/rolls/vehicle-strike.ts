/**
 * A hit on a vehicle (content#28), from attack to damage. The attack path builds
 * a {@link VehicleTargetProfile} for each vehicle it can strike — its line's
 * rules, the facing the attacker sees, its mounts and its trait effects — and
 * the one damage pipeline stamps a {@link VehicleStrike} on each Hit it lands:
 * where on the vehicle it struck, the armour that facing reads, the trait force
 * field's roll and the Righteous Fury chart rows. The damage card carries the
 * strike to the assign step, so a hit applied later still meets the armour and
 * chart it was rolled against.
 */

import { vehicleCombatRulesFor } from '../config/game-systems/index.ts';
import { SYSTEM_ID } from '../constants.ts';
import type { AggregatedVehicleTraitEffects } from '../data/shared/vehicle-trait-effects-template.ts';
import { bearingDegrees, tokenFacingBearing } from '../rules/area-template.ts';
import {
    type CrewTargeting,
    crewTargeting,
    type IncomingToHitEntry,
    isAttackFromAboveOrBelow,
    isVehicleLocationId,
    struckArmourFacing,
    type VehicleArmourFacing,
    type VehicleCombatRules,
    type VehicleFacing,
    type VehicleHitLocation,
    type VehicleLocationId,
    type VehicleMotionState,
    type VehicleMountProfile,
    vehicleFacingFromBearings,
} from '../rules/vehicle-damage.ts';
import { type OccupantLike, readAboard } from '../rules/vehicle-occupancy.ts';
import type { VehicleCritLookup, VehicleCritLookupFn } from './vehicle-critical-tables.ts';

/** A conventional craft's durability, as the damage pipeline reads it off `actor.system`. */
export interface VehicleDurability {
    readonly armour: Readonly<Record<VehicleArmourFacing, { readonly value: number }>>;
    readonly integrity: { readonly max: number; readonly value: number; readonly critical: number };
    readonly traitEffects: AggregatedVehicleTraitEffects;
    readonly gameSystem: string;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: the damage pipeline holds targets as Foundry Actors whose `system` is a per-type DataModel; this guard narrows it to a conventional craft
function isFacingArmour(value: unknown): value is { value: number } {
    return typeof value === 'object' && value !== null && 'value' in value && typeof value.value === 'number';
}

/**
 * The durability of a conventional craft (facing armour, Structural Integrity and
 * the aggregated trait effects), or null for anything else — a creature, a
 * voidship, an unprepared document.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: the damage pipeline holds targets as Foundry Actors whose `system` is a per-type DataModel; this guard narrows it to a conventional craft
export function readVehicleDurability(system: unknown): VehicleDurability | null {
    if (typeof system !== 'object' || system === null) return null;
    if (!('armour' in system) || !('integrity' in system) || !('traitEffects' in system)) return null;
    const armour = readFacingArmour(system.armour);
    const integrity = readIntegrity(system.integrity);
    const { traitEffects } = system;
    if (armour === null || integrity === null || typeof traitEffects !== 'object' || traitEffects === null || !('sources' in traitEffects)) return null;
    const gameSystem = 'gameSystem' in system && typeof system.gameSystem === 'string' ? system.gameSystem : '';
    // The aggregate is the vehicle DataModel's derived field; the `sources` probe above is its shape check.
    return { armour, integrity, traitEffects: traitEffects as AggregatedVehicleTraitEffects, gameSystem };
}

/** A craft's Front / Side / Rear armour, or null. */
// eslint-disable-next-line no-restricted-syntax -- boundary: a field of the per-type DataModel `system` readVehicleDurability narrows
function readFacingArmour(armour: unknown): VehicleDurability['armour'] | null {
    if (typeof armour !== 'object' || armour === null || !('front' in armour) || !('side' in armour) || !('rear' in armour)) return null;
    const { front, side, rear } = armour;
    return isFacingArmour(front) && isFacingArmour(side) && isFacingArmour(rear) ? { front, side, rear } : null;
}

/** A craft's Structural Integrity track, or null. */
// eslint-disable-next-line no-restricted-syntax -- boundary: a field of the per-type DataModel `system` readVehicleDurability narrows
function readIntegrity(integrity: unknown): VehicleDurability['integrity'] | null {
    if (typeof integrity !== 'object' || integrity === null || !('value' in integrity) || !('max' in integrity) || !('critical' in integrity)) return null;
    const { value, max, critical } = integrity;
    return typeof value === 'number' && typeof max === 'number' && typeof critical === 'number' ? { value, max, critical } : null;
}

/** A trait force field a vehicle's traits give it. */
interface VehicleForceField {
    readonly rating: number;
    readonly source: string;
    readonly neverOverloads: boolean;
}

/** What the attack path reads off the canvas beyond the facing: the attack's angle and the vehicle's motion. */
export interface VehiclePlacement {
    /** The attacker is above or below the vehicle, so the hit reads Rear armour. */
    readonly fromAboveOrBelow: boolean;
    /** The vehicle moved on its most recent turn. */
    readonly moving: boolean;
    /** The vehicle is off the ground. */
    readonly airborne: boolean;
}

/** No positions known: level, not moving, on the ground. */
const UNPLACED: VehiclePlacement = { fromAboveOrBelow: false, moving: false, airborne: false };

/** What the attack path knows of a vehicle it can strike. */
export interface VehicleTargetProfile {
    readonly line: string;
    readonly rules: VehicleCombatRules;
    readonly facing: VehicleFacing;
    /** True when no positions were known and Front was assumed. */
    readonly facingAssumed: boolean;
    /** The attack came from above or below and reads Rear armour. */
    readonly fromAboveOrBelow: boolean;
    /** The vehicle's traits' to-hit penalties on attacks against it. */
    readonly incomingToHit: readonly IncomingToHitEntry[];
    /** Whether it is moving, airborne and mobile — what those penalties' conditions read. */
    readonly motion: VehicleMotionState;
    /**
     * A burst's extra hits were spread onto it from the declared target (DH2 Core
     * p. 254), so no hit on it is the attack's first: each reads a fresh d100 on
     * the hit-location table, never the reversed attack roll.
     */
    readonly spreadTarget: boolean;
    readonly mounts: VehicleMountProfile;
    readonly forceField: VehicleForceField | null;
    /** The die Righteous Fury rolls on the vehicle's chart, and the trait that set it ('' for the line's own). */
    readonly righteousFuryDie: string;
    readonly righteousFuryDieSource: string;
    readonly critMultiplier: number | null;
    readonly critExcludesRighteousFury: boolean;
    readonly critMultiplierSources: readonly string[];
}

/** The slice of an owned item the mount profile reads. */
interface VehicleItemLike {
    readonly type: string;
    // eslint-disable-next-line no-restricted-syntax -- boundary: an owned item's `system` is a per-type DataModel the actor's EmbeddedCollection holds untyped; read through the weapon fields below
    readonly system: unknown;
}

/** The mounting, facing and installation a weapon item declares. */
// eslint-disable-next-line no-restricted-syntax -- boundary: an owned item's `system` is a per-type DataModel the actor's EmbeddedCollection holds untyped
function weaponMount(system: unknown): { mounting: string; facing: string; installed: boolean } {
    if (typeof system !== 'object' || system === null) return { mounting: '', facing: '', installed: true };
    const mounting = 'mounting' in system && typeof system.mounting === 'string' ? system.mounting : '';
    const facing = 'facing' in system && typeof system.facing === 'string' ? system.facing : '';
    const hardpoint = 'hardpoint' in system && typeof system.hardpoint === 'string' ? system.hardpoint : '';
    const innate = 'innate' in system && system.innate === true;
    return { mounting, facing, installed: innate || hardpoint !== '' };
}

/**
 * Whether the vehicle carries a turret, and where its other weapons sit. A
 * vehicle that declares hardpoints counts only the weapons installed in one (or
 * innate); one that declares none counts every weapon it owns.
 */
export function vehicleMountProfile(items: Iterable<VehicleItemLike>, installedOnly: boolean): VehicleMountProfile {
    let hasTurret = false;
    const weaponFacings: string[] = [];
    for (const item of items) {
        if (item.type !== 'weapon') continue;
        const mount = weaponMount(item.system);
        if (installedOnly && !mount.installed) continue;
        if (mount.mounting === 'turret') hasTurret = true;
        else weaponFacings.push(mount.facing);
    }
    return { hasTurret, weaponFacings };
}

/** The slice of an actor {@link vehicleTargetProfile} reads. */
interface VehicleActorLike {
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry Actor `system` is a per-type DataModel; narrowed by readVehicleDurability
    readonly system: unknown;
    readonly items: Iterable<VehicleItemLike>;
}

/** Whether the craft declares weapon hardpoints. */
// eslint-disable-next-line no-restricted-syntax -- boundary: Foundry Actor `system` is a per-type DataModel; read for its hardpoint list only
function declaresHardpoints(system: unknown): boolean {
    return typeof system === 'object' && system !== null && 'hardpoints' in system && Array.isArray(system.hardpoints) && system.hardpoints.length > 0;
}

/**
 * The profile of a vehicle the attack can strike from `facing`, or null when the
 * actor is not a conventional craft. Attacked from above or below, it reads Rear.
 */
export function vehicleTargetProfile(
    actor: VehicleActorLike,
    facing: VehicleFacing,
    facingAssumed: boolean,
    placement: VehiclePlacement = UNPLACED,
): VehicleTargetProfile | null {
    const durability = readVehicleDurability(actor.system);
    if (durability === null) return null;
    const rules = vehicleCombatRulesFor(durability.gameSystem);
    if (rules === null) return null;
    const effects = durability.traitEffects;
    return {
        line: durability.gameSystem,
        rules,
        facing: placement.fromAboveOrBelow ? 'rear' : facing,
        facingAssumed,
        fromAboveOrBelow: placement.fromAboveOrBelow,
        incomingToHit: effects.incomingToHit,
        motion: { moving: placement.moving, airborne: placement.airborne, mobile: !effects.immobile },
        spreadTarget: false,
        mounts: vehicleMountProfile(actor.items, declaresHardpoints(actor.system)),
        forceField:
            effects.forceFieldRating > 0
                ? { rating: effects.forceFieldRating, source: effects.sources.forceFieldRating, neverOverloads: effects.forceFieldNeverOverloads }
                : null,
        righteousFuryDie: effects.righteousFuryCritDie === '' ? rules.righteousFuryDie : effects.righteousFuryCritDie,
        righteousFuryDieSource: effects.righteousFuryCritDie === '' ? '' : effects.sources.righteousFuryCritDie,
        critMultiplier: effects.critDamageMultiplier,
        critExcludesRighteousFury: effects.critExcludesRighteousFury,
        critMultiplierSources: effects.sources.critDamageMultiplier,
    };
}

/** A token's centre, rotation and elevation, as the facing and motion read them. */
interface PlacedTokenLike {
    readonly center: { readonly x: number; readonly y: number };
    readonly document: { readonly rotation: number; readonly elevation?: number };
}

/** The facing of `vehicle` an attacker at `attacker` strikes. */
export function struckFacing(vehicle: PlacedTokenLike, attacker: { readonly x: number; readonly y: number }): VehicleFacing {
    return vehicleFacingFromBearings(tokenFacingBearing(vehicle.document.rotation), bearingDegrees(vehicle.center, attacker));
}

/** The scene's grid scale: pixels per cell and scene units (metres) per cell. */
export interface GridScale {
    readonly size: number;
    readonly distance: number;
}

/**
 * Whether the attacker is above or below the vehicle (steeper than 45°): the
 * difference in elevation against the ground distance between their centres.
 */
export function attackedFromAboveOrBelow(vehicle: PlacedTokenLike, attacker: PlacedTokenLike, grid: GridScale): boolean {
    if (grid.size <= 0) return false;
    const groundMetres = (Math.hypot(attacker.center.x - vehicle.center.x, attacker.center.y - vehicle.center.y) / grid.size) * grid.distance;
    return isAttackFromAboveOrBelow(groundMetres, (attacker.document.elevation ?? 0) - (vehicle.document.elevation ?? 0));
}

/** The vehicle's motion as the canvas shows it: off the ground by its elevation, moving by its combat turn record. */
export interface VehicleMotionReading {
    /** Metres it moved on its most recent combat turn (0 out of combat). */
    readonly movedMetres: number;
}

/**
 * The profile of the vehicle behind a token, struck from the attacker's token
 * (Front assumed when either is off the canvas): the facing it sees, whether it
 * attacks from above or below, and whether the vehicle is airborne and moving.
 */
export function vehicleTargetProfileFromTokens(
    actor: VehicleActorLike,
    vehicleToken: PlacedTokenLike | undefined,
    attackerToken: PlacedTokenLike | undefined,
    grid: GridScale,
    motion: VehicleMotionReading,
): VehicleTargetProfile | null {
    if (vehicleToken === undefined) return vehicleTargetProfile(actor, 'front', true);
    const placement = {
        fromAboveOrBelow: attackerToken !== undefined && attackedFromAboveOrBelow(vehicleToken, attackerToken, grid),
        moving: motion.movedMetres > 0,
        airborne: (vehicleToken.document.elevation ?? 0) > 0,
    };
    if (attackerToken === undefined) return vehicleTargetProfile(actor, 'front', true, placement);
    return vehicleTargetProfile(actor, struckFacing(vehicleToken, attackerToken.center), false, placement);
}

/** The flag movement tracking keeps on a combatant: metres moved on its current or most recent turn. */
const MOVED_FLAG = 'movedThisTurnMetres';

/** A token placeable with the id its combatant is keyed by. */
interface CanvasTokenLike extends PlacedTokenLike {
    readonly id: string;
}

/** Metres the combatant behind `tokenId` moved on its most recent turn in the active combat; 0 out of combat. */
function movedMetresOnLastTurn(tokenId: string): number {
    const combat = game.combat;
    if (combat?.started !== true) return 0;
    // eslint-disable-next-line no-restricted-syntax -- boundary: Combatant#getFlag is typed to the "core" scope only and returns the flag as untyped JSON; Number() validates it
    const combatant = combat.combatants.find((entry) => entry.tokenId === tokenId) as { getFlag: (scope: string, key: string) => unknown } | undefined;
    const moved = Number(combatant?.getFlag(SYSTEM_ID, MOVED_FLAG) ?? 0);
    return Number.isFinite(moved) ? moved : 0;
}

/** The profile of the vehicle behind `vehicleToken` on the live canvas, struck from `attackerToken`. */
export function vehicleTargetProfileOnCanvas(
    actor: VehicleActorLike,
    vehicleToken: CanvasTokenLike | undefined,
    attackerToken: PlacedTokenLike | undefined,
): VehicleTargetProfile | null {
    // Off a drawn canvas there is no scale: no attack reads as from above or below.
    const drawn = canvas.grid;
    const grid = drawn === null ? { size: 0, distance: 0 } : { size: drawn.size, distance: drawn.distance };
    return vehicleTargetProfileFromTokens(actor, vehicleToken, attackerToken, grid, {
        movedMetres: vehicleToken === undefined ? 0 : movedMetresOnLastTurn(vehicleToken.id),
    });
}

/* -------------------------------------------- */
/*  Crew aboard                                 */
/* -------------------------------------------- */

/** How an attack may reach someone aboard a vehicle, and the vehicle. */
export interface CrewTarget {
    readonly targeting: CrewTargeting;
    readonly vehicleName: string;
    readonly riderTargetableInMelee: boolean;
}

/** The vehicle an `aboard` flag names, as the crew rules read it. */
interface AboardVehicleLike {
    readonly name: string;
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry Actor `system` is a per-type DataModel; narrowed by readVehicleDurability
    readonly system: unknown;
}

/** The vehicle an `aboard` flag names (an Actor UUID), or null when it is gone. */
export function resolveAboardVehicle(uuid: string): AboardVehicleLike | null {
    const doc = fromUuidSync(uuid);
    return doc instanceof Actor ? doc : null;
}

/**
 * How an attack by `attacker` may reach `target` when the target is aboard a
 * vehicle (content#28): sheltered inside a closed one, by Called Shot from an open
 * one, freely from aboard the same one. Null when the target is not aboard a craft.
 * @param resolveVehicle  Resolves the vehicle's UUID (`fromUuidSync` at runtime).
 */
export function crewTargetOf(
    target: OccupantLike | null,
    attacker: OccupantLike | null,
    resolveVehicle: (uuid: string) => AboardVehicleLike | null,
): CrewTarget | null {
    const aboard = readAboard(target);
    if (aboard === null) return null;
    const vehicle = resolveVehicle(aboard.vehicleUuid);
    const durability = vehicle === null ? null : readVehicleDurability(vehicle.system);
    if (vehicle === null || durability === null) return null;
    const effects = durability.traitEffects;
    return {
        targeting: crewTargeting({
            exposure: effects.crewExposure,
            riderTargetableInMelee: effects.riderTargetableInMelee,
            // The weapon is picked in the dialog; the Bike's melee exception is applied there.
            isMelee: false,
            attackerAboard: readAboard(attacker)?.vehicleUuid === aboard.vehicleUuid,
        }),
        vehicleName: vehicle.name,
        riderTargetableInMelee: effects.riderTargetableInMelee,
    };
}

/* -------------------------------------------- */
/*  The strike a Hit carries                    */
/* -------------------------------------------- */

/** The trait force field's roll against the attack. */
export interface VehicleForceFieldRoll {
    readonly rating: number;
    readonly roll: number;
    readonly nullified: boolean;
    readonly source: string;
    /** The field overloads by its craftsmanship, which a vehicle trait does not record: the GM decides. */
    readonly overloadUnmodelled: boolean;
}

/**
 * A Righteous Fury roll on the vehicle's chart. The row's text is never carried:
 * each card reads it from the line's pack by `value`, so a card's attribute can
 * never inject chart text.
 */
export interface VehicleFuryRow {
    readonly die: string;
    readonly dieSource: string;
    readonly rolled: number;
    /** The value read against the chart (the roll, multiplied when a crit multiplier reaches Righteous Fury). */
    readonly value: number;
    /** The traits whose crit multiplier does not reach Righteous Fury (Reinforced Armour), '' for none. */
    readonly unaffectedBy: string;
}

/** A Righteous Fury row with the chart text it landed on (null when the line's packs carry no chart). */
export interface VehicleFuryResult extends VehicleFuryRow {
    readonly critical: VehicleCritLookup | null;
}

/** Read each Righteous Fury roll's row off the vehicle's chart for the struck location. */
export async function vehicleFuryResults(
    rows: readonly VehicleFuryRow[],
    line: string,
    location: VehicleLocationId,
    lookup: VehicleCritLookupFn,
): Promise<VehicleFuryResult[]> {
    return Promise.all(rows.map(async (row) => ({ ...row, critical: await lookup(line, location, row.value) })));
}

/** How the hit-location table was read: the reversed attack roll, a fresh d100 for an extra hit, or not at all (one chart). */
export type VehicleTableRollKind = 'reversed' | 'fresh' | 'none';

/** Where a hit struck a vehicle, carried from the damage card to the assign step. */
export interface VehicleStrike {
    readonly line: string;
    readonly facing: VehicleFacing;
    readonly facingAssumed: boolean;
    /** The attack came from above or below, so the facing read is Rear. */
    readonly fromAboveOrBelow: boolean;
    readonly location: VehicleLocationId;
    readonly tableRoll: number;
    readonly tableRollKind: VehicleTableRollKind;
    readonly redirectedFrom: VehicleLocationId | null;
    readonly armourFacing: VehicleArmourFacing;
    forceField: VehicleForceFieldRoll | null;
    righteousFury: VehicleFuryRow[];
}

/** The strike for a hit landing at `located` on a vehicle struck as `profile` describes. */
export function strikeFor(profile: VehicleTargetProfile, located: VehicleHitLocation, tableRollKind: VehicleTableRollKind): VehicleStrike {
    return {
        line: profile.line,
        facing: profile.facing,
        facingAssumed: profile.facingAssumed,
        fromAboveOrBelow: profile.fromAboveOrBelow,
        location: located.location,
        tableRoll: located.tableRoll,
        tableRollKind,
        redirectedFrom: located.redirectedFrom,
        armourFacing: struckArmourFacing(profile.facing, located.location),
        forceField: null,
        righteousFury: [],
    };
}

/** A force field's outcome on a d100 roll: nullified at or under its rating. */
export function forceFieldRollFor(field: VehicleForceField, roll: number): VehicleForceFieldRoll {
    return { rating: field.rating, roll, nullified: roll <= field.rating, source: field.source, overloadUnmodelled: !field.neverOverloads };
}

/** The die a force field's protection roll uses. */
const FORCE_FIELD_DIE = '1d100';

/**
 * Roll the vehicle's trait force field against an attack (the field rolls once
 * when the vehicle is attacked; at or under its rating, the attack is nullified).
 * Null when its traits give it none.
 */
export async function rollVehicleForceField(profile: VehicleTargetProfile): Promise<VehicleForceFieldRoll | null> {
    if (profile.forceField === null) return null;
    const roll = new Roll(FORCE_FIELD_DIE, {});
    await roll.evaluate();
    return forceFieldRollFor(profile.forceField, roll.total ?? 0);
}

/** The slice of a Hit that carries a vehicle strike. */
interface StrikeCarrier {
    vehicleStrike: VehicleStrike | null;
}

/** Record one force-field roll on every hit the attack landed on the vehicle. */
export function stampForceField(hits: readonly StrikeCarrier[], roll: VehicleForceFieldRoll | null): void {
    if (roll === null) return;
    for (const hit of hits) {
        if (hit.vehicleStrike !== null) hit.vehicleStrike.forceField = roll;
    }
}

const FACINGS: ReadonlySet<string> = new Set(['front', 'left', 'right', 'rear']);
const ARMOUR_FACINGS: ReadonlySet<string> = new Set(['front', 'side', 'rear']);

function isFacing(value: string): value is VehicleFacing {
    return FACINGS.has(value);
}

function isArmourFacing(value: string): value is VehicleArmourFacing {
    return ARMOUR_FACINGS.has(value);
}

// eslint-disable-next-line no-restricted-syntax -- boundary: the strike arrives as JSON.parse output of a chat card's data attribute; these guards are its validation
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// eslint-disable-next-line no-restricted-syntax -- boundary: JSON.parse output of a chat card's data attribute
function readForceField(value: unknown): VehicleForceFieldRoll | null {
    if (!isRecord(value)) return null;
    const { rating, roll, nullified, source, overloadUnmodelled } = value;
    if (typeof rating !== 'number' || typeof roll !== 'number' || typeof nullified !== 'boolean' || typeof source !== 'string') return null;
    return { rating, roll, nullified, source, overloadUnmodelled: overloadUnmodelled === true };
}

// eslint-disable-next-line no-restricted-syntax -- boundary: JSON.parse output of a chat card's data attribute
function readFuryRow(value: unknown): VehicleFuryRow | null {
    if (!isRecord(value)) return null;
    const { die, dieSource, rolled, unaffectedBy } = value;
    const chartValue = value['value'];
    if (typeof die !== 'string' || typeof rolled !== 'number' || typeof chartValue !== 'number') return null;
    return {
        die,
        dieSource: typeof dieSource === 'string' ? dieSource : '',
        rolled,
        value: chartValue,
        unaffectedBy: typeof unaffectedBy === 'string' ? unaffectedBy : '',
    };
}

/**
 * The strike a damage card carried in its `data-vehicle-strike` attribute, or null
 * when it carries none or the payload is malformed.
 */
export function parseVehicleStrike(raw: string | undefined): VehicleStrike | null {
    if (raw === undefined || raw === '') return null;
    let parsed: ReturnType<typeof JSON.parse>;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return null;
    }
    if (!isRecord(parsed)) return null;
    const { line, facing, location, tableRoll, tableRollKind, redirectedFrom, armourFacing, forceField, righteousFury, facingAssumed, fromAboveOrBelow } =
        parsed;
    if (typeof line !== 'string' || typeof facing !== 'string' || !isFacing(facing)) return null;
    if (typeof location !== 'string' || !isVehicleLocationId(location)) return null;
    if (typeof armourFacing !== 'string' || !isArmourFacing(armourFacing)) return null;
    const redirected = typeof redirectedFrom === 'string' && isVehicleLocationId(redirectedFrom) ? redirectedFrom : null;
    return {
        line,
        facing,
        facingAssumed: facingAssumed === true,
        fromAboveOrBelow: fromAboveOrBelow === true,
        location,
        tableRoll: typeof tableRoll === 'number' ? tableRoll : 0,
        tableRollKind: tableRollKind === 'reversed' || tableRollKind === 'fresh' ? tableRollKind : 'none',
        redirectedFrom: redirected,
        armourFacing,
        forceField: readForceField(forceField),
        righteousFury: Array.isArray(righteousFury) ? righteousFury.map(readFuryRow).filter((row): row is VehicleFuryRow => row !== null) : [],
    };
}
