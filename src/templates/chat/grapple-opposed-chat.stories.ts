/**
 * Storybook stories for the grapple option card (#120, #450; DH2 core pp. 221–222).
 *
 * Each opposed story resolves a real test through the rules module and renders the
 * card from `buildGrappleCard`, so the card shows exactly what the sheet posts: each
 * side's base, its modifiers with their source, target, roll and degrees, the Size
 * edge, the verdict by the RAW Opposed-test ladder (p. 24) and the option's effect.
 * Grappling is in every line, so the card renders under each line's system attribute.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import type { SystemId } from '../../../stories/mocks/extended';
import { initializeStoryHandlebars } from '../../../stories/template-support';
import { renderSheet } from '../../../stories/test-helpers';
import {
    buildGrappleCard,
    type GrappleCardContext,
    type GrappleCardSideInput,
    grappleSideTarget,
    resolveGrappleOpposed,
    type GrappleAction,
} from '../../module/rules/grapple';
import cardSrc from './grapple-opposed-chat.hbs?raw';

initializeStoryHandlebars();

interface Args {
    card: GrappleCardContext | null;
    gameSystem: SystemId;
    /** The grapple is over for both (a won Break Free / Slip Free). */
    ended?: boolean;
    /** An option with no test (Ready, Use Item). */
    declared?: { actionLabelKey: string; effectKey: string; actorName: string };
}

function renderCard(args: Args): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    wrapper.style.maxWidth = '320px';
    const context =
        args.declared !== undefined
            ? { gameSystem: args.gameSystem, declared: true, ...args.declared }
            : { gameSystem: args.gameSystem, ended: args.ended === true, ...args.card };
    wrapper.appendChild(renderSheet(cardSrc, context));
    return wrapper;
}

const meta: Meta<Args> = { title: 'Chat/GrappleOpposedChat', render: (args) => renderCard(args) };
export default meta;
type Story = StoryObj<Args>;

/** One side of a Strength test, with optional modifier rows. */
function side(name: string, strength: number, roll: number, modifiers: GrappleCardSideInput['modifiers'] = []): GrappleCardSideInput {
    return { name, base: strength, baseLabel: 'Strength', modifiers, roll };
}

/** Resolve an opposed option between two sides and build its card. */
function card(
    action: GrappleAction,
    actor: GrappleCardSideInput,
    opponent: GrappleCardSideInput,
    sizes: { actorSize?: number; opponentSize?: number } = {},
): GrappleCardContext {
    const resolution = resolveGrappleOpposed(
        {
            actorRoll: actor.roll,
            actorStrength: grappleSideTarget(actor),
            opponentRoll: opponent.roll,
            opponentStrength: grappleSideTarget(opponent),
            ...sizes,
        },
        action,
    );
    return buildGrappleCard(resolution, actor, opponent);
}

const WON = card('damage-opponent', side('Sister Ophelia', 45, 22), side('Cultist', 30, 61));

/** The controller wins Damage Opponent: her pass beats his failure, and the card states the damage. */
export const ControllerWins: Story = {
    args: { card: WON, gameSystem: 'dh2' },
    play: async ({ canvasElement }) => {
        const root = canvasElement.querySelector('[data-wh40k-hook="grapple-card"]');
        await expect(root?.getAttribute('data-grapple-outcome')).toBe('won');
        await expect(canvasElement.querySelector('[data-grapple-side="actor"]')?.textContent).toContain('Rolled 22 against 45');
        await expect(canvasElement.querySelector('[data-grapple-side="opponent"]')?.textContent).toContain('Rolled 61 against 30');
        await expect(canvasElement.querySelector('[data-grapple-side="actor"] [data-grapple-base]')?.textContent).toContain('Strength');
        await expect(canvasElement.querySelector('[data-wh40k-hook="grapple-verdict"]')?.textContent).toContain('Sister Ophelia wins the test');
        await expect(canvasElement.querySelector('[data-wh40k-hook="grapple-effect"]')?.textContent).toContain('1d5−3+SB');
    },
};

/**
 * A thrown-down opponent (DH2 core p. 221): the controller's +10 is a row with its
 * source, folded into the target.
 */
