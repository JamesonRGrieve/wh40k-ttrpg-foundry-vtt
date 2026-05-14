/**
 * Stories for TalentEditorDialog — the complex tabbed editor for talent modifiers,
 * prerequisites, situational modifiers, and grants.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import Handlebars from 'handlebars';
import { expect } from 'storybook/test';
import templateSrc from '../../../templates/dialogs/talent-editor-dialog.hbs?raw';
import { renderTemplate } from '../../../../stories/mocks';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { seedRandom, randomId } from '../../../../stories/mocks/extended';

initializeStoryHandlebars();
const compiled = Handlebars.compile(templateSrc);
const rng = seedRandom(0x7a1de0);

function makeCtx(activeSection = 'prerequisites', overrides: Record<string, unknown> = {}) {
    const id = randomId('talent-editor', rng);
    return {
        id,
        item: {
            name: 'Mighty Shot',
            system: {
                prerequisites: { text: 'BS 40', characteristics: [], skills: [], talents: [] },
                modifiers: { characteristics: {}, skills: {}, combat: {}, resources: {}, other: [] },
                situationalModifiers: [],
                grants: { skills: [], talents: [], traits: [], specialAbilities: [] },
            },
        },
        sections: {
            prerequisites: activeSection === 'prerequisites',
            modifiers: activeSection === 'modifiers',
            situational: activeSection === 'situational',
            grants: activeSection === 'grants',
        },
        prerequisites: {
            text: 'BS 40',
            characteristics: [{ key: 'ballisticSkill', label: 'Ballistic Skill', value: 40 }],
            skills: [],
            talents: [],
        },
        characteristicOptions: [
            { value: 'weaponSkill', label: 'Weapon Skill' },
            { value: 'ballisticSkill', label: 'Ballistic Skill' },
            { value: 'strength', label: 'Strength' },
            { value: 'toughness', label: 'Toughness' },
            { value: 'agility', label: 'Agility' },
            { value: 'intelligence', label: 'Intelligence' },
            { value: 'perception', label: 'Perception' },
            { value: 'willpower', label: 'Willpower' },
            { value: 'fellowship', label: 'Fellowship' },
        ],
        modifiers: { charMods: [], skillMods: [], combatMods: [], resourceMods: [], otherMods: [] },
        situationalMods: [],
        grants: { skills: [], talents: [], traits: [], specialAbilities: [] },
        ...overrides,
    };
}

const meta: Meta = { title: 'Item Sheets/TalentEditorDialog' };
export default meta;

type Story = StoryObj;

export const PrerequisitesTab: Story = { render: () => renderTemplate(compiled, makeCtx('prerequisites')) };

export const ModifiersTab: Story = { render: () => renderTemplate(compiled, makeCtx('modifiers')) };

export const GrantsTab: Story = { render: () => renderTemplate(compiled, makeCtx('grants')) };

export const RendersSectionTabs: Story = {
    render: () => renderTemplate(compiled, makeCtx('prerequisites')),
    play: async ({ canvasElement }) => {
        const prereqBtn = canvasElement.querySelector('[data-section="prerequisites"]');
        const modBtn = canvasElement.querySelector('[data-section="modifiers"]');
        const grantBtn = canvasElement.querySelector('[data-section="grants"]');
        expect(prereqBtn).toBeTruthy();
        expect(modBtn).toBeTruthy();
        expect(grantBtn).toBeTruthy();
    },
};

export const ClicksModifiersSection: Story = {
    render: () => renderTemplate(compiled, makeCtx('prerequisites')),
    play: async ({ canvasElement }) => {
        const modBtn = canvasElement.querySelector<HTMLElement>('[data-action="switchSection"][data-section="modifiers"]');
        expect(modBtn).toBeTruthy();
        modBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    },
};
