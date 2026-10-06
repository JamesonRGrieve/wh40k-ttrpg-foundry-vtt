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

/** Distance unit spellings that may appear in an authored range, and their size in metres. */
const UNIT = '(m|metres?|meters?|km|kilometres?|kilometers?)';
const KILOMETRE = 1000;
/** `<N> <unit> x|×|*|per|/ <scale>` — N units per point of Psy Rating or Willpower Bonus. */
const SCALING_RE = new RegExp(`^(\\d+)\\s*${UNIT}?\\s*(?:[x×*/]|per)\\s*(psy rating|pr|willpower bonus|wb)$`);
/** `Psy Rating <unit>` — one unit per point of Psy Rating. */
const PSY_RATING_UNITS_RE = new RegExp(`^(?:psy rating|pr)\\s*${UNIT}$`);
const PLAIN_RE = new RegExp(`^(\\d+)\\s*${UNIT}?$`);
/** A trailing cap, "(max. 50m)". */
const CAP_RE = new RegExp(`^(.*?)\\s*\\(max\\.?\\s*(\\d+)\\s*${UNIT}?\\)$`);
/** "Self or 10 metres x PR": the bounded alternative. */
const SELF_OR_RE = /^(?:self|you)\s+or\s+(.+)$/;

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
    'earshot',
    'line of sight',
    'unlimited',
    'special',
]);

/**
 * Collapse whitespace, lowercase, drop thousands commas ("1,000") and a trailing
 * area word ("5 metres x Psy Rating radius" measures the same distance).
 */
function normalise(raw: string): string {
    return raw
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase()
        .replace(/(\d),(?=\d{3}\b)/g, '$1')
        .replace(/\s+radius$/, '');
}

/** Metres per authored unit; no unit means metres. */
function unitMetres(unit: string | undefined): number {
    return unit?.startsWith('k') === true ? KILOMETRE : 1;
}

/** A non-negative integer from a possibly non-finite input. */
function wholeNumber(value: number): number {
    return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

/**
 * Parse an authored psychic range into metres.
 *
 * @param raw            the power's `system.range` (string or number).
 * @param psyRating      the caster's effective Psy Rating, for scaling ranges.
 * @param willpowerBonus the caster's Willpower Bonus, for "× Willpower Bonus" ranges.
 * @returns metres (>= 0) when recognised, or `null` when the string matches no
 *          known range grammar (caller should log it and fall back to 0).
 */
export function parsePsychicRange(raw: string | number | null | undefined, psyRating: number, willpowerBonus = 0): number | null {
    // A missing range is "no bounded distance", not an error — resolve silently.
    if (raw === undefined || raw === null) return 0;
    if (typeof raw === 'number') return Number.isFinite(raw) ? Math.max(0, Math.trunc(raw)) : null;
    return parseRangeText(normalise(raw), wholeNumber(psyRating), wholeNumber(willpowerBonus));
}

function parseRangeText(s: string, pr: number, wb: number): number | null {
    if (NON_METRIC.has(s)) return 0;

    const selfOr = SELF_OR_RE.exec(s);
    if (selfOr?.[1] !== undefined) return parseRangeText(selfOr[1], pr, wb);

    const capped = CAP_RE.exec(s);
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess parser mismatch: tsconfig.json types a capture group as string | undefined, the lint project (tsconfig.test.json) as string
    if (capped?.[1] !== undefined && capped[2] !== undefined) {
        const inner = parseRangeText(capped[1], pr, wb);
        return inner === null ? null : Math.min(inner, Number(capped[2]) * unitMetres(capped[3]));
    }

    const scaling = SCALING_RE.exec(s);
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess parser mismatch: tsconfig.json types a capture group as string | undefined, the lint project (tsconfig.test.json) as string
    if (scaling?.[1] !== undefined && scaling[3] !== undefined) {
        const per = scaling[3] === 'willpower bonus' || scaling[3] === 'wb' ? wb : pr;
        return Number(scaling[1]) * unitMetres(scaling[2]) * per;
    }

    const prUnits = PSY_RATING_UNITS_RE.exec(s);
    if (prUnits !== null) return pr * unitMetres(prUnits[1]);

    const plain = PLAIN_RE.exec(s);
    if (plain?.[1] !== undefined) return Number(plain[1]) * unitMetres(plain[2]);

    return null;
}

/** The caster values a psychic damage or penetration formula may name. */
export interface PsychicFormulaValues {
    psyRating: number;
    willpowerBonus: number;
    /** The caster's own Toughness Bonus (Neural Storm, BC Tome of Fate). */
    toughnessBonus: number;
}

/**
 * The terms the books write in psychic damage / penetration, and the value each
 * stands for. A term stands alone ("1d10+PR"), as a written multiple ("2xPR"),
 * or as a die count ("PRd10").
 */
const FORMULA_TERMS: ReadonlyArray<{ pattern: string; value: (v: PsychicFormulaValues) => number }> = [
    { pattern: 'PR', value: (v) => v.psyRating },
    { pattern: 'WPB|WB', value: (v) => v.willpowerBonus },
    { pattern: 'TB', value: (v) => v.toughnessBonus },
];

/**
 * Substitute the caster's values for the terms in an authored psychic damage or
 * penetration formula: at PR 3 and WPB 4, `"1d10+PR"` rolls `"1d10+3"`,
 * `"1d10+2xPR"` rolls `"1d10+2*3"`, `"PRd10"` rolls `"3d10"` and `"1d10+WPB"`
 * rolls `"1d10+4"`. Foundry's Roll parser treats such a term as an unresolvable
 * string and throws. Pure.
 */
export function resolvePsychicFormulaTerms(formula: string, values: PsychicFormulaValues): string {
    return FORMULA_TERMS.reduce((out, term) => {
        const n = String(wholeNumber(term.value(values)));
        return out
            .replace(new RegExp(`(\\d+)\\s*[x×]\\s*(?:${term.pattern})(?![A-Za-z])`, 'g'), `$1*${n}`)
            .replace(new RegExp(`(?<![A-Za-z])(?:${term.pattern})(?=d\\d|[^A-Za-z]|$)`, 'g'), n);
    }, formula);
}
