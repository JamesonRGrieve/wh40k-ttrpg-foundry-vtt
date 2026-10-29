/**
 * The rows a vehicle hit prints on the damage and assign cards (content#28): the
 * facing struck, where on the vehicle, the armour that facing reads after
 * Penetration, the trait force field's roll, the Structural Integrity it costs,
 * the Critical damage past it and the trait that halves it, the chart rows it
 * lands on and Righteous Fury's. Every number carries where it came from — a
 * hover shows its parts, and each trait that changed it is named.
 *
 * Pure: the caller passes the localiser, so the rows are unit-tested without
 * Foundry. Chart text (`html`) only ever comes from a pack lookup, never from a
 * card attribute.
 */

import {
    type VehicleArmourFacing,
    type VehicleDamageOutcome,
    type VehicleFacing,
    isVehicleLocationId,
    type VehicleLocationId,
    vehicleFacingLabelKey,
    vehicleLocationLabelKey,
} from '../rules/vehicle-damage.ts';
import type { I18nKey } from '../types/i18n-keys.d.ts';
import { prepareModifierTooltipData } from '../utils/modifier-tooltip.ts';
import type { VehicleCritLookup } from './vehicle-critical-tables.ts';
import { readVehicleDurability, type VehicleForceFieldRoll, type VehicleFuryResult, type VehicleStrike } from './vehicle-strike.ts';

/** One printed row. `html` is trusted chart text from a pack; `note` is plain text. */
export interface VehicleCardRow {
    readonly hook: string;
    readonly label: string;
    readonly value: string;
    readonly note: string;
    readonly html: string;
    /** `data-wh40k-tooltip-data` for a hoverable row, '' for none. */
    readonly tooltip: string;
    /** A Righteous Fury row's Damage Control re-roll request (JSON), '' when it offers none. */
    readonly control: string;
}

/** The localiser the rows read. */
export interface CardLocaliser {
    localize: (key: I18nKey) => string;
    format: (key: I18nKey, data: Record<string, string>) => string;
}

/** The runtime langpack, or a key echo under unit tests. */
export function cardLocaliser(): CardLocaliser {
    // eslint-disable-next-line no-restricted-syntax -- boundary: `game` is the Foundry runtime global; the damage layer also runs under unit tests where it is absent
    const i18n = (globalThis as { game?: { i18n?: { localize: (key: string) => string; format: (key: string, data: Record<string, string>) => string } } }).game
        ?.i18n;
    return {
        localize: (key) => i18n?.localize(key) ?? key,
        format: (key, data) => i18n?.format(key, data) ?? key,
    };
}

const ARMOUR_FACING_KEYS: Readonly<Record<VehicleArmourFacing, I18nKey>> = {
    front: 'WH40K.Vehicle.ArmourFront',
    side: 'WH40K.Vehicle.ArmourSide',
    rear: 'WH40K.Vehicle.ArmourRear',
};

function row(hook: string, label: string, value: string, extra: Partial<Pick<VehicleCardRow, 'note' | 'html' | 'tooltip' | 'control'>> = {}): VehicleCardRow {
    return { hook, label, value, note: extra.note ?? '', html: extra.html ?? '', tooltip: extra.tooltip ?? '', control: extra.control ?? '' };
}

/** How the struck facing was read. */
interface FacingReading {
    readonly facing: VehicleFacing;
    readonly facingAssumed: boolean;
    readonly fromAboveOrBelow: boolean;
}

function facingNoteKey(reading: FacingReading): I18nKey {
    if (reading.fromAboveOrBelow) return 'WH40K.Vehicle.Damage.FacingAboveOrBelow';
    return reading.facingAssumed ? 'WH40K.Vehicle.Damage.FacingAssumed' : 'WH40K.Vehicle.Damage.FacingFromPosition';
}

function facingRow(reading: FacingReading, i18n: CardLocaliser): VehicleCardRow {
    return row('vehicle-facing', i18n.localize('WH40K.Vehicle.Damage.Facing'), i18n.localize(vehicleFacingLabelKey(reading.facing)), {
        note: i18n.localize(facingNoteKey(reading)),
    });
}

