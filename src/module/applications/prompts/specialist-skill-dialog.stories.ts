import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import { renderSheet, clickAction } from '../../../../stories/test-helpers';
import templateSrc from '../../../../src/templates/prompt/add-speciality-prompt.hbs?raw';

interface SkillOption {
    key: string;
    label: string;
    characteristic: string;
}

interface Args {
    actor: { name: string; img: string };
    specialistSkills: SkillOption[];
    specializations: string[];
    preSelectedSkillKey?: string;
}

const meta = {
    title: 'Prompts/SpecialistSkillDialog',
    render: (args) => renderSheet(templateSrc, args as unknown as Record<string, unknown>),
    args: {
        actor: { name: 'Acolyte Brennen', img: 'icons/svg/mystery-man.svg' },
        specialistSkills: [
            { key: 'commonLore', label: 'Common Lore', characteristic: 'Int' },
            { key: 'forbiddenLore', label: 'Forbidden Lore', characteristic: 'Int' },
            { key: 'scholasticLore', label: 'Scholastic Lore', characteristic: 'Int' },
            { key: 'trade', label: 'Trade', characteristic: 'Int' },
        ],
        specializations: [],
    },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

export const NoSkillSelected: Story = {};

export const WithPreselectedSkillAndSpecializations: Story = {
    args: {
        preSelectedSkillKey: 'commonLore',
        specializations: ['Adeptus Arbites', 'Adeptus Mechanicus', 'Imperium', 'Imperial Guard', 'Imperial Navy'],
    },
};

/**
 * Asserts the Add and Cancel buttons carry the runtime data-action attributes
 * Foundry's static-actions resolver reads.
 */
export const ActionButtonsDispatch: Story = {
    args: { preSelectedSkillKey: 'commonLore', specializations: ['Imperium'] },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        const add = canvasElement.querySelector('[data-action="add"]');
        const cancel = canvasElement.querySelector('[data-action="cancel"]');
        expect(add).toBeTruthy();
        expect(cancel).toBeTruthy();
        clickAction(canvasElement, 'add');
        clickAction(canvasElement, 'cancel');
        void canvas;
    },
};
