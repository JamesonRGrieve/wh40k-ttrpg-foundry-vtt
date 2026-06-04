/**
 * Storybook stories for the compact movement panel (#234). This panel is
 * purpose-built for the combat tab and is now wired into combat-station-panel
 * in place of the old inline mobility block. The rows are click-to-announce
 * (data-action="vocalizeMovement") via the optional action param on
 * movement-stat-row, so the combat behaviour is preserved by the DRY swap.
 *
 * Values are fixed for screenshot-diff stability (no Math.random).
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { renderSheet } from '../../../../stories/test-helpers';
import panelSrc from './movement-panel-compact.hbs?raw';

initializeStoryHandlebars();

interface MovementCompactCtx {
    system: { movement: { half: number; full: number; charge: number; run: number } };
}

function renderPanel(ctx: MovementCompactCtx): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    wrapper.dataset['wh40kSystem'] = 'dh2';
    // Constrain width to the combat panel's vitals-column footprint so the
    // composed look matches where this panel actually renders.
    wrapper.style.maxWidth = '280px';
    wrapper.appendChild(renderSheet(panelSrc, ctx));
    return wrapper;
}

const meta: Meta<MovementCompactCtx> = {
    title: 'Actor/Character/MovementPanelCompact',
};
export default meta;
type Story = StoryObj<MovementCompactCtx>;

export const Default: Story = {
    name: 'Compact movement panel — Half/Full/Charge/Run rows (#234)',
    args: {
        system: { movement: { half: 4, full: 8, charge: 12, run: 24 } },
    },
    render: (args) => renderPanel(args),
};
