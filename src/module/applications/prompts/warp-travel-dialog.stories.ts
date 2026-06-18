import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import templateSrc from '../../../../src/templates/prompt/warp-travel-dialog.hbs?raw';
import { assertField, renderSheet } from '../../../../stories/test-helpers';
import { resolveWarpJourney, type WarpJourneyInput } from '../../rules/warp-travel.ts';

/**
 * WarpTravelDialog (RT, GM-only) renders `warp-travel-dialog.hbs`. The GM enters
 * a base voyage duration + Navigator characteristics + per-stage d100 rolls, then
 * presses Resolve; the summary panel + Post-to-Chat button appear once a result
 * exists. Stories cover the pristine (no-result) state and a resolved journey
 * built from the real `resolveWarpJourney()` resolution math.
 */

interface WarpArgs {
    inputs: WarpJourneyInput;
    result: ReturnType<typeof resolveWarpJourney> | null;
}

const DEFAULT_INPUTS: WarpJourneyInput = {
    baseDays: 30,
    awareness: 40,
    navigationWarp: 40,
    locateRoll: 50,
    chartRoll: 50,
    steerRoll: 50,
    leaveRoll: 50,
};

const meta = {
    title: 'Prompts/WarpTravelDialog',
    render: (args) => renderSheet(templateSrc, { ...args }),
    args: {
        inputs: DEFAULT_INPUTS,
        result: null,
    },
} satisfies Meta<WarpArgs>;
export default meta;

type Story = StoryObj<WarpArgs>;

/** Pristine state — inputs populated, no summary yet, Post-to-Chat disabled. */
export const InputsOnly: Story = {
    play: async ({ canvasElement }) => {
        assertField(canvasElement, 'baseDays', 30);
        assertField(canvasElement, 'awareness', 40);
        assertField(canvasElement, 'navigationWarp', 40);
        const resolve = canvasElement.querySelector('[data-action="resolveJourney"]');
        await expect(resolve).toBeTruthy();
        const postChat = canvasElement.querySelector<HTMLButtonElement>('[data-action="postChat"]');
        await expect(postChat?.disabled).toBe(true);
    },
};

/** A clean voyage (all stages pass) — summary panel renders, Post-to-Chat enabled. */
export const ResolvedJourney: Story = {
    args: {
        inputs: { ...DEFAULT_INPUTS, awareness: 70, navigationWarp: 70, locateRoll: 12, chartRoll: 18, steerRoll: 22, leaveRoll: 15 },
        result: resolveWarpJourney({ ...DEFAULT_INPUTS, awareness: 70, navigationWarp: 70, locateRoll: 12, chartRoll: 18, steerRoll: 22, leaveRoll: 15 }),
    },
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        // Summary numbers render; elapsedDays is computed from the resolution math.
        const expected = resolveWarpJourney({
            ...DEFAULT_INPUTS,
            awareness: 70,
            navigationWarp: 70,
            locateRoll: 12,
            chartRoll: 18,
            steerRoll: 22,
            leaveRoll: 15,
        });
        await expect(view.getByText(String(expected.elapsedDays))).toBeTruthy();
        const postChat = canvasElement.querySelector<HTMLButtonElement>('[data-action="postChat"]');
        await expect(postChat?.disabled).toBe(false);
    },
};

/** A botched voyage (failed rolls) — off-course / beacon-lost flags surface in red. */
export const OffCourseJourney: Story = {
    args: {
        inputs: { ...DEFAULT_INPUTS, awareness: 25, navigationWarp: 25, locateRoll: 98, chartRoll: 96, steerRoll: 97, leaveRoll: 95 },
        result: resolveWarpJourney({ ...DEFAULT_INPUTS, awareness: 25, navigationWarp: 25, locateRoll: 98, chartRoll: 96, steerRoll: 97, leaveRoll: 95 }),
    },
    play: async ({ canvasElement }) => {
        // The summary panel exists once a result is present.
        await expect(canvasElement.querySelector('.tw-tabular-nums')).toBeTruthy();
    },
};
