/**
 * Storybook stories for the Warband Subtlety panel (DH2-only — issues
 * #64 / #87).
 *
 * Renders `src/templates/actor/panel/subtlety-panel.hbs` against a
 * `system.subtlety` + `subtletyAdjusters[]` context (the exact shape the
 * DH2 character sheet derives in `_prepareContext` from
 * `actor.collectSubtletyAdjusters()`). Stories cover the visible states the
 * panel must render correctly:
 *   1. PlayerView           — non-GM, mixed adjusters (clamp + passive);
 *                             interactive `play` asserts the readout + that the
 *                             stepper renders but is disabled (#317: visible,
 *                             greyed for non-GM, not hidden).
 *   2. GmViewWithAdjusters  — GM stepper enabled, three adjusters (clamp,
 *                             passive penalty, event bonus); `play` asserts
 *                             the enabled stepper buttons + signed-delta rendering.
 *   3. EmptyAdjusters       — GM view with no adjusters surfaced.
 *
 * The panel is normally rendered inside the DH2 character sheet root, which
 * carries `data-wh40k-system="dh2"`; the stories wrap the panel in that
 * ancestor so the `dh2:tw-*` per-system variants fire under visual review
 * (CLAUDE.md "Check the ancestor implication for variants"). The companion
 * e2e spec (`tests/e2e/subtlety-panel.spec.ts`) snaps the live-Foundry render.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import panelSrc from '../../src/templates/actor/panel/subtlety-panel.hbs?raw';
import { seedRandom } from '../mocks/extended';
import { initializeStoryHandlebars } from '../template-support';
import { renderSheet } from '../test-helpers';

initializeStoryHandlebars();

// Seeded RNG so any future randomized fixture stays deterministic across
// screenshot diffs / play-function runs (CLAUDE.md "Seeded RNG in stories").
seedRandom(0x5b7);

interface SubtletyAdjusterRow {
    sourceUuid: string | null;
    primitive: 'manual' | 'inquest' | null;
    label: string;
    kind: 'clamp' | 'passive' | 'event';
    delta: number;
    minAbsoluteDelta: number;
}

interface SubtletyContext {
    isGM: boolean;
    system: { subtlety: { value: number; max: number } };
    subtletyAdjusters: SubtletyAdjusterRow[];
}

/**
 * Render the panel wrapped in the `.wh40k-rpg` + `data-wh40k-system="dh2"`
 * ancestor the live DH2 sheet provides, so `important: '.wh40k-rpg'`-scoped
 * utilities and `dh2:tw-*` per-system variants resolve under visual review.
 */
function renderPanel(ctx: SubtletyContext): HTMLElement {
    const root = document.createElement('div');
    root.className = 'wh40k-rpg sheet actor character';
    root.dataset['wh40kSystem'] = 'dh2';
    root.append(renderSheet(panelSrc, ctx));
    return root;
}

const meta: Meta<SubtletyContext> = {
    title: 'Actor/Panels/SubtletyPanel',
};
export default meta;
type Story = StoryObj<SubtletyContext>;

