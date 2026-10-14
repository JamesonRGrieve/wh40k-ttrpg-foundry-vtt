/**
 * Regression guard (#629): a locked sheet keeps its view-only controls usable.
 * Foundry disables every form control of a sheet the user cannot edit; these
 * helpers decide which `data-action` controls come back.
 */
import { describe, expect, it } from 'vitest';
import { collectViewOnlyActions, enableViewOnlyControls } from './view-only-actions.ts';

class Base {
    static VIEW_ONLY_ACTIONS: readonly string[] = ['toggleCollapsed'];
}
class Middle extends Base {}
class Leaf extends Middle {
    static override VIEW_ONLY_ACTIONS: readonly string[] = ['toggleBody'];
}

/** A locked sheet as Foundry leaves it: every control disabled. */
function lockedSheet(markup: string): HTMLElement {
    const root = document.createElement('section');
    root.innerHTML = markup;
    for (const control of root.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement>('button, input, select')) control.disabled = true;
    return root;
}

describe('collectViewOnlyActions', () => {
    it("unions every class's own list along the chain, with Foundry's built-in tab action", () => {
        expect([...collectViewOnlyActions(Leaf)].sort()).toEqual(['tab', 'toggleBody', 'toggleCollapsed']);
    });

    it('reads an intermediate class that declares nothing through to its ancestors', () => {
        expect([...collectViewOnlyActions(Middle)].sort()).toEqual(['tab', 'toggleCollapsed']);
    });

    it("gives a class with an empty list only Foundry's built-in tab action", () => {
        class Bare {
            static VIEW_ONLY_ACTIONS: readonly string[] = [];
        }
        expect([...collectViewOnlyActions(Bare)]).toEqual(['tab']);
    });
});

describe('enableViewOnlyControls', () => {
    it('re-enables only the controls bound to a view-only action', () => {
        const root = lockedSheet(`
            <button type="button" data-action="toggleBody">Show Details</button>
            <button type="button" data-action="deleteItem">Delete</button>
            <input type="checkbox" data-action="toggleBody" />
            <select data-action="toggleBody"><option>a</option></select>
            <input type="text" name="system.notes" />
        `);
        enableViewOnlyControls(root, collectViewOnlyActions(Leaf));

        const toggle = root.querySelector<HTMLButtonElement>('button[data-action="toggleBody"]');
        expect(toggle?.disabled).toBe(false);
        expect(root.querySelector<HTMLInputElement>('input[data-action="toggleBody"]')?.disabled).toBe(false);
        expect(root.querySelector<HTMLSelectElement>('select[data-action="toggleBody"]')?.disabled).toBe(false);
        expect(root.querySelector<HTMLButtonElement>('[data-action="deleteItem"]')?.disabled).toBe(true);
        expect(root.querySelector<HTMLInputElement>('input[name="system.notes"]')?.disabled).toBe(true);
    });

    it('leaves a sheet with no view-only controls fully locked', () => {
        const root = lockedSheet('<button type="button" data-action="rollDamage">Roll</button>');
        enableViewOnlyControls(root, collectViewOnlyActions(Base));
        expect(root.querySelector<HTMLButtonElement>('button')?.disabled).toBe(true);
    });
});
