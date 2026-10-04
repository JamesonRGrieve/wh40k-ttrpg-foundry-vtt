/**
 * Foundry extends `Array.prototype` with `findSplice` (typed globally by
 * fvtt-types). happy-dom/vitest don't ship it at runtime, yet rule code such as
 * `updateAvailableCombatActions` and `updateAttackSpecials` calls it while pruning
 * entries. These helpers install a faithful polyfill matching Foundry's signature
 * for a suite's duration and remove it afterwards so it never leaks.
 */

function findSplicePolyfill<T>(this: T[], predicate: (value: T, index: number, obj: T[]) => boolean, replace?: T): T | null {
    const index = this.findIndex(predicate);
    if (index === -1) return null;
    const removed = this[index];
    if (replace === undefined) this.splice(index, 1);
    else this.splice(index, 1, replace);
    return removed ?? null;
}

/**
 * Install the polyfill when the runtime lacks `findSplice`.
 * @returns {boolean}  Whether it was installed — pass to {@link uninstallFindSplice}.
 */
export function installFindSplice(): boolean {
    if (typeof Array.prototype.findSplice === 'function') return false;
    Object.defineProperty(Array.prototype, 'findSplice', {
        configurable: true,
        writable: true,
        value: findSplicePolyfill,
    });
    return true;
}

/** Remove a polyfill {@link installFindSplice} installed; a no-op when it installed nothing. */
export function uninstallFindSplice(installed: boolean): void {
    if (!installed) return;
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- test teardown: remove the polyfill installFindSplice added so it doesn't leak into other suites.
    delete (Array.prototype as { findSplice?: typeof findSplicePolyfill }).findSplice;
}
