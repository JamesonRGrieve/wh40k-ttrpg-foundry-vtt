/**
 * Regression guard (#617, #620): the Combat tab's Armour | Movement row never clips
 * its contents.
 *
 * The row was a fixed two-column grid, so at the default sheet width each panel got
 * half of the left column: the armour silhouette (four columns, ~20rem) lost its
 * L.ARM / L.LEG locations off the right edge (#620), and a movement row's selected
 * check was pushed past the row's clipped edge (#617). The row now auto-fits: side by
 * side only when both panels have 20rem, else stacked; and the movement row's label
 * column may shrink, so the check keeps its place at the row's end.
 *
 * happy-dom has no layout, so this pins the rendered classes; the real geometry is
 * asserted in the stories and the Tier B spec (tests/e2e/combat-tab-layout.spec.ts).
 */

import Hbs from 'handlebars';
import { describe, expect, it } from 'vitest';
import combatStationSrc from '../src/templates/actor/panel/combat-station-panel.hbs?raw';
import movementRowSrc from '../src/templates/actor/partial/movement-stat-row.hbs?raw';
import { mockPlayerSheetContext } from '../stories/mocks/sheet-contexts';
import { initializeStoryHandlebars } from '../stories/template-support';

initializeStoryHandlebars();

const ARMOUR = { total: 4, items: [], tooltipData: '' };

function renderCombatTab(): HTMLElement {
    const root = document.createElement('div');
    root.innerHTML = Hbs.compile(combatStationSrc)({
        ...mockPlayerSheetContext({ systemId: 'dh2', activeTab: 'combat' }),
        armourDisplay: { head: ARMOUR, rightArm: ARMOUR, leftArm: ARMOUR, body: ARMOUR, rightLeg: ARMOUR, leftLeg: ARMOUR },
        equippedGear: [],
        hasForceField: false,
        combatMovement: { inCombat: true, disabled: false, selectedMode: 'run', remaining: 18 },
    });
    return root;
}

describe('Combat tab Armour | Movement row (#620)', () => {
    it('auto-fits the two panels instead of a fixed two-column grid', () => {
        const row = renderCombatTab().querySelector('[data-combat-armour-movement]');
        expect(row).not.toBeNull();
        expect(row?.classList.contains('tw-grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))]')).toBe(true);
        expect(row?.classList.contains('tw-grid-cols-2')).toBe(false);
    });

    it('holds all six armour locations and the movement panel', () => {
        const row = renderCombatTab().querySelector('[data-combat-armour-movement]');
        expect(row?.querySelectorAll('[data-location]').length).toBe(6);
        expect(row?.querySelector('[data-movement-type="run"]')).not.toBeNull();
    });
});

describe('movement row selected check (#617)', () => {
    it('lets the label column shrink so the check keeps its place at the row end', () => {
        const root = document.createElement('div');
        root.innerHTML = Hbs.compile(movementRowSrc)({
            label: 'Run',
            value: 18,
            active: true,
            action: 'setMovementMode',
            movementType: 'run',
            actionCost: '1',
        });
        const check = root.querySelector('[data-move-mode-selected]');
        expect(check).not.toBeNull();
        expect(check?.classList.contains('tw-shrink-0')).toBe(true);
        const labelColumn = root.querySelector('.tw-flex-1');
        expect(labelColumn?.classList.contains('tw-min-w-0')).toBe(true);
        // The check is the row's last laid-out child (only the absolute fill bar follows it).
        expect(check?.nextElementSibling?.classList.contains('tw-absolute')).toBe(true);
    });
});
