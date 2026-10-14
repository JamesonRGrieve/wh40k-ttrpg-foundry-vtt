/**
 * Storybook stories for the force-field activation card (`force-field-roll-chat.hbs`).
 *
 * The field's `system.description` is the structured `{value, chat, summary}`
 * record; the card renders its `value` HTML, never the record itself
 * ("[object Object]", #229).
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import { initializeStoryHandlebars } from '../../../stories/template-support';
import { renderSheet } from '../../../stories/test-helpers';
import cardSrc from './force-field-roll-chat.hbs?raw';

initializeStoryHandlebars();

interface ForceFieldCardCtx {
    actor: { name: string };
    forceField: { name: string; system: { description: { value: string; chat: string; summary: string } } };
    roll: { total: number };
    protectionRating: number;
    success: boolean;
    overload: boolean;
    isTargetOnly: boolean;
    isManualRoll: boolean;
    gameSystem: string;
}

function card(gameSystem: string, success: boolean): ForceFieldCardCtx {
    return {
        actor: { name: 'Inquisitor Halvar' },
        forceField: {
            name: 'Refractor Field',
            system: { description: { value: '<p>A shimmering haze that bends incoming fire.</p>', chat: '', summary: '' } },
        },
        roll: { total: success ? 12 : 64 },
        protectionRating: 30,
        success,
        overload: false,
        isTargetOnly: false,
        isManualRoll: false,
        gameSystem,
    };
}

function render(ctx: ForceFieldCardCtx): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    wrapper.dataset['wh40kSystem'] = ctx.gameSystem;
    wrapper.appendChild(renderSheet(cardSrc, ctx));
    return wrapper;
}

const meta: Meta<ForceFieldCardCtx> = { title: 'Chat / Force Field Activation Card' };
export default meta;
type Story = StoryObj<ForceFieldCardCtx>;

/** The field's description renders as its text, after the activation result. */
export const ActivatedWithDescription: Story = {
    args: card('rt', true),
    render: (args) => render(args),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-wh40k-hook="force-field-description"]')?.textContent.trim()).toBe(
            'A shimmering haze that bends incoming fire.',
        );
        await expect(canvasElement.textContent).toContain('Field Activated');
        await expect(canvasElement.textContent).toContain('Force Field Activation');
        await expect(canvasElement.textContent).not.toContain('[object Object]');
    },
};

/** A failed activation still prints the description, never the record. */
export const FailedWithDescription: Story = {
    args: card('dh2', false),
    render: (args) => render(args),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.textContent).toContain('Field Failed');
        await expect(canvasElement.textContent).not.toContain('[object Object]');
    },
};
