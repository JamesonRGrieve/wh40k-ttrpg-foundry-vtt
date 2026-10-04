import { BODY_LOCATIONS, type BodyLocationId } from '../data/shared/body-locations.ts';
import type { I18nKey } from '../types/i18n-keys';
import { findBandBy } from './_dice.ts';

/** Stable hit-location identifier (`rightArm`, …): what a hit and a called shot store; labels resolve via {@link hitLocationLabel}. */
export type HitLocationId = BodyLocationId;

/** A hit location's langpack keys and Table 7-3 reversed-roll band. */
interface HitLocationDef {
    /** Full display name ("Right Arm"). */
    readonly labelKey: I18nKey;
    /** Compact display name for tight layouts ("R.Arm"). */
    readonly shortLabelKey: I18nKey;
    /** Letter abbreviation ("RA"). */
    readonly abbrKey: I18nKey;
    readonly min: number;
    readonly max: number;
}

/**
 * Labels and Table 7-3 bands for every location id. Keyed by the shared
 * {@link BODY_LOCATIONS} ids, so the compiler rejects a missing or unknown
 * location — ids, labels and bands cannot drift apart.
 */
const HIT_LOCATION_DEFS: Record<HitLocationId, HitLocationDef> = {
    head: { labelKey: 'WH40K.BodyLocation.Head', shortLabelKey: 'WH40K.BodyLocation.Head', abbrKey: 'WH40K.BodyLocation.Abbr.Head', min: 0, max: 10 },
    rightArm: {
        labelKey: 'WH40K.BodyLocation.RightArm',
        shortLabelKey: 'WH40K.ArmourSilhouette.ShortRightArm',
        abbrKey: 'WH40K.BodyLocation.Abbr.RightArm',
        min: 11,
        max: 20,
    },
    leftArm: {
        labelKey: 'WH40K.BodyLocation.LeftArm',
        shortLabelKey: 'WH40K.ArmourSilhouette.ShortLeftArm',
        abbrKey: 'WH40K.BodyLocation.Abbr.LeftArm',
        min: 21,
        max: 30,
    },
    body: { labelKey: 'WH40K.BodyLocation.Body', shortLabelKey: 'WH40K.BodyLocation.Body', abbrKey: 'WH40K.BodyLocation.Abbr.Body', min: 31, max: 70 },
    rightLeg: {
        labelKey: 'WH40K.BodyLocation.RightLeg',
        shortLabelKey: 'WH40K.ArmourSilhouette.ShortRightLeg',
        abbrKey: 'WH40K.BodyLocation.Abbr.RightLeg',
        min: 71,
        max: 85,
    },
    leftLeg: {
        labelKey: 'WH40K.BodyLocation.LeftLeg',
        shortLabelKey: 'WH40K.ArmourSilhouette.ShortLeftLeg',
        abbrKey: 'WH40K.BodyLocation.Abbr.LeftLeg',
        min: 86,
        max: 100,
    },
};

/** Location ids in Table 7-3 (d100) order. */
export const HIT_LOCATION_IDS: readonly HitLocationId[] = [...BODY_LOCATIONS].sort((a, b) => HIT_LOCATION_DEFS[a].min - HIT_LOCATION_DEFS[b].min);

/** Where a hit lands when no location was rolled, called, or recognised. */
export const DEFAULT_HIT_LOCATION: HitLocationId = 'body';

/**
 * Resolve a stored or authored location value to its stable id. Accepts an id
 * (`rightArm`) and the legacy English display names older chat messages and
 * authored content carry (`Right Arm`), matched ignoring case and whitespace.
 * Returns undefined when the value names no hit location.
 */
export function resolveHitLocationId(value: string | null | undefined): HitLocationId | undefined {
    if (typeof value !== 'string') return undefined;
    const folded = value.replace(/\s/g, '').toLowerCase();
    return BODY_LOCATIONS.find((id) => id.toLowerCase() === folded);
}

/** Langpack key of the full name of the location a stored or authored value names, or undefined when it names none. */
export function hitLocationLabelKey(value: string): I18nKey | undefined {
    const id = resolveHitLocationId(value);
    return id === undefined ? undefined : HIT_LOCATION_DEFS[id].labelKey;
}

