/**
 * Storybook stories for the Fanatic "Death to All Who Oppose Me" button
 * (#93, within.md p.34/967).
 *
 * Renders the action button panel against a minimal context. The button
 * itself is gated on `hasFanatic` (computed by
 * CharacterSheet._prepareContext based on actor talent/role names) so the
 * stories cover both the rendered and hidden states.
 *
 * The companion e2e spec (`tests/e2e/fanatic-button.spec.ts`) creates a
 * dh2-character with a "Fanatic" talent, opens the sheet, clicks the
 * button, and snaps `fanatic-button-clicked` against a live Foundry
 * instance — verifying the Fate value decrements and the ActiveEffect
 * is created.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import Handlebars from 'handlebars';
import panelSrc from '../../src/templates/actor/panel/fanatic-button.hbs?raw';
import { renderTemplate } from '../mocks';
import { initializeStoryHandlebars } from '../template-support';

initializeStoryHandlebars();

interface FanaticContext {
    hasFanatic: boolean;
}

const panelTpl = Handlebars.compile(panelSrc);

function renderPanel(ctx: FanaticContext): HTMLElement {
    return renderTemplate(panelTpl, ctx);
}

const meta: Meta<FanaticContext> = {
    title: 'Actor/Panels/FanaticButton',
};
export default meta;
type Story = StoryObj<FanaticContext>;

export const FanaticVisible: Story = {
    name: 'Fanatic — button rendered',
    args: { hasFanatic: true },
    render: (args) => renderPanel(args),
};

export const NonFanaticHidden: Story = {
    name: 'Non-Fanatic — panel hidden',
    args: { hasFanatic: false },
    render: (args) => renderPanel(args),
};
