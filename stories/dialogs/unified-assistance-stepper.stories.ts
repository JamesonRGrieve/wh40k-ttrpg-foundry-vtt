import type { Meta, StoryObj } from '@storybook/html-vite';
import Handlebars from 'handlebars';
import { DEFAULT_ASSISTANT_CAP, getAssistanceBonus } from '../../src/module/rules/assistance.ts';
import modifiersSrc from '../../src/templates/prompt/unified/modifiers.hbs?raw';
import { renderTemplate } from '../mocks';
import { initializeStoryHandlebars } from '../template-support';

initializeStoryHandlebars();

const modifiersTemplate = Handlebars.compile(modifiersSrc);

interface AssistanceArgs {
    assistantCount: number;
}

function buildContext(args: AssistanceArgs): Record<string, unknown> {
    const count = Math.max(0, Math.min(args.assistantCount, DEFAULT_ASSISTANT_CAP));
    const bonus = getAssistanceBonus(count);
    return {
        // Force the modifiers partial down its non-force-field branch.
        isForceField: false,
        // No situational chips or custom-modifier UI in this story; the focus
        // is the new wh40k-assistance-stepper block.
        hasSituationalModifiers: false,
        situationalModifiers: [],
        showCustomModifier: false,
        customMod: 0,
        // Assistance-stepper context contract.
        assistantCount: count,
        assistanceBonus: bonus,
        assistantMax: DEFAULT_ASSISTANT_CAP,
        canIncrementAssistant: count < DEFAULT_ASSISTANT_CAP,
        canDecrementAssistant: count > 0,
    };
}

const meta: Meta<AssistanceArgs> = {
    title: 'Dialogs/Unified Roll — Assistance Stepper (#60)',
    argTypes: {
        assistantCount: { control: { type: 'number', min: 0, max: DEFAULT_ASSISTANT_CAP, step: 1 } },
    },
    render: (args) => renderTemplate(modifiersTemplate, buildContext(args)),
};

export default meta;

type Story = StoryObj<AssistanceArgs>;

export const NoAssistants: Story = {
    name: 'No assistants (0 → +0)',
    args: { assistantCount: 0 },
};

export const OneAssistant: Story = {
    name: 'One assistant (1 → +10)',
    args: { assistantCount: 1 },
};

export const TwoAssistants: Story = {
    name: 'Two assistants (2 → +20, at cap)',
    args: { assistantCount: 2 },
};
