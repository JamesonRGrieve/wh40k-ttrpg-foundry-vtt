/**
 * Regression tests for the inventory equip toggle (#332).
 *
 * Equipped state applies to ALL carryable equippable items — armour, gear
 * (auspex, rebreather, micro-bead), cybernetics, weapons, force fields — not
 * just weapons/armour. The backpack-split (Equipment tab inventory) now renders
 * a `toggleEquip` control per carried item, gated on `system.state` so only
 * EquippableTemplate items get one (consumables/ammunition do not). These tests
 * pin:
 *
 *   - an equip toggle renders for every carried item that has `system.state`;
 *   - it does NOT render for a non-equippable carried item (no `system.state`);
 *   - the toggle reflects the current equipped state (icon + Equip/Unequip label).
 */

import HbsStory from 'handlebars';
import { describe, expect, it } from 'vitest';
import panelSrc from '../src/templates/actor/panel/backpack-split-panel.hbs?raw';
import { initializeStoryHandlebars } from '../stories/template-support';

initializeStoryHandlebars();

const template = HbsStory.compile(panelSrc);

interface CarriedItem {
    id: string;
    type: string;
    name: string;
    img: string;
    system: { state?: { equipped: boolean }; weight?: number };
}

function render(allCarriedItems: CarriedItem[]): HTMLElement {
    const html = template({ allCarriedItems, allShipItems: [] });
    const root = document.createElement('div');
    root.innerHTML = html;
    return root;
}

const EQUIPPED_GEAR: CarriedItem = { id: 'g1', type: 'gear', name: 'Auspex', img: 'i.svg', system: { state: { equipped: true } } };
const STOWED_GEAR: CarriedItem = { id: 'g2', type: 'gear', name: 'Rebreather', img: 'i.svg', system: { state: { equipped: false } } };
const AMMO: CarriedItem = { id: 'a1', type: 'ammunition', name: 'Bolt Shells', img: 'i.svg', system: {} };

function toggleFor(root: HTMLElement, id: string): HTMLElement | null {
    return root.querySelector(`button[data-action="toggleEquip"][data-item-id="${id}"]`);
}

describe('backpack equip toggle (#332)', () => {
    it('renders an equip toggle for every equippable carried item', () => {
        const root = render([EQUIPPED_GEAR, STOWED_GEAR, AMMO]);
        expect(root.querySelectorAll('button[data-action="toggleEquip"]')).toHaveLength(2);
        expect(toggleFor(root, 'g1')).not.toBeNull();
        expect(toggleFor(root, 'g2')).not.toBeNull();
    });

    it('does NOT render a toggle for a non-equippable carried item (no system.state)', () => {
        const root = render([AMMO]);
        expect(toggleFor(root, 'a1')).toBeNull();
        expect(root.querySelectorAll('button[data-action="toggleEquip"]')).toHaveLength(0);
    });

    it('shows Unequip + fa-toggle-on for an equipped item', () => {
        const btn = toggleFor(render([EQUIPPED_GEAR]), 'g1');
        expect(btn?.getAttribute('title')).toBe('Unequip');
        expect(btn?.querySelector('i')?.className).toContain('fa-toggle-on');
    });

    it('shows Equip + fa-toggle-off for an unequipped item', () => {
        const btn = toggleFor(render([STOWED_GEAR]), 'g2');
        expect(btn?.getAttribute('title')).toBe('Equip');
        expect(btn?.querySelector('i')?.className).toContain('fa-toggle-off');
    });
});
