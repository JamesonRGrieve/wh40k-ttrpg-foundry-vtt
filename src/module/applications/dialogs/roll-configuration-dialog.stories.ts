/**
 * Stories for RollConfigurationDialog — the pre-roll modifier picker. Renders
 * the dialog's `.hbs` against representative prepared contexts: a full roll
 * with situational + permanent modifiers, a bare roll with no actor, and a
 * play-driven check of the toggleSituational / roll action handles.
 */

import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import templateSrc from '../../../../src/templates/dialogs/roll-configuration.hbs?raw';
import { renderSheet, clickAction } from '../../../../stories/test-helpers';

interface DifficultyChoice {
    key: string;
    label: string;
    value: number;
    selected: boolean;
}

interface RollModeChoice {
    key: string;
    label: string;
    selected: boolean;
}

interface SituationalModifier {
    id: string;
    source: string;
    condition: string;
    icon: string;
    value: number;
    valueDisplay: string;
    active: boolean;
}

interface PermanentModifier {
    source: string;
    icon: string;
    value: number;
    valueDisplay: string;
    hasSource: boolean;
    uuid?: string;
}

interface RollButton {
    type: string;
    cssClass: string;
    action: string;
    icon: string;
    label: string;
}

interface Args {
    actor: boolean;
    actorImg: string;
    actorName: string;
    rollName: string;
    baseTarget: number;
    totalModifier: number;
    finalTarget: number;
    difficulties: DifficultyChoice[];
    hasSituationalModifiers: boolean;
    situationalModifiers: SituationalModifier[];
    situationalModifierTotal: number;
    hasPermanentModifiers: boolean;
    permanentModifiers: PermanentModifier[];
    permanentModifierTotal: number;
    customModifier: number;
    rollModes: RollModeChoice[];
    buttons: RollButton[];
}

const DIFFICULTIES: DifficultyChoice[] = [
    { key: 'easy', label: 'Easy', value: 30, selected: false },
    { key: 'routine', label: 'Routine', value: 20, selected: false },
    { key: 'ordinary', label: 'Ordinary', value: 0, selected: true },
    { key: 'difficult', label: 'Difficult', value: -10, selected: false },
    { key: 'hard', label: 'Hard', value: -20, selected: false },
];

const ROLL_MODES: RollModeChoice[] = [
    { key: 'roll', label: 'Public Roll', selected: true },
    { key: 'gmroll', label: 'Private GM Roll', selected: false },
    { key: 'blindroll', label: 'Blind GM Roll', selected: false },
];

const BUTTONS: RollButton[] = [
    { type: 'submit', cssClass: 'primary', action: 'roll', icon: 'fa-solid fa-dice', label: 'WH40K.Roll.RollButton' },
    { type: 'button', cssClass: 'secondary', action: 'cancel', icon: 'fa-solid fa-xmark', label: 'WH40K.Cancel' },
];

const meta = {
    title: 'Dialogs/RollConfigurationDialog',
    render: (args) => renderSheet(templateSrc, { ...args }),
    args: {
        actor: true,
        actorImg: 'icons/svg/mystery-man.svg',
        actorName: 'Acolyte Vael',
        rollName: 'Ballistic Skill',
        baseTarget: 40,
        totalModifier: 10,
        finalTarget: 50,
        difficulties: DIFFICULTIES,
        hasSituationalModifiers: true,
        situationalModifiers: [
            {
                id: 'aim',
                source: 'Aiming (Full)',
                condition: 'Spent a full action aiming',
                icon: 'fa-solid fa-crosshairs',
                value: 20,
                valueDisplay: '+20',
                active: true,
            },
            {
                id: 'range',
                source: 'Long Range',
                condition: 'Target beyond half range',
                icon: 'fa-solid fa-ruler',
                value: -10,
                valueDisplay: '-10',
                active: false,
            },
        ],
        situationalModifierTotal: 20,
        hasPermanentModifiers: true,
        permanentModifiers: [
            { source: 'Deadeye Shot', icon: 'fa-solid fa-bullseye', value: 10, valueDisplay: '+10', hasSource: true, uuid: 'Item.talent-deadeye' },
        ],
        permanentModifierTotal: 10,
        customModifier: 0,
        rollModes: ROLL_MODES,
        buttons: BUTTONS,
    },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

export const Default: Story = {};

export const NoActor: Story = {
    args: {
        actor: false,
        hasPermanentModifiers: false,
        permanentModifiers: [],
        permanentModifierTotal: 0,
    },
};

export const RollFlow: Story = {
    play: async ({ canvasElement }) => {
        const scope = within(canvasElement);
        await expect(scope.getByText('Acolyte Vael')).toBeTruthy();
        // Drive the same action handles the runtime dialog wires up.
        clickAction(canvasElement, 'toggleSituational');
        clickAction(canvasElement, 'viewModifierSource');
        clickAction(canvasElement, 'roll');
        clickAction(canvasElement, 'cancel');
    },
};
