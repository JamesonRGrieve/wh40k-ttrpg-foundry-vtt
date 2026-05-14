/**
 * @file DialogWH40K - Base dialog class for WH40K RPG
 * Based on dnd5e's Dialog5e pattern for Foundry V13+
 */

import type { ApplicationV2Ctor } from './application-types.ts';
import ApplicationV2Mixin from './application-v2-mixin.ts';

const { ApplicationV2 } = foundry.applications.api;

interface DialogButton {
    label: string;
    class?: string;
    // eslint-disable-next-line no-restricted-syntax -- boundary: DialogButton callback return type is unknown per Foundry's DialogV2 contract
    callback?: (event: SubmitEvent, button: HTMLButtonElement, dialog: HTMLElement) => unknown;
    default?: boolean;
}

/**
 * Base dialog class for creating WH40K dialogs.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2Mixin requires ApplicationV2Ctor; cast needed because Foundry's ApplicationV2 class shape doesn't match the constructor type exactly
export default class DialogWH40K extends ApplicationV2Mixin(ApplicationV2 as unknown as ApplicationV2Ctor) {
    // eslint-disable-next-line no-restricted-syntax -- boundary: Promise resolve/reject typed as unknown per Foundry dialog contract; callers cast to concrete type
    _resolve?: (value: unknown) => void;
    // eslint-disable-next-line no-restricted-syntax -- boundary: Promise reject reason is unknown per standard Promise contract
    _reject?: (reason?: unknown) => void;
    _submitted?: boolean;

    /** @override */
    static override DEFAULT_OPTIONS: Partial<ApplicationV2Config.DefaultOptions> = {
        tag: 'dialog',
        classes: ['wh40k-rpg', 'dialog', 'standard-form'],
        window: {
            contentTag: 'form',
        },
        position: {
            width: 400,
        },
        form: {
            closeOnSubmit: true,
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static override PARTS: Record<string, ApplicationV2Config.PartConfiguration> = {
        content: {
            template: 'systems/wh40k-rpg/templates/prompt/dialog-content.hbs',
        },
        footer: {
            template: 'templates/generic/form-footer.hbs',
        },
    };

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @inheritDoc */
    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2._prepareContext must return Record<string,unknown> per framework contract
    override async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<Record<string, unknown>> {
        const context = await super._prepareContext(options);
        const appOptions = this.options as { content?: string; buttons?: DialogButton[] };
        context['content'] = appOptions.content ?? '';
        context['buttons'] = appOptions.buttons?.map((button) => ({
            ...button,
            cssClass: button.class,
        }));
        return context;
    }

    /* -------------------------------------------- */

    /**
     * Wait for the dialog to be submitted or closed.
     * @returns {Promise<unknown>}
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: dialog wait() resolves with caller-typed value; unknown is correct for the generic API
    async wait(): Promise<unknown> {
        return new Promise((resolve, reject) => {
            this._resolve = resolve;
            this._reject = reject;
            // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 mixes EventTarget at runtime but TypeScript doesn't know; cast needed for addEventListener
            (this as unknown as EventTarget).addEventListener(
                'close',
                () => {
                    if (this._submitted !== true) resolve(null);
                },
                { once: true },
            );
            void this.render({ force: true });
        });
    }

    /* -------------------------------------------- */

    /**
     * Resolve the dialog with a result.
     * @param {unknown} result  The result to return.
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: resolve accepts unknown because callers type the result themselves after await
    resolve(result: unknown): void {
        this._submitted = true;
        this._resolve?.(result);
    }

    /* -------------------------------------------- */
    /*  Static Helper Methods                       */
    /* -------------------------------------------- */

    /**
     * A helper to create a simple confirmation dialog.
     * @param {object} options          Dialog options.
     * @param {string} options.title    Dialog title.
     * @param {string} options.content  Dialog content HTML.
     * @param {boolean} [options.defaultYes=true]  Whether "Yes" is the default button.
     * @returns {Promise<boolean|null>}
     */
    static async confirm({ title, content, defaultYes = true }: { title?: string; content?: string; defaultYes?: boolean } = {}): Promise<boolean | null> {
        return foundry.applications.api.DialogV2.confirm({
            window: { title },
            content,
            yes: { default: defaultYes },
            no: { default: !defaultYes },
            rejectClose: false,
        });
    }

    /**
     * A helper to create a simple prompt dialog.
     * @param {object} options              Dialog options.
     * @param {string} options.title        Dialog title.
     * @param {string} options.content      Dialog content HTML.
     * @param {string} [options.label]      Submit button label.
     * @param {Function} options.callback   Callback when submitted.
     * @returns {Promise<unknown>}
     */
    static async prompt({
        title,
        content,
        label = 'OK',
        callback,
    }: {
        title?: string;
        content?: string;
        label?: string;
        // eslint-disable-next-line no-restricted-syntax -- boundary: callback return type is unknown per Foundry's DialogV2.prompt contract
        callback?: (dialog: HTMLElement) => unknown;
        // eslint-disable-next-line no-restricted-syntax -- boundary: DialogV2.prompt return type is unknown; callers cast to concrete type
    } = {}): Promise<unknown> {
        return foundry.applications.api.DialogV2.prompt({
            window: { title },
            content,
            ok: {
                label,
                callback: (_event: SubmitEvent, _button: HTMLButtonElement, dialog: HTMLElement) => callback?.(dialog),
            },
            rejectClose: false,
        });
    }
}
