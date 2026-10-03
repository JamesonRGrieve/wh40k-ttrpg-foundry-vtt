/**
 * Regression guard: every actor sheet's template context carries `inEditMode`.
 *
 * History: only CharacterSheet copied `inEditMode` into its context, so the
 * craft sheet's six `{{#if inEditMode}}` blocks (Description editor, stat inputs)
 * and the loot sheet's description editor could never render — toggling edit
 * mode changed nothing on those sheets. The flag now lives in
 * BaseActorSheet._prepareCommonContext, which every actor sheet inherits.
 *
 * Source-text idiom (the sheet classes cannot load under happy-dom); see
 * actor-sheet-equipment-reprep.test.ts.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (rel: string): string => readFileSync(resolve(__dirname, '..', rel), 'utf8');

describe('actor sheet edit-mode context', () => {
    const base = read('src/module/applications/actor/base-actor-sheet.ts');
    const common = base.match(/\n {4}protected _prepareCommonContext\([^)]*\)[^{]*\{([\s\S]*?)\n {4}\}/)?.[1];

    it('BaseActorSheet._prepareCommonContext exposes inEditMode and editable', () => {
        expect(common, '_prepareCommonContext must exist').toBeDefined();
        expect(common).toContain("context['inEditMode'] = this.inEditMode");
        expect(common).toContain("context['editable'] = this.isEditable");
    });

    it.each(['src/templates/actor/craft/tab-overview.hbs', 'src/templates/actor/loot/loot-sheet.hbs'])('%s gates its editor on inEditMode', (template) => {
        expect(read(template)).toContain('{{#if inEditMode}}');
    });
});
