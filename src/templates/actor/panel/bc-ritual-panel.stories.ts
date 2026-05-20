/**
 * Storybook stories for the Black Crusade Chaos Ritual panel (#179).
 *
 * Covers three Daemonic Mastery profiles an operator needs to review:
 *
 *   1. Novice  — fresh Heretic with Mastery 0 (no bindings yet).
 *   2. Adept   — mid-arc Heretic with Mastery 3 (typical bound-daemon
 *                portfolio).
 *   3. Master  — late-arc Heretic with Mastery 7 (binding contests win
 *                outright against most rivals).
 *
 * Story factories use fixed inputs (no Math.random) per the "Seeded RNG
 * in stories" rule in CLAUDE.md — the only displayed value (Mastery
 * rating) is the literal input.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import Handlebars from 'handlebars';
import { renderTemplate } from '../../../../stories/mocks';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import panelSrc from './bc-ritual-panel.hbs?raw';

initializeStoryHandlebars();

interface RitualPanelCtx {
    ritualPanel: {
        ritualMastery: number;
    };
}

const panelTpl = Handlebars.compile(panelSrc);

function renderPanel(ctx: RitualPanelCtx): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    wrapper.dataset['wh40kSystem'] = 'bc';
    wrapper.appendChild(renderTemplate(panelTpl, ctx));
    return wrapper;
}

function buildCtx(ritualMastery: number): RitualPanelCtx {
    return { ritualPanel: { ritualMastery } };
}

const meta: Meta<RitualPanelCtx> = {
    title: 'Actor/Character/BcRitualPanel',
};
export default meta;
type Story = StoryObj<RitualPanelCtx>;

export const Novice: Story = {
    name: 'Novice — Daemonic Mastery 0',
    args: buildCtx(0),
    render: (args) => renderPanel(args),
};

export const Adept: Story = {
    name: 'Adept — Daemonic Mastery 3',
    args: buildCtx(3),
    render: (args) => renderPanel(args),
};

export const Master: Story = {
    name: 'Master — Daemonic Mastery 7',
    args: buildCtx(7),
    render: (args) => renderPanel(args),
};
