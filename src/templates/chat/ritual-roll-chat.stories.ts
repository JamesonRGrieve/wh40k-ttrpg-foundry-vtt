/**
 * Storybook stories for the ritual roll card (`ritual-roll-chat.hbs`) — the card a
 * ritual performed from the character sheet posts (`Item#rollRitual`).
 *
 * The ritual's `system.duration` is the structured activation duration
 * (`{value, units, sustained}`); the card prints its localised `durationLabel`
 * and never the record itself ("Duration: [object Object]", #229).
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import { initializeStoryHandlebars } from '../../../stories/template-support';
import { renderSheet } from '../../../stories/test-helpers';
import cardSrc from './ritual-roll-chat.hbs?raw';

initializeStoryHandlebars();

interface RitualCardCtx {
    item: {
        name: string;
        img: string;
        system: {
            description: { value: string };
            effect: string;
            duration: { value: number; units: string; sustained: boolean };
            durationLabel: string;
        };
    };
    roll: { total: number };
    targetValue: number;
    success: boolean;
    degrees: number;
    actor: string;
    gameSystem: string;
}

function ritualCard(gameSystem: string, duration: RitualCardCtx['item']['system']['duration'], durationLabel: string): RitualCardCtx {
    return {
        item: {
            name: 'Rite of Warding',
            img: 'icons/svg/aura.svg',
            system: { description: { value: '<p>Hallowed salts are scattered at every threshold.</p>' }, effect: '', duration, durationLabel },
        },
        roll: { total: 1 },
        targetValue: 75,
        success: true,
        degrees: 7,
        actor: 'Adept Corvane',
        gameSystem,
    };
}

/** Render the card inside a `.wh40k-rpg` root, as a chat message is. */
function render(ctx: RitualCardCtx): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    wrapper.dataset['wh40kSystem'] = ctx.gameSystem;
    wrapper.appendChild(renderSheet(cardSrc, ctx));
    return wrapper;
}

const meta: Meta<RitualCardCtx> = { title: 'Chat / Ritual Roll Card' };
export default meta;
type Story = StoryObj<RitualCardCtx>;

/** A DH1 ritual lasting 3 rounds prints "3 Rounds", not the duration record. */
export const TimedDuration: Story = {
    args: ritualCard('dh1', { value: 3, units: 'rounds', sustained: false }, '3 Rounds'),
    render: (args) => render(args),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-wh40k-hook="ritual-duration"]')?.textContent.replace(/\s+/g, ' ').trim()).toBe('Duration: 3 Rounds');
        await expect(canvasElement.textContent).not.toContain('[object Object]');
        await expect(canvasElement.textContent).toContain('(7 Degrees)');
    },
};

/** A sustained BC ritual prints "Sustained". */
export const SustainedDuration: Story = {
    args: ritualCard('bc', { value: 0, units: 'sustained', sustained: true }, 'Sustained'),
    render: (args) => render(args),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-wh40k-hook="ritual-duration"]')?.textContent).toContain('Sustained');
        await expect(canvasElement.textContent).not.toContain('[object Object]');
    },
};

/** No duration label (an item with no activation duration): no Duration row at all. */
export const NoDuration: Story = {
    args: ritualCard('dh2', { value: 0, units: 'instant', sustained: false }, ''),
    render: (args) => render(args),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-wh40k-hook="ritual-duration"]')).toBeNull();
    },
};
