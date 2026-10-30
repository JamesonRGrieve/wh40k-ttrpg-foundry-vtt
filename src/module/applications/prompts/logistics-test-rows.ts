/**
 * @file Labels and provenance rows for the OW Logistics Test dialog and chat
 * card (#154, #192).
 *
 * Pure presentation over `rules/ow-logistics.ts`: the option label keys for
 * each Availability by Front Conditions / Craftsmanship and Logistics axis, and the hoverable component rows a rolled test
 * prints (each row names the table row it came from). The translator is
 * injected so the module stays free of the `game` global.
 */

import { AVAILABILITY_KEYS, type AvailabilityKey, CRAFTSMANSHIP_KEYS } from '../../rules/acquisition-ladder.ts';
import {
    type Craftsmanship,
    FRONT_TIME_KEYS,
    type LogisticsBreakdown,
    type LogisticsContext,
    type TimeInFront,
    TROOP_COUNT_KEYS,
    type TroopCount,
    WAR_CONDITION_KEYS,
    type WarCondition,
} from '../../rules/ow-logistics.ts';
import type { I18nKey } from '../../types/i18n-keys';
import { prepareModifierTooltipData } from '../../utils/modifier-tooltip.ts';

/** `t()`-shaped translator. */
export type Translate = (key: I18nKey, params?: Record<string, string>) => string;

const AVAILABILITY_LABELS: Readonly<Record<AvailabilityKey, I18nKey>> = {
    ubiquitous: 'WH40K.Availability.Ubiquitous',
    abundant: 'WH40K.Availability.Abundant',
    plentiful: 'WH40K.Availability.Plentiful',
    common: 'WH40K.Availability.Common',
    average: 'WH40K.Availability.Average',
    scarce: 'WH40K.Availability.Scarce',
    rare: 'WH40K.Availability.Rare',
    veryRare: 'WH40K.Availability.VeryRare',
    extremelyRare: 'WH40K.Availability.ExtremelyRare',
    nearUnique: 'WH40K.Availability.NearUnique',
    unique: 'WH40K.Availability.Unique',
};

const TROOP_COUNT_LABELS: Readonly<Record<TroopCount, I18nKey>> = {
    company: 'WH40K.OW.Logistics.TroopCount.Company',
    regiment: 'WH40K.OW.Logistics.TroopCount.Regiment',
    regiments: 'WH40K.OW.Logistics.TroopCount.Regiments',
};

/** Time Spent in Front and Front Active share their five printed rows. */
const FRONT_TIME_LABELS: Readonly<Record<TimeInFront, I18nKey>> = {
    under3Months: 'WH40K.OW.Logistics.FrontTime.Under3Months',
    months3to6: 'WH40K.OW.Logistics.FrontTime.Months3to6',
    months6to12: 'WH40K.OW.Logistics.FrontTime.Months6to12',
    years1to5: 'WH40K.OW.Logistics.FrontTime.Years1to5',
    years5plus: 'WH40K.OW.Logistics.FrontTime.Years5plus',
};

const WAR_CONDITION_LABELS: Readonly<Record<WarCondition, I18nKey>> = {
    losingBadly: 'WH40K.OW.Logistics.WarCondition.LosingBadly',
    faltering: 'WH40K.OW.Logistics.WarCondition.Faltering',
    violentImpasse: 'WH40K.OW.Logistics.WarCondition.ViolentImpasse',
    ceasefire: 'WH40K.OW.Logistics.WarCondition.Ceasefire',
    nearVictorious: 'WH40K.OW.Logistics.WarCondition.NearVictorious',
    dominant: 'WH40K.OW.Logistics.WarCondition.Dominant',
};

const CRAFTSMANSHIP_LABELS: Readonly<Record<Craftsmanship, I18nKey>> = {
    poor: 'WH40K.OW.Logistics.Craftsmanship.Poor',
    common: 'WH40K.OW.Logistics.Craftsmanship.Common',
    good: 'WH40K.OW.Logistics.Craftsmanship.Good',
    best: 'WH40K.OW.Logistics.Craftsmanship.Best',
};

/** One picker button. */
interface LogisticsOption<T extends string> {
    readonly id: T;
    readonly labelKey: I18nKey;
    readonly selected: boolean;
}

function options<T extends string>(ids: readonly T[], labels: Readonly<Record<T, I18nKey>>, selected: T): LogisticsOption<T>[] {
    return ids.map((id) => ({ id, labelKey: labels[id], selected: id === selected }));
}

