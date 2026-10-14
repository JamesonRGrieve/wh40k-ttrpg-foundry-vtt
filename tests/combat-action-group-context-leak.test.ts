/**
 * Regression (#245): the Combat Actions panel's block-only Reactions group showed a
 * third, unlabelled tile. `combat-action-group.hbs` iterated `items`, and a partial
 * inherits its caller's context, so with no `items` hash the group iterated the
 * SHEET's `items` (the actor's owned items). The partial now iterates
 * `groupEntries`, a name no sheet context defines.
 */

import HbsStory from 'handlebars';
import { describe, expect, it } from 'vitest';
import combatActionsPanelSrc from '../src/templates/actor/panel/combat-actions-panel.hbs?raw';
import { initializeStoryHandlebars } from '../stories/template-support';
import { readRepoFile } from './lib/repo-file.ts';

initializeStoryHandlebars();
const panel = HbsStory.compile(combatActionsPanelSrc);

interface PanelContext {
    system: { initiative: { total: number } };
    items: { id: string; name: string; type: string }[];
    combatTalents: never[];
    dh: { combatActions: { utility: { key: string; label: string; description: string; type: string; icon: string }[] } };
}

/** A sheet context carrying owned items, exactly what the block-only groups must never iterate. */
function sheetContext(): PanelContext {
    return {
        system: { initiative: { total: 9 } },
        items: [
            { id: 'owned-lasgun', name: 'Lasgun', type: 'weapon' },
            { id: 'owned-flak', name: 'Flak Armour', type: 'armour' },
        ],
        combatTalents: [],
        dh: { combatActions: { utility: [{ key: 'ready', label: 'Ready', description: 'Ready a stowed item.', type: 'half', icon: 'fa-tools' }] } },
    };
}

function render(): HTMLElement {
    const root = document.createElement('div');
    root.innerHTML = panel(sheetContext());
    return root;
}

describe('a block-only combat-action group renders only its own buttons (#245)', () => {
    it('the Reactions row is exactly Dodge and Parry, however many items the actor owns', () => {
        const grid = render().querySelector('[data-action="dodge"]')?.parentElement;
        expect(Array.from(grid?.querySelectorAll('button') ?? []).map((button) => button.dataset['action'])).toEqual(['dodge', 'parry']);
    });

    it('no owned item leaks into any group', () => {
        const root = render();
        expect(root.querySelector('[data-item-id="owned-lasgun"]')).toBeNull();
        expect(root.textContent).not.toContain('Lasgun');
        expect(root.textContent).not.toContain('Flak Armour');
    });

    it('the utility group still renders the entries it is given', () => {
        expect(render().querySelector('[data-action="vocalizeCombatAction"][data-action-key="ready"]')).not.toBeNull();
    });

    it('the partial iterates a hash name no sheet context defines, and every caller passes it by that name', () => {
        expect(readRepoFile('src/templates/actor/panel/combat-action-group.hbs')).toContain('{{#each groupEntries as |entry|}}');
        expect(readRepoFile('src/templates/actor/panel/combat-action-group.hbs')).not.toMatch(/\{\{#each items\b/);
        expect(combatActionsPanelSrc).not.toMatch(/combat-action-group\.hbs[^}]*\bitems=/);
    });
});
