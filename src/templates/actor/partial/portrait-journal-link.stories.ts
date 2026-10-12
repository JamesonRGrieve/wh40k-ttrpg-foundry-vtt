/**
 * Portrait journal link (#590) — the journal icon overlaid on an actor
 * portrait. Rendered through the shared `actor-identity` partial (the name +
 * portrait unit every character / NPC / voidcraft sheet composes), so the
 * stories exercise the icon in its real container.
 */

import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import { mockActor } from '../../../../stories/mocks';
import { type SystemId, withSystem } from '../../../../stories/mocks/extended';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { clickAction, renderSheet } from '../../../../stories/test-helpers';

initializeStoryHandlebars();

const JOURNAL_UUID = 'JournalEntry.aaaaaaaaaaaaaaaa';

interface PortraitJournalContext {
    readonly uuid: string;
    readonly canClear: boolean;
}

interface Args {
    gameSystem: SystemId;
    portraitJournal: PortraitJournalContext | null;
}

const IDENTITY_SOURCE = `<div data-wh40k-system="{{gameSystem}}" class="tw-w-[200px]">{{> systems/wh40k-rpg/templates/actor/partial/actor-identity.hbs}}</div>`;

function render(args: Args): HTMLElement {
    const actor = withSystem(mockActor({ name: 'Garrick Varo' }), args.gameSystem);
    return renderSheet(IDENTITY_SOURCE, { actor, system: actor.system, isNPC: true, gameSystem: args.gameSystem, portraitJournal: args.portraitJournal });
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

const meta = {
    title: 'Actor/Partials/PortraitJournalLink',
    render,
    args: { gameSystem: 'dh2', portraitJournal: { uuid: JOURNAL_UUID, canClear: false } },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

export const LinkedDH2: Story = {
    name: 'Linked · DH2',
    play: async ({ canvasElement }) => {
        const open = canvasElement.querySelector<HTMLButtonElement>('[data-action="openPortraitJournal"]');
        await expect(open).not.toBeNull();
        if (open === null) return;
        // A native button: focusable, and Enter / Space activate it as a click.
        await expect(open.tagName).toBe('BUTTON');
        await expect(open.type).toBe('button');
        await expect(open.getAttribute('aria-label')).toBe('Open journal entry');
        await expect(open.dataset['tooltip']).toBe('Open journal entry');
        open.focus();
        await expect(open.ownerDocument.activeElement).toBe(open);
        // Overlaid on the portrait: inside the drop-target container with the image.
        const portrait = open.closest('[data-wh40k-hook="actor-portrait"]');
        await expect(portrait?.querySelector('img[data-action="editImage"]')).not.toBeNull();
        // No explicit link to clear.
        await expect(canvasElement.querySelector('[data-action="clearPortraitJournal"]')).toBeNull();

        const fired = recordActions(canvasElement);
        clickAction(canvasElement, 'openPortraitJournal');
        // The click dispatches the journal action, not the portrait's editImage.
        await expect(fired).toEqual(['openPortraitJournal']);
    },
};

export const Unlinked: Story = {
    name: 'Unlinked · DH2',
    args: { portraitJournal: null },
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-action="openPortraitJournal"]')).toBeNull();
        await expect(canvasElement.querySelector('[data-action="clearPortraitJournal"]')).toBeNull();
        // The portrait itself still renders and stays the drop target.
        await expect(canvasElement.querySelector('[data-wh40k-hook="actor-portrait"] img')).not.toBeNull();
    },
};

export const ExplicitLinkRT: Story = {
    name: 'Explicit link (owner) · RT',
    args: { gameSystem: 'rt', portraitJournal: { uuid: JOURNAL_UUID, canClear: true } },
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-wh40k-system="rt"]')).not.toBeNull();
        const clear = canvasElement.querySelector<HTMLButtonElement>('[data-action="clearPortraitJournal"]');
        await expect(clear?.tagName).toBe('BUTTON');
        await expect(clear?.getAttribute('aria-label')).toContain('Unlink journal entry');

        const fired = recordActions(canvasElement);
        clickAction(canvasElement, 'openPortraitJournal');
        clickAction(canvasElement, 'clearPortraitJournal');
        await expect(fired).toEqual(['openPortraitJournal', 'clearPortraitJournal']);
    },
};

export const LinkedBC: Story = {
    name: 'Linked · BC',
    args: { gameSystem: 'bc' },
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-wh40k-system="bc"]')).not.toBeNull();
        const fired = recordActions(canvasElement);
        clickAction(canvasElement, 'openPortraitJournal');
        await expect(fired).toEqual(['openPortraitJournal']);
    },
};
