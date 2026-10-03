/**
 * Regression guard: preparing skill render context must never write to the actor.
 *
 * History: `_augmentSkillData` called `actor.setFlag('wh40k-rpg', 'favoriteSkills', …)`
 * to prune untrained advanced skills from the favourites list. That write ran on
 * every render, re-rendered the sheet, and silently changed the favourites panel
 * between the first render and the next (the view/edit screenshots of every PC
 * showed different favourite lists). Eligibility is now a display-only filter
 * (`_isFavouriteEligible`) shared by the Skills tab and the Overview panel.
 *
 * Source-text idiom (the sheet classes cannot load under happy-dom); see
 * actor-sheet-equipment-reprep.test.ts.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (rel: string): string => readFileSync(resolve(__dirname, '..', rel), 'utf8');
const baseSrc = read('src/module/applications/actor/base-actor-sheet.ts');
const charSrc = read('src/module/applications/actor/character-sheet.ts');

/** Body of a 4-space-indented class method, up to its closing brace. */
function methodBody(src: string, signature: RegExp, name: string): string {
    const m = src.match(new RegExp(`${signature.source}[^{]*\\{([\\s\\S]*?)\\n {4}\\}`));
    const body = m?.[1];
    if (body === undefined) throw new Error(`${name} must exist`);
    return body;
}

describe('skill context preparation has no side effects', () => {
    // Anchor on the declaration line (start of line, 4-space indent), not a call site.
    const augment = methodBody(baseSrc, /\n {4}_augmentSkillData\s*\(/, '_augmentSkillData');
    const favourites = methodBody(charSrc, /\n {4}_prepareFavoriteSkills\s*\(\)/, '_prepareFavoriteSkills');

    it('_augmentSkillData never writes flags or updates the actor', () => {
        expect(augment).not.toMatch(/\.(setFlag|unsetFlag|update)\(/);
    });

    it('both favourite surfaces gate on the shared display-only eligibility check', () => {
        expect(augment).toContain('_isFavouriteEligible(');
        expect(favourites).toContain('_isFavouriteEligible(');
        expect(favourites).not.toMatch(/\.(setFlag|unsetFlag|update)\(/);
    });
});
