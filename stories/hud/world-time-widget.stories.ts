/**
 * Storybook stories for the World-Time Counter widget (#487).
 *
 * Renders `src/templates/hud/world-time-widget.hbs` against the context shape
 * `WorldTimeWidget._prepareContext` produces (day counter + full date + elapsed,
 * plus the `isGM` gate). Two views cover the acceptance criteria:
 *   1. GmView     — GM sees the advance controls (+1 Hour / +1 Day / advance N)
 *                   and the "Set Day 0 here" inception control.
 *   2. PlayerView — the same readout, with the GM controls entirely absent.
 *   3. Undo (#703) — the GM's Undo button names the last advance, explains what
 *      else it takes back, and is disabled when there is nothing to undo.
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
    localBodyName: string;
    localRotationHours: number;
    localDay: number;
    localTimeOfDay: string;
    /** The day phase key and its localised label (Night, Dawn, Morning, Midday, …). */
    localDayPhase: string;
    localDayPhaseLabel: string;
    /** Localised weather of the viewed scene's body ('' when no body is configured). */
    localWeather: string;
    /** Whether the last advance can be undone, and the Undo button's label (#703). */
    canUndo: boolean;
    undoLabel: string;
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
    localBodyName: 'Solenne Minoris',
    localRotationHours: 19,
    localDay: 5,
    localTimeOfDay: '07:12',
    localDayPhase: 'morning',
    localDayPhaseLabel: 'Morning',
    localWeather: 'Smog',
    canUndo: true,
    undoLabel: 'Undo +1d',
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
        // The Celestial Bodies & Weather editor opener (#588).
        void expect(canvasElement.querySelector('[data-action="editBodies"]')).not.toBeNull();
        // The named phase of the local day sits under the clock.
        const phase = canvasElement.querySelector<HTMLElement>('[data-wh40k-hook="wt-phase"]');
        void expect(phase?.textContent.trim()).toBe('Morning');
        void expect(phase?.dataset['dayPhase']).toBe('morning');
        // The viewed body's current weather is shown.
        void expect(canvasElement.querySelector('[data-wh40k-hook="wt-weather"]')?.textContent.trim()).toBe('Smog');
        void expect(canvasElement.querySelector('[data-wh40k-hook="wt-amount"]')).not.toBeNull();
        void expect(canvasElement.querySelector('[data-wh40k-hook="wt-unit"]')).not.toBeNull();
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
        // ...as is the day phase...
        void expect(canvasElement.querySelector('[data-wh40k-hook="wt-phase"]')?.textContent.trim()).toBe('Morning');
        // ...but every GM advance control is absent.
        void expect(canvasElement.querySelector('[data-wh40k-hook="wt-gm-controls"]')).toBeNull();
        void expect(canvasElement.querySelector('[data-action="advanceHour"]')).toBeNull();
        void expect(canvasElement.querySelector('[data-action="advanceDay"]')).toBeNull();
        void expect(canvasElement.querySelector('[data-action="advanceCustom"]')).toBeNull();
        void expect(canvasElement.querySelector('[data-action="editBodies"]')).toBeNull();
        void expect(canvasElement.querySelector('[data-action="undoAdvance"]')).toBeNull();
    },
};

/** #703: the GM can take back the last advance; the tooltip says what comes back with the clock. */
export const UndoLastAdvance: Story = {
    name: 'GM view — Undo the last advance',
    args: { ...BASE, isGM: true },
    render: (args) => renderWidget(args),
    play: async ({ canvasElement }) => {
        const undo = canvasElement.querySelector<HTMLButtonElement>('[data-action="undoAdvance"]');
        await expect(undo?.disabled).toBe(false);
        await expect(undo?.textContent.trim()).toBe('Undo +1d');
        await expect(undo?.dataset['tooltip']).toContain('Fatigue that advance recovered is taken back');
    },
};

/** #703: with no advance to take back (or the clock moved since), Undo is shown but disabled. */
export const UndoUnavailable: Story = {
    name: 'GM view — nothing to undo',
    args: { ...BASE, isGM: true, canUndo: false, undoLabel: 'Nothing to undo' },
    render: (args) => renderWidget(args),
    play: async ({ canvasElement }) => {
        const undo = canvasElement.querySelector<HTMLButtonElement>('[data-action="undoAdvance"]');
        await expect(undo?.disabled).toBe(true);
        await expect(undo?.textContent.trim()).toBe('Nothing to undo');
    },
};

export const NoBodiesConfigured: Story = {
    name: 'No celestial bodies — Terran day, no weather line',
    args: { ...BASE, isGM: true, localBodyName: 'Terran Standard', localRotationHours: 24, localWeather: '' },
    render: (args) => renderWidget(args),
    play: ({ canvasElement }) => {
        void expect(canvasElement.querySelector('[data-wh40k-hook="wt-weather"]')).toBeNull();
        void expect(canvasElement.querySelector('[data-action="editBodies"]')).not.toBeNull();
    },
};

/** The widget's window width (WorldTimeWidget DEFAULT_OPTIONS.position.width). */
const WIDGET_WIDTH_PX = 260;

/** #473: at the widget's width, the Celestial Bodies & Weather button's label sits on one line. */
export const CelestialButtonOneLine: Story = {
    name: 'GM view — Celestial Bodies & Weather label on one line',
    args: { ...BASE, isGM: true },
    render: (args) => {
        const widget = renderWidget(args);
        widget.style.width = `${WIDGET_WIDTH_PX}px`;
        return widget;
    },
    play: async ({ canvasElement }) => {
        const button = canvasElement.querySelector<HTMLElement>('[data-action="editBodies"]');
        const label = button?.querySelector('span') ?? null;
        await expect(label?.textContent.trim()).toBe('Bodies & Weather');
        await expect(button?.dataset['tooltip']).toBe('Celestial Bodies & Weather');
        // The whole short label shows: nothing is cut to an ellipsis.
        await expect((label?.scrollWidth ?? 0) <= (label?.clientWidth ?? 0)).toBe(true);
        await expect(button?.classList.contains('tw-whitespace-nowrap')).toBe(true);
        // One line box for the label, however the font measures.
        await expect(label?.getClientRects().length).toBe(1);
    },
};
