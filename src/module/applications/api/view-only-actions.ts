/**
 * @file View-only actions on a locked document sheet (#629).
 *
 * Foundry's `DocumentSheetV2._toggleDisabled(true)` disables every form control
 * of a sheet the user cannot edit (a locked compendium document, another
 * player's actor). Most controls deserve that, but some only change what the
 * viewer sees — "Show Details", collapse/expand, a tab, opening a linked
 * document's own (equally locked) sheet. A disabled button receives no click, so
 * those went dead too and a compendium viewer could not read a weapon's details.
 *
 * A sheet class lists such actions in a static `VIEW_ONLY_ACTIONS` array, next to
 * the `DEFAULT_OPTIONS.actions` entries they name. Every class in the chain may
 * declare its own; the lists are unioned along the prototype chain the way
 * Foundry merges `DEFAULT_OPTIONS`, so a subclass never repeats its parents'.
 */

/** Actions Foundry dispatches itself and that never touch the document. */
const BUILT_IN_VIEW_ONLY_ACTIONS: readonly string[] = ['tab'];

/** A sheet class, or one of its ancestors, that may declare view-only actions. */
export interface ViewOnlyActionsDeclarer {
    readonly VIEW_ONLY_ACTIONS?: readonly string[];
}

/**
 * Every view-only action a sheet class and its ancestors declare, plus
 * Foundry's built-in ones. Only each class's OWN `VIEW_ONLY_ACTIONS` is read, so
 * an inherited static is not counted twice.
 */
export function collectViewOnlyActions(sheetClass: ViewOnlyActionsDeclarer): ReadonlySet<string> {
    const actions = new Set<string>(BUILT_IN_VIEW_ONLY_ACTIONS);
    // Every link of a class's prototype chain is a constructor (or Function.prototype), so each may carry the static.
    for (
        let current: ViewOnlyActionsDeclarer | null = sheetClass;
        current !== null;
        current = Object.getPrototypeOf(current) as ViewOnlyActionsDeclarer | null
    ) {
        if (!Object.hasOwn(current, 'VIEW_ONLY_ACTIONS')) continue;
        for (const action of current.VIEW_ONLY_ACTIONS ?? []) actions.add(action);
    }
    return actions;
}

/**
 * Re-enable the controls under `root` whose `data-action` is view-only, after
 * the framework disabled every control of a locked sheet. Controls bound to any
 * other action stay disabled.
 */
export function enableViewOnlyControls(root: ParentNode, viewOnlyActions: ReadonlySet<string>): void {
    for (const control of root.querySelectorAll<HTMLElement>('[data-action]')) {
        const action = control.dataset['action'];
        if (action === undefined || !viewOnlyActions.has(action)) continue;
        if (control instanceof HTMLButtonElement || control instanceof HTMLInputElement || control instanceof HTMLSelectElement) control.disabled = false;
    }
}
