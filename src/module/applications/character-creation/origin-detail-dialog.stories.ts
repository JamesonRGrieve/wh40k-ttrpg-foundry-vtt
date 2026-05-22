/**
 * Stories for OriginDetailDialog — the origin-path step inspector shown during
 * character creation. Renders the dialog's `.hbs` against a prepared context
 * covering the Grants tab (characteristics / skills / talents / equipment),
 * the selectable footer, the already-selected state, and the
 * switchOriginTab / confirm action handles.
 */

import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import templateSrc from '../../../../src/templates/character-creation/origin-detail-dialog.hbs?raw';
import { renderSheet, clickAction } from '../../../../stories/test-helpers';

interface CharacteristicGrant {
    short: string;
    label: string;
    value: number;
    positive: boolean;
}

interface SkillGrant {
    displayName: string;
    levelLabel: string;
}

interface NamedGrant {
    name: string;
    uuid?: string;
    hasItem?: boolean;
    description?: string;
    level?: string;
}

interface EquipmentGrant {
    name: string;
    uuid?: string;
    quantity: number;
}

interface Args {
    name: string;
    img: string;
    stepLabel: string;
    isAdvanced: boolean;
    xpCost: number | null;
    hasSource: boolean;
    source: { book: string; page: number };
    hasCharacteristics: boolean;
    characteristics: CharacteristicGrant[];
    hasFormulas: boolean;
    woundsFormula: string | null;
    fateFormula: string | null;
    hasSkills: boolean;
    skills: SkillGrant[];
    hasTalents: boolean;
    talents: NamedGrant[];
    hasTraits: boolean;
    traits: NamedGrant[];
    hasEquipment: boolean;
    equipment: EquipmentGrant[];
    hasSpecialAbilities: boolean;
    specialAbilities: Array<{ name: string; description: string }>;
    hasDescription: boolean;
    description: string;
    hasChoices: boolean;
    choices: never[];
    hasRequirements: boolean;
    allowSelection: boolean;
    isSelected: boolean;
}

const meta = {
    title: 'Character Creation/OriginDetailDialog',
    render: (args) => renderSheet(templateSrc, { ...args }),
    args: {
        name: 'Forge World',
        img: 'icons/svg/mystery-man.svg',
        stepLabel: 'Home World',
        isAdvanced: false,
        xpCost: null,
        hasSource: true,
        source: { book: 'Dark Heresy 2e Core', page: 32 },
        hasCharacteristics: true,
        characteristics: [
            { short: 'Int', label: 'Intelligence', value: 3, positive: true },
            { short: 'WP', label: 'Willpower', value: 3, positive: true },
            { short: 'WS', label: 'Weapon Skill', value: -3, positive: false },
        ],
        hasFormulas: true,
        woundsFormula: '1d5+8',
        fateFormula: '1d10 (3+/4)',
        hasSkills: true,
        skills: [{ displayName: 'Tech-Use', levelLabel: 'Known' }],
        hasTalents: true,
        talents: [{ name: 'Technical Knock', uuid: 'Compendium.wh40k-rpg.dh2.Item.tk1', hasItem: true, description: 'Unjam a weapon as a Half Action.' }],
        hasTraits: false,
        traits: [],
        hasEquipment: true,
        equipment: [{ name: 'Combi-tool', uuid: 'Compendium.wh40k-rpg.dh2.Item.ct1', quantity: 1 }],
        hasSpecialAbilities: true,
        specialAbilities: [{ name: 'Stranger to the Cult', description: 'Fear (1) when first encountering daemonic entities.' }],
        hasDescription: true,
        description: '<p>Born amid the clamour of a Forge World, you are one with the Machine God.</p>',
        hasChoices: false,
        choices: [],
        hasRequirements: false,
        allowSelection: true,
        isSelected: false,
    },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

export const Selectable: Story = {
    play: async ({ canvasElement }) => {
        const scope = within(canvasElement);
        await expect(scope.getByText('Forge World')).toBeTruthy();
        await expect(scope.getByText('Technical Knock')).toBeTruthy();
        // Tab + selection action handles must be present for the dialog to wire them.
        clickAction(canvasElement, 'switchOriginTab');
        clickAction(canvasElement, 'openItem');
        clickAction(canvasElement, 'confirm');
    },
};

export const AlreadySelected: Story = {
    args: { isSelected: true },
    play: async ({ canvasElement }) => {
        const scope = within(canvasElement);
        await expect(scope.getByText(/WH40K\.OriginPath\.AlreadySelected|Already Selected/)).toBeTruthy();
    },
};

export const AdvancedWithXp: Story = {
    name: 'Advanced (elite) origin with XP cost',
    args: {
        name: 'Inquisitorial Acolyte',
        stepLabel: 'Elite Advance',
        isAdvanced: true,
        xpCost: 500,
        allowSelection: false,
    },
};
