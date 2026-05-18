/**
 * Storybook stories for the Possession track panel (#82, beyond.md p.69).
 *
 * Renders the panel against a hand-crafted `system.possession` context. The
 * stories cover the visible states the panel must render correctly:
 *   1. Latent              — latent possession, no uses spent yet.
 *   2. LatentPartialSpend  — latent, some uses spent, GM view (reset visible).
 *   3. Possessed           — full possession, all uses exhausted (button disabled).
 *
 * The companion e2e spec (`tests/e2e/possession-panel.spec.ts`) creates a
 * dh2-character with possession.state='latent' and snaps the panel against
 * a live Foundry instance.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import Handlebars from 'handlebars';
import { renderTemplate } from '../mocks';
import { initializeStoryHandlebars } from '../template-support';
import panelSrc from '../../src/templates/actor/panel/possession-panel.hbs?raw';

initializeStoryHandlebars();

interface PossessionContext {
    isGM: boolean;
    system: {
        possession: {
            state: 'none' | 'latent' | 'possessed';
            unleashUsed: number;
            unleashMax: number;
        };
    };
}

const panelTpl = Handlebars.compile(panelSrc);

function renderPanel(ctx: PossessionContext): HTMLElement {
    return renderTemplate(panelTpl, ctx);
}

const meta: Meta<PossessionContext> = {
    title: 'Actor/Panels/PossessionPanel',
};
export default meta;
type Story = StoryObj<PossessionContext>;

export const Latent: Story = {
    name: 'Latent — no uses spent (player view)',
    args: {
        isGM: false,
        system: {
            possession: { state: 'latent', unleashUsed: 0, unleashMax: 3 },
        },
    },
    render: (args) => renderPanel(args),
};

export const LatentPartialSpend: Story = {
    name: 'Latent — 1/3 uses spent (GM view, reset visible)',
    args: {
        isGM: true,
        system: {
            possession: { state: 'latent', unleashUsed: 1, unleashMax: 3 },
        },
    },
    render: (args) => renderPanel(args),
};

export const Possessed: Story = {
    name: 'Possessed — all uses exhausted (Unleash disabled)',
    args: {
        isGM: true,
        system: {
            possession: { state: 'possessed', unleashUsed: 3, unleashMax: 3 },
        },
    },
    render: (args) => renderPanel(args),
};
