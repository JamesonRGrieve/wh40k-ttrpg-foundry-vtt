/**
 * @file config-choices - derive UI choice lists from canonical CONFIG maps.
 *
 * The CONFIG tables in `config.ts` (difficulties, availabilities, hull types,
 * …) are the single source of truth for key → modifier/label data. Consumers
 * (dialogs, item sheets) must derive their dropdown / picker lists from those
 * maps rather than re-hardcoding parallel copies that silently drift when the
 * canonical table is rebalanced.
 */

/** A CONFIG map entry that at minimum carries a localizable label key. */
export interface LabelledConfigEntry {
    label: string;
}

/** A single derived UI choice: the CONFIG key as `value`, localized `label`. */
export interface ConfigChoice {
    value: string;
    label: string;
}

/**
 * Build an ordered `{ value, label }` choice list from a CONFIG map, localizing
 * each entry's label key. Insertion order of the map is preserved.
 */
export function choicesFrom(map: Record<string, LabelledConfigEntry>): ConfigChoice[] {
    return Object.entries(map).map(([value, entry]) => ({ value, label: game.i18n.localize(entry.label) }));
}

/**
 * Build a `Record<value, localizedLabel>` from a CONFIG map, suitable for the
 * Handlebars `{{selectOptions}}` helper. Delegates to {@link choicesFrom} so the
 * localize-each-entry logic lives in one place.
 */
export function choicesRecordFrom(map: Record<string, LabelledConfigEntry>): Record<string, string> {
    return Object.fromEntries(choicesFrom(map).map(({ value, label }) => [value, label]));
}
