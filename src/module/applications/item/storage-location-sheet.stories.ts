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

const STORED: EmbeddedItem[] = [
    { id: 'rope0000000000aa', type: 'gear', name: 'Climbing Rope' },
    { id: 'lasp0000000000bb', type: 'weapon', name: 'Laspistol' },
];

/**
 * #697: the stored items render from the sheet's `nestedItems` array. The template
 * read `item.items.length`, and a Collection has no `length`, so every storage
 * location looked empty. Each row carries its nested id and the container sheet's
 * edit and delete actions.
 */
export const WithStoredItems: Story = {
    render: () => renderSheet(templateSrc, { ...baseArgs, nestedItems: STORED }),
    play: async ({ canvasElement }) => {
        const rows = [...canvasElement.querySelectorAll<HTMLElement>('[data-nested-item-id]')];
        await expect(rows.map((row) => row.dataset['nestedItemId'])).toEqual(STORED.map((s) => s.id));
        await expect(rows.map((row) => row.textContent.includes(STORED.find((s) => s.id === row.dataset['nestedItemId'])?.name ?? '?'))).toEqual([true, true]);
        await expect(
            rows.every((row) => row.querySelector('[data-action="nestedItemEdit"]') !== null && row.querySelector('[data-action="nestedItemDelete"]') !== null),
        ).toBe(true);
        await expect(canvasElement.querySelector('[data-item-section-actions]')?.textContent.trim()).toBe('2');
        await expect(canvasElement.textContent).not.toContain('No items stored');
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
