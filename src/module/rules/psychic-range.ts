/**
 * Parse a psychic power's authored `range` into a maximum range in metres.
 *
 * Power ranges are authored as natural-language content strings — `"5 metres x
 * Psy Rating"`, `"30m"`, `"Self"`, `"Willpower"`, `"—"` — NOT dice formulas.
 * The old code fed the string straight to `new Roll(...).evaluate()`, which
 * threw for every prose range, defaulted the range to 0, and raised a spurious
 * "Range formula failed" notification (#568 — e.g. Dominate, `"5 metres x Psy
 * Rating"`). This parser understands the authored vocabulary instead:
 *
 *   - **scaling** — `"<N> metres x Psy Rating"` → `N × psyRating` metres;
 *   - **plain metres** — `"30m"`, `"10 metres"`, `"5"` → that many metres;
 *   - **non-metric** — `"Self"`, `"You"`, `"Touch"`, `"Willpower"`, `"Opposed
 *     Willpower"`, `"Psyniscience"`, `"—"`, `""`, range bands — recognised as
 *     "no bounded distance from this field" and resolved to 0 with no warning.
 *
 * A value that matches none of the above returns `null` so the caller can log
 * the offending string (and fall back to 0) instead of swallowing it silently.
 *
 * Pure and content-agnostic: it interprets the authored grammar, it does not
 * encode any specific power's value.
 */

/** Metre unit spellings that may appear in an authored range. */
const UNIT = '(?:m|metre|metres|meter|meters)';
const SCALING_RE = new RegExp(`^(\\d+)\\s*${UNIT}\\s*[x×*]\\s*psy\\s*rating$`);
const PLAIN_METRES_RE = new RegExp(`^(\\d+)\\s*${UNIT}$`);
const PLAIN_INT_RE = /^(\d+)$/;

/**
 * Non-metric range tokens: real, recognised authored values that simply do not
 * express a bounded distance in this field. They resolve to 0 metres with no
 * warning (other subsystems handle self/touch/band semantics).
 */
const NON_METRIC = new Set<string>([
    '',
    '-',
    '—', // em dash
    '–', // en dash
    'self',
    'you',
    'touch',
    'personal',
    'melee',
    'thrown',
    'short',
    'medium',
    'long',
    'extreme',
    'willpower',
    'opposed willpower',
    'psyniscience',
]);

/** Collapse internal whitespace and lowercase, for tolerant matching. */
function normalise(raw: string): string {
    return raw.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Parse an authored psychic range into metres.
 *
 * @param raw       the power's `system.range` (string or number).
 * @param psyRating the caster's effective Psy Rating, for scaling ranges.
 * @returns metres (>= 0) when recognised, or `null` when the string matches no
 *          known range grammar (caller should log it and fall back to 0).
 */
export function parsePsychicRange(raw: string | number | null | undefined, psyRating: number): number | null {
    // A missing range is "no bounded distance", not an error — resolve silently.
    if (raw === undefined || raw === null) return 0;
    if (typeof raw === 'number') return Number.isFinite(raw) ? Math.max(0, Math.trunc(raw)) : null;

    const s = normalise(raw);
    if (NON_METRIC.has(s)) return 0;

    const pr = Number.isFinite(psyRating) ? Math.max(0, Math.trunc(psyRating)) : 0;

    const scaling = SCALING_RE.exec(s);
    if (scaling?.[1] !== undefined) return Number(scaling[1]) * pr;

    const metres = PLAIN_METRES_RE.exec(s);
    if (metres?.[1] !== undefined) return Number(metres[1]);

    const int = PLAIN_INT_RE.exec(s);
    if (int?.[1] !== undefined) return Number(int[1]);

    return null;
}