export const ThrownDownBonus: Story = {
    args: {
        card: card(
            'push-opponent',
            side('Sister Ophelia', 40, 45, [{ label: 'Opponent thrown down', value: 10, source: 'Throw Down Opponent' }]),
            side('Cultist', 35, 70),
        ),
        gameSystem: 'dh2',
    },
    play: async ({ canvasElement }) => {
        const row = canvasElement.querySelector('[data-grapple-side="actor"] [data-grapple-modifier]');
        await expect(row?.textContent).toContain('Opponent thrown down');
        await expect(row?.textContent).toContain('Throw Down Opponent');
        await expect(row?.textContent).toContain('+10');
        await expect(canvasElement.querySelector('[data-grapple-side="actor"]')?.textContent).toContain('Rolled 45 against 50');
        await expect(canvasElement.querySelector('[data-wh40k-hook="grapple-verdict"]')?.textContent).toContain('Sister Ophelia wins the test');
    },
};

/** Break Free against a larger controller: his Size edge decides it. */
export const LargerControllerHolds: Story = {
    args: { card: card('break-free', side('Acolyte Vex', 40, 30), side('Ogryn', 40, 30), { actorSize: 4, opponentSize: 5 }), gameSystem: 'ow' },
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-grapple-side="opponent"] [data-grapple-size-edge]')?.textContent).toContain('+1 DoS for Size');
        await expect(canvasElement.querySelector('[data-wh40k-hook="grapple-verdict"]')?.textContent).toContain('Ogryn wins the test');
        await expect(canvasElement.querySelector('[data-wh40k-hook="grapple-effect"]')).toBeNull();
    },
};

/** The held side wins Break Free: the grapple is over for both. */
export const BreakFreeEnds: Story = {
    args: { card: card('break-free', side('Acolyte Vex', 50, 8), side('Cultist', 30, 44)), gameSystem: 'dh2', ended: true },
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-wh40k-hook="grapple-verdict"]')?.textContent).toContain('Acolyte Vex wins the test');
        await expect(canvasElement.querySelector('[data-wh40k-hook="grapple-ended"]')?.textContent).toContain('The grapple is over.');
    },
};

/** Take Control won: the card says the roles swap. */
export const TakeControlWins: Story = {
    args: { card: card('take-control', side('Acolyte Vex', 45, 12), side('Cultist', 30, 50)), gameSystem: 'rt' },
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-wh40k-hook="grapple-effect"]')?.textContent).toContain('Takes control of the grapple');
    },
};

/** DH1 Escape Grapple: Contortionist against the grappler's Strength. */
export const ContortionistEscape: Story = {
    args: {
        card: card('slip-free', { name: 'Acolyte Vex', base: 42, baseLabel: 'Contortionist', modifiers: [], roll: 20 }, side('Cultist', 30, 55)),
        gameSystem: 'dh1',
        ended: true,
    },
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-grapple-side="actor"] [data-grapple-base]')?.textContent).toContain('Contortionist');
        await expect(canvasElement.querySelector('[data-wh40k-hook="grapple-effect"]')?.textContent).toContain('Slips free');
    },
};

/** Both fail: a stalemate, and nothing happens. */
export const Stalemate: Story = {
    args: { card: card('push-opponent', side('Acolyte Vex', 35, 95), side('Cultist', 35, 88)), gameSystem: 'bc' },
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-wh40k-hook="grapple-card"]')?.getAttribute('data-grapple-outcome')).toBe('stalemate');
        await expect(canvasElement.querySelector('[data-wh40k-hook="grapple-verdict"]')?.textContent).toContain('Stalemate');
    },
};

/** Ready needs no test: the card states the option. */
export const ReadyDeclared: Story = {
    args: {
        card: null,
        gameSystem: 'dw',
        declared: { actionLabelKey: 'WH40K.Grapple.Ready', effectKey: 'WH40K.Grapple.Effect.Ready', actorName: 'Brother Tehoc' },
    },
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-wh40k-hook="grapple-card"]')?.getAttribute('data-grapple-outcome')).toBe('declared');
        await expect(canvasElement.textContent).toContain('Brother Tehoc takes this option; it needs no test.');
        await expect(canvasElement.querySelector('[data-wh40k-hook="grapple-effect"]')?.textContent).toContain('Ready one of your own items');
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
