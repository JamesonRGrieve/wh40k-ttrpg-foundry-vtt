/**
 * @file Pure view-model builder for the grenade throw dialog and its chat card (#135).
 *
 * Turns a grenade weapon's authored rider (`system.rider`, see `rules/grenade-rider.ts`)
 * and its own stat line into the dialog's picker rows and the card's content: area,
 * damage, qualities, test, duration and effect. Reads no Foundry globals — the labels
 * come through {@link GrenadeLabels} — so the dialog, its story and its tests share it.
 */

import { type GrenadeRiderData, hasGrenadeRider, type RiderDurationKind, riderArea, riderHasTest } from '../../rules/grenade-rider.ts';
import type { I18nKey } from '../../types/i18n-keys';

/** One weapon quality as WeaponData's `qualitiesArray` lists it. */
interface GrenadeQuality {
    label: string;
    level: number | null;
}

/**
 * The weapon fields the view reads (WeaponData's). Optional because an actor's item
 * `system` is typed across every item type; a weapon always carries them.
 */
export interface GrenadeWeaponView {
    rider?: GrenadeRiderData | null;
    effectiveSpecial?: ReadonlySet<string>;
    fullDamageFormula?: string;
    damageTypeAbbr?: string;
    qualitiesArray?: readonly GrenadeQuality[];
}

/** A grenade the thrower carries. */
export interface GrenadeItemView {
    id: string;
    name: string;
    system: GrenadeWeaponView;
}

/** Where the view's words come from: the langpack, and the characteristic names. */
export interface GrenadeLabels {
    localize: (key: I18nKey, params?: Record<string, string | number>) => string;
    characteristic: (key: string) => string;
}

/** One grenade as the dialog's picker and the chat card show it. */
export interface GrenadeChoice {
    id: string;
    name: string;
    /** "6 m radius", or '' when the grenade prints no area. */
    areaLabel: string;
    /** "1d10 X", or '' for a grenade that deals no damage. */
    damage: string;
    qualities: string[];
    hasTest: boolean;
    /** "Agility +10", or the no-test label. */
    testLabel: string;
    /** "1 round per degree of failure", or '' when the rider prints no duration. */
    durationLabel: string;
    /** "+1 to the effect roll per degree of failure (max 10)", or ''. */
    shiftLabel: string;
    /** The heading over the effect: "On a failed test" when there is a test, "Effect" when there is none. */
    effectLabel: string;
    effect: string;
    isSelected: boolean;
}

/** The dialog's render context. */
export interface GrenadeThrowViewContext {
    grenades: GrenadeChoice[];
    selectedId: string;
    selectedGrenade: GrenadeChoice | null;
}

function signed(value: number): string {
    return value >= 0 ? `+${value}` : String(value);
}

function areaLabel(rider: GrenadeRiderData, special: ReadonlySet<string>, labels: GrenadeLabels): string {
    const area = riderArea(rider, special);
    if (area === null) return '';
    return labels.localize(area.measure === 'radius' ? 'WH40K.GrenadeRider.AreaRadius' : 'WH40K.GrenadeRider.AreaDiameter', { size: area.size });
}

function testLabel(rider: GrenadeRiderData, labels: GrenadeLabels): string {
    if (!riderHasTest(rider)) return labels.localize('WH40K.GrenadeRider.NoTest');
    return labels.localize('WH40K.GrenadeRider.TestFormat', {
        characteristic: labels.characteristic(rider.test.characteristic),
        modifier: signed(rider.test.modifier),
    });
}

/** How each printed duration kind reads. */
const DURATION_LABELS: Record<Exclude<RiderDurationKind, ''>, (duration: GrenadeRiderData['duration'], labels: GrenadeLabels) => string> = {
    degreesOfFailure: ({ base }, labels) =>
        base === 0 ? labels.localize('WH40K.GrenadeRider.DurationPerDegree') : labels.localize('WH40K.GrenadeRider.DurationBasePerDegree', { base }),
    roll: ({ formula }, labels) => labels.localize('WH40K.GrenadeRider.DurationRoll', { formula }),
    encounter: (_duration, labels) => labels.localize('WH40K.GrenadeRider.DurationEncounter'),
};

function durationLabel(rider: GrenadeRiderData, labels: GrenadeLabels): string {
    const { kind } = rider.duration;
    return kind === '' ? '' : DURATION_LABELS[kind](rider.duration, labels);
}

function shiftLabel(rider: GrenadeRiderData, labels: GrenadeLabels): string {
    const { perDegree, max } = rider.effectRollShift;
    return perDegree === 0 ? '' : labels.localize('WH40K.GrenadeRider.EffectRollShift', { step: signed(perDegree), max });
}

/** The picker row / card content for one grenade; null when the weapon carries no rider. */
export function buildGrenadeChoice(item: GrenadeItemView, selectedId: string, labels: GrenadeLabels): GrenadeChoice | null {
    const { system } = item;
    if (!hasGrenadeRider(system)) return null;
    const { rider, effectiveSpecial = new Set<string>(), fullDamageFormula = '', damageTypeAbbr = '', qualitiesArray = [] } = system;
    const hasTest = riderHasTest(rider);
    return {
        id: item.id,
        name: item.name,
        areaLabel: areaLabel(rider, effectiveSpecial, labels),
        damage: fullDamageFormula === '' ? '' : `${fullDamageFormula} ${damageTypeAbbr}`.trim(),
        qualities: qualitiesArray.map((quality) => (quality.level === null ? quality.label : `${quality.label} (${quality.level})`)),
        hasTest,
        testLabel: testLabel(rider, labels),
        durationLabel: durationLabel(rider, labels),
        shiftLabel: shiftLabel(rider, labels),
        effectLabel: labels.localize(hasTest ? 'WH40K.GrenadeRider.OnFailedTest' : 'WH40K.GrenadeRider.Effect'),
        effect: rider.effect,
        isSelected: item.id === selectedId,
    };
}

/** A grenade's rider as the damage card states it, after the damage it follows (#622). */
export interface DamageCardRider {
    rider: GrenadeChoice;
    /** The names of the creatures the attack struck, once each, in the order struck. */
    struck: string[];
}

/**
 * The rider a damage card states: the weapon's rider and who the attack struck. Null when
 * the weapon carries no rider (or the roll was no weapon's).
 */
export function buildDamageCardRider(item: GrenadeItemView | null, struck: readonly string[], labels: GrenadeLabels): DamageCardRider | null {
    if (item === null) return null;
    const rider = buildGrenadeChoice(item, item.id, labels);
    return rider === null ? null : { rider, struck: [...new Set(struck.filter((name) => name !== ''))] };
}

/** The dialog context: every rider grenade the thrower carries, with `selectedId` (or the first) selected. */
export function buildGrenadeThrowContext(items: readonly GrenadeItemView[], selectedId: string, labels: GrenadeLabels): GrenadeThrowViewContext {
    const riders = items.filter((item) => hasGrenadeRider(item.system));
    const selected = riders.some((item) => item.id === selectedId) ? selectedId : riders[0]?.id ?? '';
    const grenades = riders.map((item) => buildGrenadeChoice(item, selected, labels)).filter((choice): choice is GrenadeChoice => choice !== null);
    return { grenades, selectedId: selected, selectedGrenade: grenades.find((choice) => choice.isSelected) ?? null };
}
