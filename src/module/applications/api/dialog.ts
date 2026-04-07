/**
 * @file DialogWH40K - Base dialog class for WH40K RPG
 * Based on dnd5e's Dialog5e pattern for Foundry V13+
 */

import ApplicationV2Mixin from './application-v2-mixin.ts';

const { ApplicationV2 } = foundry.applications.api;

/**
 * Base dialog class for creating WH40K dialogs.
 */
export default class DialogWH40K extends ApplicationV2Mixin(ApplicationV2) {
    [key: string]: any;
    /** @override */
    static DEFAULT_OPTIONS: Partial<ApplicationV2Config.DefaultOptions> = {
        tag: 'dialog',
        classes: ['wh40k-rpg', 'dialog', 'standard-form'],
        window: {
            contentTag: 'form',
            contentClasses: ['standard-form'],
            minimizable: false,
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
    static PARTS: Record<string, ApplicationV2Config.PartConfiguration> = {
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
    async _prepareContext(options: Record<string, unknown>): Promise<Record<string, unknown>> {
        const context = await super._prepareContext(options);
        context.content = this.options.content ?? '';
        context.buttons = this.options.buttons?.map((button) => ({
            ...button,
            cssClass: button.class,
        }));
        return context;
    }

    /* -------------------------------------------- */

    /**
     * Wait for the dialog to be submitted or closed.
     * @returns {Promise<any>}
     */
    async wait(): Promise<any> {
        return new Promise((resolve, reject) => {
            this._resolve = resolve;
            this._reject = reject;
            this.addEventListener(
                'close',
                () => {
                    if (!this._submitted) resolve(null);
                },
                { once: true },
            );
            this.render(true);
        });
    }

    /* -------------------------------------------- */

    /**
     * Resolve the dialog with a result.
     * @param {any} result  The result to return.
     */
    resolve(result: any): void {
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
     * @returns {Promise<any>}
     */
    static async prompt({ title, content, label = 'OK', callback }: { title?: string; content?: string; label?: string; callback?: Function } = {}): Promise<any> {
        return foundry.applications.api.DialogV2.prompt({
            window: { title },
            content,
            ok: {
                label,
                callback: (event, button, dialog) => callback?.(dialog),
            },
            rejectClose: false,
        });
    }
}
