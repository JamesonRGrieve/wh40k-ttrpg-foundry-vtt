import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import templateSrc from '../../../../src/templates/dialogs/effect-creation-dialog.hbs?raw';
import { clickAction, renderSheet } from '../../../../stories/test-helpers';

interface Args {
    selectedCategory: 'condition' | 'characteristic' | 'skill' | 'combat' | 'custom';
    /** Picker rows, shaped like `conditionPickerRows` (the condition documents). */
    conditions?: { id: string; name: string; img: string; nature: string }[];
    characteristics?: { key: string; label: string; selected?: boolean }[];
    skills?: { key: string; label: string; characteristic: string }[];
    name?: string;
    duration?: number;
}

const meta = {
    title: 'Dialogs/EffectCreationDialog',
    render: (args) => renderSheet(templateSrc, { ...args }),
    args: {
        selectedCategory: 'condition',
        conditions: [
            { id: 'fatigued', name: 'Fatigued', img: 'icons/svg/sleep.svg', nature: 'harmful' },
            { id: 'pinned', name: 'Pinned', img: 'icons/svg/net.svg', nature: 'harmful' },
            { id: 'stunned', name: 'Stunned', img: 'icons/svg/daze.svg', nature: 'harmful' },
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

/**
 * The condition picker renders one selectable row per catalog condition, with
 * the condition document's image (an image path, not an icon-font class).
 */
export const ConditionTab: Story = {
    play: async ({ canvasElement }) => {
        const rows = Array.from(canvasElement.querySelectorAll('[data-action="selectCondition"]'));
        await expect(rows.map((row) => row.getAttribute('data-condition-id'))).toEqual(['fatigued', 'pinned', 'stunned']);
        await expect(rows.map((row) => row.querySelector('img')?.getAttribute('src'))).toEqual([
            'icons/svg/sleep.svg',
            'icons/svg/net.svg',
            'icons/svg/daze.svg',
        ]);
    },
};

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
        const tabs = canvasElement.querySelectorAll('[data-action="selectCategory"]');
        await expect(tabs.length).toBe(5);
        const categories = Array.from(tabs).map((b) => b.getAttribute('data-category'));
        await expect(categories).toEqual(['condition', 'characteristic', 'skill', 'combat', 'custom']);
        clickAction(canvasElement, 'selectCategory');
    },
};
