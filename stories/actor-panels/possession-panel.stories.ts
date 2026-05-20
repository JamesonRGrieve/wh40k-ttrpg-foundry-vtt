/**
 * Storybook stories for the Possession track panel (#82, beyond.md p.69)
 * + Possession-power Frenzy-test loop (#132, beyond.md L2095-2116).
 *
 * Renders the panel against a hand-crafted `system.possession` context. The
 * stories cover the visible states the panel must render correctly:
 *   1. Latent              — contested possession, no uses spent yet; the
 *                            #132 Frenzy-test / mismanifest controls show.
 *   2. LatentPartialSpend  — contested, some uses spent, GM view (reset visible).
 *   3. Possessed           — full possession, all uses exhausted; Frenzy
 *                            loop controls are hidden (daemon already won).
 *
 * The companion e2e spec (`tests/e2e/possession-panel.spec.ts`) creates a
 * dh2-character with possession.state='latent' and snaps the panel against
 * a live Foundry instance.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import Handlebars from 'handlebars';
import { expect } from 'storybook/test';
import panelSrc from '../../src/templates/actor/panel/possession-panel.hbs?raw';
import { renderTemplate } from '../mocks';
import { initializeStoryHandlebars } from '../template-support';

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
    name: 'Latent — no uses spent (player view, #132 Frenzy loop visible)',
    args: {
        isGM: false,
        system: {
            possession: { state: 'latent', unleashUsed: 0, unleashMax: 3 },
        },
    },
    render: (args) => renderPanel(args),
    play: async ({ canvasElement }) => {
        // #132: while contested (latent) the Frenzy-test loop controls
        // must be present so the per-round test / mismanifest contest
        // can be rolled.
        const frenzyBtn = canvasElement.querySelector('[data-action="possessionFrenzyTest"]');
        const mismanifestBtn = canvasElement.querySelector('[data-action="possessionMismanifest"]');
        expect(frenzyBtn).toBeTruthy();
        expect(mismanifestBtn).toBeTruthy();
    },
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
    name: 'Possessed — all uses exhausted (#132 Frenzy loop hidden)',
    args: {
        isGM: true,
        system: {
            possession: { state: 'possessed', unleashUsed: 3, unleashMax: 3 },
        },
    },
    render: (args) => renderPanel(args),
    play: async ({ canvasElement }) => {
        // #132: in the terminal possessed state the daemon already won
        // the contest — the Frenzy-test loop controls must be gone.
        const frenzyBtn = canvasElement.querySelector('[data-action="possessionFrenzyTest"]');
        const mismanifestBtn = canvasElement.querySelector('[data-action="possessionMismanifest"]');
        expect(frenzyBtn).toBeNull();
        expect(mismanifestBtn).toBeNull();
        // The disabled Unleash button is still rendered.
        const unleash = canvasElement.querySelector('[data-action="unleashDaemon"]');
        expect(unleash?.hasAttribute('disabled')).toBe(true);
    },
};
