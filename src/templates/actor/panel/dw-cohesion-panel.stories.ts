/**
 * Storybook stories for the Deathwatch Kill-team Cohesion panel
 * (#162 — core.md §"COHESION"). Covers the three visual states an
 * operator needs to verify in review:
 *
 *   1. FullPool   — fresh kill-team, current = max, no losses, not rallied.
 *   2. Depleted   — current < max, lostThisTurn > 0, not yet rallied.
 *   3. AfterRally — rallied this turn; rally affordance disabled; recover
 *                   affordance still live (current < max).
 *
 * Every value is fixed for diff stability (no Math.random).
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import Handlebars from 'handlebars';
import { renderTemplate } from '../../../../stories/mocks';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import panelSrc from './dw-cohesion-panel.hbs?raw';

initializeStoryHandlebars();

interface CohesionPanelCtx {
    cohesionPanel: {
        current: number;
        max: number;
        lostThisTurn: number;
        rallied: boolean;
        canRally: boolean;
        canRecover: boolean;
    };
}

const panelTpl = Handlebars.compile(panelSrc);

function renderPanel(ctx: CohesionPanelCtx): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    wrapper.dataset['wh40kSystem'] = 'dw';
    wrapper.appendChild(renderTemplate(panelTpl, ctx));
    return wrapper;
}

const meta: Meta<CohesionPanelCtx> = {
    title: 'Actor/Character/DwCohesionPanel',
};
export default meta;
type Story = StoryObj<CohesionPanelCtx>;

export const FullPool: Story = {
    name: 'Full pool — fresh kill-team, no losses this turn',
    args: {
        cohesionPanel: {
            current: 6,
            max: 6,
            lostThisTurn: 0,
            rallied: false,
            canRally: true,
            canRecover: false,
        },
    },
    render: (args) => renderPanel(args),
};

export const Depleted: Story = {
    name: 'Depleted — point lost this turn; rally still available',
    args: {
        cohesionPanel: {
            current: 3,
            max: 6,
            lostThisTurn: 1,
            rallied: false,
            canRally: true,
            canRecover: true,
        },
    },
    render: (args) => renderPanel(args),
};

export const AfterRally: Story = {
    name: 'After rally — rally consumed this turn; recovery still live',
    args: {
        cohesionPanel: {
            current: 4,
            max: 6,
            lostThisTurn: 0,
            rallied: true,
            canRally: false,
            canRecover: true,
        },
    },
    render: (args) => renderPanel(args),
};
