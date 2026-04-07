/**
 * @file ConfirmationDialog - ApplicationV2 replacement for Dialog.confirm()
 * Provides a modern, consistent confirmation dialog UI
 *
 * Usage:
 *   const confirmed = await ConfirmationDialog.confirm({
 *     title: "Delete Item",
 *     content: "Are you sure you want to delete this item?",
 *     confirmLabel: "Delete",
 *     cancelLabel: "Cancel"
 *   });
 */

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export default class ConfirmationDialog extends HandlebarsApplicationMixin(ApplicationV2) {
    [key: string]: any;
    /* -------------------------------------------- */
    /*  Configuration                               */
    /* -------------------------------------------- */

    /** @override */
    static DEFAULT_OPTIONS = {
        id: 'confirmation-dialog-{id}',
        classes: ['wh40k-rpg', 'confirmation-dialog'],
        tag: 'div',
        window: {
            title: 'Confirm',
            icon: 'fa-solid fa-question-circle',
            minimizable: false,
            resizable: false,
            contentClasses: ['standard-form'],
        },
        position: {
            width: 400,
            height: 'auto' as const,
        },
        actions: {
            confirm: ConfirmationDialog.#onConfirm,
            cancel: ConfirmationDialog.#onCancel,
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        content: {
            template: 'systems/wh40k-rpg/templates/dialogs/confirmation.hbs',
        },
    };

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * Configuration for this dialog
     * @type {object}
     */
    #config = {};

    /**
     * Promise resolve function
     * @type {Function|null}
     */
    #resolve = null;

    /**
     * Whether the dialog has been resolved
     * @type {boolean}
     */
    #resolved = false;

    /* -------------------------------------------- */
    /*  Construction                                */
    /* -------------------------------------------- */

    /**
     * Create a confirmation dialog
     * @param {object} config         Dialog configuration
     * @param {string} [config.title]         Dialog window title
     * @param {string} [config.content]       Dialog content/message
     * @param {string} [config.confirmLabel]  Label for confirm button
     * @param {string} [config.cancelLabel]   Label for cancel button
     * @param {boolean} [config.rejectOnClose] Reject promise when closing via X button
     * @param {object} [options]      Application options
     */
    constructor(config = {}, options = {}) {
        super(options);
        this.#config = {
            // @ts-expect-error - dynamic property
            title: config.title || 'Confirm',
            // @ts-expect-error - dynamic property
            content: config.content || 'Are you sure?',
            // @ts-expect-error - dynamic property
            confirmLabel: config.confirmLabel || 'Confirm',
            // @ts-expect-error - dynamic property
            cancelLabel: config.cancelLabel || 'Cancel',
            // @ts-expect-error - dynamic property
            rejectOnClose: config.rejectOnClose ?? false,
        };
    }

    /* -------------------------------------------- */

    /** @override */
    get title() {
        // @ts-expect-error - dynamic property
        return this.#config.title;
    }

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @override */
    async _prepareContext(options: Record<string, unknown>): Promise<Record<string, unknown>> {
        // @ts-expect-error - argument type
        const context = await super._prepareContext(options);
        return {
            ...context,
            // @ts-expect-error - dynamic property
            content: this.#config.content,
            // @ts-expect-error - dynamic property
            confirmLabel: this.#config.confirmLabel,
            // @ts-expect-error - dynamic property
            cancelLabel: this.#config.cancelLabel,
        };
    }

    /* -------------------------------------------- */
    /*  Event Handlers                              */
    /* -------------------------------------------- */

    /**
     * Handle confirm button click
     * @this {ConfirmationDialog}
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async #onConfirm(this: any, event: Event, target: HTMLElement): Promise<void> {
        this.#resolved = true;
        this.#resolve?.(true);
        await this.close();
    }

    /* -------------------------------------------- */

    /**
     * Handle cancel button click
     * @this {ConfirmationDialog}
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async #onCancel(this: any, event: Event, target: HTMLElement): Promise<void> {
        this.#resolved = true;
        this.#resolve?.(false);
        await this.close();
    }

    /* -------------------------------------------- */
    /*  Lifecycle                                   */
    /* -------------------------------------------- */

    /** @override */
    // @ts-expect-error - override type
    async close(options: Record<string, unknown> = {}): Promise<void> {
        // If not already resolved (closed via X button), resolve as cancel
        if (!this.#resolved && this.#resolve) {
            this.#resolve(false);
        }
        // @ts-expect-error - type assignment
        return super.close(options);
    }

    /* -------------------------------------------- */
    /*  Public API                                  */
    /* -------------------------------------------- */

    /**
     * Wait for user response
     * @returns {Promise<boolean>}  True if confirmed, false if cancelled
     */
    async wait(): Promise<void> {
        return new Promise((resolve) => {
            this.#resolve = resolve;
            this.render(true);
        });
    }

    /* -------------------------------------------- */
    /*  Static Helper                               */
    /* -------------------------------------------- */

    /**
     * Show a confirmation dialog and wait for user response
     * @param {object} config         Dialog configuration
     * @param {string} [config.title]         Dialog window title
     * @param {string} [config.content]       Dialog content/message
     * @param {string} [config.confirmLabel]  Label for confirm button
     * @param {string} [config.cancelLabel]   Label for cancel button
     * @returns {Promise<boolean>}  True if confirmed, false if cancelled
     * @static
     *
     * @example
     * const confirmed = await ConfirmationDialog.confirm({
     *   title: "Delete Item",
     *   content: "Are you sure you want to delete this item?",
     *   confirmLabel: "Delete"
     * });
     * if (confirmed) {
     *   // Perform deletion
     * }
     */
    static async confirm(config: Record<string, unknown> = {}): Promise<any> {
        const dialog = new this(config);
        return dialog.wait();
    }
}
