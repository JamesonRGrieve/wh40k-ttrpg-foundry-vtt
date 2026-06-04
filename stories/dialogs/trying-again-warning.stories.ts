import type { Meta, StoryObj } from '@storybook/html-vite';
import { getTryAgainAdvice, type RetryAdvice } from '../../src/module/rules/trying-again.ts';
import modifiersSrc from '../../src/templates/prompt/unified/modifiers.hbs?raw';
import { initializeStoryHandlebars } from '../template-support';
import { renderSheet } from '../test-helpers';

initializeStoryHandlebars();

interface TryingAgainArgs {
    skillKey: 'inquiry' | 'awareness' | 'charm' | 'intimidate';
    previousAttempts: number;
}

interface TryingAgainCtx {
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
    tryAgainAdvice: RetryAdvice | null;
    tryAgainPenalty: number;
    tryAgainPenaltyLabel: string;
}

function buildContext(args: TryingAgainArgs): TryingAgainCtx {
    const advice = getTryAgainAdvice(args.skillKey, args.previousAttempts);
    const penalty = advice.cumulativePenalty;
    const showAdvice = advice.blocksByConvention || advice.cumulativePenalty !== 0;
    return {
        isForceField: false,
        hasSituationalModifiers: false,
        situationalModifiers: [],
        showCustomModifier: false,
        customMod: 0,
        assistantCount: 0,
        assistanceBonus: 0,
        assistantMax: 4,
        canIncrementAssistant: true,
        canDecrementAssistant: false,
        tryAgainAdvice: showAdvice ? advice : null,
        tryAgainPenalty: penalty,
        tryAgainPenaltyLabel: penalty < 0 ? `${penalty}` : penalty > 0 ? `+${penalty}` : '0',
    };
}

const meta: Meta<TryingAgainArgs> = {
    title: 'Dialogs/Unified Roll — Trying Again Warning (#62)',
    argTypes: {
        skillKey: { control: { type: 'select' }, options: ['inquiry', 'awareness', 'charm', 'intimidate'] },
        previousAttempts: { control: { type: 'number', min: 0, max: 5, step: 1 } },
    },
    render: (args) => renderSheet(modifiersSrc, buildContext(args)),
};

export default meta;

type Story = StoryObj<TryingAgainArgs>;

export const NoRetryYet: Story = {
    name: 'No previous attempts (no warning)',
    args: { skillKey: 'inquiry', previousAttempts: 0 },
};

export const InquiryBlocked: Story = {
    name: 'Inquiry — blocked by convention',
    args: { skillKey: 'inquiry', previousAttempts: 1 },
};

export const CharmCumulativeMinus10: Story = {
    name: 'Charm — cumulative -10 after one retry',
    args: { skillKey: 'charm', previousAttempts: 1 },
};

export const IntimidateCumulativeMinus20: Story = {
    name: 'Intimidate — cumulative -20 after two retries',
    args: { skillKey: 'intimidate', previousAttempts: 2 },
};
