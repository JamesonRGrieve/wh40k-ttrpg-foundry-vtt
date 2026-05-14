/**
 * Stories for TalentSheet.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import Handlebars from 'handlebars';
import { expect, within } from 'storybook/test';
import templateSrc from '../../../templates/item/talent-sheet.hbs?raw';
import { mockItem, renderTemplate } from '../../../../stories/mocks';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { seedRandom, randomId } from '../../../../stories/mocks/extended';

initializeStoryHandlebars();
const compiled = Handlebars.compile(templateSrc);
const rng = seedRandom(0x7a1e47);

function makeCtx(overrides: Record<string, unknown> = {}) {
    const id = randomId('talent', rng);
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
            overview: { id: 'overview', tab: 'overview', group: 'primary', active: true, cssClass: 'active' },
            effects: { id: 'effects', tab: 'effects', group: 'primary', active: false, cssClass: '' },
            properties: { id: 'properties', tab: 'properties', group: 'primary', active: false, cssClass: '' },
            description: { id: 'description', tab: 'description', group: 'primary', active: false, cssClass: '' },
        },
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
        expect(canvas.getByDisplayValue('Mighty Shot')).toBeTruthy();
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