function locationNote(strike: VehicleStrike, i18n: CardLocaliser): string {
    if (strike.redirectedFrom !== null) {
        return i18n.format('WH40K.Vehicle.Damage.LocationRedirected', {
            roll: String(strike.tableRoll),
            rolled: i18n.localize(vehicleLocationLabelKey(strike.redirectedFrom)),
        });
    }
    if (strike.tableRollKind === 'reversed') return i18n.format('WH40K.Vehicle.Damage.LocationReversed', { roll: String(strike.tableRoll) });
    if (strike.tableRollKind === 'fresh') return i18n.format('WH40K.Vehicle.Damage.LocationFresh', { roll: String(strike.tableRoll) });
    return i18n.localize('WH40K.Vehicle.Damage.LocationSingleChart');
}

const FIELD_CRAFTSMANSHIP_KEYS: ReadonlyMap<string, I18nKey> = new Map<string, I18nKey>([
    ['poor', 'WH40K.Craftsmanship.Poor'],
    ['common', 'WH40K.Craftsmanship.Common'],
    ['good', 'WH40K.Craftsmanship.Good'],
    ['best', 'WH40K.Craftsmanship.Best'],
]);

/** What the field's roll did beyond stopping the attack or not: overloaded, or an overload the trait leaves to the GM. */
function overloadNote(field: VehicleForceFieldRoll, i18n: CardLocaliser): string {
    if (field.overloaded && field.overloadMax !== null) {
        const craftsmanship = FIELD_CRAFTSMANSHIP_KEYS.get(field.craftsmanship);
        return i18n.format('WH40K.Vehicle.Damage.ForceFieldOverloaded', {
            max: String(field.overloadMax).padStart(2, '0'),
            craftsmanship: craftsmanship === undefined ? '' : i18n.localize(craftsmanship),
        });
    }
    return field.overloadUnmodelled ? i18n.localize('WH40K.Vehicle.Damage.ForceFieldOverload') : '';
}

function forceFieldRow(field: VehicleForceFieldRoll, i18n: CardLocaliser): VehicleCardRow {
    if (field.bypassedBy !== '') {
        const quality = `${field.bypassedBy.charAt(0).toUpperCase()}${field.bypassedBy.slice(1)}`;
        return row('vehicle-force-field', field.source, i18n.localize('WH40K.Vehicle.Damage.ForceFieldBypassed'), {
            note: i18n.format('WH40K.Vehicle.Damage.ForceFieldBypassedBy', { quality }),
        });
    }
    const data = { roll: String(field.roll), rating: String(field.rating) };
    return row(
        'vehicle-force-field',
        field.source,
        i18n.localize(field.nullified ? 'WH40K.Vehicle.Damage.ForceFieldNullified' : 'WH40K.Vehicle.Damage.ForceFieldFailed'),
        {
            note: [i18n.format('WH40K.Vehicle.Damage.ForceFieldRoll', data), overloadNote(field, i18n)].filter((part) => part !== '').join(' '),
        },
    );
}

/** Damage Control on the struck vehicle: its trait, and where a re-roll request finds the vehicle and the hit. */
export interface DamageControlOffer {
    readonly trait: string;
    readonly vehicleUuid: string;
    readonly hitIndex: number;
}

/** What Damage Control's re-roll button asks for: which Righteous Fury roll, on which vehicle's chart. */
export interface DamageControlRequest {
    readonly vehicleUuid: string;
    readonly trait: string;
    readonly line: string;
    readonly location: VehicleLocationId;
    readonly die: string;
    /** Identifies the roll within its card (`<hit>.<fury>`), so it is re-rolled once. */
    readonly key: string;
}

/** The request a fury row's button carries, from the offer and the struck location. */
function damageControlRequest(offer: DamageControlOffer, strike: VehicleStrike, fury: VehicleFuryResult, furyIndex: number): string {
    const request: DamageControlRequest = {
        vehicleUuid: offer.vehicleUuid,
        trait: offer.trait,
        line: strike.line,
        location: strike.location,
        die: fury.die,
        key: `${offer.hitIndex}.${furyIndex}`,
    };
    return JSON.stringify(request);
}

