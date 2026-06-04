/**
 * Storybook stories for the Only War Comrade panel (#152 — core.md
 * p.12137). Covers the three visual states an operator needs to
 * verify in review:
 *
 *   1. Unharmed — green badge, in Cohesion, Wound/Heal/Replace buttons
 *                 reflect the legal-transition gates.
 *   2. Wounded  — yellow badge, still in Cohesion, Heal enabled.
 *   3. Dead     — red badge, out of Cohesion, only Replace can fire
 *                 (and only because the PC is `inCamp`).
 *
 * Every value is fixed for diff stability (no Math.random); the
 * `inCohesion` flag is resolved through the canonical rules module so
 * any change to the 5 m radius / visual-line gate surfaces here first.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { renderSheet } from '../../../../stories/test-helpers';
import { COMRADE_COHESION_RANGE_M, type ComradeState, inCohesion } from '../../../module/rules/ow-comrade';
import panelSrc from './ow-comrade-panel.hbs?raw';

initializeStoryHandlebars();

interface ComradePanelCtx {
    comradePanel: {
        name: string;
        state: ComradeState;
        stateLabelKey: string;
        distanceM: number;
        hasVisualLine: boolean;
        cohesionRangeM: number;
        inCohesion: boolean;
        isUnharmed: boolean;
        isWounded: boolean;
        isDead: boolean;
        canWound: boolean;
        canHeal: boolean;
        canReplace: boolean;
        inCamp: boolean;
    };
}

const STATE_LABEL_KEY: Record<ComradeState, string> = {
    unharmed: 'WH40K.OW.Comrade.State.Unharmed',
    wounded: 'WH40K.OW.Comrade.State.Wounded',
    dead: 'WH40K.OW.Comrade.State.Dead',
};

function buildContext(opts: { name: string; state: ComradeState; distanceM: number; hasVisualLine: boolean; inCamp: boolean }): ComradePanelCtx {
    const cohesion = inCohesion({ distanceM: opts.distanceM, hasVisualLine: opts.hasVisualLine });
    const isUnharmed = opts.state === 'unharmed';
    const isWounded = opts.state === 'wounded';
    const isDead = opts.state === 'dead';
    return {
        comradePanel: {
            name: opts.name,
            state: opts.state,
            stateLabelKey: STATE_LABEL_KEY[opts.state],
            distanceM: opts.distanceM,
            hasVisualLine: opts.hasVisualLine,
            cohesionRangeM: COMRADE_COHESION_RANGE_M,
            inCohesion: cohesion,
            isUnharmed,
            isWounded,
            isDead,
            canWound: !isDead,
            canHeal: isWounded,
            canReplace: isDead && opts.inCamp,
            inCamp: opts.inCamp,
        },
    };
}

function renderPanel(ctx: ComradePanelCtx): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    wrapper.dataset['wh40kSystem'] = 'ow';
    wrapper.appendChild(renderSheet(panelSrc, ctx));
    return wrapper;
}

const meta: Meta<ComradePanelCtx> = {
    title: 'Actor/Character/OwComradePanel',
};
export default meta;
type Story = StoryObj<ComradePanelCtx>;

export const Unharmed: Story = {
    name: 'Unharmed — green badge, in Cohesion at 3 m',
    args: buildContext({ name: 'Comrade Jaeger', state: 'unharmed', distanceM: 3, hasVisualLine: true, inCamp: false }),
    render: (args) => renderPanel(args),
};

export const Wounded: Story = {
    name: 'Wounded — yellow badge, in Cohesion, Heal enabled',
    args: buildContext({ name: 'Comrade Jaeger', state: 'wounded', distanceM: 4, hasVisualLine: true, inCamp: false }),
    render: (args) => renderPanel(args),
};

export const Dead: Story = {
    name: 'Dead — red badge, out of Cohesion, Replace gated on camp',
    args: buildContext({ name: 'Comrade Jaeger', state: 'dead', distanceM: 12, hasVisualLine: false, inCamp: true }),
    render: (args) => renderPanel(args),
};
