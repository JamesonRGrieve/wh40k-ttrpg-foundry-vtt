/**
 * The origin-path sheet's step select and line-specific grant fields (#687).
 *
 * The step options are the steps the item's own line declares
 * (`getOriginPathStepKeys`). A stored step the line does not declare is still
 * offered, selected, so saving the sheet never rewrites it. The select used to
 * hard-code Rogue Trader's steps: every other line's origin opened on "Home
 * World", and a save turned it into one.
 */
import type { OriginGrantField } from '../config/game-systems/types.ts';

/** One `<option>` of the step select. */
export interface OriginStepOption {
    value: string;
    label: string;
    selected: boolean;
}

/** Which line-specific grant fields the origin sheet shows. */
export type OriginGrantFieldFlags = Record<OriginGrantField, boolean>;

/** The step select's options: the line's steps in order, plus the stored step when the line does not declare it. */
export function originStepOptions(lineSteps: readonly string[], current: string, label: (step: string) => string): OriginStepOption[] {
    const steps = current !== '' && !lineSteps.includes(current) ? [...lineSteps, current] : [...lineSteps];
    return steps.map((step) => ({ value: step, label: label(step), selected: step === current }));
}

/** The grant fields the line declares, as flags the template reads. */
export function originGrantFieldFlags(declared: readonly OriginGrantField[]): OriginGrantFieldFlags {
    return { fateThreshold: declared.includes('fateThreshold'), blessedByEmperor: declared.includes('blessedByEmperor') };
}
