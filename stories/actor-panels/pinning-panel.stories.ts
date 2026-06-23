/**
 * Storybook stories for the DH2 Pinning panel (core.md §"Pinning").
 *
 * Renders the panel — two quick-test buttons ("Pinning Test" / "Escape
 * Pinning") that dispatch the `rollPinningTest` / `escapePinning` CharacterSheet
 * actions. The panel is stateless (no `system` fields), so a single default
 * story covers it. Both actions route through the actor's unified-roll methods
 * so Willpower talents/traits surface as situational modifiers before resolving.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import panelSrc from '../../src/templates/actor/panel/pinning-panel.hbs?raw';
import { renderSheet } from '../test-helpers';

type PinningContext = Record<string, never>;

function renderPanel(ctx: PinningContext): HTMLElement {
    return renderSheet(panelSrc, ctx);
}

const meta: Meta<PinningContext> = {
    id: 'actor-panels-pinningpanel',
    title: 'Actor/Panels/PinningPanel',
};
export default meta;
type Story = StoryObj<PinningContext>;

export const Default: Story = {
    name: 'Pinning test / escape buttons',
    args: {},
    render: (args) => renderPanel(args),
};
