/**
 * Storybook stories for the World-Time Counter widget (#487).
 *
 * Renders `src/templates/hud/world-time-widget.hbs` against the context shape
 * `WorldTimeWidget._prepareContext` produces (day counter + full date + elapsed,
 * plus the `isGM` gate). Two views cover the acceptance criteria:
 *   1. GmView     — GM sees the advance controls (+1 Hour / +1 Day / advance N)
 *                   and the "Set Day 0 here" inception control.
 *   2. PlayerView — the same readout, with the GM controls entirely absent.
 *
 * The widget is a floating ApplicationV2 whose root carries `wh40k-rpg` (from
 * DEFAULT_OPTIONS.classes); the stories wrap the template in that ancestor so
 * the `important: '.wh40k-rpg'`-scoped `tw-*` utilities resolve under visual
 * review. It is system-agnostic (world time is not per-line), so no
 * `data-wh40k-system` ancestor is needed.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import widgetSrc from '../../src/templates/hud/world-time-widget.hbs?raw';
import { seedRandom } from '../mocks/extended';
import { initializeStoryHandlebars } from '../template-support';
import { renderSheet } from '../test-helpers';

initializeStoryHandlebars();

// Deterministic RNG so any future randomized fixture stays stable across
// screenshot diffs / play runs (CLAUDE.md "Seeded RNG in stories").
seedRandom(0x487);

interface WorldTimeContext {
    isGM: boolean;
    dayNumber: number;
    dayCounterLabel: string;
    fullDate: string;
    elapsed: string;
}

/** Wrap the widget template in the `.wh40k-rpg` ancestor the live floating panel
 *  provides via DEFAULT_OPTIONS.classes, so scoped `tw-*` utilities resolve. */
function renderWidget(ctx: WorldTimeContext): HTMLElement {
    const root = document.createElement('div');
    root.className = 'wh40k-rpg world-time-widget';
    root.append(renderSheet(widgetSrc, ctx));
    return root;
}

const meta: Meta<WorldTimeContext> = {
    title: 'HUD/WorldTimeWidget',
};
export default meta;
type Story = StoryObj<WorldTimeContext>;

const BASE: WorldTimeContext = {
    isGM: false,
    dayNumber: 5,
    dayCounterLabel: 'Day 5',
    fullDate: '0000-01-06 14:05:09',
    elapsed: '5d 14h',
};

export const GmView: Story = {
    name: 'GM view — advance controls visible',
    args: { ...BASE, isGM: true },
    render: (args) => renderWidget(args),
    play: ({ canvasElement }) => {
        const storyCanvas = within(canvasElement);
        // Readout: day counter, full date, elapsed.
        void expect(storyCanvas.getByText('Day 5')).toBeTruthy();
        void expect(canvasElement.querySelector('[data-wh40k-hook="wt-date"]')?.textContent.trim()).toBe('0000-01-06 14:05:09');
        void expect(canvasElement.querySelector('[data-wh40k-hook="wt-elapsed"]')?.textContent.trim()).toBe('5d 14h');
        // GM controls: quick advance, custom advance amount + unit, set inception.
        void expect(canvasElement.querySelector('[data-wh40k-hook="wt-gm-controls"]')).not.toBeNull();
        void expect(canvasElement.querySelector('[data-action="advanceHour"]')).not.toBeNull();
        void expect(canvasElement.querySelector('[data-action="advanceDay"]')).not.toBeNull();
        void expect(canvasElement.querySelector('[data-action="advanceCustom"]')).not.toBeNull();
        void expect(canvasElement.querySelector('[data-action="setInception"]')).not.toBeNull();
        void expect(canvasElement.querySelector('.wh40k-wt-amount')).not.toBeNull();
        void expect(canvasElement.querySelector('.wh40k-wt-unit')).not.toBeNull();
    },
};

export const PlayerView: Story = {
    name: 'Player view — readout only, no controls',
    args: { ...BASE, isGM: false },
    render: (args) => renderWidget(args),
    play: ({ canvasElement }) => {
        const storyCanvas = within(canvasElement);
        // The counter and date are visible to players...
        void expect(storyCanvas.getByText('Day 5')).toBeTruthy();
        void expect(canvasElement.querySelector('[data-wh40k-hook="wt-date"]')?.textContent.trim()).toBe('0000-01-06 14:05:09');
        // ...but every GM advance control is absent.
        void expect(canvasElement.querySelector('[data-wh40k-hook="wt-gm-controls"]')).toBeNull();
        void expect(canvasElement.querySelector('[data-action="advanceHour"]')).toBeNull();
        void expect(canvasElement.querySelector('[data-action="advanceDay"]')).toBeNull();
        void expect(canvasElement.querySelector('[data-action="advanceCustom"]')).toBeNull();
        void expect(canvasElement.querySelector('[data-action="setInception"]')).toBeNull();
    },
};
