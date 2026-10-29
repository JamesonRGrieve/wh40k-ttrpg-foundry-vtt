/**
 * Modifying and repairing xenos equipment (#136).
 *
 * Working on an alien device starts with a Hard (−20) Forbidden Lore test in
 * the specialisation of the race that built it; when nobody knows the maker,
 * the device can't be worked on at all. The repair or modification test that
 * follows takes −20 for the device's alien nature and +5 per degree of success
 * the lore test scored.
 *
 * The flow is two tests. The lore test's degrees of success are recorded on
 * the item as an insight for the Acolyte who rolled it. Their next attempt on
 * that item, a Tech-Use Repair or a personal modification fitting or removal
 * (`weapon-modification.ts`), reads the insight and takes the −20 /
 * +5-per-DoS modifiers. Whether the maker race is known is a GM ruling made at repair
 * time, because items carry no maker field. The printed values live on the
 * line config (`ItemRepairRules.xenos`); this module holds only the math.
 */

import { nonNegInt } from './_num.ts';

/** A line's printed xenos-repair rule. */
export interface XenosRepairRules {
    /** Difficulty of the Forbidden Lore test (Hard, −20). */
    loreModifier: number;
    /** Base penalty on the repair test for the item's alien nature (−20). */
    repairModifier: number;
    /** Bonus on the repair test per degree of success on the Forbidden Lore test (+5). */
    bonusPerLoreDegree: number;
}

/** The item flag (under the system scope) holding the pending {@link XenosRepairInsight}. */
export const XENOS_REPAIR_INSIGHT_FLAG = 'xenosRepairInsight';

/** An Acolyte's successful Forbidden Lore test on one xenos item, awaiting the repair attempt. */
export interface XenosRepairInsight {
    /** The Acolyte who rolled the lore test. */
    actorUuid: string;
    /** Degrees of success on that test. */
    degrees: number;
}

/** The item surface the xenos check reads: its document type and its own `system.type`. */
export interface XenosCandidateItem {
    readonly type: string;
    readonly system: { readonly type?: string | undefined };
}

/** Weapons and armour typed `xenos` are xenos equipment. */
export function isXenosEquipment(item: XenosCandidateItem): boolean {
    return (item.type === 'weapon' || item.type === 'armour') && item.system.type === 'xenos';
}

/** The repair test's two xenos modifiers: the alien-nature penalty and the lore bonus. */
export function xenosRepairModifiers(rules: XenosRepairRules, loreDegrees: number): { alienNature: number; loreInsight: number } {
    return { alienNature: rules.repairModifier, loreInsight: nonNegInt(loreDegrees) * rules.bonusPerLoreDegree };
}

/**
 * Read a stored insight flag for `actorUuid`: only that Acolyte's own lore
 * test counts toward their repair. Anything malformed reads as no insight.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: validates an untyped Item#getFlag result
export function readXenosRepairInsight(raw: unknown, actorUuid: string): XenosRepairInsight | null {
    if (raw === null || typeof raw !== 'object') return null;
    // eslint-disable-next-line no-restricted-syntax -- boundary: the flag object, read field-by-field through the typeof guards below
    const record = raw as { actorUuid?: unknown; degrees?: unknown };
    if (record.actorUuid !== actorUuid || typeof record.degrees !== 'number') return null;
    return { actorUuid, degrees: nonNegInt(record.degrees) };
}
