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
import equipmentTabSrc from '../../../templates/actor/player/tab-equipment.hbs?raw';
import { callerRequirementView } from '../dialogs/reinforcement-call-view.ts';

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

// ── Reinforcement Character panel (#77) ─────────────────────────────────────
// `NPCSheet._prepareContext` builds `reinforcementPanel` only for the GM, on a
// DH2 NPC flagged `isReinforcement`. These stories render the whole NPC tab so
// the panel is reviewed in place among the GM tools.

/** A DH2 RC NPC context: the Thrice-Bound Daemonhost's printed terms (Enemies Beyond p. 38). */
function daemonhostRcContext(): SheetContextLike {
    return mockNpcSheetContext({
        systemId: 'dh2',
        actorOverrides: { name: 'Thrice-Bound Daemonhost' },
        contextOverrides: {
            reinforcementPanel: {
                hasTerms: true,
                influenceMinimum: 50,
                influenceCost: 5,
                peer: '',
                peerAmount: '',
                callerRequirement: callerRequirementView(
                    { skill: 'forbiddenLore', specialization: 'Daemonology', rank: 2, corruption: '1d5' },
                    'Forbidden Lore',
                ),
            },
        },
    });
}

/** Record every `callReinforcement` click that reaches the NPC tab root, as the sheet's action dispatch would see it. */
function recordCallClicks(canvasElement: HTMLElement): { count: () => number } {
    let clicks = 0;
    canvasElement.addEventListener('click', (event) => {
        if (event.target instanceof Element && event.target.closest('[data-action="callReinforcement"]') !== null) clicks += 1;
    });
    return { count: () => clicks };
}

export const ReinforcementCharacterPanel: Story = {
    name: 'Reinforcement Character — Daemonhost call terms (#77)',
    args: daemonhostRcContext(),
    render: (args) => renderNPCSheet(args),
    play: async ({ canvasElement }) => {
        const panel = canvasElement.querySelector<HTMLElement>('[data-wh40k-hook="rc-panel"]');
        await expect(panel).not.toBeNull();
        await expect(panel?.textContent).toContain('50');
        await expect(panel?.querySelector('[data-wh40k-hook="rc-caller-skill"]')?.textContent).toContain('Forbidden Lore (Daemonology)');
        await expect(panel?.querySelector('[data-wh40k-hook="rc-caller-corruption"]')?.textContent).toContain('1d5');
        const clicks = recordCallClicks(canvasElement);
        const call = panel?.querySelector<HTMLButtonElement>('[data-action="callReinforcement"]');
        await expect(call?.disabled).toBe(false);
        clickAction(canvasElement, 'callReinforcement');
        await expect(clicks.count()).toBe(1);
    },
};

export const ReinforcementPanelAbsentOffDh2: Story = {
    name: 'Reinforcement Character — no panel outside DH2 (#77)',
    // The sheet never builds `reinforcementPanel` for another line, so the include renders nothing.
    args: mockNpcSheetContext({ systemId: 'dh1', actorOverrides: { name: 'Heretek' } }),
    render: (args) => renderNPCSheet(args),
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(view.getByText('GM Tools')).toBeVisible();
        await expect(canvasElement.querySelector('[data-wh40k-hook="rc-panel"]')).toBeNull();
        await expect(canvasElement.querySelector('[data-action="callReinforcement"]')).toBeNull();
    },
};

/** An NPC from a template whose equipment matched no compendium item, in the order the template listed it. */
const CARRIED_EQUIPMENT = [
    { name: 'Ration Pack', quantity: 3 },
    { name: 'Cult Icon', quantity: 1 },
];

function npcWithCarriedEquipment(equipment: Array<{ name: string; quantity: number }>): SheetContextLike {
    const ctx = mockNpcSheetContext({ systemId: 'dh2', activeTab: 'equipment' });
    const system = { ...ctx.system, equipment };
    return { ...ctx, system, actor: { ...ctx.actor, system } };
}

function renderNpcEquipmentTab(ctx: SheetContextLike): HTMLElement {
    return renderSheetParts([{ template: equipmentTabSrc, partClass: 'wh40k-sheet-body tw-p-2' }], ctx, { systemId: systemIdOf(ctx) });
}

export const CarriedEquipment: Story = {
    name: 'Carried equipment from its template (#670)',
    args: npcWithCarriedEquipment(CARRIED_EQUIPMENT),
    render: (args) => renderNpcEquipmentTab(args),
    play: async ({ canvasElement }) => {
        const panel = canvasElement.querySelector<HTMLElement>('[data-npc-carried-equipment]');
        await expect(panel).not.toBeNull();
        if (panel === null) return;
        await expect(panel).toBeVisible();
        await expect(within(panel).getByText('Carried Equipment')).toBeVisible();
        const rows = Array.from(panel.querySelectorAll('li'), (li) => li.textContent.replace(/\s+/g, ' ').trim());
        await expect(rows).toEqual(['Ration Pack ×3', 'Cult Icon ×1']);
    },
};

export const NoCarriedEquipment: Story = {
    name: 'No carried-equipment panel when the list is empty (#670)',
    args: npcWithCarriedEquipment([]),
    render: (args) => renderNpcEquipmentTab(args),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-npc-carried-equipment]')).toBeNull();
    },
};

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
