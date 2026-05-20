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
 *                             interactive `play` asserts the readout +
 *                             absence of the GM stepper.
 *   2. GmViewWithAdjusters  — GM stepper visible, three adjusters (clamp,
 *                             passive penalty, event bonus); `play` asserts
 *                             the stepper buttons + signed-delta rendering.
 *   3. EmptyAdjusters       — GM view with no adjusters surfaced.
 *
 * The panel is normally rendered inside the DH2 character sheet root, which
 * carries `data-wh40k-system="dh2e"`; the stories wrap the panel in that
 * ancestor so the `dh2e:tw-*` per-system variants fire under visual review
 * (CLAUDE.md "Check the ancestor implication for variants"). The companion
 * e2e spec (`tests/e2e/subtlety-panel.spec.ts`) snaps the live-Foundry render.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import Handlebars from 'handlebars';
import { renderTemplate } from '../mocks';
import { seedRandom } from '../mocks/extended';
import { initializeStoryHandlebars } from '../template-support';
import panelSrc from '../../src/templates/actor/panel/subtlety-panel.hbs?raw';

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

const panelTpl = Handlebars.compile(panelSrc);

/**
 * Render the panel wrapped in the `.wh40k-rpg` + `data-wh40k-system="dh2e"`
 * ancestor the live DH2 sheet provides, so `important: '.wh40k-rpg'`-scoped
 * utilities and `dh2e:tw-*` per-system variants resolve under visual review.
 */
function renderPanel(ctx: SubtletyContext): HTMLElement {
    const root = document.createElement('div');
    root.className = 'wh40k-rpg sheet actor character';
    root.dataset['wh40kSystem'] = 'dh2e';
    root.append(renderTemplate(panelTpl, ctx));
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
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        // Pool readout shows current / max.
        expect(canvasElement.querySelector('.wh40k-subtlety-value')?.textContent?.trim()).toBe('60');
        expect(canvasElement.querySelector('.wh40k-subtlety-max')?.textContent?.trim()).toBe('100');
        // Player view: the GM-only manual stepper must NOT render.
        expect(canvasElement.querySelector('.wh40k-subtlety-manual')).toBeNull();
        expect(canvasElement.querySelectorAll('[data-action="adjustSubtletyManually"]').length).toBe(0);
        // Both adjuster rows render; the clamp row shows its shield affordance.
        expect(canvasElement.querySelectorAll('.wh40k-subtlety-adjuster-row').length).toBe(2);
        expect(canvasElement.querySelector('.wh40k-subtlety-adjuster-clamp')).not.toBeNull();
        expect(canvas.getByText('Dark Pact — Hunger for Knowledge (discovered)')).toBeTruthy();
        // Breakdown affordance is always available.
        expect(canvasElement.querySelector('[data-action="viewSubtletyBreakdown"]')).not.toBeNull();
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
    play: async ({ canvasElement }) => {
        expect(canvasElement.querySelector('.wh40k-subtlety-value')?.textContent?.trim()).toBe('45');
        // GM view: the manual stepper renders both +1 / -1 buttons.
        const steppers = canvasElement.querySelectorAll('[data-action="adjustSubtletyManually"]');
        expect(steppers.length).toBe(2);
        const deltas = Array.from(steppers).map((b) => b.getAttribute('data-delta'));
        expect(deltas).toContain('1');
        expect(deltas).toContain('-1');
        // Three adjuster rows; the gains row (+5) and losses row (-3) render
        // signed deltas, the clamp row renders the shield affordance.
        expect(canvasElement.querySelectorAll('.wh40k-subtlety-adjuster-row').length).toBe(3);
        const deltaCells = Array.from(canvasElement.querySelectorAll('.wh40k-subtlety-adjuster-delta')).map((n) => n.textContent?.trim());
        expect(deltaCells).toContain('+5');
        expect(deltaCells).toContain('-3');
        expect(canvasElement.querySelector('.wh40k-subtlety-adjuster-clamp')).not.toBeNull();
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
    play: async ({ canvasElement }) => {
        expect(canvasElement.querySelector('.wh40k-subtlety-value')?.textContent?.trim()).toBe('80');
        expect(canvasElement.querySelectorAll('.wh40k-subtlety-adjuster-row').length).toBe(0);
        expect(canvasElement.querySelector('.wh40k-subtlety-adjusters-empty')).not.toBeNull();
    },
};
