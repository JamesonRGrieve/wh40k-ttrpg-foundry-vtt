/**
 * The theme-adoption scan counts a template that renders a per-system-aware
 * partial (#696). #695 moved nine templates' accent onto the shared
 * item-detail-section panel; a per-file scan dropped them and the ratchet fell.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { classifyThemeAwareness, partialReferences } from '../scripts/lib/theme-awareness.mjs';

const IDS = ['bc', 'dh1', 'dh2', 'dw', 'ow', 'rt', 'im'] as const;
const PANEL = 'src/templates/item/partial/item-detail-section.hbs';
const PANEL_SRC = `<section><i class="fas {{icon}} {{themeClassFor 'accent'}}"></i>{{> @partial-block}}</section>`;
const PLAIN = 'src/templates/item/plain-shell.hbs';
const SHEET = 'src/templates/item/sheet.hbs';

const withPanel = `<div>{{#> systems/wh40k-rpg/templates/item/partial/item-detail-section.hbs icon="fa-x" labelKey="K"}}body{{/systems/wh40k-rpg/templates/item/partial/item-detail-section.hbs}}</div>`;

function classify(entries: Record<string, string>): { direct: Set<string>; inherited: Set<string> } {
    return classifyThemeAwareness(new Map(Object.entries(entries)), IDS);
}

describe('theme awareness through partials (#696)', () => {
    it('a template that renders a themed partial counts; the same template without it does not', () => {
        const using = classify({ [PANEL]: PANEL_SRC, [SHEET]: withPanel });
        expect(using.direct.has(PANEL)).toBe(true);
        expect(using.inherited.has(SHEET)).toBe(true);

        const without = classify({ [PANEL]: PANEL_SRC, [SHEET]: '<div><h3>Storage</h3>body</div>' });
        expect(without.direct.has(SHEET)).toBe(false);
        expect(without.inherited.has(SHEET)).toBe(false);
    });

    it('rendering an unthemed partial does not count', () => {
        const result = classify({
            [PLAIN]: '<section>{{> @partial-block}}</section>',
            [SHEET]: '{{#> systems/wh40k-rpg/templates/item/plain-shell.hbs}}x{{/systems/wh40k-rpg/templates/item/plain-shell.hbs}}',
        });
        expect(result.inherited.has(SHEET)).toBe(false);
    });

    it('awareness passes through a chain of partials', () => {
        const result = classify({
            [PANEL]: PANEL_SRC,
            [PLAIN]: withPanel,
            [SHEET]: '{{> systems/wh40k-rpg/templates/item/plain-shell.hbs}}',
        });
        expect(result.inherited.has(PLAIN)).toBe(true);
        expect(result.inherited.has(SHEET)).toBe(true);
    });

    it('a partial named only in a comment is not rendered', () => {
        const commented = `{{!-- was {{> systems/wh40k-rpg/templates/item/partial/item-detail-section.hbs}} --}}<div></div>`;
        expect(partialReferences(commented)).toEqual([]);
        expect(classify({ [PANEL]: PANEL_SRC, [SHEET]: commented }).inherited.has(SHEET)).toBe(false);
    });

    it('direct theming still counts on its own: a variant class or themeClassFor', () => {
        const result = classify({ [SHEET]: '<div class="dh2:tw-bg-bronze"></div>', [PLAIN]: `<i class="{{themeClassFor 'accent'}}"></i>` });
        expect([...result.direct].sort()).toEqual([PLAIN, SHEET].sort());
    });

    it('the gear sheet counts through the shared panel', () => {
        const gear = 'src/templates/item/item-gear-sheet.hbs';
        const result = classify({ [PANEL]: readFileSync(PANEL, 'utf8'), [gear]: readFileSync(gear, 'utf8') });
        expect(result.inherited.has(gear)).toBe(true);
    });
});