/** The Damage Control request a button carried, or null when it is malformed. */
export function parseDamageControlRequest(raw: string | undefined): DamageControlRequest | null {
    if (raw === undefined || raw === '') return null;
    let parsed: ReturnType<typeof JSON.parse>;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return null;
    }
    if (typeof parsed !== 'object' || parsed === null) return null;
    if (!('vehicleUuid' in parsed && 'trait' in parsed && 'line' in parsed && 'location' in parsed && 'die' in parsed && 'key' in parsed)) return null;
    const { vehicleUuid, trait, line, location, die, key } = parsed;
    if (typeof vehicleUuid !== 'string' || typeof trait !== 'string' || typeof line !== 'string' || typeof die !== 'string' || typeof key !== 'string')
        return null;
    if (typeof location !== 'string' || !isVehicleLocationId(location)) return null;
    return { vehicleUuid, trait, line, location, die, key };
}

function furyRows(
    furies: readonly VehicleFuryResult[],
    i18n: CardLocaliser,
    control: (fury: VehicleFuryResult, index: number) => string = () => '',
): VehicleCardRow[] {
    return furies.map((fury, index) => {
        const notes = [
            fury.dieSource === '' ? '' : i18n.format('WH40K.Vehicle.Damage.FuryDieSource', { trait: fury.dieSource, die: fury.die }),
            fury.unaffectedBy === '' ? '' : i18n.format('WH40K.Vehicle.Damage.FuryUnaffected', { traits: fury.unaffectedBy }),
            fury.value === fury.rolled ? '' : i18n.format('WH40K.Vehicle.Damage.FuryReadAt', { value: String(fury.value) }),
            i18n.localize('WH40K.Vehicle.Damage.FuryNotCritical'),
            fury.critical === null
                ? i18n.localize('WH40K.Vehicle.Damage.ChartMissing')
                : i18n.format('WH40K.Vehicle.Damage.ChartRow', { chart: fury.critical.chartName, value: String(fury.value) }),
        ];
        return row('vehicle-righteous-fury', i18n.format('WH40K.Vehicle.Damage.Fury', { die: fury.die }), String(fury.rolled), {
            note: notes.filter((note) => note !== '').join(' '),
            html: fury.critical?.text ?? '',
            control: control(fury, index),
        });
    });
}

/**
 * The card a Damage Control re-roll posts: the trait that re-rolled, and the new
 * roll's chart row. "The second result must be accepted even if it is worse than
 * the first" (OW core; DH2 core prints the same re-roll).
 */
export function damageControlCardRows(request: DamageControlRequest, fury: VehicleFuryResult, i18n: CardLocaliser): VehicleCardRow[] {
    return [
        row('vehicle-damage-control', request.trait, i18n.localize('WH40K.Vehicle.Damage.DamageControlRerolled'), {
            note: i18n.localize('WH40K.Vehicle.Damage.DamageControlStands'),
        }),
        ...furyRows([fury], i18n),
    ];
}

/** What the damage card knows of a vehicle hit. */
export interface VehicleDamageCardInput {
    readonly strike: VehicleStrike;
    /** The struck facing's printed armour. */
    readonly facingArmour: number;
    readonly coverAP: number;
    readonly penetration: number;
    readonly damage: number;
    readonly armourIgnored: boolean;
    /** Righteous Fury rows, with their chart text. */
    readonly furies: readonly VehicleFuryResult[];
    /** Damage Control on the vehicle, which offers each Righteous Fury roll a re-roll; null without it. */
    readonly damageControl: DamageControlOffer | null;
}

