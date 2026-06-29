import type { ApplicationV2Ctor } from '../api/application-types.ts';
import ApplicationV2Mixin, { setupNumberInputAutoSelect } from '../api/application-v2-mixin.ts';

const { ApplicationV2 } = foundry.applications.api;

/**
 * The finalize/dispatch contract every roll dialog drives on the roll button.
 * `_getRollData()` resolves this from wherever a subclass stores it (directly on
 * `rollData`, or nested on a wrapping `*AttackData` record), so the shared
 * `_performRoll()` sequence stays agnostic to the storage shape.
 */
export interface RollDispatch {
    finalize?: (() => Promise<void> | void) | undefined;
    performActionAndSendToChat?: (() => Promise<void> | void) | undefined;
}

/**
 * Base dialog class for roll prompts.
 * Provides common functionality for weapon, psychic, force field, and other roll dialogs.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2Mixin requires ApplicationV2Ctor; cast needed because Foundry's ApplicationV2 class shape doesn't match the constructor type exactly
export default class BaseRollDialog extends ApplicationV2Mixin(ApplicationV2 as unknown as ApplicationV2Ctor) {
    /**
     * @param {Record<string, unknown>} rollData     The roll data to configure.
     * @param {ApplicationV2Config.DefaultOptions} [options={}] Dialog options.
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: rollData accepts any roll configuration object; callers know the concrete shape
    constructor(rollData: Record<string, unknown> = {}, options: ApplicationV2Config.DefaultOptions = {}) {
        super(options);
        this.rollData = rollData;
        this.initialized = false;
    }

    /* -------------------------------------------- */

    /** @override */
    static override DEFAULT_OPTIONS: ApplicationV2Config.DefaultOptions = {
        tag: 'form',
        classes: ['wh40k-rpg', 'dialog', 'roll-dialog', 'standard-form'],
        /* eslint-disable @typescript-eslint/unbound-method -- ApplicationV2 action handlers: framework binds `this` at call time */
        actions: {
            roll: BaseRollDialog.#onRoll,
            cancel: BaseRollDialog.#onCancel,
        },
        form: {
            handler: BaseRollDialog.#onFormSubmit,
            submitOnChange: true,
            closeOnSubmit: false,
        },
        /* eslint-enable @typescript-eslint/unbound-method */
        position: {
            width: 500,
        },
        window: {
            resizable: false,
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static override PARTS: Record<string, ApplicationV2Config.PartConfiguration> = {
        form: {
            template: 'systems/wh40k-rpg/templates/prompt/base-roll-prompt.hbs',
            classes: [],
            scrollable: [],
        },
    };

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * The roll data being configured.
     * @type {object}
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: rollData holds any roll configuration shape; subclasses access known fields via type assertions
    rollData: Record<string, unknown>;

    /**
     * Whether the dialog has been initialized.
     * @type {boolean}
     */
    initialized: boolean;

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @inheritDoc */
    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2._prepareContext must return Record<string,unknown> per framework contract
    override async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<Record<string, unknown>> {
        // Initialize roll data on first render
        if (!this.initialized && typeof this.rollData['initialize'] === 'function') {
            (this.rollData['initialize'] as () => void)();
            this.initialized = true;
        }

        // Update roll data if it has an update method
        if (typeof this.rollData['update'] === 'function') {
            await (this.rollData['update'] as () => Promise<void>)();
        }

        const context = await super._prepareContext(options);
        return {
            ...context,
            ...this.rollData,
            rollData: this.rollData,
            dh: CONFIG.wh40k,
            isEditable: true,
        };
    }

    /* -------------------------------------------- */

    /** @inheritDoc */
    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2._onRender context is untyped framework parameter
    override async _onRender(context: Record<string, unknown>, options: ApplicationV2Config.RenderOptions): Promise<void> {
        await super._onRender(context, options);
        setupNumberInputAutoSelect(this.element);
    }

    /* -------------------------------------------- */
    /*  Form Handling                               */
    /* -------------------------------------------- */

    /**
     * Handle form submission - updates roll data with form values.
     * @param {SubmitEvent} event           The form submission event.
     * @param {HTMLFormElement} form  The form element.
     * @param {FormDataExtended} formData  The form data.
     */
    static async #onFormSubmit(this: BaseRollDialog, _event: SubmitEvent, _form: HTMLFormElement, formData: FormDataExtended): Promise<void> {
        const data = foundry.utils.expandObject(formData.object);
        // eslint-disable-next-line no-restricted-syntax -- boundary: formData.object is a Foundry framework type; expandObject returns unknown shape
        this._updateRollData(data as Record<string, unknown>);

        if (typeof this.rollData['update'] === 'function') {
            await (this.rollData['update'] as () => Promise<void>)();
        }

        // Re-render so the recomputed aggregate target and modifier lines reflect
        // the change. `submitOnChange` runs this handler but ApplicationV2 does
        // not re-render after a form submit on its own, so without this the
        // displayed target would stay stale when a modifier changes (#382).
        void this.render();
    }

    /* -------------------------------------------- */

    /**
     * Update roll data from form values. Override in subclasses for custom handling.
     * @param {object} formData  The expanded form data.
     * @protected
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: formData is expanded form data from Foundry's FormDataExtended; shape depends on the form fields
    _updateRollData(formData: Record<string, unknown>): void {
        foundry.utils.mergeObject(this.rollData, formData, { recursive: true });
    }

    /* -------------------------------------------- */
    /*  Action Handlers                             */
    /* -------------------------------------------- */

    /**
     * Handle roll button click.
     * @this {BaseRollDialog}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #onRoll(this: BaseRollDialog, _event: Event, _target: HTMLElement): Promise<void> {
        await this._performRoll();
    }

    /* -------------------------------------------- */

    /**
     * Handle cancel button click.
     * @this {BaseRollDialog}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #onCancel(this: BaseRollDialog, _event: Event, _target: HTMLElement): Promise<void> {
        await this.close();
    }

    /* -------------------------------------------- */

    /**
     * Resolve the finalize/dispatch contract for this dialog. The default reads
     * it straight off `rollData` (force-field / assign-damage shape); subclasses
     * that wrap their roll data in a `*AttackData` record override this hook.
     * @protected
     */
    _getRollData(): RollDispatch {
        // eslint-disable-next-line no-restricted-syntax -- boundary: rollData is an arbitrary roll-config record; RollDispatch is its finalize/dispatch view
        return this.rollData;
    }

    /* -------------------------------------------- */

    /**
     * Perform the roll action: validate, finalize the roll data, dispatch to
     * chat, then close. Shared across all roll dialogs; subclasses customise via
     * `_validateRoll()` and `_getRollData()` rather than overriding this.
     * @protected
     */
    async _performRoll(): Promise<void> {
        if (!this._validateRoll()) return;

        const dispatch = this._getRollData();
        await dispatch.finalize?.();
        await dispatch.performActionAndSendToChat?.();
        await this.close();
    }

    /* -------------------------------------------- */

    /**
     * Shared select→update→render handler for item-pick actions (weapon, power).
     * Calls the roll data's select callback with the chosen name, refreshes the
     * roll data, then re-renders the dialog.
     * @param rollData  The roll-config record exposing `selectFn` and `update`.
     * @param selectFn  The roll data's selection callback (e.g. `selectWeapon`).
     * @param name      The selected item's name.
     * @protected
     */
    async _onSelectItem(rollData: { update?: () => Promise<void> | void }, selectFn: ((name: string) => void) | undefined, name: string): Promise<void> {
        selectFn?.(name);
        await rollData.update?.();
        void this.render();
    }

    /* -------------------------------------------- */

    /**
     * Validate roll can be performed. Override in subclasses.
     * @returns {boolean}
     * @protected
     */
    _validateRoll(): boolean {
        return true;
    }
}