/** Every picker's buttons for a context, in printed order. */
export function logisticsOptions(ctx: LogisticsContext): {
    availabilityOptions: LogisticsOption<AvailabilityKey>[];
    troopCountOptions: LogisticsOption<TroopCount>[];
    timeInFrontOptions: LogisticsOption<TimeInFront>[];
    frontActiveOptions: LogisticsOption<TimeInFront>[];
    warConditionOptions: LogisticsOption<WarCondition>[];
    craftsmanshipOptions: LogisticsOption<Craftsmanship>[];
} {
    return {
        availabilityOptions: options(AVAILABILITY_KEYS, AVAILABILITY_LABELS, ctx.availability),
        troopCountOptions: options(TROOP_COUNT_KEYS, TROOP_COUNT_LABELS, ctx.troopCount),
        timeInFrontOptions: options(FRONT_TIME_KEYS, FRONT_TIME_LABELS, ctx.timeInFront),
        frontActiveOptions: options(FRONT_TIME_KEYS, FRONT_TIME_LABELS, ctx.frontActive),
        warConditionOptions: options(WAR_CONDITION_KEYS, WAR_CONDITION_LABELS, ctx.warCondition),
        craftsmanshipOptions: options(CRAFTSMANSHIP_KEYS, CRAFTSMANSHIP_LABELS, ctx.craftsmanship),
    };
}

/** One hoverable component row of a Logistics Test derivation. */
export interface LogisticsRow {
    readonly key: keyof LogisticsBreakdown;
    readonly label: string;
    readonly value: number;
    /** `data-wh40k-tooltip-data` payload naming the row's source. */
    readonly tooltipData: string;
}

/**
 * The full derivation of a rolled test: the Squad Logistics Rating, then every
 * modifier with the table row it was read from. Optional bonuses that are off
 * (Munitorum Influence, standard kit, a zero situational adjustment) are left
 * out; the four front-conditions parts and craftsmanship always print, even at +0.
 */
export function logisticsRows(ctx: LogisticsContext, breakdown: LogisticsBreakdown, translate: Translate): LogisticsRow[] {
    const frontTable = translate('WH40K.OW.Logistics.Source.FrontConditions');
    const sourced = (table: string, row: string): string => translate('WH40K.OW.Logistics.Source.Row', { table, row });

    const entries: Array<{ key: keyof LogisticsBreakdown; labelKey: I18nKey; source: string; include: boolean }> = [
        { key: 'rating', labelKey: 'WH40K.OW.Logistics.BaseRatingLabel', source: translate('WH40K.OW.Logistics.Source.Rating'), include: true },
        {
            key: 'munitorum',
            labelKey: 'WH40K.OW.Logistics.Modifier.Munitorum',
            source: translate('WH40K.OW.Logistics.Modifier.Munitorum'),
            include: breakdown.munitorum !== 0,
        },
        {
            key: 'situational',
            labelKey: 'WH40K.OW.Logistics.Modifier.Situational',
            source: translate('WH40K.OW.Logistics.Modifier.Situational'),
            include: breakdown.situational !== 0,
        },
        {
            key: 'availability',
            labelKey: 'WH40K.OW.Logistics.Modifier.Availability',
            source: sourced(
                frontTable,
                translate('WH40K.OW.Logistics.Source.AvailabilityRow', {
                    availability: translate(AVAILABILITY_LABELS[ctx.availability]),
                    troops: translate(TROOP_COUNT_LABELS[ctx.troopCount]),
                }),
            ),
            include: true,
        },
        {
            key: 'timeInFront',
            labelKey: 'WH40K.OW.Logistics.Modifier.TimeInFront',
            source: sourced(frontTable, translate(FRONT_TIME_LABELS[ctx.timeInFront])),
            include: true,
        },
        {
            key: 'frontActive',
            labelKey: 'WH40K.OW.Logistics.Modifier.FrontActive',
            source: sourced(frontTable, translate(FRONT_TIME_LABELS[ctx.frontActive])),
            include: true,
        },
        {
            key: 'warCondition',
            labelKey: 'WH40K.OW.Logistics.Modifier.WarCondition',
            source: sourced(frontTable, translate(WAR_CONDITION_LABELS[ctx.warCondition])),
            include: true,
        },
        {
            key: 'standardKit',
            labelKey: 'WH40K.OW.Logistics.Modifier.StandardKit',
            source: translate('WH40K.OW.Logistics.Source.StandardKit'),
            include: breakdown.standardKit !== 0,
        },
        {
            key: 'craftsmanship',
            labelKey: 'WH40K.OW.Logistics.Modifier.Craftsmanship',
            source: sourced(translate('WH40K.OW.Logistics.Source.CraftsmanshipTable'), translate(CRAFTSMANSHIP_LABELS[ctx.craftsmanship])),
            include: true,
        },
    ];

    return entries
        .filter((entry) => entry.include)
        .map((entry) => {
            const label = translate(entry.labelKey);
            const value = breakdown[entry.key];
            return { key: entry.key, label, value, tooltipData: prepareModifierTooltipData(label, [{ name: entry.source, value }]) };
        });
}
