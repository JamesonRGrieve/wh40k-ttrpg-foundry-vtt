import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The modifiers editor's Basic / Situational / Advanced tabs (#669) highlighted on
 * click but never switched their panels: the template carried none of the hooks
 * Foundry's ApplicationV2 tab mechanism looks for. It needs a `.tabs` nav, buttons
 * with `data-action="tab"`, and `.tab` panels, each marked active from the sheet's
 * `tabGroups.modifiers` so the open tab survives a re-render. The sheet itself can't
 * load under happy-dom, so these assert the template and sheet source.
 */

const root = resolve(__dirname, '..');
const template = readFileSync(resolve(root, 'src/templates/item/panel/modifiers-editor-panel.hbs'), 'utf8');
const sheet = readFileSync(resolve(root, 'src/module/applications/item/base-item-sheet.ts'), 'utf8');
const TABS = ['basic', 'situational', 'advanced'];

/** The opening tag of the element carrying the given tag name and `data-tab`. */
function openingTag(tag: string, tab: string): string {
    // Attribute values may hold `>` (the `[&>*]:` variant), so quoted values are skipped whole.
    const attrs = '(?:[^>"]|"[^"]*")*';
    const match = new RegExp(`<${tag}\\b${attrs}data-tab="${tab}"${attrs}>`).exec(template);
    if (match === null) throw new Error(`no <${tag} data-tab="${tab}">`);
    return match[0];
}

describe('modifiers editor tabs (#669)', () => {
    it('puts the tab buttons in a `.tabs` nav for the modifiers group', () => {
        expect(template).toMatch(/<nav class="tabs [^"]*" data-group="modifiers">/);
    });

    it.each(TABS)('makes the %s button a Foundry tab action, active from tabGroups', (tab) => {
        const button = openingTag('button', tab);
        expect(button).toContain('data-action="tab"');
        expect(button).toContain('data-group="modifiers"');
        expect(button).toContain(`{{#if (eq tabGroups.modifiers '${tab}')}}active{{/if}}`);
        // Foundry reads the tab off the click's own target, so the icon and label pass clicks through.
        expect(button).toContain('[&>*]:tw-pointer-events-none');
    });

    it.each(TABS)('makes the %s panel a `.tab`, hidden unless active', (tab) => {
        const panel = openingTag('div', tab);
        expect(panel).toMatch(/class="tab tw-hidden /);
        expect(panel).toContain('[&.active]:tw-flex');
        expect(panel).toContain(`{{#if (eq tabGroups.modifiers '${tab}')}}active{{/if}}`);
    });

    it('gives item sheets a tabGroups context that opens the modifiers group on Basic', () => {
        expect(sheet).toContain("const MODIFIERS_TAB_GROUP = 'modifiers';");
        expect(sheet).toContain("const MODIFIERS_INITIAL_TAB = 'basic';");
        expect(sheet).toContain('tabGroups: { [MODIFIERS_TAB_GROUP]: MODIFIERS_INITIAL_TAB, ...this.tabGroups },');
    });
});
