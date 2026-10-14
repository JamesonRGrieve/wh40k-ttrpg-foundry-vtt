/**
 * Storybook stories for the voidcraft action tabs' "Ship Actions in Effect"
 * panel (#186): what a rolled Lock on Target, Aid the Machine Spirit, Flank
 * Speed, Come to New Heading or Evasive Manoeuvres left on the ship.
 *
 *   1. InEffect — three live modifiers (one aimed at a named Weapon Component,
 *      one lapsed and therefore hidden), rows built by the sheet's own
 *      `shipActionModifierRows`.
 *   2. NothingInEffect — no live modifier: the panel renders nothing.
 *   3. PerSystem — framed under every game line. Only Rogue Trader ships take
 *      ship-action modifiers (`applyShipActionModifier` is a no-op elsewhere), so
 *      only the RT frame shows the panel.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import { mockActor } from '../../../../stories/mocks';
import { withSystem, type SystemId } from '../../../../stories/mocks/extended';
import { storyLocalize } from '../../../../stories/mocks/ship-assault';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { renderSheet } from '../../../../stories/test-helpers';
import { shipActionModifierRows } from '../../../module/applications/ship-action/ship-action-flow.ts';
import type { ShipEffectView } from '../../../module/rules/ship-action-effects.ts';
import panelSrc from './ship-action-modifiers-panel.hbs?raw';

initializeStoryHandlebars();

const SYSTEMS: readonly SystemId[] = ['dh2', 'dh1', 'rt', 'bc', 'ow', 'dw', 'im'];

const WEAPONS = [
    { id: 'macro', name: 'Sunsear Laser Battery' },
    { id: 'lance', name: 'Titanforge Lance' },
];

const RT_EFFECTS: ShipEffectView[] = [
    { name: 'Aid the Machine Spirit', active: true, modifier: { target: 'detection', value: 10, weaponId: '' } },
    { name: 'Lock on Target', active: true, modifier: { target: 'weaponBallisticSkill', value: 15, weaponId: 'lance' } },
    { name: 'Flank Speed', active: false, modifier: { target: 'speed', value: 3, weaponId: '' } },
    { name: 'Evasive Manoeuvres', active: true, modifier: { target: 'ballisticSkill', value: -20, weaponId: '' } },
];

/** The panel inside a `.wh40k-rpg` sheet frame stamped with one game line. */
function renderPanel(systemId: SystemId, effects: ShipEffectView[]): HTMLElement {
    const actor = withSystem(mockActor({ name: 'Errant Vector', type: 'rt-voidcraft' }), systemId, 'vehicle');
    const [actorLine = ''] = actor.type.split('-');
    const frame = document.createElement('div');
    frame.classList.add('wh40k-rpg', 'sheet', 'tw-p-2');
    frame.dataset['wh40kSystem'] = actorLine;
    frame.dataset['storySystem'] = actorLine;
    // Only a Rogue Trader hull holds ship-action modifiers.
    const live = actorLine === 'rt' ? effects : [];
    frame.append(renderSheet(panelSrc, { modifiers: shipActionModifierRows({ shipWeaponChoices: WEAPONS, shipActionEffects: live }, storyLocalize) }));
    return frame;
}

/** Each listed row's text, whitespace collapsed. */
function rowTexts(root: ParentNode): string[] {
    return [...root.querySelectorAll('[data-wh40k-hook="ship-action-modifiers"] li')].map((row) => row.textContent.replace(/\s+/gu, ' ').trim());
}

const meta: Meta = {
    title: 'Actor/Voidcraft/ShipActionModifiersPanel (#186)',
};
export default meta;

type Story = StoryObj;

export const InEffect: Story = {
    render: () => renderPanel('rt', RT_EFFECTS),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.textContent).toContain('Ship Actions in Effect');
        await expect(rowTexts(canvasElement)).toEqual([
            'Aid the Machine Spirit Detection +10',
            'Lock on Target Ballistic Skill Tests to fire Titanforge Lance +15',
            "Evasive Manoeuvres every Ballistic Skill Test to fire the ship's weapons -20",
        ]);
    },
};

export const NothingInEffect: Story = {
    render: () => renderPanel('rt', []),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-wh40k-hook="ship-action-modifiers"]')).toBeNull();
    },
};

export const PerSystem: Story = {
    render: () => {
        const wrapper = document.createElement('div');
        for (const system of SYSTEMS) wrapper.append(renderPanel(system, RT_EFFECTS));
        return wrapper;
    },
    play: async ({ canvasElement }) => {
        const withPanel = SYSTEMS.filter(
            (system) => canvasElement.querySelector(`[data-story-system="${system}"] [data-wh40k-hook="ship-action-modifiers"]`) !== null,
        );
        await expect(withPanel).toEqual(['rt']);
    },
};
