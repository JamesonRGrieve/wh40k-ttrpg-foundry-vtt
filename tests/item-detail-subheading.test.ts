/**
 * Sub-headings inside item-detail panels use one shared partial in the panel
 * title's face (#699).
 *
 * The talent and NPC-template sheets used bare `<h4>` elements. A bare h4 takes
 * Foundry's h4 style (Modesto Condensed, 24px), so a granted ability's name or a
 * "Skills" label rendered larger and showier than the panel title above it. Five
 * other talent sub-headings repeated one long compact class string by hand.
 */
import { describe, expect, it } from 'vitest';
import { readRepoFile } from './lib/repo-file.ts';

const PARTIAL = readRepoFile('src/templates/item/partial/item-detail-subheading.hbs');
const PARTIAL_PATH = 'systems/wh40k-rpg/templates/item/partial/item-detail-subheading.hbs';
const SHEETS = ['src/templates/item/talent-sheet.hbs', 'src/templates/item/npc-template/tab-preview.hbs'] as const;

describe('item-detail sub-headings (#699)', () => {
    it("sets the sub-heading in the panel title's font, at a compact size", () => {
        expect(PARTIAL).toContain('tw-font-[family-name:var(--font-h3)]');
        expect(PARTIAL).toContain('tw-text-[0.8rem]');
        expect(PARTIAL).toContain('data-item-subheading');
    });

    it.each(SHEETS)('%s has no hand-styled <h4>, only the shared sub-heading', (path) => {
        const src = readRepoFile(path);
        expect(src).not.toMatch(/<h4\b/u);
        expect(src).toContain(PARTIAL_PATH);
    });

    it('the talent sheet uses the sub-heading for every modifier group, grant group and special ability', () => {
        const uses = readRepoFile('src/templates/item/talent-sheet.hbs').split(PARTIAL_PATH).length - 1;
        expect(uses).toBe(9);
    });

    it("reads only prefixed optional arguments, so an enclosing panel's icon cannot show through", () => {
        // A hash argument the caller omits resolves up the context chain: inside an
        // item-detail-section block, a bare `icon` is the panel's own icon.
        expect(PARTIAL).toContain('{{#if subheadingIcon}}');
        expect(PARTIAL).not.toMatch(/\{\{#if icon\}\}|\{\{icon\}\}|\{\{extraClass\}\}/u);
    });

    it('the partial is preloaded', () => {
        expect(readRepoFile('src/module/handlebars/handlebars-manager.ts')).toContain(`'${PARTIAL_PATH}'`);
    });
});
