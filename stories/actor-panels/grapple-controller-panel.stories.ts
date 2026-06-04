/**
 * Storybook stories for the Grapple Controller Panel (#120 — core.md
 * L10155-10180).
 *
 * The panel renders the current `grappleState` badge and the five
 * opposed-Strength action buttons (Damage / Throw Down / Break Free /
 * Stand Up / Move). The Status tab gates the include on
 * `grappleState !== 'none'`; these stories exercise the rendered panel
 * directly so the visual treatment is review-able under both
 * `grappling` and `controlled` states.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import panelSrc from '../../src/templates/actor/panel/grapple-controller-panel.hbs?raw';
import { renderSheet } from '../test-helpers';

interface GrappleContext {
    grappleState: 'none' | 'grappling' | 'controlled';
}

function renderPanel(ctx: GrappleContext): HTMLElement {
    return renderSheet(panelSrc, ctx);
}

const meta: Meta<GrappleContext> = {
    title: 'Actor/Panels/GrappleControllerPanel',
};
export default meta;
type Story = StoryObj<GrappleContext>;

export const Grappling: Story = {
    name: 'State: grappling (controller)',
    args: { grappleState: 'grappling' },
    render: (args) => renderPanel(args),
};

export const Controlled: Story = {
    name: 'State: controlled (victim)',
    args: { grappleState: 'controlled' },
    render: (args) => renderPanel(args),
};
