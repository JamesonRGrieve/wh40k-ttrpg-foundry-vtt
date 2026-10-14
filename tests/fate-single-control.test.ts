/**
 * Guard (#640, operator decision): the Overview vitals Fate row is the single Fate
 * control. `actor/panel/fate-panel.hbs` was preloaded and storied but rendered by
 * no sheet; it was deleted with its preload entry and story rather than wired in.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..');
const read = (rel: string): string => readFileSync(resolve(ROOT, rel), 'utf8');

describe('one Fate control', () => {
    it('the unused fate panel, its preload entry and its story are gone', () => {
        expect(existsSync(resolve(ROOT, 'src/templates/actor/panel/fate-panel.hbs'))).toBe(false);
        expect(existsSync(resolve(ROOT, 'src/templates/actor/panel/fate-panel.stories.ts'))).toBe(false);
        expect(read('src/module/handlebars/handlebars-manager.ts')).not.toContain('actor/panel/fate-panel.hbs');
    });

    it('the Overview vitals Fate row spends, restores and burns Fate', () => {
        const vitals = read('src/templates/actor/panel/overview-vitals-panel.hbs');
        expect(vitals).toContain('setFateStar');
        expect(vitals).toContain('spendFate');
    });
});
