import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import templateSrc from '../../../../src/templates/prompt/damage-roll-prompt.hbs?raw';
import { assertField, renderSheet } from '../../../../stories/test-helpers';

interface Args {
    name: string;
    damage: string;
    penetration: string;
    damageType: string;
    psychicPower: boolean;
    pr: number;
    dh: { combat: { damage_types: string[] } };
}

const DH = { combat: { damage_types: ['energy', 'impact', 'rending', 'explosive'] } };

const meta = {
    title: 'Prompts/DamageRollDialog',
    render: (args) => renderSheet(templateSrc, { ...args }),
    args: {
        name: 'Bolter',
        damage: '1d10+5',
        penetration: '4',
        damageType: 'impact',
        psychicPower: false,
        pr: 0,
        dh: DH,
    },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

export const RangedWeapon: Story = {};

/** A psychic power damage roll exposes the Psychic Rating field. */
export const PsychicPower: Story = {
    args: {
        name: 'Smite',
        damage: '1d10+3',
        penetration: '0',
        damageType: 'energy',
        psychicPower: true,
        pr: 4,
    },
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('#pr')).toBeTruthy();
        assertField(canvasElement, 'pr', 4);
    },
};

/** Confirms the damage formula field reflects the configured value. */
export const FormulaField: Story = {
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(view.getByText(/Bolter Damage/)).toBeTruthy();
        assertField(canvasElement, 'damage', '1d10+5');
    },
};
