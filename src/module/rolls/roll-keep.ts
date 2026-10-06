/**
 * Roll-twice-keep-one test modes (homebrew, gated by the `roll-keep-modes`
 * world setting; off = RAW one d100):
 *  - advantage    — roll the d100 twice, keep the LOWER (better on a roll-under test);
 *  - disadvantage — roll twice, keep the HIGHER;
 *  - emphasis     — roll twice, keep the result FURTHEST FROM 50, so the outcome is
 *                   more extreme either way. On a tie (30 and 70) the first die stays.
 *
 * Each mode is a Foundry dice formula, so Dice So Nice and the roll tooltip show
 * both dice with the discarded one struck through. Advantage and disadvantage use
 * core's `kl` / `kh`; emphasis uses the system's `ke` (keep extreme) modifier,
 * registered through core's documented `Die.MODIFIERS` extension point.
 */

/** A d100 test's keep mode. */
export const ROLL_KEEP_MODES = ['normal', 'advantage', 'disadvantage', 'emphasis'] as const;
export type RollKeepMode = (typeof ROLL_KEEP_MODES)[number];

/** The midpoint of the d100 an emphasis roll is measured from. */
const EMPHASIS_CENTRE = 50;

/** The `ke` (keep extreme) die modifier emphasis rolls use. */
const KEEP_EXTREME_MODIFIER = 'ke';

const KEEP_MODE_FORMULA: Readonly<Record<RollKeepMode, string>> = {
    normal: '1d100',
    advantage: '2d100kl',
    disadvantage: '2d100kh',
    emphasis: `2d100${KEEP_EXTREME_MODIFIER}`,
};

/** The dice formula a d100 test is rolled with in `mode`. */
export function keepModeFormula(mode: RollKeepMode): string {
    return KEEP_MODE_FORMULA[mode];
}

/** One selector button in the roll dialog. */
export interface KeepModeOption {
    mode: RollKeepMode;
    labelKey: string;
    hintKey: string;
    active: boolean;
}

const KEEP_MODE_KEY: Readonly<Record<RollKeepMode, string>> = {
    normal: 'Normal',
    advantage: 'Advantage',
    disadvantage: 'Disadvantage',
    emphasis: 'Emphasis',
};

/** The roll dialog's selector buttons, `selected` marked active. Pure. */
export function keepModeOptions(selected: RollKeepMode): KeepModeOption[] {
    return ROLL_KEEP_MODES.map((mode) => ({
        mode,
        labelKey: `WH40K.Roll.KeepMode.${KEEP_MODE_KEY[mode]}`,
        hintKey: `WH40K.Roll.KeepMode.${KEEP_MODE_KEY[mode]}Hint`,
        active: mode === selected,
    }));
}

/** Whether a stored / submitted value is a keep mode. */
export function isRollKeepMode(value: string): value is RollKeepMode {
    return (ROLL_KEEP_MODES as readonly string[]).includes(value);
}

/**
 * Index of the value furthest from {@link EMPHASIS_CENTRE}; the earliest wins a
 * tie. `-1` for an empty list. Pure.
 */
export function extremeResultIndex(values: readonly number[]): number {
    let best = -1;
    let bestDistance = -1;
    values.forEach((value, index) => {
        const distance = Math.abs(value - EMPHASIS_CENTRE);
        if (distance > bestDistance) {
            best = index;
            bestDistance = distance;
        }
    });
    return best;
}

/** One die result as Foundry's DiceTerm records it. */
interface DieResultLike {
    result: number;
    active?: boolean | undefined;
    discarded?: boolean | undefined;
}

/** The slice of a Foundry DiceTerm the `ke` modifier works on. */
interface KeepExtremeTermLike {
    results: DieResultLike[];
}

/**
 * The `ke` modifier: keep the active result furthest from 50 and discard the rest.
 * Runs with `this` bound to the dice term, as core calls every `Die.MODIFIERS` entry.
 */
function keepExtreme(this: KeepExtremeTermLike): void {
    const active = this.results.filter((r) => r.active === true);
    const keepIndex = extremeResultIndex(active.map((r) => r.result));
    active.forEach((result, index) => {
        if (index === keepIndex) return;
        result.active = false;
        result.discarded = true;
    });
}

/** Register `ke` on core's Die modifiers (idempotent). Call once at init. */
export function registerKeepExtremeModifier(): void {
    Object.assign(foundry.dice.terms.Die.MODIFIERS, { [KEEP_EXTREME_MODIFIER]: keepExtreme });
}

/** The kept / discarded d100 values of a resolved keep-mode roll, for the card. */
export interface KeepModeDice {
    kept: number;
    discarded: number[];
}

/** The slice of a resolved Foundry Roll the card note reads. */
interface ResolvedRollLike {
    dice: ReadonlyArray<{ results: readonly DieResultLike[] }>;
}

/**
 * The chat-card line for a keep-mode roll naming both dice and the kept one, or ''
 * for a normal roll (or one whose dice can't be read back).
 */
export function keepModeCardNote(mode: RollKeepMode, roll: ResolvedRollLike): string {
    if (mode === 'normal') return '';
    const dice = keepModeDice(roll.dice[0]?.results ?? []);
    if (dice === null) return '';
    return game.i18n.format('WH40K.Roll.KeepMode.CardNote', {
        mode: game.i18n.localize(`WH40K.Roll.KeepMode.${KEEP_MODE_KEY[mode]}`),
        kept: String(dice.kept),
        discarded: dice.discarded.join(', '),
    });
}

/** Read the kept and discarded values back off a resolved test Roll's dice. Pure. */
export function keepModeDice(results: readonly DieResultLike[]): KeepModeDice | null {
    const kept = results.find((r) => r.active === true);
    if (kept === undefined || results.length < 2) return null;
    return { kept: kept.result, discarded: results.filter((r) => r !== kept && r.discarded === true).map((r) => r.result) };
}
