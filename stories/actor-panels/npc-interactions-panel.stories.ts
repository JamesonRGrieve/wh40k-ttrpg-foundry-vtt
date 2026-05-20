/**
 * Storybook stories for the NPC Interaction Counts panel (#145, DH2 errata p.125).
 *
 * The panel surfaces a per-PC tally of social interactions and visually
 * caps each row at the PC's Fellowship-bonus worth of cap-relevant
 * exchanges. Stories cover:
 *   1. Empty           — no PCs in the world.
 *   2. MixedRoster     — three PCs at varying cap states.
 *   3. AllAtCap        — every PC has hit the cap.
 *   4. ReadOnly        — steppers disabled (player view).
 *
 * The companion e2e spec (`tests/e2e/npc-interactions-panel.spec.ts`)
 * creates a live NPC, opens its sheet, and snaps the panel.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import Handlebars from 'handlebars';
import panelSrc from '../../src/templates/actor/panel/npc-interactions-panel.hbs?raw';
import { renderTemplate } from '../mocks';
import { initializeStoryHandlebars } from '../template-support';

initializeStoryHandlebars();

interface InteractionRow {
    pcId: string;
    pcName: string;
    count: number;
    cap: number;
    atCap: boolean;
}

interface InteractionsPanelContext {
    editable: boolean;
    npcInteractions: {
        empty: boolean;
        rows: InteractionRow[];
    };
}

const panelTpl = Handlebars.compile(panelSrc);

function renderPanel(ctx: InteractionsPanelContext): HTMLElement {
    return renderTemplate(panelTpl, ctx);
}

const meta: Meta<InteractionsPanelContext> = {
    title: 'Actor/Panels/NpcInteractionsPanel',
};
export default meta;
type Story = StoryObj<InteractionsPanelContext>;

export const Empty: Story = {
    name: 'Empty — no PCs in world',
    args: {
        editable: true,
        npcInteractions: { empty: true, rows: [] },
    },
    render: (args) => renderPanel(args),
};

export const MixedRoster: Story = {
    name: 'Mixed roster — under cap, near cap, at cap',
    args: {
        editable: true,
        npcInteractions: {
            empty: false,
            rows: [
                { pcId: 'a', pcName: 'Inquisitor Aurelia', count: 1, cap: 4, atCap: false },
                { pcId: 'b', pcName: 'Brother Sigmund', count: 2, cap: 3, atCap: false },
                { pcId: 'c', pcName: 'Cassia Veyl', count: 5, cap: 5, atCap: true },
            ],
        },
    },
    render: (args) => renderPanel(args),
};

export const AllAtCap: Story = {
    name: 'All PCs at cap — disposition gain locked',
    args: {
        editable: true,
        npcInteractions: {
            empty: false,
            rows: [
                { pcId: 'a', pcName: 'Inquisitor Aurelia', count: 4, cap: 4, atCap: true },
                { pcId: 'b', pcName: 'Cassia Veyl', count: 5, cap: 5, atCap: true },
            ],
        },
    },
    render: (args) => renderPanel(args),
};

export const ReadOnly: Story = {
    name: 'Read-only — steppers disabled (player view)',
    args: {
        editable: false,
        npcInteractions: {
            empty: false,
            rows: [
                { pcId: 'a', pcName: 'Inquisitor Aurelia', count: 1, cap: 4, atCap: false },
                { pcId: 'b', pcName: 'Brother Sigmund', count: 3, cap: 3, atCap: true },
            ],
        },
    },
    render: (args) => renderPanel(args),
};
