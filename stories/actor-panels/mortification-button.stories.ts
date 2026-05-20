/**
 * Storybook stories for the Penitent "Mortification of the Flesh" button
 * (#94, within.md p.36).
 *
 * Renders the action button panel against a minimal context. The button
 * itself is gated on `hasPenitent` (computed by
 * CharacterSheet._prepareContext based on actor talent/role names) so the
 * stories cover both the rendered and hidden states.
 *
 * The companion e2e spec (`tests/e2e/mortification-action.spec.ts`) creates
 * a dh2-character with a "Penitent" talent, opens the sheet, clicks the
 * button, and snaps `mortification-button-clicked` against a live Foundry
 * instance — verifying the Fatigue value increments and the ActiveEffect
 * is created.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import Handlebars from 'handlebars';
import panelSrc from '../../src/templates/actor/panel/mortification-button.hbs?raw';
import { renderTemplate } from '../mocks';
import { initializeStoryHandlebars } from '../template-support';

initializeStoryHandlebars();

interface MortificationContext {
    hasPenitent: boolean;
}

const panelTpl = Handlebars.compile(panelSrc);

function renderPanel(ctx: MortificationContext): HTMLElement {
    return renderTemplate(panelTpl, ctx);
}

const meta: Meta<MortificationContext> = {
    title: 'Actor/Panels/MortificationButton',
};
export default meta;
type Story = StoryObj<MortificationContext>;

export const PenitentVisible: Story = {
    name: 'Penitent — button rendered',
    args: { hasPenitent: true },
    render: (args) => renderPanel(args),
};

export const NonPenitentHidden: Story = {
    name: 'Non-Penitent — panel hidden',
    args: { hasPenitent: false },
    render: (args) => renderPanel(args),
};
