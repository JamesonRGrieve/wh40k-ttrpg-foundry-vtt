/**
 * Storybook stories for the Ship Build Summary panel (issue #196).
 *
 * Covers three states the panel must render correctly:
 *   1. Empty       — no owned items contribute modifiers; panel shows the
 *                    empty-state copy.
 *   2. Components  — component modifiers and an upgrade contribute; multi-
 *                    source detection / armour rollups are visible.
 *   3. WithRole    — adds a Ship Role on top of the Components state to
 *                    verify role bonuses appear in the same panel.
 *   4. CrippledShip — the RT Crippled-ship rule (#187) as its own named source
 *                    on Speed, Manoeuvrability and Detection.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { renderSheet } from '../../../../stories/test-helpers';
import panelSrc from './ship-build-summary-panel.hbs?raw';

initializeStoryHandlebars();

interface ModifierSource {
    name: string;
    type: string;
    uuid: string;
    sourceUuid: string;
    value: number;
}

interface BuildSummaryRow {
    statKey: string;
    labelKey: string;
    base: number;
    modifier: number;
    total: number;
    sources: ModifierSource[];
}

interface PanelContext {
    buildSummaryRows: BuildSummaryRow[];
    hasAppliedModifiers: boolean;
}

function renderPanel(ctx: PanelContext): HTMLElement {
    return renderSheet(panelSrc, ctx);
}

function row(statKey: string, labelKey: string, base: number, sources: ModifierSource[]): BuildSummaryRow {
    const modifier = sources.reduce((acc, s) => acc + s.value, 0);
    return { statKey, labelKey, base, modifier, total: base + modifier, sources };
}

const meta: Meta<PanelContext> = {
    title: 'Actor/Starship/ShipBuildSummaryPanel',
};
export default meta;
type Story = StoryObj<PanelContext>;

export const Empty: Story = {
    name: 'Empty — no applied modifiers (empty state)',
    args: { buildSummaryRows: [], hasAppliedModifiers: false },
    render: (args) => renderPanel(args),
};

export const Components: Story = {
    name: 'Components — multi-source detection + armour + hull',
    args: {
        buildSummaryRows: [
            row('detection', 'WH40K.Voidcraft.Build.Stat.Detection', 10, [
                {
                    name: 'Mark-201.b Auger Array',
                    type: 'shipComponent',
                    uuid: 'Actor.demo.Item.augur',
                    sourceUuid: 'Compendium.wh40k-rpg.rt-items.augur1',
                    value: 8,
                },
                {
                    name: 'Augmented Sensorium',
                    type: 'shipUpgrade',
                    uuid: 'Actor.demo.Item.sensorium',
                    sourceUuid: 'Compendium.wh40k-rpg.rt-items.sensorium',
                    value: 3,
                },
            ]),
            row('armour', 'WH40K.Voidcraft.Build.Stat.Armour', 18, [
                {
                    name: 'Reinforced Bulkheads',
                    type: 'shipUpgrade',
                    uuid: 'Actor.demo.Item.bulkheads',
                    sourceUuid: 'Compendium.wh40k-rpg.rt-items.bulkheads',
                    value: 1,
                },
            ]),
            row('hullIntegrity', 'WH40K.Voidcraft.Build.Stat.HullIntegrity', 60, [
                {
                    name: 'Reinforced Bulkheads',
                    type: 'shipUpgrade',
                    uuid: 'Actor.demo.Item.bulkheads',
                    sourceUuid: 'Compendium.wh40k-rpg.rt-items.bulkheads',
                    value: 4,
                },
            ]),
            row('speed', 'WH40K.Voidcraft.Build.Stat.Speed', 7, [
                {
                    name: 'Modified Plasma Drive',
                    type: 'shipComponent',
                    uuid: 'Actor.demo.Item.plasma',
                    sourceUuid: 'Compendium.wh40k-rpg.rt-items.plasma-mod',
                    value: 1,
                },
            ]),
        ],
        hasAppliedModifiers: true,
    },
    render: (args) => renderPanel(args),
};

/** The Crippled-ship rule as the sheet hands it to the panel: no item, named by the langpack (#187). */
const CRIPPLED_SOURCE = { name: 'Crippled ship (0 Hull Integrity)', type: 'crippled', uuid: '', sourceUuid: '' };

