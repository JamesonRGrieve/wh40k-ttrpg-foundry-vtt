import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import templateSrc from '../../../../src/templates/item/item-peer-enemy-sheet.hbs?raw';
import type { SystemId } from '../../../../stories/mocks/extended';
import { renderSheet } from '../../../../stories/test-helpers';

interface PeerEnemyItem {
    name: string;
    system: { modifier: number; description: { value: string } };
}
interface Args {
    item: PeerEnemyItem;
    [key: string]: PeerEnemyItem;
}

const peerArgs: Args = {
    item: {
        name: 'Adeptus Arbites',
        system: {
            modifier: 10,
            description: { value: 'Friendly with the local Arbites precinct.' },
        },
    },
};

/**
 * Render the sheet and stamp `data-wh40k-system="<id>"` on the wrapper so the
 * template's per-system Tailwind variant chains (`bc:tw-border-crimson-light …
 * im:tw-border-failure` on the description block) cascade for that game line.
 */
function renderForSystem(args: Args, systemId: SystemId): HTMLElement {
    const el = renderSheet(templateSrc, args);
    el.dataset['wh40kSystem'] = systemId;
    return el;
}

const meta = {
    title: 'Item Sheets/PeerEnemySheet',
    render: (args) => renderSheet(templateSrc, args),
    args: peerArgs,
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

export const Peer: Story = {};

export const Enemy: Story = {
    args: {
        item: {
            name: 'Hereteks of the Forge Anomaly',
            system: {
                modifier: -20,
                description: { value: 'Marked for death by rogue tech-priests.' },
            },
        },
    },
};

export const RendersFields: Story = {
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(view.getByDisplayValue('Adeptus Arbites')).toBeTruthy();
        const modifier = canvasElement.querySelector<HTMLInputElement>('input[name="system.modifier"]');
        await expect(modifier?.value).toBe('10');
    },
};

// ── Per-system homologation ───────────────────────────────────────────────────
//
// One story per game line. Each stamps a different `data-wh40k-system` on the
// wrapper so the template's per-system Tailwind border-variant chains resolve
// for that system, confirming the peer/enemy sheet renders across all seven
// lines.

export const HomologationDH2: Story = {
    render: (args) => renderForSystem(args, 'dh2'),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-wh40k-system="dh2"]')).toBeTruthy();
        await expect(within(canvasElement).getByDisplayValue('Adeptus Arbites')).toBeTruthy();
    },
};

export const HomologationDH1: Story = {
    render: (args) => renderForSystem(args, 'dh1'),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-wh40k-system="dh1"]')).toBeTruthy();
    },
};

export const HomologationRT: Story = {
    render: (args) => renderForSystem(args, 'rt'),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-wh40k-system="rt"]')).toBeTruthy();
    },
};

export const HomologationBC: Story = {
    render: (args) => renderForSystem(args, 'bc'),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-wh40k-system="bc"]')).toBeTruthy();
    },
};

export const HomologationOW: Story = {
    render: (args) => renderForSystem(args, 'ow'),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-wh40k-system="ow"]')).toBeTruthy();
    },
};

export const HomologationDW: Story = {
    render: (args) => renderForSystem(args, 'dw'),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-wh40k-system="dw"]')).toBeTruthy();
    },
};

export const HomologationIM: Story = {
    render: (args) => renderForSystem(args, 'im'),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-wh40k-system="im"]')).toBeTruthy();
    },
};