/** The damage card's vehicle rows: facing, location, armour, force field, Integrity damage, Righteous Fury. */
export function vehicleDamageCardRows(input: VehicleDamageCardInput, i18n: CardLocaliser): VehicleCardRow[] {
    const { strike } = input;
    const facingName = i18n.format('WH40K.Vehicle.Damage.ArmourOf', { facing: i18n.localize(ARMOUR_FACING_KEYS[strike.armourFacing]) });
    const usableArmour = input.armourIgnored ? 0 : Math.max(0, input.facingArmour + input.coverAP - Math.max(0, input.penetration));
    const nullified = strike.forceField?.nullified === true;
    const effective = nullified ? 0 : Math.max(0, input.damage - usableArmour);
    const armourParts = [
        { name: facingName, value: input.facingArmour },
        ...(input.coverAP === 0 ? [] : [{ name: i18n.localize('WH40K.Vehicle.Damage.Cover'), value: input.coverAP }]),
        { name: i18n.localize('WH40K.Combat.Penetration'), value: -Math.min(input.facingArmour + input.coverAP, Math.max(0, input.penetration)) },
    ];
    const rows = [
        facingRow(strike, i18n),
        row('vehicle-location', i18n.localize('WH40K.Vehicle.Damage.Location'), i18n.localize(vehicleLocationLabelKey(strike.location)), {
            note: locationNote(strike, i18n),
        }),
        row('vehicle-armour', facingName, String(usableArmour), {
            note: [
                strike.location === 'turret' ? i18n.localize('WH40K.Vehicle.Damage.TurretFront') : '',
                input.armourIgnored ? i18n.localize('WH40K.Vehicle.Damage.ArmourIgnored') : '',
            ]
                .filter((note) => note !== '')
                .join(' '),
            tooltip: input.armourIgnored ? '' : prepareModifierTooltipData(facingName, armourParts),
        }),
    ];
    if (strike.forceField !== null) rows.push(forceFieldRow(strike.forceField, i18n));
    rows.push(
        row('vehicle-integrity-damage', i18n.localize('WH40K.Vehicle.Damage.IntegrityDamage'), String(effective), {
            tooltip: prepareModifierTooltipData(i18n.localize('WH40K.Vehicle.Damage.IntegrityDamage'), [
                { name: i18n.localize('WH40K.Weapon.Damage'), value: input.damage },
                { name: facingName, value: -usableArmour },
            ]),
        }),
    );
    const offer = input.damageControl;
    return [...rows, ...furyRows(input.furies, i18n, (fury, index) => (offer === null ? '' : damageControlRequest(offer, strike, fury, index)))];
}

/** The slice of a Hit the damage card's vehicle rows are stamped on. */
interface VehicleRowsCarrier {
    readonly vehicleStrike: VehicleStrike | null;
    readonly coverAP: number;
    readonly totalPenetration: number;
    readonly totalDamage: number;
    readonly armourIgnored: boolean;
    vehicleRows: VehicleCardRow[];
    vehicleStrikeData: string;
}

/**
 * Stamp a vehicle hit (content#28) with its damage-card rows and the strike its
 * Assign Damage button carries. A hit on anything but a craft is left alone. A
 * craft with Damage Control offers each Righteous Fury roll a re-roll (#678).
 * @param vehicle  The struck actor: its UUID and `system`.
 * @param hitIndex  The hit's place on the card, which keys its re-rolls.
 * @param furies  The hit's Righteous Fury rows, with their chart text already read.
 */
export function stampVehicleRows(
    hit: VehicleRowsCarrier,
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry Actor `system` is a per-type DataModel; readVehicleDurability narrows it to a conventional craft
    vehicle: { uuid: string | null; system: unknown },
    hitIndex: number,
    furies: readonly VehicleFuryResult[],
): void {
    const strike = hit.vehicleStrike;
    const durability = readVehicleDurability(vehicle.system);
    if (strike === null || durability === null) return;
    const damageControl =
        durability.traitEffects.rerollRighteousFuryCrit && vehicle.uuid !== null
            ? { trait: durability.traitEffects.sources.rerollRighteousFuryCrit, vehicleUuid: vehicle.uuid, hitIndex }
            : null;
    hit.vehicleRows = vehicleDamageCardRows(
        {
            strike,
            facingArmour: durability.armour[strike.armourFacing].value,
            coverAP: hit.coverAP,
            penetration: hit.totalPenetration,
            damage: hit.totalDamage,
            armourIgnored: hit.armourIgnored,
            furies,
            damageControl,
        },
        cardLocaliser(),
    );
    hit.vehicleStrikeData = JSON.stringify(strike);
}

