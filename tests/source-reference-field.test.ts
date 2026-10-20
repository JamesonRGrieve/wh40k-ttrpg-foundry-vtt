/**
 * #229 — every item sheet shows and edits the structured `system.source`
 * reference through ONE control, and every displayed reference is formatted by
 * the ONE `formatSourceLabel` helper.
 *
 * Covered here:
 *  - the shared `source-reference-field` partial (editable → Book + Page inputs,
 *    read-only → the formatted label, never "[object Object]");
 *  - a source scan: no item-sheet template binds an input to `system.source`
 *    itself (the SchemaField stringifies to "[object Object]", and a submit
 *    would write that string back over the reference);
 *  - the legacy `custom` reference slot the `sourceReference` getters relied on;
 *  - the stories added for the fix, by running their `play` functions.
 */
import type { Args, HtmlRenderer, Meta, StoryContext, StoryObj } from '@storybook/html-vite';
import Hbs from 'handlebars';
import { describe, expect, it } from 'vitest';
import { walkFiles } from '../scripts/lib/walk.mjs';
import { formatSourceLabel } from '../src/module/handlebars/source-label.ts';
import { readRepoFile } from '../src/module/testing/repo-file.ts';
import partialSrc from '../src/templates/item/partial/source-reference-field.hbs?raw';
import { mockSourceReference } from '../stories/mocks';
import { initializeStoryHandlebars } from '../stories/template-support';

initializeStoryHandlebars();

const partial = Hbs.compile(partialSrc);

function render(context: object): HTMLElement {
    const root = document.createElement('div');
    root.innerHTML = partial(context);
    return root;
}

describe('source-reference-field partial (#229)', () => {
    it('edits a structured source as Book + Page inputs', () => {
        const root = render({ source: mockSourceReference({ book: 'Tome of Fate', page: '61' }), editable: true });
        expect(root.querySelector<HTMLInputElement>('input[name="system.source.book"]')?.value).toBe('Tome of Fate');
        expect(root.querySelector<HTMLInputElement>('input[name="system.source.page"]')?.value).toBe('61');
        expect(root.querySelector('input[name="system.source"]')).toBeNull();
    });

    it('labels both inputs for assistive tech', () => {
        const root = render({ source: mockSourceReference(), editable: true });
        expect(root.querySelector('input[name="system.source.book"]')?.getAttribute('aria-label')).toBe('Book');
        expect(root.querySelector('input[name="system.source.page"]')?.getAttribute('aria-label')).toBe('Page');
    });

    it('shows the formatted reference when read-only', () => {
        const root = render({ source: mockSourceReference({ book: 'Tome of Fate', page: '61' }), editable: false });
        expect(root.textContent.trim()).toBe('Tome of Fate, p.61');
        expect(root.querySelector('input')).toBeNull();
    });

    it('never renders "[object Object]" in either mode, even for an empty reference', () => {
        for (const editable of [true, false]) {
            for (const source of [mockSourceReference(), mockSourceReference({ book: '', page: '' }), {}]) {
                expect(render({ source, editable }).innerHTML).not.toContain('[object Object]');
            }
        }
    });
});

