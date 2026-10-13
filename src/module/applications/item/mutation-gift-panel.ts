/**
 * @file View model for the Gift of the Gods panel on the mutation sheet (#597).
 *
 * The `system.gift` block of a `mutation` item (shape: {@link GiftData} in
 * `rules/bc-gifts.ts`) is edited through this panel, which renders only when the
 * mutation's category is {@link GIFT_MUTATION_CATEGORY}. Every other mutation
 * gets no panel and renders exactly as before.
 *
 * Pure: the sheet supplies the stored data, the item's embedded effects, the
 * characteristic table and a UUID → name resolver.
 */

import {
    GIFT_ALIGNMENTS,
    GIFT_MUTATION_CATEGORY,
    GIFT_ROLL_DIRECTIONS,
    GIFT_SUB_TABLES,
    type GiftAlignment,
    type GiftCharacteristicRoll,
    type GiftData,
    type GiftRider,
    type GiftSubTable,
} from '../../rules/bc-gifts.ts';
import {
    buildReferenceList,
    type EffectChoice,
    type FormObject,
    effectName,
    effectOptions,
    type LiteralOption,
    type ReferenceListContext,
    type SelectOption,
    type UuidNameResolver,
} from './reference-list-edits.ts';

/** Drop-zone accept tokens for the items a Gift grants. */
export const GIFT_GRANT_ACCEPT = 'trait,talent';

/** A characteristic as `CONFIG.wh40k.characteristics` declares it. */
export interface CharacteristicConfig {
    label: string;
    abbreviation: string;
}

/** One characteristic input of a rider's delta grid. */
interface RiderCharacteristicInput {
    key: string;
    labelKey: string;
    abbreviation: string;
    path: string;
    /** Stored delta; `''` when the rider leaves this characteristic alone. */
    value: number | '';
}

/** One rider of the panel. */
interface RiderView {
    index: number;
    alignmentPath: string;
    alignmentLabelKey: string;
    alignmentOptions: SelectOption[];
    descriptionPath: string;
    description: string;
    characteristics: RiderCharacteristicInput[];
    /** The rider's non-zero deltas, for read-only display. */
    deltas: Array<{ abbreviation: string; value: string }>;
    grants: ReferenceListContext;
    activeEffectPath: string;
    activeEffectOptions: LiteralOption[];
    activeEffectName: string;
}

/** One acquisition roll of the panel. */
interface CharacteristicRollView {
    index: number;
    characteristicPath: string;
    characteristicOptions: SelectOption[];
    characteristicLabelKey: string;
    formulaPath: string;
    formula: string;
    directionPath: string;
    directionOptions: SelectOption[];
    directionLabelKey: string;
}

/** Context of `mutation-gift-panel.hbs`. */
export interface GiftPanelContext {
    grants: ReferenceListContext;
    riders: RiderView[];
    /** False once every Ruinous Power has a rider — riders never stack per alignment. */
    canAddRider: boolean;
    subTablePath: string;
    subTableOptions: SelectOption[];
    subTableLabelKey: string;
    rolls: CharacteristicRollView[];
}

/** Langpack key of a rider alignment (`khorne` → `WH40K.BC.Gifts.Rider.Khorne`). */
export function riderAlignmentLabelKey(alignment: GiftAlignment): string {
    return `WH40K.BC.Gifts.Rider.${capitalize(alignment)}`;
}

/** Langpack key of a sub-table reference; `''` reads as "none". */
export function subTableLabelKey(subTable: GiftSubTable): string {
    return subTable === '' ? 'WH40K.ItemSheet.Gift.SubTableNone' : `WH40K.BC.Gifts.SubTable.${capitalize(subTable)}`;
}

/** The first alignment no rider uses yet, or `null` when all four are taken. */
export function nextRiderAlignment(riders: readonly Pick<GiftRider, 'alignment'>[]): GiftAlignment | null {
    return GIFT_ALIGNMENTS.find((alignment) => !riders.some((rider) => rider.alignment === alignment)) ?? null;
}

/** A blank rider for `alignment`. */
export function newGiftRider(alignment: GiftAlignment): GiftRider & FormObject {
    return { alignment, description: '', characteristics: {}, skills: {}, grants: [], activeEffect: '' };
}

/**
 * Formula a newly added acquisition roll starts with. The schema rejects a blank
 * formula, so a new row needs a valid placeholder for the GM to overwrite.
 */
export const NEW_ROLL_FORMULA = '1d10';

/** A new acquisition roll on the first characteristic of the table, or `null` when the table is empty. */
export function newCharacteristicRoll(characteristicKeys: readonly string[]): (GiftCharacteristicRoll & FormObject) | null {
    const characteristic = characteristicKeys.at(0);
    if (characteristic === undefined) return null;
    return { characteristic, formula: NEW_ROLL_FORMULA, direction: GIFT_ROLL_DIRECTIONS[0] };
}

