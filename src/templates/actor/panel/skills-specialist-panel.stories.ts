/**
 * Storybook story for the Statistics-tab panels whose headers were unified to
 * the shared panel.hbs scaffold (#238): Specialist Skills + Talents. Rendered
 * together (empty state) so the heading treatment can be compared at a glance —
 * both should now show the same gradient + display-font header as the
 * Characteristics / Skills / Traits panels.
 *
 * Values fixed for screenshot-diff stability (no Math.random).
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { renderSheet } from '../../../../stories/test-helpers';
import specialistSrc from './skills-specialist-panel.hbs?raw';
import talentSrc from './talent-panel.hbs?raw';

initializeStoryHandlebars();

interface StatsHeadingsCtx {
    // Empty lists — the story only exercises the (now shared) panel headers and
    // empty states, so the row item shape is irrelevant here.
    skillLists: { specialist: never[] };
    talents: never[];
    talentsCount: number;
    inEditMode: boolean;
}

function renderPanels(ctx: StatsHeadingsCtx): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    wrapper.dataset['wh40kSystem'] = 'dh2';
    wrapper.style.maxWidth = '420px';
    wrapper.appendChild(renderSheet(specialistSrc, ctx));
    wrapper.appendChild(renderSheet(talentSrc, ctx));
    return wrapper;
}

const meta: Meta<StatsHeadingsCtx> = {
    title: 'Actor/Character/StatsTabHeadings',
};
export default meta;
type Story = StoryObj<StatsHeadingsCtx>;

export const UnifiedHeaders: Story = {
    name: 'Specialist Skills + Talents share the panel.hbs header (#238)',
    args: {
        skillLists: { specialist: [] },
        talents: [],
        talentsCount: 0,
        inEditMode: false,
    },
    render: (args) => renderPanels(args),
};
