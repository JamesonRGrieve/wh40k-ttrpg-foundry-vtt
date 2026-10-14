/**
 * Regression guard: the NPC template selector's template matches the context
 * `TemplateSelector._prepareContext` provides.
 *
 * The template used to read `filteredTemplates`, `selectedTemplateData`,
 * `targetThreat` and other keys the dialog never set, and called the `eq`
 * value helper as a block (`{{#eq}}…{{/eq}}`), so the dialog listed nothing and
 * no option was ever selected. These tests render it against the real context
 * shape and check the controls `_onRender` binds to really exist.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import templateSrc from '../src/templates/dialogs/template-selector.hbs?raw';
import { initializeStoryHandlebars } from '../stories/template-support';
import { renderSheet } from '../stories/test-helpers';

initializeStoryHandlebars();

const ROOT = resolve(__dirname, '..');

/** The shape `TemplateSelector._prepareContext` returns. */
function context(overrides: object = {}): object {
    return {
        templates: [
            {
                uuid: 'Item.cultist',
                name: 'Chaos Cultist',
                img: 'icons/svg/mystery-man.svg',
                category: 'troops',
                categoryLabel: 'Troops',
                faction: 'Chaos',
                baseThreat: 4,
                type: 'troop',
                role: 'bruiser',
                summary: 'A frenzied heretic.',
                selected: true,
            },
            {
                uuid: 'Item.guard',
                name: 'Hive Enforcer',
                img: 'icons/svg/mystery-man.svg',
                category: 'troops',
                categoryLabel: 'Troops',
                faction: '',
                baseThreat: 6,
                type: 'troop',
                role: 'specialist',
                summary: '',
                selected: false,
            },
        ],
        hasTemplates: true,
        templateCount: 2,
        filters: { category: 'troops', faction: '', search: 'cult' },
        categories: [{ key: 'troops', label: 'Troops', selected: true }],
        factions: [{ key: 'Chaos', label: 'Chaos', selected: false }],
        selectedTemplate: { name: 'Chaos Cultist' },
        hasSelection: true,
        preview: {
            threatLevel: 7,
            characteristics: [
                { key: 'weaponSkill', label: 'WS', value: 38 },
                { key: 'ballisticSkill', label: 'BS', value: 33 },
            ],
            wounds: 12,
            armour: 3,
            weaponCount: 2,
            skillCount: 4,
        },
        threatLevel: 7,
        isHorde: true,
        buttons: [
            { action: 'create', icon: 'fa-solid fa-plus', label: 'WH40K.NPC.Template.CreateFromTemplate', disabled: false },
            { action: 'cancel', icon: 'fa-solid fa-times', label: 'WH40K.Cancel' },
        ],
        ...overrides,
    };
}

describe('NPC template selector template', () => {
    it('lists every template the dialog provides and marks the selected one', () => {
        const root = renderSheet(templateSrc, context());
        const rows = [...root.querySelectorAll<HTMLElement>('[data-action="selectTemplate"]')];
        expect(rows.map((row) => row.dataset['uuid'])).toEqual(['Item.cultist', 'Item.guard']);
        expect(rows[0]?.getAttribute('aria-selected')).toBe('true');
        expect(rows[1]?.getAttribute('aria-selected')).toBe('false');
        expect(rows[0]?.textContent).toContain('Chaos Cultist');
        expect(rows[0]?.textContent).toContain('4');
    });

    it('keeps the current filters selected', () => {
        const root = renderSheet(templateSrc, context());
        expect(root.querySelector<HTMLSelectElement>('[name="filterCategory"]')?.value).toBe('troops');
        expect(root.querySelector<HTMLSelectElement>('[name="filterFaction"]')?.value).toBe('');
        expect(root.querySelector<HTMLInputElement>('[name="filterSearch"]')?.value).toBe('cult');
    });

    it('shows the preview at the chosen threat and the horde toggle', () => {
        const root = renderSheet(templateSrc, context());
        expect(root.querySelector<HTMLInputElement>('[name="threatLevel"]')?.value).toBe('7');
        expect(root.querySelector('[data-tsel="threat-value"]')?.textContent).toBe('7');
        expect(root.querySelector<HTMLInputElement>('[name="isHorde"]')?.checked).toBe(true);
        expect(root.querySelector('[data-characteristic="weaponSkill"]')?.textContent).toContain('38');
        expect(root.querySelector('[data-preview="wounds"]')?.textContent).toBe('12');
        expect(root.querySelector('[data-preview="armour"]')?.textContent).toBe('3');
    });

    it('enables Create only once a template is selected', () => {
        const selected = renderSheet(templateSrc, context());
        expect(selected.querySelector<HTMLButtonElement>('[data-action="create"]')?.disabled).toBe(false);
        const none = renderSheet(
            templateSrc,
            context({
                hasSelection: false,
                selectedTemplate: undefined,
                preview: null,
                buttons: [
                    { action: 'create', icon: 'fa-solid fa-plus', label: 'WH40K.NPC.Template.CreateFromTemplate', disabled: true },
                    { action: 'cancel', icon: 'fa-solid fa-times', label: 'WH40K.Cancel' },
                ],
            }),
        );
        expect(none.querySelector<HTMLButtonElement>('[data-action="create"]')?.disabled).toBe(true);
        expect(none.querySelector('[name="threatLevel"]')).toBeNull();
    });

    it('says so when no template matches', () => {
        const root = renderSheet(templateSrc, context({ templates: [], hasTemplates: false, templateCount: 0 }));
        expect(root.querySelector('[data-action="selectTemplate"]')).toBeNull();
        expect(root.querySelector('[data-tsel="empty"]')).not.toBeNull();
    });

    it('has every control the dialog binds to and every action it declares', () => {
        const source = readFileSync(join(ROOT, 'src/module/applications/npc/template-selector.ts'), 'utf8');
        const names = [...source.matchAll(/\[name="([^"]+)"\]/g)].map((m) => m[1]);
        expect(names.length).toBeGreaterThan(0);
        for (const name of names) expect(templateSrc).toContain(`name="${name}"`);
        const declared = new Set([...source.matchAll(/^\s{12}(\w+): TemplateSelector\.#/gm)].map((m) => m[1]));
        const used = [...templateSrc.matchAll(/data-action="(\w+)"/g)].map((m) => m[1]);
        for (const action of used) expect(declared).toContain(action);
    });
});

function hbsFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return hbsFiles(path);
        return entry.name.endsWith('.hbs') ? [path] : [];
    });
}

describe('the eq helper is a value helper', () => {
    it('no template calls it as a block ({{#eq}} renders "true"/"false", never its body)', () => {
        const offenders = hbsFiles(join(ROOT, 'src/templates'))
            .filter((file) => /\{\{#eq\b/.test(readFileSync(file, 'utf8')))
            .map((file) => relative(ROOT, file));
        expect(offenders).toEqual([]);
    });
});