/** What a hit did to a vehicle, as the assign card states it. */
export interface VehicleDamageApplied {
    readonly facing: VehicleFacing;
    readonly facingAssumed: boolean;
    readonly fromAboveOrBelow: boolean;
    readonly armourFacing: VehicleArmourFacing;
    readonly location: VehicleLocationId;
    readonly outcome: VehicleDamageOutcome;
    readonly integrityBefore: number;
    readonly integrityMax: number;
    readonly criticalBefore: number;
    /** The traits behind the crit multiplier, for its provenance row. */
    readonly critSources: readonly string[];
    /** The chart row the cumulative Critical damage lands on; null with no Critical damage or no chart. */
    readonly critical: VehicleCritLookup | null;
    /** Critical damage was taken but the line's packs carry no chart for it. */
    readonly criticalChartMissing: boolean;
    /** The force field that nullified the hit, or null. */
    readonly nullifiedBy: VehicleForceFieldRoll | null;
    /** The Righteous Fury chart rows the hit applies. */
    readonly righteousFury: readonly VehicleFuryResult[];
    /** Righteous Fury rolled but the line needs a damaging hit, and this one dealt none. */
    readonly righteousFuryLost: boolean;
}

/** The assign card's vehicle rows: Integrity, the excess, the trait multiplier, Critical damage and its chart row, Righteous Fury. */
export function vehicleAssignCardRows(applied: VehicleDamageApplied, i18n: CardLocaliser): VehicleCardRow[] {
    const { outcome } = applied;
    const integrityLabel = i18n.localize('WH40K.Vehicle.Damage.Integrity');
    const rows: VehicleCardRow[] = [facingRow(applied, i18n)];
    rows.push(row('vehicle-location', i18n.localize('WH40K.Vehicle.Damage.Location'), i18n.localize(vehicleLocationLabelKey(applied.location))));
    if (applied.nullifiedBy !== null) rows.push(forceFieldRow(applied.nullifiedBy, i18n));
    rows.push(
        row(
            'vehicle-integrity',
            integrityLabel,
            i18n.format('WH40K.Vehicle.Damage.IntegrityValue', {
                before: String(applied.integrityBefore),
                after: String(outcome.integrityAfter),
                max: String(applied.integrityMax),
            }),
            {
                tooltip: prepareModifierTooltipData(integrityLabel, [
                    { name: i18n.localize('WH40K.Vehicle.Damage.IntegrityBefore'), value: applied.integrityBefore },
                    { name: i18n.localize('WH40K.Vehicle.Damage.IntegrityDamage'), value: -outcome.integrityLoss },
                ]),
            },
        ),
    );
    if (outcome.excess > 0) {
        rows.push(row('vehicle-excess', i18n.localize('WH40K.Vehicle.Damage.Excess'), String(outcome.excess)));
        if (outcome.critMultiplier !== null) {
            rows.push(
                row(
                    'vehicle-crit-multiplier',
                    applied.critSources.join(', '),
                    i18n.format('WH40K.Vehicle.Damage.MultiplierValue', { factor: String(outcome.critMultiplier), taken: String(outcome.criticalTaken) }),
                    { note: i18n.localize('WH40K.Vehicle.Damage.MultiplierNote') },
                ),
            );
        }
        const criticalLabel = i18n.localize('WH40K.Vehicle.Damage.Critical');
        rows.push(
            row(
                'vehicle-critical',
                criticalLabel,
                i18n.format('WH40K.Vehicle.Damage.CriticalValue', {
                    before: String(applied.criticalBefore),
                    taken: String(outcome.criticalTaken),
                    after: String(outcome.criticalAfter),
                }),
                {
                    note:
                        applied.critical === null
                            ? i18n.localize('WH40K.Vehicle.Damage.ChartMissing')
                            : i18n.format('WH40K.Vehicle.Damage.ChartRow', { chart: applied.critical.chartName, value: String(outcome.criticalAfter) }),
                    html: applied.critical?.text ?? '',
                    tooltip: prepareModifierTooltipData(criticalLabel, [
                        { name: i18n.localize('WH40K.Vehicle.Damage.CriticalBefore'), value: applied.criticalBefore },
                        { name: i18n.localize('WH40K.Vehicle.Damage.CriticalTaken'), value: outcome.criticalTaken },
                    ]),
                },
            ),
        );
    }
    if (applied.righteousFuryLost)
        rows.push(row('vehicle-fury-lost', i18n.localize('WH40K.RighteousFury.Triggered'), i18n.localize('WH40K.Vehicle.Damage.FuryLost')));
    return [...rows, ...furyRows(applied.righteousFury, i18n)];
}
