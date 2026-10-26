/**
 * The talent sheet's effects summary strip (#701). It sat flush to the window
 * edge as bare text ("Effects / Modifiers 1 / Grants 1+1 / View Details"). It
 * is now an inset, bordered row whose three kinds share one pill partial.
 */
import HandlebarsCompiler from 'handlebars';
import { describe, expect, it } from 'vitest';
import { readRepoFile } from './lib/repo-file.ts';

const TEMPLATE = readRepoFile('src/templates/item/talent-sheet.hbs');
const BANNER = /data-wh40k-hook="talent-effects-banner"[^>]*>/u.exec(TEMPLATE)?.[0] ?? '';

describe('talent effects banner (#701)', () => {
    it('is inset with the sheet padding and drawn as a bordered row', () => {
        for (const cls of ['tw-mx-3', 'tw-px-3', 'tw-border', 'tw-rounded-md']) expect(BANNER).toContain(cls);
    });

    it('renders every effect kind through the one pill partial', () => {
        expect(TEMPLATE.match(/\{\{#> talentEffectPill /gu)).toHaveLength(3);
        expect(TEMPLATE).toContain('data-wh40k-hook="talent-effect-pill"');
    });

    it('still parses', () => {
        expect(() => HandlebarsCompiler.precompile(TEMPLATE)).not.toThrow();
    });
});
