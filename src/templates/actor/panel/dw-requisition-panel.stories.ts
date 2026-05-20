/**
 * Storybook stories for the Deathwatch Requisition panel (#165). Covers
 * the three visual states an operator needs to verify in review:
 *
 *   1. Initiated / Standard — fresh Battle-Brother, baseline RP grant.
 *   2. Famed / Priority    — mid-career Brother on a Priority mission;
 *                            mid-tier RP balance.
 *   3. Hero / Critical     — Hero-rank Brother on a Critical mission;
 *                            high RP balance.
 *
 * No randomness — fixed values for diff stability per the "Seeded RNG
 * in stories" rule in CLAUDE.md.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import Handlebars from 'handlebars';
import { renderTemplate } from '../../../../stories/mocks';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import type { MissionRating } from '../../../module/rules/dw-requisition.ts';
import type { RenownRank } from '../../../module/rules/dw-renown.ts';
import panelSrc from './dw-requisition-panel.hbs?raw';

initializeStoryHandlebars();

interface RequisitionPanelCtx {
    requisitionPanel: {
        rp: number;
        missionRating: MissionRating;
        renownRank: RenownRank;
    };
}

const panelTpl = Handlebars.compile(panelSrc);

function renderPanel(ctx: RequisitionPanelCtx): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    wrapper.dataset['wh40kSystem'] = 'dw';
    wrapper.appendChild(renderTemplate(panelTpl, ctx));
    return wrapper;
}

const meta: Meta<RequisitionPanelCtx> = {
    title: 'Actor/Character/DwRequisitionPanel',
};
export default meta;
type Story = StoryObj<RequisitionPanelCtx>;

export const InitiatedStandard: Story = {
    name: 'Initiated / Standard — fresh Battle-Brother, baseline grant',
    args: {
        requisitionPanel: {
            rp: 25,
            missionRating: 'standard',
            renownRank: 'initiated',
        },
    },
    render: (args) => renderPanel(args),
};

export const FamedPriority: Story = {
    name: 'Famed / Priority — mid-career Brother, Priority mission',
    args: {
        requisitionPanel: {
            rp: 50,
            missionRating: 'priority',
            renownRank: 'famed',
        },
    },
    render: (args) => renderPanel(args),
};

export const HeroCritical: Story = {
    name: 'Hero / Critical — Hero-rank Brother on a Critical mission',
    args: {
        requisitionPanel: {
            rp: 100,
            missionRating: 'critical',
            renownRank: 'hero',
        },
    },
    render: (args) => renderPanel(args),
};
