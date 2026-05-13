import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import templateSrc from '../../../../src/templates/dialogs/effect-creation-dialog.hbs?raw';
import { clickAction, renderSheet } from '../../../../stories/test-helpers';

interface Args {
    selectedCategory: 'condition' | 'characteristic' | 'skill' | 'combat' | 'custom';
    conditions?: { id: string; label: string; icon: string; tier?: number }[];
    characteristics?: { key: string; label: string; selected?: boolean }[];
    skills?: { key: string; label: string; characteristic: string }[];
    name?: string;
    duration?: number;
}

const meta = {
    title: 'Dialogs/EffectCreationDialog',
    render: (args) => renderSheet(templateSrc, args as unknown as Record<string, unknown>),
    args: {
        selectedCategory: 'condition',
        conditions: [
            { id: 'fatigued', label: 'Fatigued', icon: 'icons/svg/biohazard.svg', tier: 1 },
            { id: 'pinned', label: 'Pinned', icon: 'icons/svg/sword.svg' },
            { id: 'stunned', label: 'Stunned', icon: 'icons/svg/lightning.svg', tier: 2 },
        ],
        characteristics: [
            { key: 'ws', label: 'Weapon Skill' },
            { key: 'bs', label: 'Ballistic Skill' },
            { key: 's', label: 'Strength' },
        ],
        skills: [
            { key: 'awareness', label: 'Awareness', characteristic: 'Per' },
            { key: 'dodge', label: 'Dodge', characteristic: 'Ag' },
        ],
        name: '',
        duration: 1,
    },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

export const ConditionTab: Story = {};

export const CharacteristicTab: Story = {
    args: { selectedCategory: 'characteristic' },
};

export const SkillTab: Story = {
    args: { selectedCategory: 'skill' },
};

export const CustomTab: Story = {
    args: { selectedCategory: 'custom', name: 'Sanctified Aura', duration: 5 },
};

/**
 * Asserts that the five category tabs render with `data-action="selectCategory"`
 * and the matching `data-category` attribute. The runtime sheet routes both
 * verbatim into Foundry's static-actions resolver.
 */
export const CategoryTabsDispatch: Story = {
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        const tabs = canvasElement.querySelectorAll('[data-action="selectCategory"]');
        expect(tabs.length).toBe(5);
        const categories = Array.from(tabs).map((b) => b.getAttribute('data-category'));
        expect(categories).toEqual(['condition', 'characteristic', 'skill', 'combat', 'custom']);
        clickAction(canvasElement, 'selectCategory');
        void canvas;
    },
};
