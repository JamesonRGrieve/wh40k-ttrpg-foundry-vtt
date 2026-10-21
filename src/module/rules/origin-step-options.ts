/**
 * The origin-path sheet's step select and line-specific grant fields (#687).
 *
 * The step options are the steps the item's own line declares
 * (`getOriginPathStepKeys`). A stored step the line does not declare is still
 * offered, selected, so saving the sheet never rewrites it. The select used to
 * hard-code Rogue Trader's steps: every other line's origin opened on "Home
 * World", and a save turned it into one.
 */
import { SystemConfigRegistry } from '../config/game-systems/index.ts';
import type { OriginGrantField } from '../config/game-systems/types.ts';
import { ownerGameLine } from '../utils/item-variant-utils.ts';

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

/** An item owner as the line resolver reads it: an actor document or raw actor source (`ownerGameLine` reads `type`, then `system.gameSystem`). */
export interface OriginOwner {
    type?: string;
    system?: object;
}

/**
 * The line an origin sheet renders for. An owned origin follows its owning actor's
 * line, by the rule the variant resolver uses (`ownerGameLine`), so an RT
 * character's Void Born shows RT's fields although its canonical document is
 * DH2's (#690). An unowned origin uses its own `gameSystem`.
 */
export function originSheetLine(owner: OriginOwner | null | undefined, itemLine: string): string {
    return ownerGameLine(owner) ?? itemLine;
}

/** What the origin sheet derives from its line: the step select's options and the grant-field flags. */
export interface OriginSheetLineContext {
    stepOptions: OriginStepOption[];
    grantFields: OriginGrantFieldFlags;
}

/** The step select and grant fields for `step` on `line`; no options and no grant fields for a line with no config. */
export function originSheetLineContext(line: string, step: string, label: (step: string) => string): OriginSheetLineContext {
    const config = SystemConfigRegistry.getOrNull(line);
    return {
        stepOptions: originStepOptions(config?.getOriginPathStepKeys() ?? [], step, label),
        grantFields: originGrantFieldFlags(config?.getOriginStepConfig().grantFields ?? []),
    };
}
