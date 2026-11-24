/**
 * Which of an origin's granted choices still need picks (playtester, 2026-11-24).
 *
 * The origin-path builder refuses to commit while a choice is pending. A choice
 * whose options come from content the packs don't carry (a table that wasn't
 * parsed) has no options, so it could never be satisfied and the player was left
 * with "1 choice pending" and a dead Apply button. Such a choice is reported as
 * unfillable instead of pending, and a choice offering fewer options than its
 * count needs only as many picks as there are options.
 *
 * Choice keys follow the choice dialog's: the label, with " (2)", " (3)"… on
 * repeats of the same label.
 */

/** One granted choice, as the rule reads it. */
export interface OriginChoice {
    readonly label?: string;
    readonly name?: string;
    readonly count?: number;
    readonly options?: readonly object[];
}

/** The pending and unfillable choices of one origin, by key. */
export interface OriginChoiceStatus {
    readonly pending: string[];
    readonly unfillable: string[];
}

/** Classify an origin's choices against the picks made so far. */
export function originChoiceStatus(
    choices: readonly OriginChoice[],
    selected: Readonly<Record<string, readonly string[] | string | undefined>>,
): OriginChoiceStatus {
    const pending: string[] = [];
    const unfillable: string[] = [];
    const labelCounts = new Map<string, number>();
    for (const choice of choices) {
        const base = choice.label ?? choice.name ?? '';
        const seen = (labelCounts.get(base) ?? 0) + 1;
        labelCounts.set(base, seen);
        const key = seen > 1 ? `${base} (${seen})` : base;
        const available = choice.options?.length ?? 0;
        if (available === 0) {
            unfillable.push(key);
            continue;
        }
        const picks = selected[key];
        const made = Array.isArray(picks) ? picks.length : 0;
        if (made < Math.min(choice.count ?? 1, available)) pending.push(key);
    }
    return { pending, unfillable };
}
