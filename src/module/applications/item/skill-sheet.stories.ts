import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import templateSrc from '../../../../src/templates/item/item-skill-sheet.hbs?raw';
import { renderSheet } from '../../../../stories/test-helpers';

interface SkillSystem {
    skillType: 'basic' | 'advanced' | 'specialist';
    characteristic: string;
    aptitudes: string[];
    specializations: string[];
    descriptor: string;
    uses: string;
    exampleDifficulties: Array<{ difficulty: string; modifier: number; example: string }>;
}
interface SkillItem {
    name: string;
    img: string;
    system: SkillSystem;
}
interface SkillArgs {
    item: SkillItem;
    [key: string]: SkillItem;
}

const baseSystem = (): SkillSystem => ({
    skillType: 'specialist',
    characteristic: 'intelligence',
    aptitudes: ['Intelligence', 'Knowledge'],
    specializations: ['Imperium', 'Koronus Expanse'],
    descriptor: 'Knowledge of the Imperium and its breadth.',
    uses: '<p>Used to recall facts about the wider galaxy.</p>',
    exampleDifficulties: [
        { difficulty: 'Routine', modifier: 20, example: 'Name the local sector' },
        { difficulty: 'Hard', modifier: -10, example: 'Recall a forgotten saint' },
    ],
});

const meta = {
    title: 'Item Sheets/SkillSheet',
    render: (args) => renderSheet(templateSrc, args),
    args: {
        item: { name: 'Common Lore', img: 'icons/svg/book.svg', system: baseSystem() },
    },
} satisfies Meta<SkillArgs>;
export default meta;

type Story = StoryObj<SkillArgs>;

export const Specialist: Story = {};

export const Basic: Story = {
    args: {
        item: {
            name: 'Awareness',
            img: 'icons/svg/eye.svg',
            system: { ...baseSystem(), skillType: 'basic', specializations: [] },
        },
    },
};

export const RendersSelectAndName: Story = {
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(view.getByDisplayValue('Common Lore')).toBeTruthy();
        const select = canvasElement.querySelector<HTMLSelectElement>('select[name="system.skillType"]');
        await expect(select).toBeTruthy();
        await expect(select?.value).toBe('specialist');
    },
};
