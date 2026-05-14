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

// eslint-disable-next-line no-restricted-syntax -- boundary: _prepareContext must return Record<string,unknown> per ApplicationV2 contract; ConfirmationContext adds typed fields on top
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
    static override DEFAULT_OPTIONS = {
        id: 'confirmation-dialog-{id}',
        classes: ['wh40k-rpg', 'confirmation-dialog'],
        tag: 'div',
        window: {
            icon: 'fa-solid fa-question-circle',
            minimizable: false,
            resizable: false,
            contentClasses: ['standard-form', 'tw-p-0', 'tw-bg-gradient-to-b', 'tw-from-[#1a1a24]', 'tw-to-[#0d0d12]'],
        },
        position: {
            width: 400,
            // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 position.height typed as number but 'auto' is a valid runtime value that Foundry handles
            height: 'auto' as unknown as number,
        },
        /* eslint-disable @typescript-eslint/unbound-method -- ApplicationV2 action handlers: framework binds `this` at call time */
        actions: {
            confirm: ConfirmationDialog.#onConfirm,
            cancel: ConfirmationDialog.#onCancel,
        },
        /* eslint-enable @typescript-eslint/unbound-method */
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

    readonly #config: ConfirmationConfig;
    #resolve: ((value: boolean) => void) | null = null;
    #resolved = false;

    /* -------------------------------------------- */
    /*  Construction                                */
    /* -------------------------------------------- */

    constructor(config: Partial<ConfirmationConfig> = {}, options: ApplicationV2Config.DefaultOptions = {}) {
        // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 super() constructor accepts options as Record<string,unknown>; typed DefaultOptions requires cast
        super(options as Record<string, unknown>);
        this.#config = {
            title: config.title !== undefined && config.title !== '' ? config.title : 'Confirm',
            content: config.content !== undefined && config.content !== '' ? config.content : 'Are you sure?',
            confirmLabel: config.confirmLabel !== undefined && config.confirmLabel !== '' ? config.confirmLabel : 'Confirm',
            cancelLabel: config.cancelLabel !== undefined && config.cancelLabel !== '' ? config.cancelLabel : 'Cancel',
            rejectOnClose: config.rejectOnClose ?? false,
        };
    }

    /* -------------------------------------------- */

    /** @override */
    get title(): string {
        return this.#config.title;
    }

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @override */
    override async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<ConfirmationContext> {
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

    static async #onConfirm(this: ConfirmationDialog, _event: PointerEvent, _target: HTMLElement): Promise<void> {
        this.#resolved = true;
        this.#resolve?.(true);
        await this.close();
    }

    static async #onCancel(this: ConfirmationDialog, _event: PointerEvent, _target: HTMLElement): Promise<void> {
        this.#resolved = true;
        this.#resolve?.(false);
        await this.close();
    }

    /* -------------------------------------------- */
    /*  Lifecycle                                   */
    /* -------------------------------------------- */

    /** @override */
    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2.close() accepts untyped options; signature must match the framework override
    override async close(options?: Record<string, unknown>): Promise<unknown> {
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
