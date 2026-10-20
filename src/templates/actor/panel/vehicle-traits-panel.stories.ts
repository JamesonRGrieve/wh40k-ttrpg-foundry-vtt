/**
 * Storybook stories for the craft sheet's Vehicle Tests + Trait Rules panels
 * (content#28). The context is built by the sheet's own builder from an
 * aggregated trait-effects block, so a story shows exactly what the sheet would.
 *
 *   1. Chimera     — Rugged / Tracked Vehicle / Enclosed / Amphibious: test rows
 *                    name their traits, the rules list crew exposure + amphibious.
 *   2. Skimmer     — hover, terrain, free turn, ram crash and the melee penalty.
 *   3. NoTraits    — every test reads "No trait modifiers"; the rules panel shows
 *                    its empty state.
 *   4. AllSystems  — the panel under each of the six lines' theme roots.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import { formatKey, localizeKey } from '../../../../stories/mocks/lang-localize';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { captureActionClicks, renderSheet } from '../../../../stories/test-helpers';
import { buildVehicleTraitPanel, type VehicleTraitPanelContext } from '../../../module/applications/actor/vehicle-trait-panel-context';
import { type AggregatedVehicleTraitEffects, emptyAggregatedVehicleTraitEffects } from '../../../module/data/shared/vehicle-trait-effects-template';
import panelSrc from './vehicle-traits-panel.hbs?raw';

initializeStoryHandlebars();

const SYSTEMS = ['bc', 'dh1', 'dh2', 'dw', 'ow', 'rt'] as const;

interface PanelArgs {
    effects: AggregatedVehicleTraitEffects;
}

const i18n = { localize: localizeKey, format: formatKey };

function panelContext(effects: AggregatedVehicleTraitEffects): { vehicleTraitPanel: VehicleTraitPanelContext } {
    return { vehicleTraitPanel: buildVehicleTraitPanel(effects, i18n) };
}

function renderPanel(effects: AggregatedVehicleTraitEffects, systemId: (typeof SYSTEMS)[number] = 'dh2'): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    wrapper.dataset['wh40kSystem'] = systemId;
    wrapper.appendChild(renderSheet(panelSrc, panelContext(effects)));
    return wrapper;
}

/** The text of one test row's modifier chips. */
function testChips(root: HTMLElement, category: string): string[] {
    return Array.from(root.querySelectorAll<HTMLElement>(`li[data-test="${category}"] [data-modifier-source]`)).map((chip) => chip.textContent.trim());
}

/** The rule rows' keys. */
function ruleKeys(root: HTMLElement): string[] {
    return Array.from(root.querySelectorAll<HTMLElement>('[data-rule]')).map((row) => row.dataset['rule'] ?? '');
}

const CHIMERA: AggregatedVehicleTraitEffects = {
    ...emptyAggregatedVehicleTraitEffects(),
    testModifiers: [
        { test: 'repair', value: 20, source: 'Rugged' },
        { test: 'difficultTerrain', value: 10, source: 'Tracked Vehicle' },
    ],
    crewExposure: 'enclosed',
    amphibious: true,
    mitigatesMotiveCrit: true,
};

const SKIMMER: AggregatedVehicleTraitEffects = {
    ...emptyAggregatedVehicleTraitEffects(),
    hoverer: true,
    ignoresDifficultTerrain: true,
    freeTurn: true,
    crashesOnFailedRam: true,
    incomingMeleeToHitModifier: -10,
};

const meta: Meta<PanelArgs> = {
    title: 'Actor/Craft/VehicleTraitsPanel',
};
export default meta;
type Story = StoryObj<PanelArgs>;

export const Chimera: Story = {
    name: 'Chimera — trait modifiers on its tests, enclosed + amphibious rules',
    args: { effects: CHIMERA },
    render: (args) => renderPanel(args.effects),
    play: async ({ canvasElement }) => {
        await expect(testChips(canvasElement, 'repair')).toEqual(['Rugged +20']);
        await expect(testChips(canvasElement, 'difficultTerrain')).toEqual(['Tracked Vehicle +10']);
        await expect(canvasElement.querySelector('li[data-test="floorIt"]')?.textContent).toContain(localizeKey('WH40K.Vehicle.TraitTests.NoModifiers'));
        await expect(ruleKeys(canvasElement)).toEqual(['crewExposure', 'amphibious']);
        await expect(canvasElement.querySelector('[data-rule="crewExposure"]')?.textContent).toBe('Crew: Enclosed');

        const clicks = captureActionClicks(canvasElement);
        canvasElement.querySelector<HTMLElement>('[data-action="rollVehicleTest"][data-test="repair"]')?.click();
        await expect(clicks).toEqual([{ action: 'rollVehicleTest', dataset: { test: 'repair' } }]);
    },
};

export const Skimmer: Story = {
    name: 'Skimmer — hover, terrain, free turn, ram crash and the melee penalty',
    args: { effects: SKIMMER },
    render: (args) => renderPanel(args.effects),
    play: async ({ canvasElement }) => {
        await expect(ruleKeys(canvasElement)).toEqual(['hoverer', 'ignoresDifficultTerrain', 'freeTurn', 'crashesOnFailedRam', 'incomingMeleeToHitModifier']);
        await expect(canvasElement.querySelector('[data-rule="incomingMeleeToHitModifier"]')?.textContent).toBe('Melee attacks against it: −10');
    },
};

export const NoTraits: Story = {
    name: 'No traits — no modifiers, empty rules state',
    args: { effects: emptyAggregatedVehicleTraitEffects() },
    render: (args) => renderPanel(args.effects),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelectorAll('[data-action="rollVehicleTest"]')).toHaveLength(4);
        await expect(canvasElement.querySelectorAll('[data-modifier-source]')).toHaveLength(0);
        await expect(canvasElement.querySelector('[data-wh40k-hook="vehicle-trait-rules-empty"]')?.textContent).toBe(
            localizeKey('WH40K.Vehicle.TraitRules.None'),
        );
    },
};

export const AllSystems: Story = {
    name: 'All six lines — the same four tests and rules under each theme root',
    args: { effects: CHIMERA },
    render: (args) => {
        const column = document.createElement('div');
        column.dataset['storyColumn'] = 'vehicle-traits';
        for (const systemId of SYSTEMS) column.appendChild(renderPanel(args.effects, systemId));
        return column;
    },
    play: async ({ canvasElement }) => {
        const roots = Array.from(canvasElement.querySelectorAll<HTMLElement>('[data-story-column] > [data-wh40k-system]'));
        await expect(roots.map((root) => root.dataset['wh40kSystem'])).toEqual([...SYSTEMS]);
        for (const root of roots) {
            // eslint-disable-next-line no-await-in-loop -- one assertion per rendered line
            await expect(root.querySelectorAll('[data-action="rollVehicleTest"]')).toHaveLength(4);
        }
    },
};
