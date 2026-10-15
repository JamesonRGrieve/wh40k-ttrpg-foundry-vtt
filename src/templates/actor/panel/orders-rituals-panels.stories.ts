/**
 * Storybook stories for the Ship Orders and Rituals panels' test line (#648).
 *
 * Both panels print `system.testLabel`. OrderData and RitualData build it from the
 * skill catalog's label (`skillLabel`) and a signed modifier (`formatTestLabel`);
 * the stories build it the same way, from those shared functions, so a raw key
 * ("TEST command") cannot pass. Each panel renders on every line.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { renderSheet } from '../../../../stories/test-helpers';
import { formatTestLabel, skillLabel } from '../../../module/data/shared/skill-definitions.ts';
import ordersSrc from './orders-panel.hbs?raw';
import ritualsSrc from './rituals-panel.hbs?raw';

initializeStoryHandlebars();

const LINES = ['dh1', 'dh2', 'rt', 'bc', 'dw', 'ow'] as const;

interface PanelArgs {
    template: string;
    context: object;
}

const ORDER_CONTEXT = {
    ordersCount: 1,
    orderCategories: [],
    orders: [
        {
            id: 'order-1',
            _id: 'order-1',
            name: 'Prepare to Repel Boarders',
            img: 'icons/svg/item-bag.svg',
            system: {
                category: 'manoeuvre',
                actionTypeLabel: 'Extended Action',
                testLabel: formatTestLabel(skillLabel('command'), 10),
                pill: { label: 'Manoeuvre' },
            },
        },
    ],
};

const RITUAL_CONTEXT = {
    ritualsCount: 1,
    rituals: [
        {
            id: 'ritual-1',
            _id: 'ritual-1',
            name: 'Rite of Binding',
            img: 'icons/svg/item-bag.svg',
            system: {
                type: 'rite',
                activationLabel: 'Full Action',
                test: { threshold: 0 },
                testLabel: formatTestLabel(skillLabel('forbiddenLore'), -10),
                pill: { label: 'Rite' },
            },
        },
    ],
};

/** The panel once per line. */
function renderPerLine({ template, context }: PanelArgs): HTMLElement {
    const row = document.createElement('div');
    row.style.display = 'grid';
    row.style.gridTemplateColumns = 'repeat(3, minmax(0, 1fr))';
    row.style.gap = '12px';
    for (const line of LINES) {
        const column = document.createElement('div');
        column.className = 'wh40k-rpg theme-dark';
        column.dataset['wh40kSystem'] = line;
        column.appendChild(renderSheet(template, context));
        row.appendChild(column);
    }
    return row;
}

/** Each line's panel text, for the play assertions. */
function textPerLine(canvasElement: HTMLElement): string[] {
    return LINES.map((line) => canvasElement.querySelector(`[data-wh40k-system="${line}"]`)?.textContent ?? '');
}

const meta = {
    title: 'Actor/Panels/OrdersAndRitualsTestLine',
    render: (args) => renderPerLine(args),
    args: { template: ordersSrc, context: ORDER_CONTEXT },
} satisfies Meta<PanelArgs>;
export default meta;
type Story = StoryObj<PanelArgs>;

/** A ship order tested on Command shows "Command +10", never the key "command". */
export const ShipOrderTestLabel: Story = {
    args: { template: ordersSrc, context: ORDER_CONTEXT },
    play: async ({ canvasElement }) => {
        const texts = textPerLine(canvasElement);
        await expect(texts.map((text) => text.includes('Command +10'))).toEqual(LINES.map(() => true));
        await expect(texts.map((text) => text.includes('command'))).toEqual(LINES.map(() => false));
    },
};

/** A ritual tested on Forbidden Lore shows "Forbidden Lore -10", never the key "forbiddenLore". */
export const RitualTestLabel: Story = {
    args: { template: ritualsSrc, context: RITUAL_CONTEXT },
    play: async ({ canvasElement }) => {
        const texts = textPerLine(canvasElement);
        await expect(texts.map((text) => text.includes('Forbidden Lore -10'))).toEqual(LINES.map(() => true));
        await expect(texts.map((text) => text.includes('forbiddenLore'))).toEqual(LINES.map(() => false));
    },
};
