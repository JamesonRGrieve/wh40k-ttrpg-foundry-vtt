/**
 * @file Psychic disciplines: the printed name a power carries, and the rules tree it
 * belongs to.
 *
 * A power's `discipline` is the name its book prints (content#35): "Telepathy",
 * "Sorcery", "Nurgle", "Telekinetics", "Astropath Psychic Powers" — content, authored in
 * the packs, never a fixed list in code. The trees below are the few the rules key on
 * (the Malefic corruption hook, the Sanctic predicates, the badge colour), matched from
 * the printed name; every other name is its own discipline with no tree ('minor').
 *
 * Kept Foundry-free (unlike `psychic-power.ts`, which builds `foundry.data.fields`
 * at load) so it is unit-testable.
 */

/** The discipline trees the rules and the badge key on, each with a langpack label. */
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

/** A printed name as stored: whitespace (newlines included) collapsed, trimmed. */
export function tidyPsychicDiscipline(raw: string): string {
    return raw.replace(/\s+/g, ' ').trim();
}

/**
 * The rules tree a printed discipline belongs to. An exact tree name wins; otherwise
 * the name's leading word is tried, so "Malefic Daemonology" stays Malefic and
 * "Sanctic Daemonology" Sanctic. Anything else ("Sorcery", "Nurgle") has no tree:
 * 'minor'. The printed name itself is kept on the power; this only feeds the rules.
 */
export function normalisePsychicDiscipline(raw: string): PsychicDisciplineChoice {
    const value = raw.trim().toLowerCase();
    if (isDisciplineChoice(value)) return value;
    const leading = /^[a-z]+/.exec(value)?.[0] ?? '';
    return isDisciplineChoice(leading) ? leading : 'minor';
}

/** The langpack key of a tree's label. */
function treeLabelKey(tree: PsychicDisciplineChoice): string {
    return `WH40K.PsychicDiscipline.${tree.charAt(0).toUpperCase()}${tree.slice(1)}`;
}

/** How to show a discipline: through the langpack when it names a tree exactly, else as printed. */
export type PsychicDisciplineDisplay = { readonly labelKey: string } | { readonly label: string };

/**
 * A discipline's display (#659, content#35): an exact tree name ("pyromancy",
 * "Telepathy") or an empty one reads through the langpack; any other printed name
 * ("Sorcery", "Malefic Daemonology") shows as the book prints it.
 */
export function psychicDisciplineDisplay(discipline: string): PsychicDisciplineDisplay {
    const printed = tidyPsychicDiscipline(discipline);
    const value = printed.toLowerCase();
    if (value === '') return { labelKey: treeLabelKey('minor') };
    return isDisciplineChoice(value) ? { labelKey: treeLabelKey(value) } : { label: printed };
}

/** One option of the psychic power sheet's discipline select. */
export interface PsychicDisciplineOption {
    readonly value: string;
    readonly display: PsychicDisciplineDisplay;
    readonly selected: boolean;
}

/**
 * The discipline select's options: the stored printed name first when it is not a
 * tree name (so editing the sheet never overwrites it), then every tree, the stored
 * one selected.
 */
export function psychicDisciplineOptions(current: string): PsychicDisciplineOption[] {
    const printed = tidyPsychicDiscipline(current);
    const exact = printed.toLowerCase();
    const trees = PSYCHIC_DISCIPLINE_CHOICES.map((value) => ({ value, display: psychicDisciplineDisplay(value), selected: value === exact }));
    if (printed === '' || isDisciplineChoice(exact)) return trees;
    return [{ value: printed, display: { label: printed }, selected: true }, ...trees];
}
