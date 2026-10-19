/**
 * @file Pick one compendium Item by name, from the system's packs.
 *
 * The Dark Pacts panel's Add Pact and the Regimental Drawbacks panel's Add
 * Drawback both offer every compendium Item of one kind and take the one the
 * user names.
 */

import { promptItemChoice } from '../rolls/skill-use-picker.ts';
import { queryItemIndex } from '../utils/compendium-query.ts';

/**
 * Let the user pick, by name, one compendium Item whose index entry `matches`
 * (the index loads `fields` for it to read). Returns the chosen Item's UUID, or
 * `null` when none matches or the choice is dismissed.
 */
export async function pickCompendiumItemUuid(
    fields: string[],
    matches: (entry: CompendiumIndexEntry) => boolean,
    title: string,
    hint: string,
): Promise<string | null> {
    const candidates = await queryItemIndex(
        fields,
        (entry, pack) => (matches(entry) ? { id: entry.uuid ?? `Compendium.${pack.metadata.id}.Item.${entry._id}`, name: entry.name } : undefined),
        true,
    );
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => a.name.localeCompare(b.name));
    const chosen = await promptItemChoice(candidates, title, hint);
    return chosen === null ? null : chosen.id;
}
