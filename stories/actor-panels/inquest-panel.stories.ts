/**
 * Storybook stories for the warband Inquests panel (DH2, #90) in the Party Overview.
 *
 * The rows come from the same pure `inquestPanelRows` builder the DH2
 * character sheet calls in `_prepareContext`, using DH2's printed tables. The
 * panel is wrapped in the `.wh40k-rpg` + `data-wh40k-system="dh2"` ancestor the
 * live sheet provides, so the scoped utilities and `dh2:tw-*` variants
 * resolve. Only DH2 declares Inquest rules, so the other lines never build
 * `inquestPanel` and the include site renders nothing (see `inquest-view.test.ts`).
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import { inquestPanelRows } from '../../src/module/applications/dialogs/inquest-view';
import { DH2_INQUEST_RULES } from '../../src/module/config/game-systems/dh2-config';
import { createInquest, type InquestState } from '../../src/module/rules/inquest';
import panelSrc from '../../src/templates/actor/panel/inquest-panel.hbs?raw';
import { randomId, seedRandom } from '../mocks/extended';
import { initializeStoryHandlebars } from '../template-support';
import { renderSheet } from '../test-helpers';

initializeStoryHandlebars();

const rng = seedRandom(0x1a90);

interface Args {
    canOpen: boolean;
    inquests: InquestState[];
}

function renderPanel(args: Args): HTMLElement {
    const root = document.createElement('div');
    root.className = 'wh40k-rpg sheet actor character';
    root.dataset['wh40kSystem'] = 'dh2';
    root.append(renderSheet(panelSrc, { inquestPanel: { canOpen: args.canOpen, rows: inquestPanelRows(DH2_INQUEST_RULES, args.inquests) } }));
    return root;
}

const INQUESTS: InquestState[] = [
    createInquest(randomId('inq', rng), { target: 'Lord Karheit Vorf', scope: 'minoris', investigationPoints: 350 }),
    createInquest(randomId('inq', rng), {
        target: 'The Childes of Kappellax',
        scope: 'extremis',
        investigationPoints: 450,
        revelationThresholds: [200, 400, 600, 900],
    }),
    createInquest(randomId('inq', rng), { target: 'Zethor the Heretic', scope: 'majoris', investigationPoints: 900, status: 'goalsMet' }),
];

const meta = {
    title: 'Actor/Panels/InquestPanel',
    render: renderPanel,
    args: { canOpen: true, inquests: INQUESTS },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

export const GmView: Story = {
    play: async ({ canvasElement }) => {
        const rows = [...canvasElement.querySelectorAll<HTMLElement>('[data-wh40k-hook="inquest-panel-row"]')];
        await expect(rows).toHaveLength(3);
        // Active Inquests first; the resolved one sorts last.
        await expect(rows[0]?.textContent).toContain('Lord Karheit Vorf');
        await expect(rows[0]?.textContent).toContain('350 / 600 IP');
        await expect(rows[0]?.textContent).toContain('Revelations 1 / 2');
        // GM-tailored thresholds: 200/400/600/900/1200 → two reached at 450 IP.
        await expect(rows[1]?.textContent).toContain('Revelations 2 / 5');
        await expect(rows[1]?.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('38');
        await expect(rows[2]?.textContent).toContain('Resolved — goals met');
        await expect(canvasElement.querySelector('[data-action="openInquestTracker"]')).not.toBeNull();
    },
};

export const PlayerView: Story = {
    args: { canOpen: false },
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-action="openInquestTracker"]')).toBeNull();
        await expect(canvasElement.querySelectorAll('[data-wh40k-hook="inquest-panel-row"]')).toHaveLength(3);
    },
};

export const Empty: Story = {
    args: { inquests: [] },
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-wh40k-hook="inquest-panel-empty"]')).not.toBeNull();
    },
};
