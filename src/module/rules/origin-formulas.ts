/**
 * @file How an origin's starting Wounds and Fate formulas evaluate (#760).
 *
 * Origins print starting Wounds as a dice formula, either fixed ("8+1d5") or
 * scaled by the Toughness bonus ("2xTB+1d5+2"), and starting Fate as a fixed
 * number ("3") or a banded d10 lookup ("(1-5|=2),(6-10|=3)"). The builder's roll
 * dialog and Zephyrex VTT both read these. Pure: no Foundry, no content.
 */
import { bandForRoll, isRollBandFormula, parseRollBands } from './roll-bands.ts';

/** `NxTB` in a Wounds formula: N times the Toughness bonus. */
const TOUGHNESS_MULTIPLE = /(\d+)xTB/gi;

/** A Wounds formula with every `NxTB` replaced by its value, ready to roll: "2xTB+1d5+2" at TB 4 is "8+1d5+2". */
export function woundsRollFormula(formula: string, toughnessBonus: number): string {
    return formula.replace(TOUGHNESS_MULTIPLE, (_match, multiplier: string) => String(parseInt(multiplier, 10) * toughnessBonus));
}

/** How a Fate formula resolves: a fixed number, a d10 lookup, or nothing. */
export type FateFormula = { kind: 'fixed'; value: number } | { kind: 'd10'; bands: ReturnType<typeof parseRollBands> } | { kind: 'none' };

/** Read a Fate formula: "3" is fixed, "(1-5|=2),(6-10|=3)" rolls a d10. */
export function parseFateFormula(formula: string): FateFormula {
    const trimmed = formula.trim();
    if (/^\d+$/.test(trimmed)) return { kind: 'fixed', value: parseInt(trimmed, 10) };
    if (isRollBandFormula(trimmed)) return { kind: 'd10', bands: parseRollBands(trimmed) };
    return { kind: 'none' };
}

/** Starting Fate from a formula and, for a d10 lookup, the d10 rolled (0 when no band covers it). */
export function fateForRoll(formula: string, d10: number): number {
    const fate = parseFateFormula(formula);
    if (fate.kind === 'fixed') return fate.value;
    if (fate.kind === 'none') return 0;
    return bandForRoll(fate.bands, d10)?.value ?? 0;
}
