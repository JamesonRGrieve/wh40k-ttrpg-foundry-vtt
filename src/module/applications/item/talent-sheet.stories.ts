/**
 * Stories for TalentSheet.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import Handlebars from 'handlebars';
import { expect, within } from 'storybook/test';
import { mockItem, renderTemplate } from '../../../../stories/mocks';
import { seedRandom, randomId } from '../../../../stories/mocks/extended';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import templateSrc from '../../../templates/item/talent-sheet.hbs?raw';

initializeStoryHandlebars();
// Issue #201: opening a talent in a compendium previously threw a Handlebars
// parse error because `{{#if (eq activeTab"overview")}}` was missing the space
// between the variable and the literal. Compiling at module load asserts the
// template parses cleanly; if a future edit reintroduces the typo, Storybook
// (and the regression spec in tests/storybook/issue-201-...) will fail loudly.
const compiled = Handlebars.compile(templateSrc);
const rng = seedRandom(0x7a1e47);

function makeCtx(overrides: Record<string, unknown> = {}) {
    const id = randomId('talent', rng);
    // The talent sheet template gates each tab panel on `(eq activeTab "<id>")`
    // — `activeTab` is set at runtime from `this.tabGroups.primary` in
    // `TalentSheet._prepareContext`. Without it the story renders every panel
    // simultaneously (the issue-201 "duplicate Benefit" symptom). Stories that
    // need a different active tab should pass `activeTab: '<tab-id>'` via the
    // overrides argument.
    const activeTab = (overrides as { activeTab?: string }).activeTab ?? 'overview';
    const item = mockItem({
        _id: id,
        id,
        name: 'Mighty Shot',
        type: 'talent',
        img: 'icons/skills/ranged/target-bullseye-arrow-glowing.webp',
        system: {
            identifier: 'mighty-shot',
            category: 'combat',
            tier: 1,
            isPassive: true,
            isRollable: false,
            stackable: false,
            rank: 1,
            cost: 200,
            aptitudes: ['Ballistic Skill', 'Offence'],
            source: '',
            sourceBook: 'Dark Heresy 2e Core',
            sourcePage: '123',
            notes: '',
            benefit: 'Add half BS bonus to ranged damage.',
            description: { value: '<p>Your mastery of ranged combat allows for more powerful shots.</p>' },
        },
    });
    return {
        item,
        system: item.system,
        source: item.system,
        talent: {
            identifier: 'mighty-shot',
            category: 'combat',
            categoryLabel: 'Combat',
            tier: 1,
            tierLabel: 'Tier 1',
            cost: 200,
            isPassive: true,
            isRollable: false,
            stackable: false,
            rank: 1,
            hasSpecialization: false,
            specialization: '',
            notes: '',
            source: '',
            sourceBook: 'Dark Heresy 2e Core',
            sourcePage: '123',
            aptitudes: ['Ballistic Skill', 'Offence'],
            hasAptitudes: true,
            benefit: 'Add half BS bonus to ranged damage.',
            hasBenefit: true,
            fullName: 'Mighty Shot',
        },
        prerequisites: {
            hasAny: false,
            text: '',
            characteristics: [],
            skills: [],
            talents: [],
            hasText: false,
            hasCharacteristics: false,
            hasSkills: false,
            hasTalents: false,
            label: 'None',
        },
        modifierRows: [],
        canEdit: true,
        inEditMode: false,
        editable: true,
        isOwnedByActor: false,
        effects: [],
        tabs: {
            overview: {
                id: 'overview',
                tab: 'overview',
                group: 'primary',
                active: activeTab === 'overview',
                cssClass: activeTab === 'overview' ? 'active' : '',
            },
            effects: { id: 'effects', tab: 'effects', group: 'primary', active: activeTab === 'effects', cssClass: activeTab === 'effects' ? 'active' : '' },
            properties: {
                id: 'properties',
                tab: 'properties',
                group: 'primary',
                active: activeTab === 'properties',
                cssClass: activeTab === 'properties' ? 'active' : '',
            },
            description: {
                id: 'description',
                tab: 'description',
                group: 'primary',
                active: activeTab === 'description',
                cssClass: activeTab === 'description' ? 'active' : '',
            },
        },
        activeTab,
        ...overrides,
    };
}

const meta: Meta = { title: 'Item Sheets/TalentSheet' };
export default meta;

type Story = StoryObj;

export const Default: Story = { render: () => renderTemplate(compiled, makeCtx()) };

export const EditMode: Story = { render: () => renderTemplate(compiled, makeCtx({ inEditMode: true })) };

export const RendersTalentName: Story = {
    render: () => renderTemplate(compiled, makeCtx()),
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        expect(canvas.getByRole('heading', { name: 'Mighty Shot' })).toBeTruthy();
    },
};

export const RendersEditImageAction: Story = {
    render: () => renderTemplate(compiled, makeCtx()),
    play: async ({ canvasElement }) => {
        const btn = canvasElement.querySelector('[data-action="editImage"]');
        expect(btn).toBeTruthy();
        btn?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    },
};

/**
 * Regression coverage for issue #201.
 *
 * Asserts the compendium-render path of the talent sheet:
 *   1. The template parses (compiling it at module load would have already
 *      thrown if the `activeTab"overview"` typo were present — this story
 *      simply re-renders it inside a story so Storybook's static build covers
 *      the same surface, and the Playwright regression spec under
 *      `tests/storybook/issue-201-talent-compendium-render.spec.ts` can drive
 *      a real browser against the rendered DOM.
 *   2. Each of the four tab buttons (`overview`, `effects`, `properties`,
 *      `description`) is present in the DOM — proving every
 *      `(eq activeTab "<tab>")` token reached compile time correctly spaced.
 */
export const CompendiumRender: Story = {
    name: 'Issue 201 — Compendium Render',
    render: () => renderTemplate(compiled, makeCtx({ inEditMode: false, editable: false, isCompendiumItem: true })),
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        // No parse error => rendered output contains the tab nav.
        expect(canvas.getByRole('heading', { name: 'Mighty Shot' })).toBeTruthy();
        for (const tab of ['overview', 'effects', 'properties', 'description'] as const) {
            const button = canvasElement.querySelector(`button[data-tab="${tab}"]`);
            expect(button, `tab button [data-tab="${tab}"] should render`).toBeTruthy();
            const panel = canvasElement.querySelector(`div[data-tab="${tab}"]`);
            expect(panel, `tab panel [data-tab="${tab}"] should render`).toBeTruthy();
        }
    },
};
