/**
 * Storybook stories for the Deathwatch Renown panel (#164).
 *
 * One story per rank from TABLE 5-2 (RAW: core.md §"RENOWN"):
 *   1. Initiated    (Renown 0..19)
 *   2. Respected    (Renown 20..39)
 *   3. Distinguished (Renown 40..59)
 *   4. Famed        (Renown 60..79)
 *   5. Hero         (Renown 80+; no documented ceiling)
 *
 * The `progressPercent` for ranks below Hero is computed from the
 * mock value's distance to the next rank's `min`; Hero collapses to
 * 100% (rendering edge — see `RENOWN_MAX` doc on the engine).
 *
 * Per the "Seeded RNG in stories" rule in CLAUDE.md every value is
 * fixed for diff stability — no Math.random in this module.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import Handlebars from 'handlebars';
import { renderTemplate } from '../../../../stories/mocks';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import panelSrc from './dw-renown-panel.hbs?raw';

initializeStoryHandlebars();

type RenownRank = 'initiated' | 'respected' | 'distinguished' | 'famed' | 'hero';

interface RenownPanelCtx {
    renownPanel: {
        value: number;
        rank: RenownRank;
        rankLabel: string;
        nextRank: RenownRank | null;
        nextRankLabel: string | null;
        rankMin: number;
        nextRankMin: number | null;
        progressPercent: number;
    };
}

const panelTpl = Handlebars.compile(panelSrc);

function renderPanel(ctx: RenownPanelCtx): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    wrapper.dataset['wh40kSystem'] = 'dw';
    wrapper.appendChild(renderTemplate(panelTpl, ctx));
    return wrapper;
}

const meta: Meta<RenownPanelCtx> = {
    title: 'Actor/Character/DwRenownPanel',
};
export default meta;
type Story = StoryObj<RenownPanelCtx>;

export const Initiated: Story = {
    name: 'Initiated — fresh Battle-Brother, no Renown earned',
    args: {
        renownPanel: {
            value: 5,
            rank: 'initiated',
            rankLabel: 'Initiated',
            nextRank: 'respected',
            nextRankLabel: 'Respected',
            rankMin: 0,
            nextRankMin: 20,
            progressPercent: 25,
        },
    },
    render: (args) => renderPanel(args),
};

export const Respected: Story = {
    name: 'Respected — first promotion past the Initiated threshold',
    args: {
        renownPanel: {
            value: 28,
            rank: 'respected',
            rankLabel: 'Respected',
            nextRank: 'distinguished',
            nextRankLabel: 'Distinguished',
            rankMin: 20,
            nextRankMin: 40,
            progressPercent: 40,
        },
    },
    render: (args) => renderPanel(args),
};

export const Distinguished: Story = {
    name: 'Distinguished — mid-tier Renown, mid-progress to Famed',
    args: {
        renownPanel: {
            value: 50,
            rank: 'distinguished',
            rankLabel: 'Distinguished',
            nextRank: 'famed',
            nextRankLabel: 'Famed',
            rankMin: 40,
            nextRankMin: 60,
            progressPercent: 50,
        },
    },
    render: (args) => renderPanel(args),
};

export const Famed: Story = {
    name: 'Famed — Renown approaching Hero threshold',
    args: {
        renownPanel: {
            value: 72,
            rank: 'famed',
            rankLabel: 'Famed',
            nextRank: 'hero',
            nextRankLabel: 'Hero',
            rankMin: 60,
            nextRankMin: 80,
            progressPercent: 60,
        },
    },
    render: (args) => renderPanel(args),
};

export const Hero: Story = {
    name: 'Hero — Renown 80+ (no RAW ceiling; bar saturates at 100%)',
    args: {
        renownPanel: {
            value: 92,
            rank: 'hero',
            rankLabel: 'Hero',
            nextRank: null,
            nextRankLabel: null,
            rankMin: 80,
            nextRankMin: null,
            progressPercent: 100,
        },
    },
    render: (args) => renderPanel(args),
};
