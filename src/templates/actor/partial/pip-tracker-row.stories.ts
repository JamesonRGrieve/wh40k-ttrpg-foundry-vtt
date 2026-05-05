import type { Meta, StoryObj } from '@storybook/html-vite';
import Handlebars from 'handlebars';
import { expect, within } from 'storybook/test';
import { renderSheet, clickAction } from '../../../../stories/test-helpers';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import templateSrc from './pip-tracker-row.hbs?raw';

initializeStoryHandlebars();

// `range` isn't part of the shared story helper set (it's registered in the
// runtime helper bundle in src/module/handlebars/handlebars-helpers.ts).
// Register it locally so this partial can render in isolation.
if (!Handlebars.helpers.range) {
    Handlebars.registerHelper('range', (start: number, end: number) => {
        const s = Number(start);
        const e = Number(end);
        const out: number[] = [];
        for (let i = s; i <= e; i++) out.push(i);
        return out;
    });
}

interface Args {
    count: number;
    current: number;
    action: string;
    dataAttr: string;
    pipClass: string;
    iconClass?: string;
    titlePrefix?: string;
    filledClass?: string;
}

const meta = {
    title: 'Actor/Partials/PipTrackerRow',
    render: (args) => renderSheet(templateSrc, args as unknown as Record<string, unknown>),
    args: {
        count: 5,
        current: 0,
        action: 'setFateStar',
        dataAttr: 'fate-index',
        pipClass: 'wh40k-fate-pip',
        iconClass: 'fa-star',
        titlePrefix: 'Fate',
    },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

export const Empty: Story = { args: { current: 0 } };

export const Partial: Story = { args: { current: 2 } };

export const Full: Story = { args: { count: 5, current: 5 } };

export const FatigueBolts: Story = {
    args: {
        count: 8,
        current: 3,
        action: 'setFatigueBolt',
        dataAttr: 'fatigue-index',
        pipClass: 'wh40k-fatigue-pip',
        iconClass: 'fa-bolt',
        titlePrefix: 'Fatigue',
    },
};

export const CriticalDamage: Story = {
    args: {
        count: 10,
        current: 4,
        action: 'setCriticalPip',
        dataAttr: 'crit-level',
        pipClass: 'wh40k-crit-pip',
        iconClass: 'fa-tint',
        titlePrefix: 'Crit',
    },
};

/**
 * Asserts that pips dispatch the correct data-action when clicked. The runtime
 * sheet's static-actions table reads [data-action] verbatim, so a regression in
 * the rendered attribute is a real regression.
 */
export const ClickDispatch: Story = {
    args: { count: 3, current: 1 },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        const pips = canvasElement.querySelectorAll('[data-action="setFateStar"]');
        expect(pips.length).toBe(3);
        // The second pip carries data-fate-index="2".
        const second = canvasElement.querySelector('[data-fate-index="2"]') as HTMLElement | null;
        expect(second).toBeTruthy();
        // Drive the action handle for parity with the live sheet.
        clickAction(canvasElement, 'setFateStar');
        // Filled count matches `current=1`.
        const filled = canvasElement.querySelectorAll('.wh40k-fate-pip--filled');
        expect(filled.length).toBe(1);
        // Suppress unused-canvas warning.
        void canvas;
    },
};
