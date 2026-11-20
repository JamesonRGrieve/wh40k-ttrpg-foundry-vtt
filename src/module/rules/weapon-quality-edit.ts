/**
 * @file Editing a weapon's own qualities on its sheet (#745).
 *
 * A weapon stores its qualities as ids in `system.special`: a bare id (`tearing`) or
 * an id with its rating (`toxic-4`). The weapon-qualities compendium names a quality
 * that takes a rating with an `-x` id (`toxic-x`, the book's "Toxic (X)"), so adding
 * one needs a level. Content-agnostic: pure id handling, no quality table is read.
 */

import { parseQualityLevel } from '../utils/quality-id.ts';

/** A weapon-qualities compendium entry as the picker reads it. */
export interface QualityPickerSource {
    identifier: string;
    name: string;
}

/** A picker option: the compendium id, its name, and whether adding it asks for a level. */
export interface QualityPickerOption extends QualityPickerSource {
    takesLevel: boolean;
}

/** Whether a compendium quality id takes a rating: `toxic-x` does, `tearing` doesn't. */
export function qualityTakesLevel(identifier: string): boolean {
    return /-x$/i.test(identifier);
}

/**
 * The id to store for a quality the user adds: the compendium id for an unrated
 * quality, or the rated id (`toxic-x` at level 4 → `toxic-4`). Null when a rated
 * quality has no whole, positive level.
 */
export function weaponQualityId(identifier: string, level: number | null): string | null {
    if (identifier === '') return null;
    if (!qualityTakesLevel(identifier)) return identifier;
    if (level === null || !Number.isInteger(level) || level < 1) return null;
    return `${parseQualityLevel(identifier).baseId}-${level}`;
}

/**
 * The picker's options from a line's weapon-qualities index, sorted by name. Where
 * the compendium carries a quality both unrated and rated (`toxic` and `toxic-x`),
 * only the rated one is offered, so an added Toxic always carries its rating.
 * Entries without an id are skipped.
 */
export function qualityPickerOptions(entries: Iterable<QualityPickerSource>): QualityPickerOption[] {
    const byId = new Map<string, QualityPickerSource>();
    for (const entry of entries) {
        if (entry.identifier !== '') byId.set(entry.identifier, entry);
    }
    const options: QualityPickerOption[] = [];
    for (const entry of byId.values()) {
        if (!qualityTakesLevel(entry.identifier) && byId.has(`${entry.identifier}-x`)) continue;
        options.push({ identifier: entry.identifier, name: entry.name, takesLevel: qualityTakesLevel(entry.identifier) });
    }
    return options.sort((a, b) => a.name.localeCompare(b.name));
}

/** Whether a quality shown on the weapon is its own (removable) rather than from craftsmanship, ammunition or a mode. */
export function isOwnQuality(special: ReadonlySet<string>, identifier: string): boolean {
    return special.has(identifier);
}
