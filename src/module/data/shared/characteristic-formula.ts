/**
 * @file Shared characteristic-bonus formula helpers
 * Origin / grant resource formulas may embed characteristic-bonus references
 * like `2xTB+1d5+1` (2 × Toughness Bonus + a d5 + 1). The abbreviation table
 * and the `(N)x?ABBR` substitution rule are the single piece of knowledge here;
 * both the grant-side evaluator (`resource-grant.ts`) and the prep-time wounds
 * recompute (`character.ts`) resolve these against the actor's CURRENT bonuses,
 * so they must agree on the abbreviations or a non-TB formula recomputes wrong.
 */

/** Characteristic-bonus abbreviation → characteristic key. */
export const CHARACTERISTIC_BONUS_ABBREVIATIONS: Record<string, string> = {
    TB: 'toughness',
    SB: 'strength',
    AB: 'agility',
    WPB: 'willpower',
    FB: 'fellowship',
    IB: 'intelligence',
    PB: 'perception',
    WSB: 'weaponSkill',
    BSB: 'ballisticSkill',
};

/** Abbreviations longest-first, so `WSB`/`BSB`/`WPB` match before the shorter `SB`/`B`-tail forms. */
const ABBR_LONGEST_FIRST = Object.keys(CHARACTERISTIC_BONUS_ABBREVIATIONS).sort((a, b) => b.length - a.length);

/**
 * Substitute every `(N)x?ABBR` characteristic-bonus reference in `formula` with
 * `N × bonus`, where the bonus comes from `bonusFor(charKey)`. Iterates the
 * abbreviation map in declaration order to preserve historical substitution
 * behaviour. Returns a formula string ready for `new Roll(...)`.
 */
export function resolveCharacteristicBonusRefs(formula: string, bonusFor: (charKey: string) => number): string {
    let out = formula;
    for (const [abbr, charKey] of Object.entries(CHARACTERISTIC_BONUS_ABBREVIATIONS)) {
        const regex = new RegExp(`(\\d*)x?${abbr}`, 'gi');
        out = out.replace(regex, (_match, multiplier: string) => {
            const mult = parseInt(multiplier, 10) || 1;
            return String(bonusFor(charKey) * mult);
        });
    }
    return out;
}

/** A single parsed characteristic-bonus term, e.g. `2xTB` → `{ charKey: 'toughness', multiplier: 2, match: '2xTB' }`. */
export interface CharacteristicBonusTerm {
    charKey: string;
    abbr: string;
    multiplier: number;
    match: string;
}

/**
 * Find the first `(N)x?ABBR` characteristic-bonus term in `formula` (any of the
 * known abbreviations, longest-first), or `null` when there is none. Used by
 * the wounds recompute to identify which characteristic a stored formula scales
 * with and by how much, so the bonus can be recomputed against the current value.
 */
export function parseCharacteristicBonusTerm(formula: string): CharacteristicBonusTerm | null {
    const regex = new RegExp(`(\\d*)x?(${ABBR_LONGEST_FIRST.join('|')})`, 'i');
    const m = regex.exec(formula);
    if (m === null) return null;
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess parser mismatch: tsconfig.test.json (flag off) types the regex group as `string`, tsconfig.json (flag on) requires the `?? ''` guard
    const abbr = (m[2] ?? '').toUpperCase();
    const charKey = CHARACTERISTIC_BONUS_ABBREVIATIONS[abbr];
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess parser mismatch: tsconfig.test.json (flag off) types the Record access as `string`, tsconfig.json (flag on) requires the undefined guard
    if (charKey === undefined) return null;
    return {
        charKey,
        abbr,
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess parser mismatch: tsconfig.test.json (flag off) types the regex group as `string`, tsconfig.json (flag on) requires the `?? ''` guard
        multiplier: parseInt(m[1] ?? '', 10) || 1,
        match: m[0],
    };
}
