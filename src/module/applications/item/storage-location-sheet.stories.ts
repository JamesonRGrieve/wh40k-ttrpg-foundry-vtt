import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import templateSrc from '../../../../src/templates/item/item-storage-location-sheet.hbs?raw';
import type { SystemId } from '../../../../stories/mocks/extended';
import { renderSheet } from '../../../../stories/test-helpers';

interface EmbeddedItem {
    id: string;
    type: string;
    name: string;
}

interface StorageLocationItem {
    name: string;
    img: string;
    items: EmbeddedItem[];
    system: { description: { value: string } };
}
interface Args {
    item: StorageLocationItem;
    [key: string]: StorageLocationItem;
}

const baseArgs: Args = {
    item: {
        name: 'Footlocker',
        img: 'icons/svg/chest.svg',
        items: [],
        system: { description: { value: 'A reinforced footlocker, plasteel-clad.' } },
    },
};

/**
 * Render the sheet and stamp `data-wh40k-system="<id>"` on the wrapper so the
 * template's per-system Tailwind variant chains (`bc:tw-text-crimson-light …
 * im:tw-text-failure` on the panel headings) cascade for that game line.
 */
function renderForSystem(args: Args, systemId: SystemId): HTMLElement {
    const el = renderSheet(templateSrc, args);
    el.dataset['wh40kSystem'] = systemId;
    return el;
}

const meta = {
    title: 'Item Sheets/StorageLocationSheet',
    render: (args) => renderSheet(templateSrc, args),
    args: baseArgs,
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

export const Empty: Story = {};

export const RendersTabs: Story = {
    play: ({ canvasElement }) => {
        const storyCanvas = within(canvasElement);
        void expect(storyCanvas.getByDisplayValue('Footlocker')).toBeTruthy();
        void expect(canvasElement.querySelector('[data-tab="items"]')).toBeTruthy();
        void expect(canvasElement.querySelector('[data-tab="description"]')).toBeTruthy();
    },
};

// ── Per-system homologation ───────────────────────────────────────────────────
//
// One story per game line. Each stamps a different `data-wh40k-system` on the
// wrapper so the template's per-system Tailwind variant chains resolve for that
// system, confirming the storage-location sheet renders across all seven lines.

export const HomologationDH2: Story = {
    render: (args) => renderForSystem(args, 'dh2'),
    play: ({ canvasElement }) => {
        void expect(canvasElement.querySelector('[data-wh40k-system="dh2"]')).toBeTruthy();
        void expect(within(canvasElement).getByDisplayValue('Footlocker')).toBeTruthy();
    },
};

export const HomologationDH1: Story = {
    render: (args) => renderForSystem(args, 'dh1'),
    play: ({ canvasElement }) => {
        void expect(canvasElement.querySelector('[data-wh40k-system="dh1"]')).toBeTruthy();
    },
};

export const HomologationRT: Story = {
    render: (args) => renderForSystem(args, 'rt'),
    play: ({ canvasElement }) => {
        void expect(canvasElement.querySelector('[data-wh40k-system="rt"]')).toBeTruthy();
    },
};

export const HomologationBC: Story = {
    render: (args) => renderForSystem(args, 'bc'),
    play: ({ canvasElement }) => {
        void expect(canvasElement.querySelector('[data-wh40k-system="bc"]')).toBeTruthy();
    },
};

export const HomologationOW: Story = {
    render: (args) => renderForSystem(args, 'ow'),
    play: ({ canvasElement }) => {
        void expect(canvasElement.querySelector('[data-wh40k-system="ow"]')).toBeTruthy();
    },
};

export const HomologationDW: Story = {
    render: (args) => renderForSystem(args, 'dw'),
    play: ({ canvasElement }) => {
        void expect(canvasElement.querySelector('[data-wh40k-system="dw"]')).toBeTruthy();
    },
};

export const HomologationIM: Story = {
    render: (args) => renderForSystem(args, 'im'),
    play: ({ canvasElement }) => {
        void expect(canvasElement.querySelector('[data-wh40k-system="im"]')).toBeTruthy();
    },
};
