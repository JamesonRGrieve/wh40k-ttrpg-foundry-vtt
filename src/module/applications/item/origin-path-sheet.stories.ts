/**
 * Stories for OriginPathSheet.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import HBS from 'handlebars';
import { expect, within } from 'storybook/test';
import { mockItem, renderTemplate as renderTpl } from '../../../../stories/mocks';
import { seedRandom, randomId } from '../../../../stories/mocks/extended';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import templateSrc from '../../../templates/item/item-origin-path-sheet.hbs?raw';

initializeStoryHandlebars();
const compiled = HBS.compile(templateSrc);
const rng = seedRandom(0x0a1b2c);

interface OriginPathCtx {
    item: ReturnType<typeof mockItem>;
    system: ReturnType<typeof mockItem>['system'];
    grants: ReturnType<typeof mockItem>['system']['grants'];
    modifiers: ReturnType<typeof mockItem>['system']['modifiers'];
    requirements: ReturnType<typeof mockItem>['system']['requirements'];
    step: ReturnType<typeof mockItem>['system']['step'];
    xpCost: ReturnType<typeof mockItem>['system']['xpCost'];
    hasCharModifiers: boolean;
    charModifiers: Array<{ key: string; label: string; short: string; value: number }>;
    hasSkillGrants: boolean;
    skillGrants: Array<{ name: string; level: string }>;
    hasTalentGrants: boolean;
    talentGrants: ReadonlyArray<never>;
    canEdit: boolean;
    inEditMode: boolean;
    editable: boolean;
    tabs: Record<string, { id: string; tab: string; group: string; active: boolean; cssClass: string }>;
}
function makeCtx(overrides: Partial<OriginPathCtx> = {}): OriginPathCtx {
    const id = randomId('origin', rng);
    const item = mockItem({
        _id: id,
        id,
        name: 'Hive World',
        type: 'originPath',
        img: 'icons/environment/settlement/town-exterior.webp',
        system: {
            step: 'homeWorld',
            stepLabel: 'Home World',
            stepIndex: 0,
            xpCost: 0,
            isAdvancedOrigin: false,
            description: { value: '<p>Born in the press of the underhive.</p>' },
            grants: {
                skills: [{ name: 'Dodge', specialization: '', level: 'trained' }],
                talents: [],
                traits: [],
                equipment: [],
                choices: [],
            },
            modifiers: { characteristics: { agility: 5 } },
            requirements: { text: '', previousSteps: [], excludedSteps: [] },
            source: { book: 'Dark Heresy 2e Core', page: '15' },
        },
    });
    return {
        item,
        system: item.system,
        grants: item.system.grants,
        modifiers: item.system.modifiers,
        requirements: item.system.requirements,
        step: item.system.step,
        xpCost: item.system.xpCost,
        hasCharModifiers: true,
        charModifiers: [{ key: 'agility', label: 'Agility', short: 'Ag', value: 5 }],
        hasSkillGrants: true,
        skillGrants: [{ name: 'Dodge', level: 'Trained' }],
        hasTalentGrants: false,
        talentGrants: [],
        canEdit: true,
        inEditMode: false,
        editable: true,
        tabs: {
            details: { id: 'details', tab: 'details', group: 'primary', active: true, cssClass: 'active' },
            grants: { id: 'grants', tab: 'grants', group: 'primary', active: false, cssClass: '' },
            description: { id: 'description', tab: 'description', group: 'primary', active: false, cssClass: '' },
        },
        ...overrides,
    };
}

const meta: Meta = { title: 'Item Sheets/OriginPathSheet' };
export default meta;

type Story = StoryObj;

export const Default: Story = { render: () => renderTpl(compiled, makeCtx()) };

export const EditMode: Story = { render: () => renderTpl(compiled, makeCtx({ inEditMode: true })) };

export const RendersOriginName: Story = {
    render: () => renderTpl(compiled, makeCtx()),
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(view.getByDisplayValue('Hive World')).toBeTruthy();
    },
};

export const RendersStepBadge: Story = {
    render: () => renderTpl(compiled, makeCtx()),
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(view.getByText('Home World')).toBeTruthy();
    },
};
