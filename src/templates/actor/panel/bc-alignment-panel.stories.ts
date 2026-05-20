/**
 * Storybook stories for the Black Crusade Alignment / Infamy advancement
 * panel (#173). Covers the visual states an operator needs to verify in
 * review:
 *
 *   1. Unaligned    — fresh BC PC, no advances tallied.
 *   2. Khorne / pending-flip — tally has drifted past Khorne but the
 *      10-CP re-check hasn't fired (`current !== derived`).
 *   3. Khorne / psyker-locked — current alignment is Khorne and the
 *      "no psychic powers" warning renders.
 *   4. RecheckDue   — corruption has crossed a fresh 10-CP threshold.
 *   5. InfamyCapped — Infamy is at 40, advance affordance collapses to
 *      the "Cap reached" notice.
 *
 * Story factories use seeded random IDs / no Math.random per the
 * "Seeded RNG in stories" rule in CLAUDE.md (no randomness here — every
 * value is fixed for diff stability).
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import Handlebars from 'handlebars';
import { renderTemplate } from '../../../../stories/mocks';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import panelSrc from './bc-alignment-panel.hbs?raw';

initializeStoryHandlebars();

interface AlignmentPanelCtx {
    alignmentPanel: {
        current: 'unaligned' | 'khorne' | 'nurgle' | 'slaanesh' | 'tzeentch';
        derived: 'unaligned' | 'khorne' | 'nurgle' | 'slaanesh' | 'tzeentch';
        tally: { khorne: number; nurgle: number; slaanesh: number; tzeentch: number };
        pendingFlip: boolean;
        checkpoint: number;
        corruption: number;
        nextCheckpoint: number;
        recheckDue: boolean;
        psykerLocked: boolean;
        infamy: number;
        infamyCost: number | null;
        infamyCap: number;
        infamyIncrement: number;
    };
}

const panelTpl = Handlebars.compile(panelSrc);

function renderPanel(ctx: AlignmentPanelCtx): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    wrapper.dataset['wh40kSystem'] = 'bc';
    wrapper.appendChild(renderTemplate(panelTpl, ctx));
    return wrapper;
}

const meta: Meta<AlignmentPanelCtx> = {
    title: 'Actor/Character/BcAlignmentPanel',
};
export default meta;
type Story = StoryObj<AlignmentPanelCtx>;

export const Unaligned: Story = {
    name: 'Unaligned — fresh PC, no advances tallied',
    args: {
        alignmentPanel: {
            current: 'unaligned',
            derived: 'unaligned',
            tally: { khorne: 0, nurgle: 0, slaanesh: 0, tzeentch: 0 },
            pendingFlip: false,
            checkpoint: 0,
            corruption: 0,
            nextCheckpoint: 0,
            recheckDue: false,
            psykerLocked: false,
            infamy: 30,
            infamyCost: 500,
            infamyCap: 40,
            infamyIncrement: 5,
        },
    },
    render: (args) => renderPanel(args),
};

export const PendingFlip: Story = {
    name: 'Pending flip — tally now favors Khorne; awaiting next 10-CP recheck',
    args: {
        alignmentPanel: {
            current: 'unaligned',
            derived: 'khorne',
            tally: { khorne: 7, nurgle: 1, slaanesh: 0, tzeentch: 0 },
            pendingFlip: true,
            checkpoint: 10,
            corruption: 18,
            nextCheckpoint: 10,
            recheckDue: false,
            psykerLocked: false,
            infamy: 35,
            infamyCost: 500,
            infamyCap: 40,
            infamyIncrement: 5,
        },
    },
    render: (args) => renderPanel(args),
};

export const KhornePsykerLocked: Story = {
    name: 'Khorne aligned + Psyker — psychic-power lock warning visible',
    args: {
        alignmentPanel: {
            current: 'khorne',
            derived: 'khorne',
            tally: { khorne: 9, nurgle: 2, slaanesh: 0, tzeentch: 0 },
            pendingFlip: false,
            checkpoint: 20,
            corruption: 22,
            nextCheckpoint: 20,
            recheckDue: false,
            psykerLocked: true,
            infamy: 38,
            infamyCost: 500,
            infamyCap: 40,
            infamyIncrement: 5,
        },
    },
    render: (args) => renderPanel(args),
};

export const RecheckDue: Story = {
    name: 'Recheck due — fresh 10-CP threshold crossed',
    args: {
        alignmentPanel: {
            current: 'unaligned',
            derived: 'nurgle',
            tally: { khorne: 1, nurgle: 6, slaanesh: 0, tzeentch: 0 },
            pendingFlip: true,
            checkpoint: 20,
            corruption: 32,
            nextCheckpoint: 30,
            recheckDue: true,
            psykerLocked: false,
            infamy: 20,
            infamyCost: 500,
            infamyCap: 40,
            infamyIncrement: 5,
        },
    },
    render: (args) => renderPanel(args),
};

export const InfamyCapped: Story = {
    name: 'Infamy capped — purchase affordance collapses to cap notice',
    args: {
        alignmentPanel: {
            current: 'tzeentch',
            derived: 'tzeentch',
            tally: { khorne: 0, nurgle: 0, slaanesh: 1, tzeentch: 8 },
            pendingFlip: false,
            checkpoint: 30,
            corruption: 31,
            nextCheckpoint: 30,
            recheckDue: false,
            psykerLocked: false,
            infamy: 40,
            infamyCost: null,
            infamyCap: 40,
            infamyIncrement: 5,
        },
    },
    render: (args) => renderPanel(args),
};
