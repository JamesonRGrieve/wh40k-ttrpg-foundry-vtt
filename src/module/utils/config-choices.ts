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

/**
 * Localized label for one key of a CONFIG map, read from the entry's own label
 * key (never derived from the id — hyphenated ids like `very-rare` have no
 * capitalised twin in the langpack). Unknown keys fall back to the raw id.
 */
export function labelFor(map: Record<string, LabelledConfigEntry>, key: string): string {
    const entry = map[key];
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess parser mismatch: tsconfig.test.json (flag off) sees `LabelledConfigEntry`, tsconfig.json (flag on) sees `| undefined` and requires this guard.
    return entry === undefined ? key : game.i18n.localize(entry.label);
}

/** A rating printed for a named place ("Scarce (Volg)"). */
export interface PlaceRating {
    place: string;
    availability: string;
}

/** Label each place-qualified rating as "<localized rating> (<place>)", in printed order. */
export function placeRatingLabels(map: Record<string, LabelledConfigEntry>, entries: readonly PlaceRating[]): string[] {
    return entries.map(({ place, availability }) => game.i18n.format('WH40K.Availability.AtPlace', { availability: labelFor(map, availability), place }));
}
