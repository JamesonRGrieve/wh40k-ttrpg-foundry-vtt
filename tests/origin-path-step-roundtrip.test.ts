/**
 * #687 save round-trip: the origin-path sheet submits `system.step` from its step
 * select. For every line, and for every step the line declares plus one it does not,
 * the select renders with that step selected, so the value a save submits is the
 * stored step. The select used to offer Rogue Trader's steps only; any other step
 * fell back to the first option and a save wrote `homeWorld` over it.
 */
import { describe, expect, it } from 'vitest';
import { SystemConfigRegistry } from '../src/module/config/game-systems/index.ts';
import type { GameSystemId } from '../src/module/config/game-systems/types.ts';
import { originGrantFieldFlags, originStepOptions } from '../src/module/rules/origin-step-options.ts';
import templateSrc from '../src/templates/item/item-origin-path-sheet.hbs?raw';
import { mockItem } from '../stories/mocks';
import { initializeStoryHandlebars } from '../stories/template-support';
import { renderSheet } from '../stories/test-helpers';

initializeStoryHandlebars();

const LINES: readonly GameSystemId[] = ['bc', 'dh1', 'dh2', 'dw', 'im', 'ow', 'rt'];
/** A step no line declares. */
const FOREIGN_STEP = 'regimentalDrawback';

/** The value the sheet's form submits for `system.step` when the item's step is `step`. */
function submittedStep(line: GameSystemId, step: string): string | undefined {
    const config = SystemConfigRegistry.get(line);
    const item = mockItem({ name: 'Origin', type: 'originPath', system: { step, stepIndex: 1, gameSystem: line } });
    const root = renderSheet(templateSrc, {
        item,
        system: item.system,
        inEditMode: true,
        editable: true,
        stepOptions: originStepOptions(config.getOriginPathStepKeys(), step, (key) => key),
        grantFields: originGrantFieldFlags(config.getOriginStepConfig().grantFields ?? []),
    });
    return root.querySelector<HTMLSelectElement>('select[name="system.step"]')?.value;
}

describe.each(LINES)('%s origin sheet keeps the step on save', (line) => {
    const declared = SystemConfigRegistry.get(line).getOriginPathStepKeys();

    it.each(declared)('a %s origin submits its own step', (step) => {
        expect(submittedStep(line, step)).toBe(step);
    });

    it('an origin whose step the line does not declare submits that step unchanged', () => {
        const foreign = declared.includes(FOREIGN_STEP) ? 'lureOfTheVoid' : FOREIGN_STEP;
        expect(submittedStep(line, foreign)).toBe(foreign);
    });
});
