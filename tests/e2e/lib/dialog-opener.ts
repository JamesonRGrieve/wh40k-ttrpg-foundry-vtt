import type { Page } from '@playwright/test';

/** How long the opener may take to put its application on screen. */
const OPEN_TIMEOUT_MS = 5_000;
/** Poll interval while waiting for the opened application to render. */
const OPEN_POLL_MS = 20;

/** The slice of an ApplicationV2 instance the dialog specs drive. */
export interface OpenedDialog {
    element: HTMLElement | null;
    /** ApplicationV2's `state === RENDERED` — true only once the content is in place. */
    readonly rendered: boolean;
    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 close returns Promise<this> with no shipped types
    close: () => Promise<unknown>;
}

declare global {
    /**
     * Run `open` (a call to a dialog module's `open…Dialog(...)` export) and
     * resolve to the application it put on screen — the new window whose root
     * carries `rootClass` (each dialog's own class, which matches its module's
     * file name). Installed per page by {@link installDialogOpener}.
     */
    // eslint-disable-next-line no-var -- a global installed at runtime must be declared with `var` to land on globalThis
    var wh40kOpenDialog: (rootClass: string, open: () => void) => Promise<OpenedDialog>;
}

/**
 * Install `globalThis.wh40kOpenDialog` on every document the page loads.
 *
 * The GM dialogs export only an `open…Dialog()` opener (#516) — the class is
 * module-private — so a spec opens a dialog the way the game does: call the
 * opener, then take the new entry from `foundry.applications.instances` (V14's
 * registry, populated when the application starts rendering) once it reports
 * fully rendered. Installed as an init script because `page.evaluate` bodies cannot
 * close over Node-side helpers.
 * @param {Page} page  The spec's page.
 * @returns {Promise<void>}
 */
export async function installDialogOpener(page: Page): Promise<void> {
    await page.addInitScript(
        ({ timeoutMs, pollMs }) => {
            globalThis.wh40kOpenDialog = async (rootClass, open) => {
                const instances: Map<string, OpenedDialog> = foundry.applications.instances;
                const before = new Set(instances.keys());
                open();
                const deadline = Date.now() + timeoutMs;
                while (Date.now() < deadline) {
                    // Match on the dialog's own root class: other applications (the
                    // World Time widget, notifications) can open in the same window
                    // of time. And wait for RENDERED, not just an element: the frame
                    // can attach before an async `_prepareContext` (e.g. a cold
                    // compendium load) has filled the content in.
                    for (const [id, app] of instances) {
                        if (before.has(id) || !app.rendered) continue;
                        if (app.element instanceof HTMLElement && app.element.classList.contains(rootClass)) return app;
                    }
                    // eslint-disable-next-line no-await-in-loop -- sequential poll until the opener's render lands
                    await new Promise<void>((r) => {
                        setTimeout(r, pollMs);
                    });
                }
                throw new Error(`dialog opener rendered no new .${rootClass} application`);
            };
        },
        { timeoutMs: OPEN_TIMEOUT_MS, pollMs: OPEN_POLL_MS },
    );
}
