/**
 * Storybook stories for the Crusader role button panel (#141, beyond.md p.34).
 *
 * Covers the two states the panel must render correctly:
 *   1. Active   — `hasCrusader: true`, the Smite-the-Unholy button renders.
 *   2. Hidden   — `hasCrusader: false`, the panel collapses to nothing.
 *
 * The button itself dispatches `data-action="smiteTheUnholy"`; runtime
 * resolution lives in CharacterSheet.#smiteTheUnholy. Stories render the
 * partial in isolation so layout / Tailwind cascade regressions surface
 * in visual review.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import HBS from 'handlebars';
import { renderTemplate as renderTpl } from '../../../../stories/mocks';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import panelSrc from './crusader-button.hbs?raw';

initializeStoryHandlebars();

interface PanelContext {
    hasCrusader: boolean;
}

const panelTpl = HBS.compile(panelSrc);

function renderPanel(ctx: PanelContext): HTMLElement {
    return renderTpl(panelTpl, ctx);
}

const meta: Meta<PanelContext> = {
    title: 'Actor/Character/CrusaderButton',
};
export default meta;
type Story = StoryObj<PanelContext>;

export const Active: Story = {
    name: 'Active — actor has Crusader role / Smite the Unholy talent',
    args: { hasCrusader: true },
    render: (args) => renderPanel(args),
};

export const Hidden: Story = {
    name: 'Hidden — actor lacks the Crusader role',
    args: { hasCrusader: false },
    render: (args) => renderPanel(args),
};
