import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import templateSrc from '../../../../src/templates/item/item-attack-special-sheet.hbs?raw';
import type { SystemId } from '../../../../stories/mocks/extended';
import { renderSheet } from '../../../../stories/test-helpers';

interface ItemContext {
    name: string;
    img: string;
    system: {
        hasLevel: boolean;
        enabled: boolean;
        level: number;
        source: string;
        description: { value: string };
    };
}
interface Args {
    item: ItemContext;
    [key: string]: ItemContext;
}

const baseItem = (): Args['item'] => ({
    name: 'Lightning Arc',
    img: 'icons/svg/lightning.svg',
    system: {
        hasLevel: true,
        enabled: true,
        level: 2,
        source: 'Power Weapon',
        description: { value: 'Releases a coruscating arc of lightning on a successful hit.' },
    },
});

const meta = {
    title: 'Item Sheets/AttackSpecialSheet',
    render: (args) => renderSheet(templateSrc, args),
    args: { item: baseItem() },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

export const Default: Story = {};

export const Disabled: Story = {
    args: {
        item: {
            ...baseItem(),
            system: { ...baseItem().system, enabled: false, hasLevel: false },
        },
    },
};

export const RendersAndAcceptsName: Story = {
    play: ({ canvasElement }) => {
        const cv = within(canvasElement);
        const nameInput = cv.getByDisplayValue('Lightning Arc');
        void expect(nameInput).toBeTruthy();
        void expect(nameInput.getAttribute('name')).toBe('name');
    },
};

// ── Per-system homologation (dh2 / dh1 / rt / bc / ow / dw / im) ──────────────
//
// The attack-special template colours its description divider per game line
// (`bc:tw-border-crimson-light … im:tw-border-failure`); those variants fire
// only under a `data-wh40k-system="<id>"` ancestor. Each story re-stamps the
// rendered wrapper with its system id so visual review exercises all seven.

/** Render the sheet, then stamp the active game-system id so per-system variants activate. */
function renderForSystem(systemId: SystemId): HTMLElement {
    const el = renderSheet(templateSrc, { item: baseItem() });
    el.dataset['wh40kSystem'] = systemId;
    return el;
}

export const HomologationDH2: Story = {
    render: () => renderForSystem('dh2'),
    play: ({ canvasElement }) => {
        void expect(canvasElement.querySelector('[data-wh40k-system="dh2"]')).toBeTruthy();
    },
};

export const HomologationDH1: Story = {
    render: () => renderForSystem('dh1'),
    play: ({ canvasElement }) => {
        void expect(canvasElement.querySelector('[data-wh40k-system="dh1"]')).toBeTruthy();
    },
};

export const HomologationRT: Story = {
    render: () => renderForSystem('rt'),
    play: ({ canvasElement }) => {
        void expect(canvasElement.querySelector('[data-wh40k-system="rt"]')).toBeTruthy();
    },
};

export const HomologationBC: Story = {
    render: () => renderForSystem('bc'),
    play: ({ canvasElement }) => {
        void expect(canvasElement.querySelector('[data-wh40k-system="bc"]')).toBeTruthy();
    },
};

export const HomologationOW: Story = {
    render: () => renderForSystem('ow'),
    play: ({ canvasElement }) => {
        void expect(canvasElement.querySelector('[data-wh40k-system="ow"]')).toBeTruthy();
    },
};

export const HomologationDW: Story = {
    render: () => renderForSystem('dw'),
    play: ({ canvasElement }) => {
        void expect(canvasElement.querySelector('[data-wh40k-system="dw"]')).toBeTruthy();
    },
};

export const HomologationIM: Story = {
    render: () => renderForSystem('im'),
    play: ({ canvasElement }) => {
        const cv = within(canvasElement);
        // Name still renders under the IM identity, and the system id is stamped.
        void expect(cv.getByDisplayValue('Lightning Arc')).toBeTruthy();
        void expect(canvasElement.querySelector('[data-wh40k-system="im"]')).toBeTruthy();
    },
};
