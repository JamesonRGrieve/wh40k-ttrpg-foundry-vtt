/**
 * Fate panel (`fate-panel.hbs`): the Fate total as rosette pips over the current
 * points, the spend/restore steppers and the edit body. Since #63 the panel's
 * only fields are the total (`fate.max`) and the current pool (`fate.value`);
 * the retired Burn Threshold line must not come back.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import { seedRandom, randomId } from '../../../../stories/mocks/extended';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { captureActionClicks, renderSheet } from '../../../../stories/test-helpers';
import panelSrc from './fate-panel.hbs?raw';

initializeStoryHandlebars();

interface FateArgs {
    value: number;
    max: number;
}

/** Fixed seed so the mock actor id (and anything keyed on it) is stable across runs. */
const STORY_SEED = 42;

function renderPanel(args: FateArgs): HTMLElement {
    const rng = seedRandom(STORY_SEED);
    const actor = { _id: randomId('actor', rng), flags: {} };
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg', 'theme-dark');
    wrapper.dataset['wh40kSystem'] = 'dh2';
    wrapper.style.maxWidth = '420px';
    wrapper.appendChild(
        renderSheet(panelSrc, {
            actor,
            system: { fate: { value: args.value, max: args.max } },
            _gameSystemId: 'dh2',
        }),
    );
    return wrapper;
}

/** Pips that render as available (glowing) rather than spent (dimmed). */
function availablePips(root: HTMLElement): number {
    return Array.from(root.querySelectorAll('[data-action="setFateStar"]')).filter((pip) => !pip.classList.contains('tw-opacity-40')).length;
}

const meta = {
    title: 'Actor/Panels/FatePanel',
    render: (args) => renderPanel(args),
    args: { value: 2, max: 3 },
} satisfies Meta<FateArgs>;
export default meta;
type Story = StoryObj<FateArgs>;

/** Three Fate, two left: three pips, two of them available, each pip indexed for setFateStar. */
export const PartlySpent: Story = {
    play: async ({ canvasElement }) => {
        const pips = canvasElement.querySelectorAll<HTMLElement>('[data-action="setFateStar"]');
        await expect(pips.length).toBe(3);
        await expect(availablePips(canvasElement)).toBe(2);
        await expect(Array.from(pips).map((pip) => pip.dataset['fateIndex'])).toEqual(['1', '2', '3']);
        await expect(canvasElement.querySelector('[data-action="decrement"][data-field="system.fate.value"]')).not.toBeNull();
        await expect(canvasElement.querySelector('[data-action="increment"][data-field="system.fate.value"]')).not.toBeNull();
        await expect(canvasElement.textContent).not.toMatch(/threshold/i);
    },
};

/** Clicking a pip dispatches setFateStar with that pip's index (the handler toggles the pool to it). */
export const PipClickDispatchesIndex: Story = {
    play: async ({ canvasElement }) => {
        const seen = captureActionClicks(canvasElement);
        canvasElement.querySelector<HTMLElement>('[data-fate-index="3"]')?.click();
        await expect(seen.map((click) => [click.action, click.dataset['fateIndex']])).toEqual([['setFateStar', '3']]);
    },
};

/** Every point spent: the panel takes its empty state, all pips dimmed. */
export const AllSpent: Story = {
    args: { value: 0, max: 2 },
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('.wh40k-fate-empty-state')).not.toBeNull();
        await expect(availablePips(canvasElement)).toBe(0);
    },
};

/** No Fate total at all (every point burnt): no pips, the "no Fate points" note instead. */
export const NoFateTotal: Story = {
    args: { value: 0, max: 0 },
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-action="setFateStar"]')).toBeNull();
    },
};

/** The (collapsed) edit body: exactly the total and current fields — no separate threshold field (#63). */
export const EditFields: Story = {
    play: async ({ canvasElement }) => {
        const names = Array.from(canvasElement.querySelectorAll<HTMLInputElement>('input[name^="system.fate"]')).map((input) => input.name);
        await expect(names.sort()).toEqual(['system.fate.max', 'system.fate.value']);
    },
};
