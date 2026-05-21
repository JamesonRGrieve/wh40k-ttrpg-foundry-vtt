/**
 * Storybook stories for the DH2 Shock panel (#66).
 *
 * Renders the panel against a hand-crafted `system.shock` context. Stories
 * cover the visible states the panel must render correctly:
 *   1. NoShock        — value=0, Snap-Out button disabled.
 *   2. ModerateShock  — value=2/max=10, Snap-Out enabled.
 *   3. SevereShock    — value=8/max=10, Snap-Out enabled, near max.
 *
 * The companion e2e spec (`tests/e2e/shock-panel.spec.ts`) creates a
 * dh2-character with `system.shock.value=3` and snaps the panel against
 * a live Foundry instance.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import HbsStory from 'handlebars';
import panelSrc from '../../src/templates/actor/panel/shock-panel.hbs?raw';
import { renderTemplate as renderStoryTemplate } from '../mocks';
import { initializeStoryHandlebars } from '../template-support';

initializeStoryHandlebars();

interface ShockContext {
    system: { shock: { value: number; max: number } };
}

const panelTpl = HbsStory.compile(panelSrc);

function renderPanel(ctx: ShockContext): HTMLElement {
    return renderStoryTemplate(panelTpl, ctx);
}

const meta: Meta<ShockContext> = {
    title: 'Actor/Panels/ShockPanel',
};
export default meta;
type Story = StoryObj<ShockContext>;

export const NoShock: Story = {
    name: 'No shock — Snap-Out disabled',
    args: {
        system: { shock: { value: 0, max: 10 } },
    },
    render: (args) => renderPanel(args),
};

export const ModerateShock: Story = {
    name: 'Moderate shock — 2 / 10',
    args: {
        system: { shock: { value: 2, max: 10 } },
    },
    render: (args) => renderPanel(args),
};

export const SevereShock: Story = {
    name: 'Severe shock — 8 / 10',
    args: {
        system: { shock: { value: 8, max: 10 } },
    },
    render: (args) => renderPanel(args),
};