/** Localized full name of a hit location; an unresolvable value is returned unchanged. */
export function hitLocationLabel(value: string): string {
    const key = hitLocationLabelKey(value);
    return key === undefined ? value : game.i18n.localize(key);
}

/** Localized compact name of a hit location ("R.Arm"). */
export function hitLocationShortLabel(id: HitLocationId): string {
    return game.i18n.localize(HIT_LOCATION_DEFS[id].shortLabelKey);
}

/** Localized letter abbreviation of a hit location ("RA"). */
export function hitLocationAbbreviation(id: HitLocationId): string {
    return game.i18n.localize(HIT_LOCATION_DEFS[id].abbrKey);
}

/** The Table 7-3 reversed-roll band of a location, as the printed `01-10` / `86-00` range. */
export function hitLocationRollRange(id: HitLocationId): string {
    const { min, max } = HIT_LOCATION_DEFS[id];
    const printed = (n: number): string => String(n === 100 ? 0 : n === 0 ? 1 : n).padStart(2, '0');
    return `${printed(min)}-${printed(max)}`;
}

/**
 * Reverse the digits of a d100 attack-roll result to derive the hit-
 * location lookup index per core.md L10372-10390 (Table 7-3).
 *
 * Examples: 23 → 32 (Body), 47 → 74 (Right Leg), 100 → 001 → 1 (Head).
 * Doubles / palindromes (33, 55) pass through unchanged.
 *
 * Pure — extracted from `getHitLocationForRoll` so the reversal math is
 * unit-testable without the Foundry `game` runtime.
 */
export function reverseAttackRollDigits(roll: number): number {
    const normalised = Number.isFinite(roll) ? Math.trunc(roll) : 0;
    return parseInt(normalised.toString().split('').reverse().join(''), 10);
}

export function getHitLocationForRoll(roll: number): HitLocationId | undefined {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- boundary: game.wh40k may be undefined in pure-rules tests; guard is intentional
    if (typeof game !== 'undefined' && game.wh40k !== undefined) {
        game.wh40k.log('getHitLocationForRoll', roll);
    }
    const reverseInt = reverseAttackRollDigits(roll);
    // Route the inclusive [min,max] band lookup through the shared findBandBy (#472);
    // clamp:false preserves the original .find() semantics (undefined when out of band).
    return findBandBy(creatureHitLocations(), reverseInt, (i): readonly [number, number] => [i.min, i.max], { clamp: false })?.id;
}

/** Called-shot / assign-damage location dropdown: location id → localized label. */
export function hitDropdown(): Record<string, string> {
    const dropdown: Record<string, string> = {};
    for (const id of HIT_LOCATION_IDS) {
        dropdown[id] = game.i18n.localize(HIT_LOCATION_DEFS[id].labelKey);
    }
    return dropdown;
}

/** Ordered location ids (the dropdown's option values; `[0]` is the called-shot default). */
export function hitLocationNames(): HitLocationId[] {
    return [...HIT_LOCATION_IDS];
}

/** Table 7-2: the location each additional hit of a multi-hit attack lands on, by initial location. */
export function additionalHitLocations(): Record<HitLocationId, HitLocationId[]> {
    return {
        head: ['head', 'head', 'rightArm', 'body', 'leftArm', 'body'],
        rightArm: ['rightArm', 'rightArm', 'body', 'head', 'body', 'rightArm'],
        leftArm: ['leftArm', 'leftArm', 'body', 'head', 'body', 'leftArm'],
        body: ['body', 'body', 'leftArm', 'head', 'rightArm', 'body'],
        rightLeg: ['rightLeg', 'rightLeg', 'body', 'rightArm', 'head', 'body'],
        leftLeg: ['leftLeg', 'leftLeg', 'body', 'leftArm', 'head', 'body'],
    };
}

export function creatureHitLocations(): { id: HitLocationId; min: number; max: number }[] {
    return HIT_LOCATION_IDS.map((id) => ({ id, min: HIT_LOCATION_DEFS[id].min, max: HIT_LOCATION_DEFS[id].max }));
}
