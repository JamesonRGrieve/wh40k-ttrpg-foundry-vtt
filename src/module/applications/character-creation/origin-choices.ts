/**
 * Origin-path choice-key disambiguation (#305).
 *
 * Grant `choices` can share a label ("Skill", "Skill"); the choice dialog
 * disambiguates duplicates by appending ` (N)` to the 2nd+ occurrence so each
 * entry gets its own slot in the persisted `selectedChoices` map. That keying —
 * plus the RT-`label` vs DH2/BC/OW-`name` fallback, plus the scoped/legacy
 * selected-value lookup, plus the option matcher — was copy-pasted across 8 sites
 * (`origin-path-builder.ts` ×7 + `data/item/origin-path.ts`), each with subtle
 * drift. This is the single source of truth.
 *
 * The produced `choiceKey` is the persisted map key, so it must match the prior
 * per-site logic for real content. It does: every fallback variant agrees when
 * the choice carries a non-empty `label` (RT) or `name` (others) — the only path
 * real packs take. The unified fallbacks here are the most complete of the eight
 * (the divergences were only reachable for degenerate label-less, name-less, or
 * non-array selections that no pack produces) and consistently honor the legacy
 * base-label key for pre-disambiguation worlds.
 */

/** Minimal structural view of a grant choice the disambiguator reads. */
export interface ChoiceLike {
    label?: string | undefined;
    name?: string | undefined;
    options?: readonly ChoiceOptionLike[] | undefined;
}

/** Minimal structural view of a choice option. */
export interface ChoiceOptionLike {
    value?: string | undefined;
    name?: string | undefined;
    label?: string | undefined;
}

type OptionOf<C extends ChoiceLike> = NonNullable<C['options']>[number];

/**
 * Persisted player picks: choice key → selected option ids. The schema declares
 * `Record<string, string[]>` (one legacy variant allows a bare `string`); ids are
 * stored as the option `value`/`name`. Numbers are tolerated defensively because
 * the backing `ObjectField` doesn't enforce element types at runtime.
 */
export type SelectedChoices = Record<string, readonly (string | number)[] | string | undefined>;

export interface ResolvedChoice<C extends ChoiceLike> {
    /** The choice, unchanged. */
    choice: C;
    /** Disambiguated base label before the ` (N)` suffix. */
    baseLabel: string;
    /** Persisted `selectedChoices` map key (`baseLabel` + ` (N)` for the 2nd+ dup). */
    choiceKey: string;
    /** Player picks for this choice (scoped key, then legacy base-label key), always an array. */
    selectedValues: string[];
    /** Match an option by `value ?? name`, then `name`, then `label` (superset of every prior site's matcher). */
    resolveOption: (value: string) => OptionOf<C> | undefined;
}

/** Prefer a non-empty `label` (RT), else a non-empty `name` (DH2/BC/OW), else `''`. */
export function choiceBaseLabel(choice: ChoiceLike): string {
    const label = choice.label;
    if (typeof label === 'string' && label !== '') return label;
    const name = choice.name;
    if (typeof name === 'string' && name !== '') return name;
    return '';
}

/** Coerce a persisted pick (string/number id) to a string. */
function coerceId(value: string | number): string {
    return typeof value === 'string' ? value : String(value);
}

/** A persisted value counts as "selected" only when it's an array (matching the prior scoped/legacy sites); coerce ids to strings. */
function asSelectedArray(value: SelectedChoices[string]): string[] | null {
    // typeof narrowing rather than Array.isArray: ts-reset widens Array.isArray's
    // result to readonly unknown[], and the declared union's only array member is
    // (string|number)[], so eliminating string + undefined leaves the array.
    if (value === undefined || typeof value === 'string') return null;
    return value.map(coerceId);
}

/** Player picks for a choice: the scoped key (array only), else the legacy base-label key. */
function pickSelected(selectedChoices: SelectedChoices, choiceKey: string, baseLabel: string): string[] {
    return asSelectedArray(selectedChoices[choiceKey]) ?? asSelectedArray(selectedChoices[baseLabel]) ?? [];
}

/**
 * Walk a choice list, yielding each choice with its disambiguated key, resolved
 * player picks, and an option matcher. Replaces the hand-rolled
 * `labelCounts`/suffix/`choiceKey`/`selectedChoices[key]`/matcher loop at every
 * consumer.
 */
export function* iterateResolvedChoices<C extends ChoiceLike>(choices: readonly C[], selectedChoices: SelectedChoices): Generator<ResolvedChoice<C>> {
    const labelCounts: Record<string, number> = {};
    for (const choice of choices) {
        const baseLabel = choiceBaseLabel(choice);
        labelCounts[baseLabel] = (labelCounts[baseLabel] ?? 0) + 1;
        const count = labelCounts[baseLabel];
        const suffix = count > 1 ? ` (${count})` : '';
        const choiceKey = `${baseLabel}${suffix}`;
        const selectedValues = pickSelected(selectedChoices, choiceKey, baseLabel);

        const options = choice.options ?? [];
        const resolveOption = (value: string): OptionOf<C> | undefined =>
            options.find((opt) => (opt.value ?? opt.name) === value || opt.name === value || opt.label === value);

        yield { choice, baseLabel, choiceKey, selectedValues, resolveOption };
    }
}
