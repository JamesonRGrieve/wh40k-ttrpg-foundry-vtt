/**
 * Token art toggle — the switch above the portrait's top-left corner that sets
 * whether this actor's tokens draw a circular bust or the whole art. Rendered
 * through the shared `actor-identity` partial (character / NPC / voidcraft
 * sheets) and the craft sheet header, so the stories exercise it in both of
 * its real containers.
 */

import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import { mockActor } from '../../../../stories/mocks';
import { type SystemId, withSystem } from '../../../../stories/mocks/extended';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { clickAction, renderSheet } from '../../../../stories/test-helpers';

initializeStoryHandlebars();

interface TokenArtContext {
    readonly full: boolean;
}

interface Args {
    gameSystem: SystemId;
    portraitTokenArt: TokenArtContext | null;
    container: 'identity' | 'craft';
}

const IDENTITY_SOURCE = `<div data-wh40k-system="{{gameSystem}}" class="tw-w-[200px]">{{> systems/wh40k-rpg/templates/actor/partial/actor-identity.hbs}}</div>`;
const CRAFT_SOURCE = `<div data-wh40k-system="{{gameSystem}}" class="tw-w-[220px]">{{> systems/wh40k-rpg/templates/actor/craft/header.hbs}}</div>`;

function render(args: Args): HTMLElement {
    const actor = withSystem(mockActor({ name: 'Garrick Varo' }), args.gameSystem);
    const source = args.container === 'craft' ? CRAFT_SOURCE : IDENTITY_SOURCE;
    return renderSheet(source, { actor, system: actor.system, isNPC: true, gameSystem: args.gameSystem, portraitTokenArt: args.portraitTokenArt });
}

/** Record the `data-action` of every click that bubbles out of the canvas. */
function recordActions(canvasElement: HTMLElement): string[] {
    const fired: string[] = [];
    canvasElement.addEventListener('click', (event) => {
        const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-action]') : null;
        const action = target?.dataset['action'];
        if (action !== undefined) fired.push(action);
    });
    return fired;
}

function toggleIn(canvasElement: HTMLElement): HTMLButtonElement | null {
    return canvasElement.querySelector<HTMLButtonElement>('[data-action="toggleTokenArt"]');
}

/** The toggle sits above the portrait, outside it, and to its left edge. */
async function expectAbovePortrait(canvasElement: HTMLElement, toggle: HTMLButtonElement): Promise<void> {
    const portrait = canvasElement.querySelector<HTMLElement>('[data-wh40k-hook="actor-portrait"]');
    await expect(portrait).not.toBeNull();
    if (portrait === null) return;
    await expect(portrait.contains(toggle)).toBe(false);
    // Document order: the switch comes before the portrait it labels.
    await expect(toggle.compareDocumentPosition(portrait) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
}

const meta = {
    title: 'Actor/Partials/PortraitTokenArtToggle',
    render,
    args: { gameSystem: 'dh2', portraitTokenArt: { full: false }, container: 'identity' },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

export const BustDH2: Story = {
    name: 'Circular bust · DH2',
    play: async ({ canvasElement }) => {
        const toggle = toggleIn(canvasElement);
        await expect(toggle).not.toBeNull();
        if (toggle === null) return;
        // A native switch: focusable, Enter / Space activate it as a click.
        await expect(toggle.tagName).toBe('BUTTON');
        await expect(toggle.type).toBe('button');
        await expect(toggle.getAttribute('role')).toBe('switch');
        await expect(toggle.getAttribute('aria-checked')).toBe('false');
        await expect(toggle.getAttribute('aria-label')).toBe('Token art: circular bust or whole image');
        await expect(toggle.dataset['tooltip']).toBe('Tokens show a circular bust. Click to show the whole art.');
        await expect(toggle.querySelector('.fa-circle-user')).not.toBeNull();
        await expectAbovePortrait(canvasElement, toggle);
        toggle.focus();
        await expect(toggle.ownerDocument.activeElement).toBe(toggle);

        const fired = recordActions(canvasElement);
        clickAction(canvasElement, 'toggleTokenArt');
        // The click dispatches the toggle, never the portrait's editImage.
        await expect(fired).toEqual(['toggleTokenArt']);
    },
};

export const FullArtRT: Story = {
    name: 'Whole art · RT',
    args: { gameSystem: 'rt', portraitTokenArt: { full: true } },
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-wh40k-system="rt"]')).not.toBeNull();
        const toggle = toggleIn(canvasElement);
        await expect(toggle?.getAttribute('aria-checked')).toBe('true');
        await expect(toggle?.dataset['tooltip']).toBe('Tokens show the whole art. Click to show a circular bust.');
        await expect(toggle?.querySelector('.fa-image')).not.toBeNull();
        const fired = recordActions(canvasElement);
        clickAction(canvasElement, 'toggleTokenArt');
        await expect(fired).toEqual(['toggleTokenArt']);
    },
};

export const NotOwner: Story = {
    name: 'Not an owner · DH2',
    args: { portraitTokenArt: null },
    play: async ({ canvasElement }) => {
        await expect(toggleIn(canvasElement)).toBeNull();
        // The portrait itself still renders.
        await expect(canvasElement.querySelector('[data-wh40k-hook="actor-portrait"] img')).not.toBeNull();
    },
};

export const CraftHeaderBC: Story = {
    name: 'Craft header · BC',
    args: { gameSystem: 'bc', container: 'craft' },
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-wh40k-system="bc"]')).not.toBeNull();
        const toggle = toggleIn(canvasElement);
        await expect(toggle).not.toBeNull();
        if (toggle === null) return;
        await expectAbovePortrait(canvasElement, toggle);
        const fired = recordActions(canvasElement);
        clickAction(canvasElement, 'toggleTokenArt');
        await expect(fired).toEqual(['toggleTokenArt']);
    },
};
