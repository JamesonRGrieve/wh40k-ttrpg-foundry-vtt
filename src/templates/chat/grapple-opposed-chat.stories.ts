/**
 * Storybook stories for the grapple action result card (#450, DH2 core p. 221–222).
 *
 * Each story resolves a real Opposed Strength test through the rules module and
 * renders the card from `buildGrappleCard`, so the card shows exactly what the
 * sheet posts: both sides' Strength, roll and degrees, the Size edge, and the
 * verdict by the RAW Opposed-test ladder (p. 24). Grappling is in every line, so
 * the card renders under each line's system attribute.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import type { SystemId } from '../../../stories/mocks/extended';
import { initializeStoryHandlebars } from '../../../stories/template-support';
import { renderSheet } from '../../../stories/test-helpers';
import { buildGrappleCard, type GrappleCardContext, resolveBreakGrapple, resolveDamageOpponent, resolveMoveWhileGrappling } from '../../module/rules/grapple';
import cardSrc from './grapple-opposed-chat.hbs?raw';

initializeStoryHandlebars();

interface Args {
    card: GrappleCardContext;
    gameSystem: SystemId;
    /** A won Break Free: the card notes the grapple is over. */
    ended?: boolean;
}

function renderCard(args: Args): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    wrapper.style.maxWidth = '300px';
    wrapper.appendChild(renderSheet(cardSrc, { gameSystem: args.gameSystem, ended: args.ended === true, ...args.card }));
    return wrapper;
}

const meta: Meta<Args> = { title: 'Chat/GrappleOpposedChat', render: (args) => renderCard(args) };
export default meta;
type Story = StoryObj<Args>;

const WON = buildGrappleCard(
    resolveDamageOpponent({ actorRoll: 22, actorStrength: 45, opponentRoll: 61, opponentStrength: 30 }),
    { name: 'Sister Ophelia', strength: 45, roll: 22 },
    { name: 'Cultist', strength: 30, roll: 61 },
);

/** The controller wins Damage Opponent: her pass beats his failure. */
export const ControllerWins: Story = {
    args: { card: WON, gameSystem: 'dh2' },
    play: async ({ canvasElement }) => {
        const card = canvasElement.querySelector('[data-wh40k-hook="grapple-card"]');
        await expect(card?.getAttribute('data-grapple-outcome')).toBe('won');
        await expect(canvasElement.querySelector('[data-grapple-side="actor"]')?.textContent).toContain('Rolled 22 against Strength 45');
        await expect(canvasElement.querySelector('[data-grapple-side="opponent"]')?.textContent).toContain('Rolled 61 against Strength 30');
        await expect(canvasElement.querySelector('[data-wh40k-hook="grapple-verdict"]')?.textContent).toContain('Sister Ophelia wins the test');
    },
};

/** Break Free against a larger controller: his Size edge decides it. */
export const LargerControllerHolds: Story = {
    args: {
        card: buildGrappleCard(
            resolveBreakGrapple({ actorRoll: 30, actorStrength: 40, opponentRoll: 30, opponentStrength: 40, actorSize: 4, opponentSize: 5 }),
            { name: 'Acolyte Vex', strength: 40, roll: 30 },
            { name: 'Ogryn', strength: 40, roll: 30 },
        ),
        gameSystem: 'ow',
    },
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-grapple-side="opponent"] [data-grapple-size-edge]')?.textContent).toContain('+1 DoS for Size');
        await expect(canvasElement.querySelector('[data-wh40k-hook="grapple-verdict"]')?.textContent).toContain('Ogryn wins the test');
    },
};

/** The held side wins Break Free: the grapple is over for both. */
export const BreakFreeEnds: Story = {
    args: {
        card: buildGrappleCard(
            resolveBreakGrapple({ actorRoll: 8, actorStrength: 50, opponentRoll: 44, opponentStrength: 30 }),
            { name: 'Acolyte Vex', strength: 50, roll: 8 },
            { name: 'Cultist', strength: 30, roll: 44 },
        ),
        gameSystem: 'dh2',
        ended: true,
    },
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-wh40k-hook="grapple-verdict"]')?.textContent).toContain('Acolyte Vex wins the test');
        await expect(canvasElement.querySelector('[data-wh40k-hook="grapple-ended"]')?.textContent).toContain('The grapple is over.');
    },
};

/** Both fail: a stalemate, and nothing happens. */
export const Stalemate: Story = {
    args: {
        card: buildGrappleCard(
            resolveMoveWhileGrappling({ actorRoll: 95, actorStrength: 35, opponentRoll: 88, opponentStrength: 35 }),
            { name: 'Acolyte Vex', strength: 35, roll: 95 },
            { name: 'Cultist', strength: 35, roll: 88 },
        ),
        gameSystem: 'bc',
    },
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-wh40k-hook="grapple-card"]')?.getAttribute('data-grapple-outcome')).toBe('stalemate');
        await expect(canvasElement.querySelector('[data-wh40k-hook="grapple-verdict"]')?.textContent).toContain('Stalemate');
    },
};

const LINES: SystemId[] = ['dh2', 'dh1', 'rt', 'bc', 'ow', 'dw'];

/** The same card under each line. */
export const PerSystem: Story = {
    render: () => {
        const root = document.createElement('div');
        for (const gameSystem of LINES) root.appendChild(renderCard({ card: WON, gameSystem }));
        return root;
    },
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelectorAll('[data-wh40k-hook="grapple-card"]').length).toBe(LINES.length);
    },
};
