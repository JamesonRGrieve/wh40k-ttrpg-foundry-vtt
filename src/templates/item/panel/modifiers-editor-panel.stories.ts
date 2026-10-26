/**
 * Stories for the item modifiers editor panel (#669, #699): the Basic tab's
 * characteristic boxes each carry a visible abbreviation and an accessible name.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import { renderSheet } from '../../../../stories/test-helpers';
import templateSrc from './modifiers-editor-panel.hbs?raw';

interface CharacteristicConfig {
    label: string;
    abbreviation: string;
}

interface Args {
    config: { characteristics: Record<string, CharacteristicConfig> };
    system: { modifiers: { characteristics: Record<string, number>; skills: object; situational: { characteristics: object[] }; other: object[] } };
    tabGroups: { modifiers: 'basic' | 'situational' | 'advanced' };
    inEditMode: boolean;
    canEdit: boolean;
}

/** The nine characteristics as CONFIG.wh40k declares them: a langpack label and an abbreviation. */
const CHARACTERISTICS: Record<string, CharacteristicConfig> = {
    weaponSkill: { label: 'WH40K.Characteristic.WeaponSkill', abbreviation: 'WS' },
    ballisticSkill: { label: 'WH40K.Characteristic.BallisticSkill', abbreviation: 'BS' },
    strength: { label: 'WH40K.Characteristic.Strength', abbreviation: 'S' },
    toughness: { label: 'WH40K.Characteristic.Toughness', abbreviation: 'T' },
    agility: { label: 'WH40K.Characteristic.Agility', abbreviation: 'Ag' },
    intelligence: { label: 'WH40K.Characteristic.Intelligence', abbreviation: 'Int' },
    perception: { label: 'WH40K.Characteristic.Perception', abbreviation: 'Per' },
    willpower: { label: 'WH40K.Characteristic.Willpower', abbreviation: 'WP' },
    fellowship: { label: 'WH40K.Characteristic.Fellowship', abbreviation: 'Fel' },
};

const meta = {
    title: 'Item Panels/ModifiersEditorPanel',
    render: (args) => renderSheet(templateSrc, { ...args }),
    args: {
        config: { characteristics: CHARACTERISTICS },
        system: { modifiers: { characteristics: { strength: 5 }, skills: {}, situational: { characteristics: [] }, other: [] } },
        tabGroups: { modifiers: 'basic' },
        inEditMode: true,
        canEdit: true,
    },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

/** Each Basic-tab box shows its abbreviation and is named by the characteristic (#699). */
export const BasicCharacteristicsLabelled: Story = {
    play: async ({ canvasElement }) => {
        const boxes = Array.from(canvasElement.querySelectorAll<HTMLLabelElement>('[data-wh40k-hook="modifier-characteristic"]'));
        const read = boxes.map((box) => ({ shown: box.textContent.trim(), named: box.querySelector('input')?.getAttribute('aria-label') ?? '' }));
        await expect(read.map((r) => r.shown)).toEqual(Object.values(CHARACTERISTICS).map((c) => c.abbreviation));
        await expect(read.filter((r) => r.named === '')).toEqual([]);
        await expect(canvasElement.querySelector<HTMLInputElement>('input[name="system.modifiers.characteristics.strength"]')?.value).toBe('5');
    },
};
