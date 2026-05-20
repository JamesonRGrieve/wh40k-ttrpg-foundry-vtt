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
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import Handlebars from 'handlebars';
import { renderTemplate } from '../../../../stories/mocks';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
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

const panelTpl = Handlebars.compile(panelSrc);

function renderPanel(ctx: PanelContext): HTMLElement {
    return renderTemplate(panelTpl, ctx);
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
            row('detection', 'WH40K.Starship.Build.Stat.Detection', 10, [
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
            row('armour', 'WH40K.Starship.Build.Stat.Armour', 18, [
                {
                    name: 'Reinforced Bulkheads',
                    type: 'shipUpgrade',
                    uuid: 'Actor.demo.Item.bulkheads',
                    sourceUuid: 'Compendium.wh40k-rpg.rt-items.bulkheads',
                    value: 1,
                },
            ]),
            row('hullIntegrity', 'WH40K.Starship.Build.Stat.HullIntegrity', 60, [
                {
                    name: 'Reinforced Bulkheads',
                    type: 'shipUpgrade',
                    uuid: 'Actor.demo.Item.bulkheads',
                    sourceUuid: 'Compendium.wh40k-rpg.rt-items.bulkheads',
                    value: 4,
                },
            ]),
            row('speed', 'WH40K.Starship.Build.Stat.Speed', 7, [
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

export const WithRole: Story = {
    name: 'With role — role bonuses appear alongside component modifiers',
    args: {
        buildSummaryRows: [
            row('manoeuvrability', 'WH40K.Starship.Build.Stat.Manoeuvrability', 15, [
                {
                    name: 'Helmsman',
                    type: 'shipRole',
                    uuid: 'Actor.demo.Item.helmsman',
                    sourceUuid: 'Compendium.wh40k-rpg.rt-items.helmsman',
                    value: 5,
                },
            ]),
            row('detection', 'WH40K.Starship.Build.Stat.Detection', 10, [
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
            row('ballisticSkill', 'WH40K.Starship.Build.Stat.BallisticSkill', 30, [
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