/**
 * Whether a mutation shows the Gift panel. Only a Gift of the Gods does; a
 * mutation of any other category (every Dark Heresy mutation) never does.
 */
export function showsGiftPanel(category: string): boolean {
    return category === GIFT_MUTATION_CATEGORY;
}

/** Build the panel context from a Gift's stored `system.gift` block. */
export function buildGiftPanelContext(args: {
    gift: GiftData;
    characteristics: Readonly<Record<string, CharacteristicConfig>>;
    effects: readonly EffectChoice[];
    resolveName: UuidNameResolver;
}): GiftPanelContext {
    const { gift, characteristics, effects, resolveName } = args;
    const table = new Map(Object.entries(characteristics));
    const characteristicKeys = [...table.keys()];
    // An unknown key (data authored for another line's table) shows raw rather than vanishing.
    const characteristicLabel = (key: string): string => table.get(key)?.label ?? key;
    const characteristicAbbreviation = (key: string): string => table.get(key)?.abbreviation ?? key;

    const riders = gift.riders.map((rider, index): RiderView => {
        const prefix = `system.gift.riders.${index}`;
        return {
            index,
            alignmentPath: `${prefix}.alignment`,
            alignmentLabelKey: riderAlignmentLabelKey(rider.alignment),
            alignmentOptions: GIFT_ALIGNMENTS.map((alignment) => ({
                value: alignment,
                labelKey: riderAlignmentLabelKey(alignment),
                selected: alignment === rider.alignment,
            })),
            descriptionPath: `${prefix}.description`,
            description: rider.description,
            characteristics: characteristicKeys.map((key) => {
                const stored = rider.characteristics[key];
                return {
                    key,
                    labelKey: characteristicLabel(key),
                    abbreviation: characteristicAbbreviation(key),
                    path: `${prefix}.characteristics.${key}`,
                    value: typeof stored === 'number' && Number.isFinite(stored) ? stored : '',
                };
            }),
            deltas: Object.entries(rider.characteristics)
                .filter(([, value]) => Number.isFinite(value) && value !== 0)
                .map(([key, value]) => ({ abbreviation: characteristicAbbreviation(key), value: value > 0 ? `+${value}` : String(value) })),
            grants: buildReferenceList({
                path: `${prefix}.grants`,
                mode: 'list',
                accept: GIFT_GRANT_ACCEPT,
                stored: rider.grants,
                resolveName,
                emptyKey: 'WH40K.ItemSheet.Gift.NoGrants',
                dropKey: 'WH40K.ItemSheet.Gift.DropGrant',
            }),
            activeEffectPath: `${prefix}.activeEffect`,
            activeEffectOptions: effectOptions(effects, rider.activeEffect),
            activeEffectName: effectName(effects, rider.activeEffect),
        };
    });

    const rolls = gift.characteristicRolls.map((roll, index): CharacteristicRollView => {
        const prefix = `system.gift.characteristicRolls.${index}`;
        return {
            index,
            characteristicPath: `${prefix}.characteristic`,
            characteristicOptions: characteristicKeys.map((key) => ({ value: key, labelKey: characteristicLabel(key), selected: key === roll.characteristic })),
            characteristicLabelKey: characteristicLabel(roll.characteristic),
            formulaPath: `${prefix}.formula`,
            formula: roll.formula,
            directionPath: `${prefix}.direction`,
            directionOptions: GIFT_ROLL_DIRECTIONS.map((direction) => ({
                value: direction,
                labelKey: `WH40K.BC.Gifts.Direction.${capitalize(direction)}`,
                selected: direction === roll.direction,
            })),
            directionLabelKey: `WH40K.BC.Gifts.Direction.${capitalize(roll.direction)}`,
        };
    });

    return {
        grants: buildReferenceList({
            path: 'system.gift.grants',
            mode: 'list',
            accept: GIFT_GRANT_ACCEPT,
            stored: gift.grants,
            resolveName,
            emptyKey: 'WH40K.ItemSheet.Gift.NoGrants',
            dropKey: 'WH40K.ItemSheet.Gift.DropGrant',
        }),
        riders,
        canAddRider: nextRiderAlignment(gift.riders) !== null,
        subTablePath: 'system.gift.subTable',
        subTableOptions: GIFT_SUB_TABLES.map((subTable) => ({ value: subTable, labelKey: subTableLabelKey(subTable), selected: subTable === gift.subTable })),
        subTableLabelKey: subTableLabelKey(gift.subTable),
        rolls,
    };
}

function capitalize(value: string): string {
    return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}
