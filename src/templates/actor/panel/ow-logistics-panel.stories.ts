/**
 * Storybook stories for the Only War Squad Logistics panel (#154).
 *
 * Covers the three visual states an operator needs to verify in review:
 *   1. Default       — freshly founded squad, Rating 10, no Munitorum, situational 0.
 *   2. Munitorum     — Munitorum Influence Talent active, situational +5.
 *   3. SubparSquad   — half-strength regiment, Rating reduced to 5, situational -5.
 *
 * All values are fixed (no Math.random / no seeded RNG required) for
 * screenshot-diff stability per CLAUDE.md "Seeded RNG in stories".
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import HB from 'handlebars';
import { renderTemplate as compileAndRender } from '../../../../stories/mocks';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import panelSrc from './ow-logistics-panel.hbs?raw';

initializeStoryHandlebars();

interface LogisticsPanelCtx {
    logisticsPanel: {
        rating: number;
        munitorum: boolean;
        situational: number;
    };
}

const panelTpl = HB.compile(panelSrc);

function renderPanel(ctx: LogisticsPanelCtx): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    wrapper.dataset['wh40kSystem'] = 'ow';
    wrapper.appendChild(compileAndRender(panelTpl, ctx));
    return wrapper;
}

const meta: Meta<LogisticsPanelCtx> = {
    title: 'Actor/Character/OwLogisticsPanel',
};
export default meta;
type Story = StoryObj<LogisticsPanelCtx>;

export const Default: Story = {
    name: 'Default — fresh squad, Rating 10, no Munitorum, situational 0',
    args: {
        logisticsPanel: {
            rating: 10,
            munitorum: false,
            situational: 0,
        },
    },
    render: (args) => renderPanel(args),
};

export const Munitorum: Story = {
    name: 'Munitorum Influence + situational +5',
    args: {
        logisticsPanel: {
            rating: 15,
            munitorum: true,
            situational: 5,
        },
    },
    render: (args) => renderPanel(args),
};

export const SubparSquad: Story = {
    name: 'Sub-par squad — Rating 5, situational -5',
    args: {
        logisticsPanel: {
            rating: 5,
            munitorum: false,
            situational: -5,
        },
    },
    render: (args) => renderPanel(args),
};
