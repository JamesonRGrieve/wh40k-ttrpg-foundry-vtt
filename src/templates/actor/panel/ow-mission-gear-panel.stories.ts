/**
 * Storybook stories for the Only War Mission Assignment Gear panel (#155).
 *
 * Covers the three visual states an operator needs to verify in review:
 *   1. Default        — squad has never rolled gear (no "last result" row).
 *   2. StandardKit    — last roll resolved to standard-kit (Table 6-4 row 3).
 *   3. SurrenderKit   — last roll catastrophically failed (4+ DoF).
 *
 * All values are fixed; per CLAUDE.md screenshot-diff stability, no
 * Math.random / seeded RNG is required here — the panel itself is
 * RNG-free.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import HandlebarsLib from 'handlebars';
import { renderTemplate as renderMockTemplate } from '../../../../stories/mocks';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import panelSrc from './ow-mission-gear-panel.hbs?raw';

initializeStoryHandlebars();

interface MissionGearPanelCtx {
    missionGearPanel: {
        hasOutcome: boolean;
        outcomeKey: string | null;
    };
}

const panelTpl = HandlebarsLib.compile(panelSrc);

function renderPanel(ctx: MissionGearPanelCtx): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    wrapper.dataset['wh40kSystem'] = 'ow';
    wrapper.appendChild(renderMockTemplate(panelTpl, ctx as unknown as Record<string, unknown>));
    return wrapper;
}

const meta: Meta<MissionGearPanelCtx> = {
    title: 'Actor/Character/OwMissionGearPanel',
};
export default meta;
type Story = StoryObj<MissionGearPanelCtx>;

export const Default: Story = {
    name: 'Default — squad has never rolled gear',
    args: {
        missionGearPanel: {
            hasOutcome: false,
            outcomeKey: null,
        },
    },
    render: (args) => renderPanel(args),
};

export const StandardKit: Story = {
    name: 'Last result: Standard Kit (success, 0–3 DoS)',
    args: {
        missionGearPanel: {
            hasOutcome: true,
            outcomeKey: 'WH40K.OW.MissionGear.Outcome.StandardKit',
        },
    },
    render: (args) => renderPanel(args),
};

export const SurrenderKit: Story = {
    name: 'Last result: Surrender Kit (catastrophic failure, 4+ DoF)',
    args: {
        missionGearPanel: {
            hasOutcome: true,
            outcomeKey: 'WH40K.OW.MissionGear.Outcome.SurrenderKit',
        },
    },
    render: (args) => renderPanel(args),
};
