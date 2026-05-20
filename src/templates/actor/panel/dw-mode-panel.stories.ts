/**
 * Storybook stories for the Deathwatch Squad Mode / Solo Mode panel
 * (#163). Three visual states an operator needs to verify in review:
 *
 *   1. Solo            — fresh Battle-Brother, Solo Mode, no sustains.
 *   2. SquadNoSustains — Squad Mode active, no sustained abilities yet.
 *   3. SquadWithSustains — Squad Mode + two sustained abilities listed.
 *
 * Stories use fixed mock values for diff stability (no Math.random).
 * The `data-wh40k-system="dw"` attribute on the wrapper anchors the
 * per-system Tailwind variants (`dw:tw-*`) the panel uses.
 */

import type { Meta, StoryObj } from '@storybook/html-vite';
import Handlebars from 'handlebars';
import { renderTemplate } from '../../../../stories/mocks';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { getSupportRange, type DwMode } from '../../../module/rules/dw-squad-mode';
import type { RenownRank } from '../../../module/rules/dw-renown';
import panelSrc from './dw-mode-panel.hbs?raw';

initializeStoryHandlebars();

interface SustainedAbilityCtx {
    id: string;
    label: string;
}

interface DwModePanelCtx {
    modePanel: {
        mode: DwMode;
        renownRank: RenownRank;
        renownRankKey: string;
        supportRange: { visual: number; vocal: number };
        sustainedAbilities: SustainedAbilityCtx[];
    };
}

const panelTpl = Handlebars.compile(panelSrc);

function renderPanel(ctx: DwModePanelCtx): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    wrapper.dataset['wh40kSystem'] = 'dw';
    wrapper.appendChild(renderTemplate(panelTpl, ctx));
    return wrapper;
}

/** Resolve the langpack-key fragment for a Renown rank label. */
function rankKey(rank: RenownRank): string {
    return rank.charAt(0).toUpperCase() + rank.slice(1);
}

const meta: Meta<DwModePanelCtx> = {
    title: 'Actor/Character/DwModePanel',
};
export default meta;
type Story = StoryObj<DwModePanelCtx>;

export const Solo: Story = {
    name: 'Solo — fresh Battle-Brother, default state',
    args: {
        modePanel: {
            mode: 'solo',
            renownRank: 'initiated',
            renownRankKey: rankKey('initiated'),
            supportRange: getSupportRange('initiated'),
            sustainedAbilities: [],
        },
    },
    render: (args) => renderPanel(args),
};

export const SquadNoSustains: Story = {
    name: 'Squad — entered Squad Mode, no sustains active yet',
    args: {
        modePanel: {
            mode: 'squad',
            renownRank: 'respected',
            renownRankKey: rankKey('respected'),
            supportRange: getSupportRange('respected'),
            sustainedAbilities: [],
        },
    },
    render: (args) => renderPanel(args),
};

export const SquadWithSustains: Story = {
    name: 'Squad — two sustained Squad-mode abilities active',
    args: {
        modePanel: {
            mode: 'squad',
            renownRank: 'famed',
            renownRankKey: rankKey('famed'),
            supportRange: getSupportRange('famed'),
            sustainedAbilities: [
                { id: 'codex-attack-pattern.long-vigil', label: 'Long Vigil' },
                { id: 'defensive-stance.bulwark', label: 'Bulwark of the Emperor' },
            ],
        },
    },
    render: (args) => renderPanel(args),
};
