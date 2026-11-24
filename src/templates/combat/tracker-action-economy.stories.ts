/**
 * Storybook stories for the compact combat-tracker action-economy badge (#264) —
 * the readout injected into each combat-tracker row. Receives `budget` (an
 * ActionBudgetView) and shows Full availability, Half remaining, Reaction
 * remaining, and Free spent as tiny badges. Rendered here on a dark surface that
 * approximates the tracker sidebar.
 *
 * Values are fixed for screenshot-diff stability (no Math.random).
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import { initializeStoryHandlebars } from '../../../stories/template-support';
import { renderSheet } from '../../../stories/test-helpers';
import badgeSrc from './tracker-action-economy.hbs?raw';

initializeStoryHandlebars();

interface BudgetCtx {
    fullAvailable: boolean;
    halfRemaining: number;
    reactionRemaining: number;
    freeSpent: number;
    usedPoints: number;
}
interface BadgeCtx {
    budget: BudgetCtx;
    /** The foes the combatant is engaged in melee with, by name (#804). */
    engagedWith?: string[];
}

function renderBadge(ctx: BadgeCtx): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    wrapper.style.background = '#1b1b1b';
    wrapper.style.padding = '6px 10px';
    wrapper.style.maxWidth = '260px';
    wrapper.appendChild(renderSheet(badgeSrc, ctx));
    return wrapper;
}

const meta: Meta<BadgeCtx> = {
    title: 'Combat/TrackerActionEconomy',
};
export default meta;
type Story = StoryObj<BadgeCtx>;

export const FreshTurn: Story = {
    name: 'Fresh turn — all available',
    args: { budget: { fullAvailable: true, halfRemaining: 2, reactionRemaining: 1, freeSpent: 0, usedPoints: 0 } },
    render: (args) => renderBadge(args),
};

export const HalfSpent: Story = {
    name: 'One Half spent',
    args: { budget: { fullAvailable: false, halfRemaining: 1, reactionRemaining: 1, freeSpent: 1, usedPoints: 1 } },
    render: (args) => renderBadge(args),
};

export const Exhausted: Story = {
    name: 'Exhausted — Full/Half/Reaction dimmed',
    args: { budget: { fullAvailable: false, halfRemaining: 0, reactionRemaining: 0, freeSpent: 2, usedPoints: 2 } },
    render: (args) => renderBadge(args),
};

/** Engaged in melee (#804): the row names the foes in its tooltip. */
export const EngagedInMelee: Story = {
    name: 'Engaged with two foes',
    args: { budget: { fullAvailable: true, halfRemaining: 2, reactionRemaining: 1, freeSpent: 0, usedPoints: 0 }, engagedWith: ['Engaged Ork', 'Ork Boy'] },
    render: (args) => renderBadge(args),
    play: async ({ canvasElement }) => {
        const engaged = canvasElement.querySelector<HTMLElement>('[data-tracker-engaged]');
        await expect(engaged?.dataset['trackerEngaged']).toBe('Engaged Ork|Ork Boy');
        await expect(engaged?.dataset['tooltip']).toContain('Engaged Ork, Ork Boy');
    },
};

/** Not engaged: no engaged badge. */
export const NotEngaged: Story = {
    name: 'Not engaged',
    args: { budget: { fullAvailable: true, halfRemaining: 2, reactionRemaining: 1, freeSpent: 0, usedPoints: 0 }, engagedWith: [] },
    render: (args) => renderBadge(args),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-tracker-engaged]')).toBeNull();
    },
};
