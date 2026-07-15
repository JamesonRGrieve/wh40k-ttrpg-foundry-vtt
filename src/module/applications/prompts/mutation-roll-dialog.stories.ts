import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import templateSrc from '../../../../src/templates/prompt/mutation-roll-dialog.hbs?raw';
import { renderSheet } from '../../../../stories/test-helpers';
import type { MutationTrack } from '../../rules/mutation-roll.ts';

interface Args {
    track: MutationTrack;
}

interface MutationRollCtx {
    track: MutationTrack;
    trackIsMinor: boolean;
    trackIsMajor: boolean;
    rangeMin: number;
    rangeMax: number;
}

// The live dialog derives these bands from the "Mutations" compendium table;
// the story renders the template in isolation, so the representative DH2 bands
// (minor rows end at 54, the full table at 100) are supplied as mock context.
const TRACK_RANGE_MOCK: Record<MutationTrack, { min: number; max: number }> = {
    minor: { min: 1, max: 54 },
    major: { min: 1, max: 100 },
};

function buildContext(args: Args): MutationRollCtx {
    const range = TRACK_RANGE_MOCK[args.track];
    return {
        track: args.track,
        trackIsMinor: args.track === 'minor',
        trackIsMajor: args.track === 'major',
        rangeMin: range.min,
        rangeMax: range.max,
    };
}

const meta = {
    title: 'Dialogs/MutationRollDialog',
    render: (args) => renderSheet(templateSrc, { ...buildContext(args) }),
    args: {
        track: 'minor',
    },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

export const MinorTrack: Story = {
    args: { track: 'minor' },
};

export const MajorTrack: Story = {
    args: { track: 'major' },
};

export const RenderSmoke: Story = {
    args: { track: 'major' },
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        // Both track buttons render.
        await expect(canvasElement.querySelector('[data-action="selectTrack"][data-track="minor"]')).toBeTruthy();
        await expect(canvasElement.querySelector('[data-action="selectTrack"][data-track="major"]')).toBeTruthy();
        // Roll button is present.
        await expect(canvasElement.querySelector('[data-action="rollMutation"]')).toBeTruthy();
        // Title localizes.
        await expect(view.getByText(/Roll Mutation/i)).toBeTruthy();
    },
};