describe('no item sheet binds an input to the structured system.source (#229)', () => {
    /** Templates whose `system.source` is a plain StringField (NPC actor, NPC template). */
    const STRING_SOURCE_TEMPLATES = ['src/templates/actor/npc/tab-npc.hbs', 'src/templates/item/npc-template/tab-basics.hbs'];

    const ITEM_TEMPLATES = [
        'src/templates/item/item-ammo-sheet.hbs',
        'src/templates/item/item-armour-sheet.hbs',
        'src/templates/item/item-attack-special-sheet.hbs',
        'src/templates/item/item-force-field-sheet.hbs',
        'src/templates/item/item-gear-sheet.hbs',
        'src/templates/item/item-origin-path-sheet.hbs',
        'src/templates/item/item-psychic-power-sheet.hbs',
        'src/templates/item/item-skill-sheet.hbs',
        'src/templates/item/item-trait-sheet.hbs',
        'src/templates/item/item-weapon-mod-sheet.hbs',
        'src/templates/item/item-weapon-sheet.hbs',
        'src/templates/item/armour-mod-restrictions.hbs',
        // These kept hand-built Book / Page / Custom Reference inputs until #229 was reopened.
        'src/templates/item/item-condition-sheet.hbs',
        'src/templates/item/item-critical-injury-sheet.hbs',
        'src/templates/item/item-cybernetic-sheet.hbs',
        'src/templates/item/item-weapon-quality-sheet.hbs',
        'src/templates/item/item-location-sheet.hbs',
        'src/templates/item/talent-sheet.hbs',
        // Actor templates whose `system.source` is the structured reference: the craft
        // Notes tab bound Book / Page field rows of its own.
        'src/templates/actor/craft/tab-notes.hbs',
    ];

    it.each(ITEM_TEMPLATES)('%s edits its source through the shared partial', (path) => {
        const src = readRepoFile(path);
        expect(src).not.toContain('name="system.source');
        expect(src).toContain('item/partial/source-reference-field.hbs');
    });

    it.each(['src/templates/item', 'src/templates/actor'])('no template under %s binds system.source.* outside the shared partial', (dir) => {
        const offenders = [...walkFiles(dir, { ext: '.hbs' })].filter(
            (file) => file !== 'src/templates/item/partial/source-reference-field.hbs' && readRepoFile(file).includes('name="system.source.'),
        );
        expect(offenders).toEqual([]);
    });

    it.each(STRING_SOURCE_TEMPLATES)('%s formats its string source through sourceLabel', (path) => {
        expect(readRepoFile(path)).toMatch(/value="\{\{sourceLabel source\.source\}\}"/);
    });

    it('the partial is preloaded for the Foundry runtime', () => {
        expect(readRepoFile('src/module/handlebars/handlebars-manager.ts')).toContain('item/partial/source-reference-field.hbs');
    });

    it('the origin detail dialog formats its reference through sourceLabel', () => {
        const src = readRepoFile('src/templates/character-creation/origin-detail-dialog.hbs');
        expect(src).toContain('{{sourceLabel source}}');
        expect(src).not.toMatch(/\{\{source\.(book|page)\}\}/);
    });

    it.each([
        'src/module/data/shared/description-template.ts',
        'src/module/data/abstract/item-data-model.ts',
        'src/module/applications/character-creation/origin-detail-dialog.ts',
    ])('%s formats its source reference through formatSourceLabel', (path) => {
        const src = readRepoFile(path);
        expect(src).toContain('formatSourceLabel(');
        expect(src).not.toMatch(/p\.\$\{/);
    });
});

describe('formatSourceLabel legacy custom reference', () => {
    it('falls back to the pre-provenance `custom` slot after book', () => {
        expect(formatSourceLabel({ book: '', page: '', custom: 'Homebrew addendum' })).toBe('Homebrew addendum');
        expect(formatSourceLabel({ book: 'Core', page: '12', custom: 'ignored' })).toBe('Core, p.12');
    });
});

/**
 * The slice of Storybook's StoryContext these stories read: `render` and `play`
 * here only touch `args` and `canvasElement`. Storybook builds the full context
 * at runtime; this test builds the part the stories use.
 */
function storyContext<A extends Args>(args: A, canvasElement: HTMLElement): StoryContext<A> {
    return { args, canvasElement } as StoryContext<A>;
}

/** Append a story's render result (a Node or an HTML string) to the canvas. */
function mount(result: HtmlRenderer['storyResult'], canvasElement: HTMLElement): void {
    if (typeof result === 'string') canvasElement.innerHTML = result;
    else canvasElement.appendChild(result);
}

/** Render a story, run its `play` against the canvas, and return the canvas markup. */
async function runPlay<A extends Args>(story: StoryObj<A>, meta: Meta<A>): Promise<string> {
    const args = { ...meta.args, ...story.args } as A;
    const renderStory = story.render ?? meta.render;
    if (renderStory === undefined || story.play === undefined) throw new Error('story has no render/play');
    const canvasElement = document.createElement('div');
    mount(renderStory(args, storyContext(args, canvasElement)), canvasElement);
    await story.play(storyContext(args, canvasElement));
    return canvasElement.innerHTML;
}

/** Run every story's `play` in order (they share one Handlebars registry) and collect the markup. */
async function runPlays<A extends Args>(stories: Array<StoryObj<A>>, meta: Meta<A> = {}): Promise<string[]> {
    const markups: string[] = [];
    for (const story of stories) {
        // eslint-disable-next-line no-await-in-loop -- stories share one Handlebars registry; run them in order
        markups.push(await runPlay(story, meta));
    }
    return markups;
}

describe('#229 source stories pass their play assertions', () => {
    it('psychic power sheet', async () => {
        const mod = await import('../src/module/applications/item/psychic-power-sheet.stories.ts');
        const markups = await runPlays([mod.SourceReferenceEditable, mod.SourceReferenceReadOnly, mod.SourceReferenceEmpty]);
        expect(markups.join('')).not.toContain('[object Object]');
    });

    it('attack special sheet', async () => {
        const mod = await import('../src/module/applications/item/attack-special-sheet.stories.ts');
        const markups = await runPlays([mod.SourceReferenceLabel, mod.SourceReferenceInputs], mod.default);
        expect(markups.join('')).not.toContain('[object Object]');
    });

    it('origin path sheet, every game line', async () => {
        const mod = await import('../src/module/applications/item/origin-path-sheet.stories.ts');
        const markups = await runPlays([mod.Dh2Elite, mod.Dh1HomeWorld, mod.RtHomeWorld, mod.BcArchetype, mod.OwSpeciality, mod.DwChapter, mod.ImOrigin]);
        expect(markups).toHaveLength(7);
        expect(markups.join('')).not.toContain('[object Object]');
    });
});
