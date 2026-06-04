/**
 * @file Shared talent display-data preparation (#288).
 *
 * The talent sheet (read-only display) and the talent editor dialog independently
 * walked the same `system.modifiers` / `system.modifiers.situational` structures
 * with the same `Object.entries(...).filter(value !== 0).map(...)` shape. These pure
 * helpers own that walk and the skill-label formatting once; each consumer layers on
 * its own extras — the sheet adds `positive` / `short` / `icon` / `hasX` booleans,
 * the editor adds an array `index` — on top of the shared base rows.
 */

import { characteristicLabel, combatLabel, resourceLabel } from '../../helpers/characteristic-labels.ts';

/** A labelled modifier/prerequisite row: the base shape both consumers extend. */
interface TalentModRow {
    key: string;
    label: string;
    value: number;
}

/** A labelled situational-modifier row (base shape; consumers add icon/positive/index). */
interface TalentSituationalRow {
    key: string;
    label: string;
    value: number;
    condition: string;
}

/**
 * A talent modifier group as stored on the DataModel: a free-form record whose
 * values are intended to be numbers but are typed loosely (boundary — values are
 * narrowed via `typeof value === 'number'` at read time).
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: talent modifier groups are free-form content records; values narrowed via typeof in numericModRows
type NumericModRecord = Record<string, unknown>;

/** The four numeric modifier groups on a talent. */
interface ModifierRecords {
    characteristics: NumericModRecord;
    skills: NumericModRecord;
    combat: NumericModRecord;
    resources: NumericModRecord;
}

/** The three situational-modifier groups on a talent. */
interface SituationalRecords {
    characteristics: readonly { key: string; value: number; condition: string }[];
    skills: readonly { key: string; value: number; condition: string }[];
    combat: readonly { key: string; value: number; condition: string }[];
}

/**
 * Convert a camelCase / raw modifier key to a Title-Case label
 * (e.g. `commonLore` → "Common Lore"). Used for skill keys, which have no
 * CONFIG-backed label table of their own.
 */
export function formatSkillLabel(key: string): string {
    if (key === '') return '';
    return key
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, (str) => str.toUpperCase())
        .trim();
}

/** Walk a numeric modifier record → labelled rows, dropping zero / non-numeric entries. */
function numericModRows(record: NumericModRecord, labelFn: (key: string) => string): TalentModRow[] {
    return Object.entries(record).flatMap(([key, value]) => (typeof value === 'number' && value !== 0 ? [{ key, label: labelFn(key), value }] : []));
}

/** The four shared modifier-row groups (callers add `positive` / `short` / `index`). */
interface TalentModifierRows {
    characteristics: TalentModRow[];
    skills: TalentModRow[];
    combat: TalentModRow[];
    resources: TalentModRow[];
}

/**
 * Build the shared characteristic / skill / combat / resource modifier rows from a
 * talent's `system.modifiers`. Labels resolve through the canonical CONFIG-backed
 * helpers (characteristics/combat/resources) and {@link formatSkillLabel} (skills).
 */
export function prepareTalentModifierRows(mods: ModifierRecords): TalentModifierRows {
    return {
        characteristics: numericModRows(mods.characteristics, characteristicLabel),
        skills: numericModRows(mods.skills, formatSkillLabel),
        combat: numericModRows(mods.combat, combatLabel),
        resources: numericModRows(mods.resources, resourceLabel),
    };
}

/** The three shared situational-row groups (callers add `positive` / `icon` / `index`). */
interface TalentSituationalRows {
    characteristics: TalentSituationalRow[];
    skills: TalentSituationalRow[];
    combat: TalentSituationalRow[];
}

/**
 * Build the shared characteristic / skill / combat situational-modifier rows from a
 * talent's `system.modifiers.situational`, resolving each label once.
 */
export function prepareTalentSituationalRows(situational: SituationalRecords): TalentSituationalRows {
    const rows = (entries: readonly { key: string; value: number; condition: string }[], labelFn: (key: string) => string): TalentSituationalRow[] =>
        entries.map((mod) => ({ key: mod.key, label: labelFn(mod.key), value: mod.value, condition: mod.condition }));
    return {
        characteristics: rows(situational.characteristics, characteristicLabel),
        skills: rows(situational.skills, formatSkillLabel),
        combat: rows(situational.combat, combatLabel),
    };
}
