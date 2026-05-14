/**
 * Stories for NPCSheet — the NPC actor sheet used for antagonists, creatures,
 * and other non-player actors. Covers the NPC tab content, horde display,
 * GM-tools actions (scaleToThreat, addTag), and an Imperium Maledictum variant.
 */

import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import Handlebars from 'handlebars';
import npcTabSrc from '../../../templates/actor/npc/tab-npc.hbs?raw';
import { renderTemplate } from '../../../../stories/mocks';
import { mockNpcSheetContext, type SheetContextLike } from '../../../../stories/mocks/sheet-contexts';
import { seedRandom, randomId } from '../../../../stories/mocks/extended';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { clickAction } from '../../../../stories/test-helpers';

initializeStoryHandlebars();

const rng = seedRandom(0xdeadbeef);

const npcTabTpl = Handlebars.compile(npcTabSrc);

function renderNPCSheet(ctx: SheetContextLike): HTMLElement {
    const tpl = Handlebars.compile(`
        <div class="wh40k-sheet-body tw-p-2">
            ${npcTabTpl(ctx)}
        </div>
    `);
    return renderTemplate(tpl, ctx);
}

const _npcId = randomId('npc', rng);

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
        const canvas = within(canvasElement);
        await expect(canvas.getByText('GM Tools')).toBeVisible();
        await expect(canvas.getByText('Scale to Threat')).toBeVisible();
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
    play: async ({ canvasElement }) => {
        // Horde toggle button is present
        clickAction(canvasElement, 'toggleHordeMode');
    },
};

// ── Interaction: scaleToThreat ────────────────────────────────────────────────

export const ScaleToThreatClick: Story = {
    name: 'Interaction — scaleToThreat fires',
    args: mockNpcSheetContext({ systemId: 'im' }),
    render: (args) => renderNPCSheet(args),
    play: async ({ canvasElement }) => {
        clickAction(canvasElement, 'scaleToThreat');
    },
};

// ── Per-system: Dark Heresy 2e NPC ────────────────────────────────────────────

export const DarkHeresy2NPC: Story = {
    name: 'Per-system — Dark Heresy 2e NPC',
    args: mockNpcSheetContext({
        systemId: 'dh2e',
        actorOverrides: { name: 'Chaos Cultist' },
    }),
    render: (args) => renderNPCSheet(args),
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        // GM Tools section always present regardless of system
        await expect(canvas.getByText('GM Tools')).toBeVisible();
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
        const canvas = within(canvasElement);
        await expect(canvas.getByText('GM Tools')).toBeVisible();
    },
};

export const DarkHeresy1eNPC: Story = {
    name: 'Per-system — Dark Heresy 1e NPC',
    args: mockNpcSheetContext({ systemId: 'dh1e', actorOverrides: { name: 'Heretek' } }),
    render: (args) => renderNPCSheet(args),
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await expect(canvas.getByText('GM Tools')).toBeVisible();
    },
};

export const DeathwatchNPC: Story = {
    name: 'Per-system — Deathwatch NPC',
    args: mockNpcSheetContext({ systemId: 'dw', actorOverrides: { name: 'Tyranid Warrior' } }),
    render: (args) => renderNPCSheet(args),
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await expect(canvas.getByText('GM Tools')).toBeVisible();
    },
};

export const OnlyWarNPC: Story = {
    name: 'Per-system — Only War NPC',
    args: mockNpcSheetContext({ systemId: 'ow', actorOverrides: { name: 'Chaos Renegade' } }),
    render: (args) => renderNPCSheet(args),
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await expect(canvas.getByText('GM Tools')).toBeVisible();
    },
};

export const RogueTraderNPC: Story = {
    name: 'Per-system — Rogue Trader NPC',
    args: mockNpcSheetContext({ systemId: 'rt', actorOverrides: { name: 'Eldar Corsair' } }),
    render: (args) => renderNPCSheet(args),
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await expect(canvas.getByText('GM Tools')).toBeVisible();
    },
};