export const CrippledShip: Story = {
    name: 'Crippled ship (#187) — −10 Manoeuvrability and Detection, half Speed, each a named source',
    args: {
        buildSummaryRows: [
            row('speed', 'WH40K.Voidcraft.Build.Stat.Speed', 8, [{ ...CRIPPLED_SOURCE, value: -4 }]),
            row('manoeuvrability', 'WH40K.Voidcraft.Build.Stat.Manoeuvrability', 15, [{ ...CRIPPLED_SOURCE, value: -10 }]),
            row('detection', 'WH40K.Voidcraft.Build.Stat.Detection', 10, [
                {
                    name: 'Mark-201.b Auger Array',
                    type: 'shipComponent',
                    uuid: 'Actor.demo.Item.augur',
                    sourceUuid: 'Compendium.wh40k-rpg.rt-items.augur1',
                    value: 8,
                },
                { ...CRIPPLED_SOURCE, value: -10 },
            ]),
        ],
        hasAppliedModifiers: true,
    },
    render: (args) => renderPanel(args),
    play: async ({ canvasElement }) => {
        const rows = [...canvasElement.querySelectorAll<HTMLElement>('[data-wh40k-hook="ship-build-summary__row"]')];
        const totals = rows.map((el) => [el.dataset['stat'], el.querySelector('[data-field="total"]')?.textContent.trim()]);
        await expect(totals).toEqual([
            ['speed', '4'],
            ['manoeuvrability', '5'],
            ['detection', '8'],
        ]);
        const crippled = [...canvasElement.querySelectorAll<HTMLElement>('[data-source-type="crippled"]')];
        await expect(crippled).toHaveLength(3);
        await expect(crippled[0]?.textContent.replace(/\s+/gu, ' ').trim()).toBe('Crippled ship (0 Hull Integrity) (RT: Crippled Ships) -4');
    },
};

export const WithRole: Story = {
    name: 'With role — role bonuses appear alongside component modifiers',
    args: {
        buildSummaryRows: [
            row('manoeuvrability', 'WH40K.Voidcraft.Build.Stat.Manoeuvrability', 15, [
                {
                    name: 'Helmsman',
                    type: 'shipRole',
                    uuid: 'Actor.demo.Item.helmsman',
                    sourceUuid: 'Compendium.wh40k-rpg.rt-items.helmsman',
                    value: 5,
                },
            ]),
            row('detection', 'WH40K.Voidcraft.Build.Stat.Detection', 10, [
                {
                    name: 'First Officer',
                    type: 'shipRole',
                    uuid: 'Actor.demo.Item.first-officer',
                    sourceUuid: 'Compendium.wh40k-rpg.rt-items.first-officer',
                    value: 5,
                },
                {
                    name: 'Mark-201.b Auger Array',
                    type: 'shipComponent',
                    uuid: 'Actor.demo.Item.augur',
                    sourceUuid: 'Compendium.wh40k-rpg.rt-items.augur1',
                    value: 8,
                },
            ]),
            row('ballisticSkill', 'WH40K.Voidcraft.Build.Stat.BallisticSkill', 30, [
                {
                    name: 'Master Gunner',
                    type: 'shipRole',
                    uuid: 'Actor.demo.Item.gunner',
                    sourceUuid: 'Compendium.wh40k-rpg.rt-items.gunner',
                    value: 10,
                },
            ]),
        ],
        hasAppliedModifiers: true,
    },
    render: (args) => renderPanel(args),
};
