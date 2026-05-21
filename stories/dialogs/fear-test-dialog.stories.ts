import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import { MAX_FEAR_RATING, resolveFearTest } from '../../src/module/rules/fear.ts';
import templateSrc from '../../src/templates/prompt/fear-test-dialog.hbs?raw';
import { renderSheet } from '../test-helpers';

interface ObserverOption {
    id: string;
    name: string;
    willpower: number;
}

interface Args {
    willpower: number;
    fearRating: number;
    selectedObserverId: string | null;
}

const OBSERVERS: ObserverOption[] = [
    { id: 'acolyte-1', name: 'Acolyte Vex', willpower: 38 },
    { id: 'acolyte-2', name: 'Inquisitor Kael', willpower: 55 },
    { id: 'acolyte-3', name: 'Scribe Thel', willpower: 24 },
];

interface FearTestPip {
    index: number;
    on: boolean;
}

interface FearTestCtx {
    observers: ObserverOption[];
    selectedObserverId: string | null;
    willpower: number;
    fearRating: number;
    maxFearRating: number;
    target: number;
    isNoOp: boolean;
    pips: FearTestPip[];
    fearRatingHigh: boolean;
}

function buildContext(args: Args): FearTestCtx {
    const { target, isNoOp } = resolveFearTest({ willpowerTotal: args.willpower, fearRating: args.fearRating });
    const pips = Array.from({ length: MAX_FEAR_RATING }, (_v, i) => ({
        index: i + 1,
        on: i + 1 <= args.fearRating,
    }));
    return {
        observers: OBSERVERS,
        selectedObserverId: args.selectedObserverId,
        willpower: args.willpower,
        fearRating: args.fearRating,
        maxFearRating: MAX_FEAR_RATING,
        target,
        isNoOp,
        pips,
        fearRatingHigh: args.fearRating >= 3,
    };
}

const meta = {
    title: 'Dialogs/FearTestDialog',
    render: (args) => renderSheet(templateSrc, { ...buildContext(args) }),
    args: {
        willpower: 38,
        fearRating: 1,
        selectedObserverId: 'acolyte-1',
    },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

export const Fear1: Story = {};

export const Fear3Crimson: Story = {
    args: { willpower: 38, fearRating: 3, selectedObserverId: 'acolyte-1' },
};

export const Fear4Max: Story = {
    args: { willpower: 55, fearRating: 4, selectedObserverId: 'acolyte-2' },
};

export const NoFearDisabled: Story = {
    args: { willpower: 38, fearRating: 0, selectedObserverId: null },
};

export const RenderSmoke: Story = {
    play: async ({ canvasElement }) => {
        const storyCanvas = within(canvasElement);
        // Observer selector renders.
        await expect(canvasElement.querySelector('select[name="observer"]')).toBeTruthy();
        // WP + fear rating inputs render.
        await expect(canvasElement.querySelector('input[name="willpower"]')).toBeTruthy();
        await expect(canvasElement.querySelector('input[name="fearRating"]')).toBeTruthy();
        // Roll button is present.
        await expect(storyCanvas.getByText(/Trigger Fear Test/i)).toBeTruthy();
    },
};
