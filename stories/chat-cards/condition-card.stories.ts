import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import conditionCardSrc from '../../src/templates/chat/condition-card.hbs?raw';
import { initializeStoryHandlebars } from '../template-support';
import { renderSheet } from '../test-helpers';

/**
 * Chat-card story for the Condition card (condition-card.hbs). Rendered into the
 * chat log when a condition is applied; covered by the Tier B e2e suite, this
 * adds the storybook surface so the beneficial / harmful / neutral nature
 * treatments and the stackable + temporary variants are visible in review.
 */
initializeStoryHandlebars();

interface ConditionArgs {
    nature: 'beneficial' | 'harmful' | 'neutral';
    name: string;
    stackable: boolean;
    stacks: number;
    isTemporary: boolean;
}

interface ConditionContext {
    gameSystem: string;
    nature: string;
    natureLabel: string;
    natureClass: string;
    natureIcon: string;
    img: string;
    name: string;
    stackable: boolean;
    stacks: number;
    sourceReference: string;
    appliesToIcon: string;
    appliesToLabel: string;
    isTemporary: boolean;
    durationDisplay: string;
    effect: string;
    removal: string;
    notes: string;
    description: string;
}

const NATURE = {
    beneficial: { label: 'Beneficial', class: 'beneficial', icon: 'fa-circle-up' },
    harmful: { label: 'Harmful', class: 'harmful', icon: 'fa-circle-exclamation' },
    neutral: { label: 'Neutral', class: 'neutral', icon: 'fa-circle' },
};

function buildContext(args: ConditionArgs): ConditionContext {
    const n = NATURE[args.nature];
    return {
        gameSystem: 'dh2',
        nature: args.nature,
        natureLabel: n.label,
        natureClass: n.class,
        natureIcon: n.icon,
        img: 'icons/svg/aura.svg',
        name: args.name,
        stackable: args.stackable,
        stacks: args.stacks,
        sourceReference: 'Core Rulebook, p. 159',
        appliesToIcon: 'fa-user',
        appliesToLabel: 'Affects the bearer',
        isTemporary: args.isTemporary,
        durationDisplay: '3 rounds',
        effect: '<p>−10 to all tests that rely on sight until the end of the encounter.</p>',
        removal: '<p>Passes automatically at the end of the bearer&rsquo;s next turn.</p>',
        notes: 'Stacks with other penalties to sight-based tests.',
        description: '<p>The character is wreathed in obscuring smoke and cannot see clearly.</p>',
    };
}

const meta = {
    title: 'Chat/Condition Card',
    render: (args) => renderSheet(conditionCardSrc, buildContext(args)),
    args: { nature: 'harmful', name: 'Blinded', stackable: true, stacks: 2, isTemporary: true },
} satisfies Meta<ConditionArgs>;
export default meta;

type Story = StoryObj<ConditionArgs>;

/** A harmful, stackable, temporary condition. */
export const Harmful: Story = {
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(view.getByText('Blinded')).toBeTruthy();
        await expect(view.getByText(/Harmful Condition/)).toBeTruthy();
        await expect(view.getByText(/×2/)).toBeTruthy();
    },
};

/** A beneficial condition (green header treatment). */
export const Beneficial: Story = {
    args: { nature: 'beneficial', name: 'Hidden', stackable: false, stacks: 1, isTemporary: false },
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(view.getByText('Hidden')).toBeTruthy();
        await expect(view.getByText(/Beneficial Condition/)).toBeTruthy();
    },
};

/** A neutral, non-temporary condition. */
export const Neutral: Story = {
    args: { nature: 'neutral', name: 'Prone', stackable: false, stacks: 1, isTemporary: false },
};
