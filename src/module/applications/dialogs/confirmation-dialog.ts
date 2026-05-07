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

interface ConfirmationConfig {
    title: string;
    content: string;
    confirmLabel: string;
    cancelLabel: string;
    rejectOnClose: boolean;
}

interface ConfirmationContext extends Record<string, unknown> {
    content: string;
    confirmLabel: string;
    cancelLabel: string;
}

export default class ConfirmationDialog extends HandlebarsApplicationMixin(ApplicationV2) {
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
            contentClasses: ['standard-form', 'tw-p-0', 'tw-bg-gradient-to-b', 'tw-from-[#1a1a24]', 'tw-to-[#0d0d12]'],
        },
        position: {
            width: 400,
            height: 'auto' as unknown as number,
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

    #config: ConfirmationConfig;
    #resolve: ((value: boolean) => void) | null = null;
    #resolved = false;

    /* -------------------------------------------- */
    /*  Construction                                */
    /* -------------------------------------------- */

    constructor(config: Partial<ConfirmationConfig> = {}, options: ApplicationV2Config.DefaultOptions = {}) {
        super(options as Record<string, unknown>);
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
    async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<ConfirmationContext> {
        const context = await super._prepareContext(options);
        return {
            ...context,
            content: this.#config.content,
            confirmLabel: this.#config.confirmLabel,
            cancelLabel: this.#config.cancelLabel,
        } as ConfirmationContext;
    }

    /* -------------------------------------------- */
    /*  Event Handlers                              */
    /* -------------------------------------------- */

    static async #onConfirm(this: ConfirmationDialog, event: PointerEvent, target: HTMLElement): Promise<void> {
        this.#resolved = true;
        this.#resolve?.(true);
        await this.close();
    }

    static async #onCancel(this: ConfirmationDialog, event: PointerEvent, target: HTMLElement): Promise<void> {
        this.#resolved = true;
        this.#resolve?.(false);
        await this.close();
    }

    /* -------------------------------------------- */
    /*  Lifecycle                                   */
    /* -------------------------------------------- */

    /** @override */
    async close(options?: Record<string, unknown>): Promise<unknown> {
        if (!this.#resolved && this.#resolve) {
            this.#resolve(false);
        }
        return super.close(options);
    }

    /* -------------------------------------------- */
    /*  Public API                                  */
    /* -------------------------------------------- */

    async wait(): Promise<boolean> {
        return new Promise((resolve) => {
            this.#resolve = resolve;
            void this.render(true);
        });
    }

    /* -------------------------------------------- */
    /*  Static Helper                               */
    /* -------------------------------------------- */

    static async confirm(config: Partial<ConfirmationConfig> = {}): Promise<boolean> {
        const dialog = new this(config);
        return dialog.wait();
    }
}
