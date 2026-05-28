/**
 * Regression guard: the Equipment and Combat tabs must re-prepare loadout /
 * combat-station data inside `_prepareTabPartContext`.
 *
 * History: ApplicationV2 renders each PART with an isolated part context, so
 * the loadout/combat data computed in `_prepareContext` does NOT survive into
 * the part context for the equipment or combat tabs. The skills and powers
 * tabs already re-prepared their data inside `_prepareTabPartContext`, but the
 * equipment/combat branch was missing — so the Equipment tab rendered an empty
 * inventory (`allCarriedItems` absent) even though the actor carried items.
 *
 * The fix added a `partId === 'equipment' || partId === 'combat'` branch that
 * re-runs `_getCategorizedItems` → `_prepareLoadoutData` + `_prepareCombatData`,
 * mirroring the skills/powers re-prep. This test enforces that branch stays
 * present so the empty-inventory regression cannot silently return.
 *
 * Uses the source-text structural-guard idiom from
 * actor-sheet-filter-init.test.ts (the sheet class cannot load under happy-dom).
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const CHAR_PATH = resolve(__dirname, '../src/module/applications/actor/character-sheet.ts');
const charSrc = readFileSync(CHAR_PATH, 'utf8');

/** Extract the body of `_prepareTabPartContext` (up to its 4-space-indented close brace). */
function prepareTabPartContextBody(src: string): string {
    const m = src.match(/async _prepareTabPartContext\s*\([^)]*\)[^{]*\{([\s\S]*?)\n {4}\}/);
    const body = m?.[1];
    if (body === undefined) {
        throw new Error('_prepareTabPartContext method must exist in character-sheet.ts');
    }
    return body;
}

describe('character sheet equipment/combat tab re-prep', () => {
    const body = prepareTabPartContextBody(charSrc);

    it('re-prepares loadout/combat data for the equipment and combat parts', () => {
        // The branch guard must cover both inventory-bearing tabs.
        expect(body).toMatch(/partId === 'equipment'/);
        expect(body).toMatch(/partId === 'combat'/);
    });

    it('invokes the loadout and combat prep helpers within that branch', () => {
        // Isolate the equipment/combat branch and assert it re-runs the prep
        // pipeline that populates `allCarriedItems` and the combat station.
        const branch = body.match(/if \(partId === 'equipment' \|\| partId === 'combat'\)\s*\{([\s\S]*?)\n {8}\}/);
        const branchBody = branch?.[1];
        expect(branchBody, 'equipment/combat re-prep branch must be present').toBeTypeOf('string');
        expect(branchBody).toMatch(/_getCategorizedItems\(\)/);
        expect(branchBody).toMatch(/_prepareLoadoutData\(/);
        expect(branchBody).toMatch(/_prepareCombatData\(/);
    });
});
