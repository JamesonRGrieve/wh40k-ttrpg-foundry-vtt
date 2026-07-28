/**
 * Layout/chrome guard for the craft sheets (#502).
 *
 * The craft-sheet stories asserted only CONTENT (`getByDisplayValue('Chimera
 * APC')`, `assertField(...)`), so a sheet whose panels were the wrong colour,
 * whose fields sprawled six-across, and whose description editor never mounted
 * passed every check. These assertions gate the appearance instead:
 *
 *   - no hardcoded colour literal anywhere under the craft templates
 *   - craft panels use the SHARED panel partial, not a second implementation
 *   - craft fields use the SHARED field-row partial; the bespoke one is gone
 *   - field grids carry a bounded column count (no unbounded auto-fit row)
 *   - rich-text surfaces go through the `{{#if inEditMode}}` ProseMirror path
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const CRAFT_DIR = resolve(__dirname, '../src/templates/actor/craft');
const PARTIAL_DIR = resolve(__dirname, '../src/templates/actor/partial');

const craftTemplates: Array<{ name: string; text: string }> = readdirSync(CRAFT_DIR)
    .filter((f) => f.endsWith('.hbs'))
    .map((name) => ({ name, text: readFileSync(join(CRAFT_DIR, name), 'utf8') }));

/** Strip `{{!-- … --}}` comments so issue refs like `#502` aren't read as colours. */
const withoutComments = (text: string): string => text.replace(/\{\{!--[\s\S]*?--\}\}/g, '');

const COLOUR_LITERAL = /#[0-9a-fA-F]{3,8}\b|rgba?\(/;

describe('craft sheet chrome (#502)', () => {
    it('finds the craft templates', () => {
        expect(craftTemplates.length).toBeGreaterThan(0);
    });

    it.each(craftTemplates)('$name carries no hardcoded colour literal', ({ text }) => {
        const offenders = withoutComments(text)
            .split('\n')
            .filter((line) => COLOUR_LITERAL.test(line));
        expect(offenders).toEqual([]);
    });

    it('the bespoke craft panel and field partials are deleted', () => {
        expect(existsSync(join(PARTIAL_DIR, 'craft-section.hbs'))).toBe(false);
        expect(existsSync(join(PARTIAL_DIR, 'craft-field.hbs'))).toBe(false);
    });

    it('no craft template still references the retired partials', () => {
        for (const { name, text } of craftTemplates) {
            expect(`${name}:${text.includes('craft-section.hbs')}`).toBe(`${name}:false`);
            expect(`${name}:${text.includes('craft-field.hbs')}`).toBe(`${name}:false`);
        }
    });

    it('craft panels use the shared panel partial', () => {
        const usingPanels = craftTemplates.filter(({ text }) => text.includes('partial/panel.hbs'));
        expect([...usingPanels.map((t) => t.name)].sort()).toEqual([
            'tab-combat.hbs',
            'tab-components.hbs',
            'tab-crew.hbs',
            'tab-notes.hbs',
            'tab-overview.hbs',
        ]);
    });

    it('craft fields use the shared field-row partial', () => {
        for (const name of ['tab-overview.hbs', 'tab-crew.hbs', 'tab-combat.hbs', 'tab-notes.hbs']) {
            const tpl = craftTemplates.find((t) => t.name === name);
            expect(`${name}:${tpl?.text.includes('shared/field-row.hbs') ?? false}`).toBe(`${name}:true`);
        }
    });

    it('field grids are column-bounded — no unbounded auto-fit row', () => {
        // `auto-fit,minmax(150px,1fr)` resolved to six 150px inputs across the
        // 1000px window, the same sprawl #15 was filed for.
        for (const { name, text } of craftTemplates) {
            expect(`${name}:${text.includes('tw-grid-cols-[repeat(auto-fit')}`).toBe(`${name}:false`);
        }
    });

    it('rich-text surfaces mount ProseMirror through the edit-mode path', () => {
        // A bare `<div class="editor-content" data-edit=…>` never mounts an
        // editor (CLAUDE.md gotcha #5) — the description was not editable.
        for (const name of ['tab-overview.hbs', 'tab-notes.hbs']) {
            const text = craftTemplates.find((t) => t.name === name)?.text ?? '';
            expect(`${name}:${text.includes('engine="prosemirror"')}`).toBe(`${name}:true`);
            expect(`${name}:${text.includes('{{#if inEditMode}}')}`).toBe(`${name}:true`);
            expect(`${name}:${text.includes('data-edit=')}`).toBe(`${name}:false`);
        }
    });

    it('craft surfaces carry per-system theming', () => {
        // Direction #3: the craft sheet was the only actor family that looked
        // identical in all seven lines and matched none of them.
        const themed = craftTemplates.filter(({ text }) => text.includes('themeClassFor'));
        expect(themed.length).toBeGreaterThanOrEqual(4);
    });
});
