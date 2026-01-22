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
    /* -------------------------------------------- */
    /*  Configuration                               */
    /* -------------------------------------------- */

    /** @override */
    static DEFAULT_OPTIONS = {
        id: 'confirmation-dialog-{id}',
        classes: ['rogue-trader', 'confirmation-dialog'],
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
            height: 'auto',
        },
        actions: {
            confirm: this.#onConfirm,
            cancel: this.#onCancel,
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        content: {
            template: 'systems/rogue-trader/templates/dialogs/confirmation.hbs',
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
            title: config.title || 'Confirm',
            content: config.content || 'Are you sure?',
            confirmLabel: config.confirmLabel || 'Confirm',
            cancelLabel: config.cancelLabel || 'Cancel',
            rejectOnClose: config.rejectOnClose ?? false,
        };
    }

    /* -------------------------------------------- */

    /** @override */
    get title() {
        return this.#config.title;
    }

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @override */
    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        return {
            ...context,
            content: this.#config.content,
            confirmLabel: this.#config.confirmLabel,
            cancelLabel: this.#config.cancelLabel,
        };
    }

    /* -------------------------------------------- */
    /*  Event Handlers                              */
    /* -------------------------------------------- */

    /**
     * Handle confirm button click
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    async #onConfirm(event, target) {
        this.#resolved = true;
        this.#resolve?.(true);
        await this.close();
    }

    /* -------------------------------------------- */

    /**
     * Handle cancel button click
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    async #onCancel(event, target) {
        this.#resolved = true;
        this.#resolve?.(false);
        await this.close();
    }

    /* -------------------------------------------- */
    /*  Lifecycle                                   */
    /* -------------------------------------------- */

    /** @override */
    async close(options = {}) {
        // If not already resolved (closed via X button), resolve as cancel
        if (!this.#resolved && this.#resolve) {
            this.#resolve(false);
        }
        return super.close(options);
    }

    /* -------------------------------------------- */
    /*  Public API                                  */
    /* -------------------------------------------- */

    /**
     * Wait for user response
     * @returns {Promise<boolean>}  True if confirmed, false if cancelled
     */
    async wait() {
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
    static async confirm(config = {}) {
        const dialog = new this(config);
        return dialog.wait();
    }
}
