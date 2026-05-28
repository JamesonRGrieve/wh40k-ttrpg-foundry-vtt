/**
 * Regression guard: `system.experience.used` must be clamped to `<= total` in
 * the character DataModel's `_cleanData` path.
 *
 * History: the 2026-05 "empty inventories" incident was paired with an XP
 * corruption — an external builder import (ajott.io) wrote each PC's full
 * build cost (~4500) as `experience.used` while `experience.total` stayed at
 * the out-of-box 1000. `available = total - used` therefore rendered negative,
 * downstream advancement-affordability math went undefined, and the sheet
 * displayed "1000 / 4500" XP. The Origin Path Builder already carried a
 * defensive clamp for this case (issue #214), but only on its commit path —
 * so direct `actor.update` writes and external imports bypassed it.
 *
 * The fix added a clamp in `CharacterData.#cleanExperience`, so the invariant
 * holds on every document initialization, not only when the builder runs.
 * This guard asserts that clamp stays present (CharacterData cannot be loaded
 * under happy-dom, so we use the source-text idiom from
 * actor-sheet-filter-init.test.ts / actor-sheet-equipment-reprep.test.ts).
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const CHAR_PATH = resolve(__dirname, '../src/module/data/actor/character.ts');
const charSrc = readFileSync(CHAR_PATH, 'utf8');

/** Extract the body of `#cleanExperience` up to its matching 4-space-indent close brace. */
function cleanExperienceBody(src: string): string {
    const m = src.match(/static #cleanExperience\s*\([^)]*\)[^{]*\{([\s\S]*?)\n {4}\}/);
    const body = m?.[1];
    if (body === undefined) {
        throw new Error('#cleanExperience method must exist in character.ts');
    }
    return body;
}

describe('character DataModel experience clamp', () => {
    const body = cleanExperienceBody(charSrc);

    it('clamps `used` to <= `total` so `available` never renders negative', () => {
        // Both halves of the invariant must be present in the cleaning step.
        expect(body, 'must compare used against total').toMatch(/used\s*>\s*total/);
        expect(body, 'must assign clamped used back').toMatch(/experience\['used'\]\s*=\s*total/);
    });

    it("guards on numeric typeof so a missing or non-numeric field doesn't throw", () => {
        // The clamp must precondition on typeof === 'number' for BOTH fields,
        // otherwise an actor with undefined/string experience throws during clean.
        expect(body).toMatch(/typeof used === 'number'/);
        expect(body).toMatch(/typeof total === 'number'/);
    });
});
