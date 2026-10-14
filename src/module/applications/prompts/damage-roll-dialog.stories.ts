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

/** Confirms the damage formula field reflects the configured value, and every label comes from the langpack. */
export const FormulaField: Story = {
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(view.getByText(/Bolter Damage/)).toBeTruthy();
        await expect(['Damage Formula', 'Damage Type', 'Penetration'].map((label) => view.queryByText(label) !== null)).toEqual([true, true, true]);
        assertField(canvasElement, 'damage', '1d10+5');
    },
};

/**
 * A grenade's Explosive damage type (#624): the select's chosen option sits inside its box.
 * Foundry gives a select a fixed height and a matching line height, so the select clears
 * its vertical padding and sets its own height and line height; the option's line then
 * fits the box's content height instead of being pushed below it.
 */
export const ExplosiveTypeUnclipped: Story = {
    args: { name: 'Frag Grenade', damage: '2d10', penetration: '0', damageType: 'explosive' },
    play: async ({ canvasElement }) => {
        const select = canvasElement.querySelector<HTMLSelectElement>('[data-damage-type-select]');
        if (select === null) throw new Error('no damage-type select');
        await expect(select.value).toBe('explosive');
        await expect(select.className).toContain('tw-py-0');
        await expect(select.className).toContain('tw-h-10');
        await expect(select.className).toContain('tw-leading-normal');
        const style = getComputedStyle(select);
        const contentHeight = select.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
        const fontSize = parseFloat(style.fontSize);
        // `line-height: normal` reports no pixel value; it is ~1.2× the font size.
        const lineHeight = Number.isNaN(parseFloat(style.lineHeight)) ? fontSize * 1.2 : parseFloat(style.lineHeight);
        await expect(lineHeight).toBeLessThanOrEqual(contentHeight);
    },
};
