import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import templateSrc from '../../../../src/templates/character-creation/origin-path-choice-dialog.hbs?raw';
import { clickAction, renderSheet } from '../../../../stories/test-helpers';

interface ChoiceOption {
    value: string;
    label: string;
    description?: string;
    selected?: boolean;
    pendingSpec?: boolean;
    disabled?: boolean;
    hasSpecializations?: boolean;
    specializations?: string[];
    chosenSpecialization?: string;
    uuid?: string;
}

interface ChoiceGroup {
    typeLabel: string;
    label: string;
    choiceKey: string;
    remaining: number;
    options: ChoiceOption[];
}

interface Args {
    itemImg: string;
    itemName: string;
    choices: ChoiceGroup[];
    allChoicesComplete: boolean;
}

const meta: Meta<Args> = {
    title: 'Character Creation/OriginPathChoiceDialog',
    render: (args) => renderSheet(templateSrc, args as unknown as Record<string, unknown>),
    args: {
        itemImg: 'icons/svg/d20.svg',
        itemName: 'Schola Progenium',
        allChoicesComplete: false,
        choices: [
            {
                typeLabel: 'Talent Choice',
                label: 'Choose one starting talent',
                choiceKey: 'starting-talent',
                remaining: 1,
                options: [
                    {
                        value: 'weapon-training',
                        label: 'Weapon Training',
                        description: 'Gain training with a selected weapon group.',
                        hasSpecializations: true,
                        specializations: ['Las', 'Chain', 'Bolt'],
                    },
                    {
                        value: 'resistance',
                        label: 'Resistance',
                        description: 'Hardened by relentless drills and indoctrination.',
                        selected: true,
                        uuid: 'Compendium.wh40k.talents.resistance',
                    },
                ],
            },
        ],
    },
};

export default meta;

type Story = StoryObj<Args>;

export const Default: Story = {};

export const CompleteSelection: Story = {
    args: {
        allChoicesComplete: true,
        choices: [
            {
                typeLabel: 'Talent Choice',
                label: 'Choose one starting talent',
                choiceKey: 'starting-talent',
                remaining: 0,
                options: [
                    {
                        value: 'weapon-training',
                        label: 'Weapon Training',
                        description: 'Gain training with a selected weapon group.',
                        selected: true,
                        hasSpecializations: true,
                        specializations: ['Las', 'Chain', 'Bolt'],
                        chosenSpecialization: 'Bolt',
                    },
                    {
                        value: 'resistance',
                        label: 'Resistance',
                        description: 'Hardened by relentless drills and indoctrination.',
                    },
                ],
            },
        ],
    },
};

export const ConfirmFlow: Story = {
    args: CompleteSelection.args,
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        expect(canvas.getByText('Schola Progenium')).toBeTruthy();
        expect(canvas.getByText('Weapon Training')).toBeTruthy();
        clickAction(canvasElement, 'confirm');
        clickAction(canvasElement, 'cancel');
    },
};
