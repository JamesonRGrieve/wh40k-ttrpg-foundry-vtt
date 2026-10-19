/**
 * @file Psychic-discipline choices and the normaliser that maps stored values onto them.
 *
 * Kept Foundry-free (unlike `psychic-power.ts`, which builds `foundry.data.fields`
 * at load) so the normalisation is unit-testable.
 */

/**
 * Canonical psychic-discipline choices. Shared between the psychic-power
 * schema and its `_migrateData` coercion.
 */
export const PSYCHIC_DISCIPLINE_CHOICES = [
    'telepathy',
    'telekinesis',
    'divination',
    'pyromancy',
    'biomancy',
    'daemonology',
    'malefic',
    'sanctic',
    'minor',
] as const;

type PsychicDisciplineChoice = (typeof PSYCHIC_DISCIPLINE_CHOICES)[number];

function isDisciplineChoice(value: string): value is PsychicDisciplineChoice {
    return (PSYCHIC_DISCIPLINE_CHOICES as readonly string[]).includes(value);
}

/**
 * Map a stored discipline onto a schema choice. Compendium and legacy data
 * carry the printed discipline heading — title-case, qualified, or annotated
 * ("Telepathy", "Malefic Daemonology", "Divination\n(Emperor's Tarot)",
 * "Telepathy - Astropath Elite Advance"). An exact choice wins; otherwise the
 * heading's leading word is tried, so a qualified heading keeps its tree instead
 * of collapsing to 'minor' (which made every Malefic / Sanctic Daemonology power
 * unrecognisable to the rules that key on those trees). Anything still
 * unrecognised falls back to 'minor', the "no tree" bucket.
 */
export function normalisePsychicDiscipline(raw: string): PsychicDisciplineChoice {
    const value = raw.trim().toLowerCase();
    if (isDisciplineChoice(value)) return value;
    const leading = /^[a-z]+/.exec(value)?.[0] ?? '';
    return isDisciplineChoice(leading) ? leading : 'minor';
}

/**
 * The langpack key of a discipline's label (#659): the sheet showed the raw
 * key ("pyromancy"). A stored value that is not a choice is normalised first.
 */
export function psychicDisciplineLabelKey(discipline: string): string {
    const choice = normalisePsychicDiscipline(discipline);
    return `WH40K.PsychicDiscipline.${choice.charAt(0).toUpperCase()}${choice.slice(1)}`;
}

/** One option of the psychic power sheet's discipline select. */
export interface PsychicDisciplineOption {
    readonly value: PsychicDisciplineChoice;
    readonly labelKey: string;
    readonly selected: boolean;
}

/** The discipline select's options: every choice, the stored one selected. */
export function psychicDisciplineOptions(current: string): PsychicDisciplineOption[] {
    const selected = normalisePsychicDiscipline(current);
    return PSYCHIC_DISCIPLINE_CHOICES.map((value) => ({ value, labelKey: psychicDisciplineLabelKey(value), selected: value === selected }));
}
