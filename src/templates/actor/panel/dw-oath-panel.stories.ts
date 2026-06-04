/**
 * Storybook stories for the Deathwatch Mission Oath panel (#168 —
 * core.md Table 7-16 §"OATHS", p.10165). Covers the three visual
 * states an operator needs to verify in review:
 *
 *   1. NoOathLeader     — leader, no Oath sworn; swear available.
 *   2. OathSworn        — leader with an active Oath; release available.
 *   3. NotLeader        — non-leader battle-brother; both actions disabled.
 *
 * Every value is fixed for diff stability (no Math.random).
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { renderSheet } from '../../../../stories/test-helpers';
import panelSrc from './dw-oath-panel.hbs?raw';

initializeStoryHandlebars();

interface OathPanelCtx {
    oathPanel: {
        isLeader: boolean;
        active: boolean;
        activeOathId: string | null;
        activeLabel: string | null;
        canSwear: boolean;
        canRelease: boolean;
    };
}

function renderPanel(ctx: OathPanelCtx): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    wrapper.dataset['wh40kSystem'] = 'dw';
    wrapper.appendChild(renderSheet(panelSrc, ctx));
    return wrapper;
}

const meta: Meta<OathPanelCtx> = {
    title: 'Actor/Character/DwOathPanel',
};
export default meta;
type Story = StoryObj<OathPanelCtx>;

export const NoOathLeader: Story = {
    name: 'Leader, no Oath sworn — swear available',
    args: {
        oathPanel: {
            isLeader: true,
            active: false,
            activeOathId: null,
            activeLabel: null,
            canSwear: true,
            canRelease: false,
        },
    },
    render: (args) => renderPanel(args),
};

export const OathSworn: Story = {
    name: 'Leader with active Oath — release available',
    args: {
        oathPanel: {
            isLeader: true,
            active: true,
            activeOathId: 'Compendium.wh40k-rpg.dw-oaths.Item.oath-of-glory',
            activeLabel: 'Oath of Glory',
            canSwear: false,
            canRelease: true,
        },
    },
    render: (args) => renderPanel(args),
};

export const NotLeader: Story = {
    name: 'Non-leader battle-brother — both actions disabled',
    args: {
        oathPanel: {
            isLeader: false,
            active: false,
            activeOathId: null,
            activeLabel: null,
            canSwear: false,
            canRelease: false,
        },
    },
    render: (args) => renderPanel(args),
};
