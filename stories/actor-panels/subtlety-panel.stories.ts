/**
 * Storybook stories for the Warband Subtlety panel (#87).
 *
 * Renders the panel against a hand-crafted `system.subtlety` +
 * `subtletyAdjusters[]` context. Stories cover the visible states the
 * panel must render correctly:
 *   1. PlayerView           — non-GM, mixed adjusters (clamp + passive).
 *   2. GmViewWithAdjusters  — GM stepper visible, three adjusters (clamp,
 *                             passive penalty, event bonus).
 *   3. EmptyAdjusters       — GM view with no adjusters surfaced.
 *
 * The companion e2e spec (`tests/e2e/subtlety-panel.spec.ts`) creates a
 * dh2-character with `system.subtlety.value=45` and snaps the panel
 * against a live Foundry instance.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import Handlebars from 'handlebars';
import { renderTemplate } from '../mocks';
import { initializeStoryHandlebars } from '../template-support';
import panelSrc from '../../src/templates/actor/panel/subtlety-panel.hbs?raw';

initializeStoryHandlebars();

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

function renderPanel(ctx: SubtletyContext): HTMLElement {
    return renderTemplate(panelTpl, ctx);
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
};

export const EmptyAdjusters: Story = {
    name: 'GM view — no adjusters surfaced',
    args: {
        isGM: true,
        system: { subtlety: { value: 80, max: 100 } },
        subtletyAdjusters: [],
    },
    render: (args) => renderPanel(args),
};
