/**
 * Stories for QuickCreateDialog — the single-NPC fast-create popup with a live
 * auto-generated stat preview. Renders the dialog's `.hbs` against a prepared
 * `state` + `preview` context, covering the populated preview and a minimal
 * (no skills/weapons) variant, and drives the create action handle.
 */

import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import templateSrc from '../../../../src/templates/dialogs/npc-quick-create.hbs?raw';
import { renderSheet, clickAction } from '../../../../stories/test-helpers';

interface Choice {
    key: string;
    name: string;
    selected: boolean;
}

interface PreviewCharacteristic {
    short: string;
    value: number;
    bonus: number;
}

interface PreviewSkill {
    name: string;
    level?: string;
}

interface PreviewWeapon {
    name: string;
    damage: string;
    pen: number;
}

interface Preview {
    characteristics: PreviewCharacteristic[];
    wounds: number;
    armour: number;
    movement: { half: number; full: number; charge: number; run: number };
    skills: PreviewSkill[];
    weapons: PreviewWeapon[];
}

interface DialogButton {
    type: string;
    action?: string;
    cssClass: string;
    icon: string;
    label: string;
}

interface QuickState {
    name: string;
    faction: string;
    threatLevel: number;
    isHorde: boolean;
}

interface Args {
    state: QuickState;
    tierName: string;
    tierDescription: string;
    roles: Choice[];
    types: Choice[];
    presets: Choice[];
    preview: Preview;
    buttons: DialogButton[];
}

const CHARACTERISTICS: PreviewCharacteristic[] = [
    { short: 'WS', value: 35, bonus: 3 },
    { short: 'BS', value: 30, bonus: 3 },
    { short: 'S', value: 40, bonus: 4 },
    { short: 'T', value: 38, bonus: 3 },
    { short: 'Ag', value: 32, bonus: 3 },
];

const BUTTONS: DialogButton[] = [
    { type: 'submit', action: 'create', cssClass: 'primary', icon: 'fa-solid fa-check', label: 'WH40K.NPC.Create' },
    { type: 'button', action: 'reroll', cssClass: 'secondary', icon: 'fa-solid fa-dice', label: 'WH40K.NPC.Reroll' },
];

const meta = {
    title: 'NPC/QuickCreateDialog',
    render: (args) => renderSheet(templateSrc, { ...args }),
    args: {
        state: { name: 'Renegade Trooper', faction: 'Traitor Guard', threatLevel: 7, isHorde: false },
        tierName: 'Standard',
        tierDescription: 'A capable rank-and-file combatant.',
        roles: [{ key: 'minion', name: 'Minion', selected: true }],
        types: [{ key: 'human', name: 'Human', selected: true }],
        presets: [{ key: 'guard', name: 'Imperial Guard', selected: true }],
        preview: {
            characteristics: CHARACTERISTICS,
            wounds: 12,
            armour: 4,
            movement: { half: 3, full: 6, charge: 9, run: 18 },
            skills: [{ name: 'Awareness', level: '+10' }, { name: 'Dodge' }],
            weapons: [{ name: 'Lasgun', damage: '1d10+3 E', pen: 0 }],
        },
        buttons: BUTTONS,
    },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

export const Default: Story = {
    play: async ({ canvasElement }) => {
        const scope = within(canvasElement);
        await expect(scope.getByText('Lasgun')).toBeTruthy();
        await expect(scope.getByText('Awareness +10')).toBeTruthy();
        clickAction(canvasElement, 'create');
        clickAction(canvasElement, 'reroll');
    },
};

export const MinimalPreview: Story = {
    args: {
        state: { name: 'Hive Rat Swarm', faction: '', threatLevel: 1, isHorde: true },
        tierName: 'Minor',
        tierDescription: 'A trivial nuisance.',
        preview: {
            characteristics: CHARACTERISTICS,
            wounds: 4,
            armour: 0,
            movement: { half: 2, full: 4, charge: 6, run: 12 },
            skills: [],
            weapons: [],
        },
    },
};