export const PlayerView: Story = {
    name: 'Player view — mixed adjusters, no stepper',
    args: {
        isGM: false,
        system: { subtlety: { value: 60, max: 100 } },
        subtletyAdjusters: [
            {
                sourceUuid: 'Compendium.wh40k-rpg.dh2-origin-paths.Item.QuarantineWorld',
                primitive: null,
                label: 'Quarantine World — Secretive by Nature',
                kind: 'clamp',
                delta: 0,
                minAbsoluteDelta: 1,
            },
            {
                sourceUuid: 'Compendium.wh40k-rpg.dh2-pacts.Item.PactOfHungerForKnowledge',
                primitive: null,
                label: 'Dark Pact — Hunger for Knowledge (discovered)',
                kind: 'passive',
                delta: -5,
                minAbsoluteDelta: 0,
            },
        ],
    },
    render: (args) => renderPanel(args),
    play: ({ canvasElement }) => {
        const storyCanvas = within(canvasElement);
        // Pool readout shows current / max.
        void expect(canvasElement.querySelector('.wh40k-subtlety-value')?.textContent.trim()).toBe('60');
        void expect(canvasElement.querySelector('.wh40k-subtlety-max')?.textContent.trim()).toBe('100');
        // Player view (#317): the manual stepper renders for everyone but its
        // buttons are disabled (visible, greyed) for non-GM rather than hidden.
        void expect(canvasElement.querySelector('.wh40k-subtlety-manual')).not.toBeNull();
        const playerSteppers = canvasElement.querySelectorAll('[data-action="adjustSubtletyManually"]');
        void expect(playerSteppers.length).toBe(2);
        void expect(Array.from(playerSteppers).every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
        // Both adjuster rows render; the clamp row shows its shield affordance.
        void expect(canvasElement.querySelectorAll('.wh40k-subtlety-adjuster-row').length).toBe(2);
        void expect(canvasElement.querySelector('.wh40k-subtlety-adjuster-clamp')).not.toBeNull();
        void expect(storyCanvas.getByText('Dark Pact — Hunger for Knowledge (discovered)')).toBeTruthy();
        // Breakdown affordance is always available.
        void expect(canvasElement.querySelector('[data-action="viewSubtletyBreakdown"]')).not.toBeNull();
    },
};

export const GmViewWithAdjusters: Story = {
    name: 'GM view — three adjusters (clamp + penalty + bonus)',
    args: {
        isGM: true,
        system: { subtlety: { value: 45, max: 100 } },
        subtletyAdjusters: [
            {
                sourceUuid: 'Compendium.wh40k-rpg.dh2-origin-paths.Item.QuarantineWorld',
                primitive: null,
                label: 'Quarantine World — Secretive by Nature',
                kind: 'clamp',
                delta: 0,
                minAbsoluteDelta: 1,
            },
            {
                sourceUuid: 'Compendium.wh40k-rpg.dh2-weapons.Item.DaemonBlade',
                primitive: null,
                label: 'Daemon Weapon carried',
                kind: 'passive',
                delta: -3,
                minAbsoluteDelta: 0,
            },
            {
                sourceUuid: null,
                primitive: 'inquest',
                label: 'Inquest pursued openly',
                kind: 'event',
                delta: 5,
                minAbsoluteDelta: 0,
            },
        ],
    },
    render: (args) => renderPanel(args),
    play: ({ canvasElement }) => {
        void expect(canvasElement.querySelector('.wh40k-subtlety-value')?.textContent.trim()).toBe('45');
        // GM view: the manual stepper renders both +1 / -1 buttons, enabled.
        const steppers = canvasElement.querySelectorAll('[data-action="adjustSubtletyManually"]');
        void expect(steppers.length).toBe(2);
        void expect(Array.from(steppers).some((b) => (b as HTMLButtonElement).disabled)).toBe(false);
        const deltas = Array.from(steppers).map((b) => b.getAttribute('data-delta'));
        void expect(deltas).toContain('1');
        void expect(deltas).toContain('-1');
        // Three adjuster rows; the gains row (+5) and losses row (-3) render
        // signed deltas, the clamp row renders the shield affordance.
        void expect(canvasElement.querySelectorAll('.wh40k-subtlety-adjuster-row').length).toBe(3);
        const deltaCells = Array.from(canvasElement.querySelectorAll('.wh40k-subtlety-adjuster-delta')).map((n) => n.textContent.trim());
        void expect(deltaCells).toContain('+5');
        void expect(deltaCells).toContain('-3');
        void expect(canvasElement.querySelector('.wh40k-subtlety-adjuster-clamp')).not.toBeNull();
    },
};

export const EmptyAdjusters: Story = {
    name: 'GM view — no adjusters surfaced',
    args: {
        isGM: true,
        system: { subtlety: { value: 80, max: 100 } },
        subtletyAdjusters: [],
    },
    render: (args) => renderPanel(args),
    play: ({ canvasElement }) => {
        void expect(canvasElement.querySelector('.wh40k-subtlety-value')?.textContent.trim()).toBe('80');
        void expect(canvasElement.querySelectorAll('.wh40k-subtlety-adjuster-row').length).toBe(0);
        void expect(canvasElement.querySelector('.wh40k-subtlety-adjusters-empty')).not.toBeNull();
    },
};
