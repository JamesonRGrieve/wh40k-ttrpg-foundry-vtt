import type { Meta, StoryObj } from '@storybook/html-vite';
import HB from 'handlebars';
import modifiersSrc from '../../src/templates/prompt/unified/modifiers.hbs?raw';
import { renderTemplate as compileAndRender } from '../mocks';
import { initializeStoryHandlebars } from '../template-support';

initializeStoryHandlebars();

const modifiersTemplate = HB.compile(modifiersSrc);

interface ExtendedToggleArgs {
    extended: boolean;
    extendedThreshold: number;
}

interface ExtendedTestCtx {
    isForceField: boolean;
    hasSituationalModifiers: boolean;
    situationalModifiers: never[];
    showCustomModifier: boolean;
    customMod: number;
    assistantCount: number;
    assistanceBonus: number;
    assistantMax: number;
    canIncrementAssistant: boolean;
    canDecrementAssistant: boolean;
    extended: boolean;
    extendedThreshold: number;
}

function buildContext(args: ExtendedToggleArgs): ExtendedTestCtx {
    return {
        // Force the modifiers partial down its non-force-field branch.
        isForceField: false,
        // No situational chips or custom-modifier UI; focus is the new
        // wh40k-extended-test-controls block.
        hasSituationalModifiers: false,
        situationalModifiers: [],
        showCustomModifier: false,
        customMod: 0,
        // Assistance stepper context — neutral defaults, not the subject.
        assistantCount: 0,
        assistanceBonus: 0,
        assistantMax: 2,
        canIncrementAssistant: true,
        canDecrementAssistant: false,
        // Extended-test contract (#59).
        extended: args.extended,
        extendedThreshold: Math.max(1, Math.trunc(args.extendedThreshold)),
    };
}

const meta: Meta<ExtendedToggleArgs> = {
    title: 'Dialogs/Unified Roll — Extended Test Toggle (#59)',
    argTypes: {
        extended: { control: { type: 'boolean' } },
        extendedThreshold: { control: { type: 'number', min: 1, step: 1 } },
    },
    render: (args) => compileAndRender(modifiersTemplate, buildContext(args)),
};

export default meta;

type Story = StoryObj<ExtendedToggleArgs>;

export const Off: Story = {
    name: 'Off — toggle visible, threshold hidden',
    args: { extended: false, extendedThreshold: 5 },
};

export const OnDefault: Story = {
    name: 'On — default threshold 5',
    args: { extended: true, extendedThreshold: 5 },
};

export const OnHighThreshold: Story = {
    name: 'On — threshold 20 (long endeavour)',
    args: { extended: true, extendedThreshold: 20 },
};
