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
    overloadMin: number;
    overloadRating: number;
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
        overloadMin: 1,
        overloadRating: 10,
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

/**
 * The card prints the whole resolution (#645): the d100 against the protection
 * rating, and the overload band it was checked against.
 */
export const ProtectionFormula: Story = {
    args: card('dh2', true),
    render: (args) => render(args),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-wh40k-hook="force-field-formula"]')?.textContent).toContain('d100 12 vs PR 30');
        await expect(canvasElement.querySelector('[data-wh40k-hook="force-field-overload-band"]')?.textContent).toContain('d100 12 vs 1–10');
        await expect(canvasElement.textContent).not.toContain('Field Overload!');
    },
};

/** A roll inside the overload band protects and overloads at once. */
export const ProtectedAndOverloaded: Story = {
    args: { ...card('dh2', true), roll: { total: 7 }, overload: true },
    render: (args) => render(args),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.textContent).toContain('Field Activated');
        await expect(canvasElement.textContent).toContain('Field Overload!');
        await expect(canvasElement.querySelector('[data-wh40k-hook="force-field-overload-band"]')?.textContent).toContain('d100 7 vs 1–10');
    },
};
