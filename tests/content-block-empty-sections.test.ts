/**
 * Regression (#597): the read-only mutation (Gift) and special ability (Distinction)
 * sheets printed the Description, Drawback / Benefit, Notes and Modifiers headings
 * with nothing under them. Each section of the shared content-block sheet now renders
 * through content-block-section.hbs, which a read-only sheet skips when the section
 * is empty; edit mode keeps every section, to be filled in.
 */

import HbsStory from 'handlebars';
import { describe, expect, it } from 'vitest';
import sheetSrc from '../src/templates/item/item-content-block-sheet.hbs?raw';
import { initializeStoryHandlebars } from '../stories/template-support';

initializeStoryHandlebars();
const sheet = HbsStory.compile(sheetSrc);

interface ContentField {
    name: string;
    labelKey: string;
    value: string;
}

const ZERO_MODIFIERS = { characteristics: { strength: 0 }, skills: {}, combat: { attack: 0, damage: 0 }, resources: { wounds: 0, fate: 0 }, other: [] };

/** The mutation sheet's fields (Effect, Drawback) or the special ability's (Benefit), all empty unless given. */
const MUTATION_FIELDS = (effect = '', drawback = ''): ContentField[] => [
    { name: 'system.effect', labelKey: 'WH40K.Mutation.Effect', value: effect },
    { name: 'system.drawback', labelKey: 'WH40K.Mutation.Drawback', value: drawback },
];
const ABILITY_FIELDS = (benefit = ''): ContentField[] => [{ name: 'system.benefit', labelKey: 'WH40K.SpecialAbility.Benefit', value: benefit }];

function render(opts: { inEditMode: boolean; description?: string; notes?: string; fields: ContentField[]; modifiers?: object }): HTMLElement {
    const system = { description: { value: opts.description ?? '<p></p>' }, notes: opts.notes ?? '', modifiers: opts.modifiers ?? ZERO_MODIFIERS };
    const root = document.createElement('div');
    root.innerHTML = sheet({
        item: { name: 'Test Item', img: 'icons/svg/mystery-man.svg', system },
        system,
        contentScalars: [],
        contentFields: opts.fields,
        inEditMode: opts.inEditMode,
        canEdit: true,
        editable: opts.inEditMode,
    });
    return root;
}

/** The sections a render shows, by heading key. */
function sections(root: HTMLElement): string[] {
    return [...root.querySelectorAll<HTMLElement>('[data-content-section]')].map((section) => section.dataset['contentSection'] ?? '');
}

/** Every heading in the sheet's content area, whatever renders it. */
function headings(root: HTMLElement): string[] {
    return [...root.querySelectorAll('section.wh40k-tab-content h3, section.wh40k-tab-content h4')].map((h) => h.textContent.trim());
}

describe('read-only content-block sheets hide empty sections (#597)', () => {
    it('an empty mutation shows no Description, Effect, Drawback, Notes or Modifiers heading', () => {
        const root = render({ inEditMode: false, fields: MUTATION_FIELDS() });
        expect(headings(root)).toEqual([]);
        expect(sections(root)).toEqual([]);
    });

    it('an empty special ability shows no Description, Benefit, Notes or Modifiers heading', () => {
        const root = render({ inEditMode: false, fields: ABILITY_FIELDS() });
        expect(headings(root)).toEqual([]);
        expect(sections(root)).toEqual([]);
    });

    it('a section with content still shows, and only those', () => {
        const root = render({
            inEditMode: false,
            description: '<p>A gift of the Dark Gods.</p>',
            fields: MUTATION_FIELDS('', '<p>−10 Fellowship.</p>'),
            modifiers: { ...ZERO_MODIFIERS, characteristics: { fellowship: -10 } },
        });
        expect(sections(root)).toEqual(['WH40K.Item.Tabs.Description', 'WH40K.Mutation.Drawback', 'WH40K.Item.Tabs.Modifiers']);
        // Within Modifiers, only the group that holds one: no empty Skills / Combat / Resources headings.
        const modifiers = root.querySelector('[data-content-section="WH40K.Item.Tabs.Modifiers"]');
        expect(modifiers?.querySelectorAll('h4')).toHaveLength(1);
    });

    it('edit mode keeps every section, to be filled in', () => {
        expect(sections(render({ inEditMode: true, fields: MUTATION_FIELDS() }))).toEqual([
            'WH40K.Item.Tabs.Description',
            'WH40K.Mutation.Effect',
            'WH40K.Mutation.Drawback',
            'WH40K.Item.Tabs.Notes',
            'WH40K.Item.Tabs.Modifiers',
        ]);
    });
});
