/**
 * Stories for NPCSheet — the NPC actor sheet used for antagonists, creatures,
 * and other non-player actors. Covers the NPC tab content, horde display,
 * GM-tools actions (scaleToThreat, addTag), and an Imperium Maledictum variant.
 */

import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import { seedRandom, randomId } from '../../../../stories/mocks/extended';
import { mockNpcSheetContext, type SheetContextLike } from '../../../../stories/mocks/sheet-contexts';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { clickAction, renderSheetParts } from '../../../../stories/test-helpers';
import npcTabSrc from '../../../templates/actor/npc/tab-npc.hbs?raw';

initializeStoryHandlebars();

const rng = seedRandom(0xdeadbeef);
void randomId('npc', rng); // seed advance only — id not used at module level

/** Actor types are `<systemId>-<role>`; the prefix is the active game-system id. */
function systemIdOf(ctx: SheetContextLike): string {
    const [systemId = 'dh2'] = ctx.actor.type.split('-');
    return systemId;
}

function renderNPCSheet(ctx: SheetContextLike): HTMLElement {
    return renderSheetParts([{ template: npcTabSrc, partClass: 'wh40k-sheet-body tw-p-2' }], ctx, { systemId: systemIdOf(ctx) });
}

const meta: Meta<SheetContextLike> = {
    title: 'Actor/NPCSheet',
};
export default meta;
type Story = StoryObj<SheetContextLike>;

// ── Default NPC (IM) ──────────────────────────────────────────────────────────

export const Default: Story = {
    name: 'Default — Imperium Maledictum NPC',
    args: mockNpcSheetContext({ systemId: 'im' }),
    render: (args) => renderNPCSheet(args),
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(view.getByText('GM Tools')).toBeVisible();
        await expect(view.getByText('Scale to Threat')).toBeVisible();
    },
};

// ── Horde display ─────────────────────────────────────────────────────────────

export const HordeEnabled: Story = {
    name: 'Horde Mode enabled',
    args: mockNpcSheetContext({
        systemId: 'im',
        contextOverrides: {
            horde: {
                enabled: true,
                magnitude: 12,
                magnitudeMax: 20,
                magnitudePercent: 60,
                damageMultiplier: 2,
                sizeModifier: 10,
                barClass: 'reduced',
                destroyed: false,
            },
        },
    }),
    render: (args) => renderNPCSheet(args),
    play: ({ canvasElement }) => {
        // Horde toggle button is present
        clickAction(canvasElement, 'toggleHordeMode');
    },
};

// ── Interaction: scaleToThreat ────────────────────────────────────────────────

export const ScaleToThreatClick: Story = {
    name: 'Interaction — scaleToThreat fires',
    args: mockNpcSheetContext({ systemId: 'im' }),
    render: (args) => renderNPCSheet(args),
    play: ({ canvasElement }) => {
        clickAction(canvasElement, 'scaleToThreat');
    },
};

// ── Per-system: Dark Heresy 2e NPC ────────────────────────────────────────────

export const DarkHeresy2NPC: Story = {
    name: 'Per-system — Dark Heresy 2e NPC',
    args: mockNpcSheetContext({
        systemId: 'dh2',
        actorOverrides: { name: 'Chaos Cultist' },
    }),
    render: (args) => renderNPCSheet(args),
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        // GM Tools section always present regardless of system
        await expect(view.getByText('GM Tools')).toBeVisible();
    },
};

// ── Per-system homologation variants ─────────────────────────────────────────
// Each variant pins a different game-system context so the NPC tab's GM-tools
// section, characteristic display, and horde controls are exercised across all
// seven lines. GM Tools are system-agnostic, so the assertion is intentionally
// the same — the value is catching per-system template divergence in visual review.

export const BlackCrusadeNPC: Story = {
    name: 'Per-system — Black Crusade NPC',
    args: mockNpcSheetContext({ systemId: 'bc', actorOverrides: { name: 'Chaos Space Marine' } }),
    render: (args) => renderNPCSheet(args),
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(view.getByText('GM Tools')).toBeVisible();
    },
};

export const DarkHeresy1eNPC: Story = {
    name: 'Per-system — Dark Heresy 1e NPC',
    args: mockNpcSheetContext({ systemId: 'dh1', actorOverrides: { name: 'Heretek' } }),
    render: (args) => renderNPCSheet(args),
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(view.getByText('GM Tools')).toBeVisible();
    },
};

export const DeathwatchNPC: Story = {
    name: 'Per-system — Deathwatch NPC',
    args: mockNpcSheetContext({ systemId: 'dw', actorOverrides: { name: 'Tyranid Warrior' } }),
    render: (args) => renderNPCSheet(args),
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(view.getByText('GM Tools')).toBeVisible();
    },
};

export const OnlyWarNPC: Story = {
    name: 'Per-system — Only War NPC',
    args: mockNpcSheetContext({ systemId: 'ow', actorOverrides: { name: 'Chaos Renegade' } }),
    render: (args) => renderNPCSheet(args),
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(view.getByText('GM Tools')).toBeVisible();
    },
};

export const RogueTraderNPC: Story = {
    name: 'Per-system — Rogue Trader NPC',
    args: mockNpcSheetContext({ systemId: 'rt', actorOverrides: { name: 'Eldar Corsair' } }),
    render: (args) => renderNPCSheet(args),
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(view.getByText('GM Tools')).toBeVisible();
    },
};

// ── Fatigue panel (#420) ────────────────────────────────────────────────────
// The NPC body never surfaced fatigue; the shared fatigue vital panel now
// renders here so fatigue is editable on NPCs (aberrants etc.) alongside wounds.

/** NPC context with a partial fatigue load so the panel shows the meter + controls. */
function fatiguedNpcContext(): SheetContextLike {
    const ctx = mockNpcSheetContext({ systemId: 'dh2', actorOverrides: { name: 'Broodkin Aberrant' } });
    ctx.system.fatigue = { value: 3, max: 6 };
    return ctx;
}

export const FatiguePanel: Story = {
    name: 'Fatigue panel — editable on NPC body (#420)',
    args: fatiguedNpcContext(),
    render: (args) => renderNPCSheet(args),
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        // The fatigue vital panel is surfaced on the NPC tab with working controls.
        await expect(view.getByText('Fatigue')).toBeVisible();
        await expect(view.getByText('Rest (-1)')).toBeVisible();
        // Clear-All appears only while fatigue > 0 (value 3 here).
        await expect(view.getByText('Clear All')).toBeVisible();
    },
};
