/**
 * @file RighteousFuryDialog - Confirmation dialog for Righteous Fury
 */

import type { ApplicationV2Ctor } from '../api/application-types.ts';
import ApplicationV2Mixin from '../api/application-v2-mixin.ts';
import DialogResolution from '../dialogs/dialog-resolution.ts';

const { ApplicationV2 } = foundry.applications.api;

interface RighteousFuryDialogOptions {
    actor?: Actor;
    characteristic?: string;
    target?: number;
    weaponName?: string;
    isMelee?: boolean;
    onConfirm?: () => void | Promise<void>;
    onFail?: () => void | Promise<void>;
}

/**
 * Dialog for confirming Righteous Fury triggers.
 * Shows the confirmation roll (d100 vs BS/WS) and handles the result.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2Mixin requires a constructor type; Foundry's ApplicationV2 class does not match the ctor constraint directly
export default class RighteousFuryDialog extends ApplicationV2Mixin(ApplicationV2 as unknown as ApplicationV2Ctor) {
    /** Promise-resolution plumbing (#287); dismissal without a resolved roll yields false. */
    readonly #resolution = new DialogResolution<boolean>(false);

    /**
     * @param {RighteousFuryDialogOptions} options - Dialog options
     */
    constructor(options: RighteousFuryDialogOptions = {}) {
        super(options);
        if (options.actor !== undefined) this.actor = options.actor;
        if (options.characteristic !== undefined) this.characteristic = options.characteristic;
        if (options.target !== undefined) this.target = options.target;
        if (options.weaponName !== undefined) this.weaponName = options.weaponName;
        if (options.isMelee !== undefined) this.isMelee = options.isMelee;
        if (options.onConfirm !== undefined) this.onConfirm = options.onConfirm;
        if (options.onFail !== undefined) this.onFail = options.onFail;
        this.confirmationRoll = null;
        this.success = false;
        this.dos = 0;
    }

    /* -------------------------------------------- */

    /** @override */
    static override DEFAULT_OPTIONS = {
        tag: 'div',
        classes: ['wh40k-rpg', 'dialog', 'righteous-fury', 'standard-form'],
        /* eslint-disable @typescript-eslint/unbound-method -- ApplicationV2 actions accept method references and bind `this` itself */
        actions: {
            roll: RighteousFuryDialog.#onRoll,
            cancel: RighteousFuryDialog.#onCancel,
        },
        /* eslint-enable @typescript-eslint/unbound-method */
        position: {
            width: 400,
        },
        window: {
            title: 'WH40K.RighteousFury.Title',
            minimizable: false,
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static override PARTS = {
        form: {
            template: 'systems/wh40k-rpg/templates/prompt/righteous-fury-prompt.hbs',
            scrollable: [''],
        },
    };

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * The actor performing the RF
     * @type {Actor}
     */
    actor?: Actor;

    /**
     * The characteristic to test (WS or BS)
     * @type {string}
     */
    characteristic?: string;

    /**
     * Target number for confirmation
     * @type {number}
     */
    target: number = 0;

    /**
     * Name of the weapon
     * @type {string}
     */
    weaponName?: string;

    /**
     * Is this a melee weapon?
     * @type {boolean}
     */
    isMelee?: boolean;

    /**
     * Callback for successful confirmation
     * @type {Function}
     */
    onConfirm?: () => void | Promise<void>;

    /**
     * Callback for failed confirmation
     * @type {Function}
     */
    onFail?: () => void | Promise<void>;

    /**
     * The confirmation roll result
     * @type {Roll|null}
     */
    confirmationRoll: Roll | null;

    /**
     * Was the confirmation successful?
     * @type {boolean}
     */
    success: boolean;

    /**
     * Degrees of success
     * @type {number}
     */
    dos: number;

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @inheritDoc */
    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 _prepareContext is typed as Record<string, unknown> in Foundry's shipped typings
    override async _prepareContext(options: Record<string, unknown>): Promise<Record<string, unknown>> {
        const context = await super._prepareContext(options);
        return {
            ...context,
            actor: this.actor,
            characteristic: this.characteristic,
            target: this.target,
            weaponName: this.weaponName,
            isMelee: this.isMelee,
            confirmationRoll: this.confirmationRoll,
            success: this.success,
            dos: this.dos,
            hasRolled: this.confirmationRoll !== null,
        };
    }

    /* -------------------------------------------- */
    /*  Action Handlers                             */
    /* -------------------------------------------- */

    /**
     * Handle roll button click.
     * @this {RighteousFuryDialog}
     * @param {Event} event - Triggering click event
     * @param {HTMLElement} target - Button that was clicked
     */
    static async #onRoll(this: RighteousFuryDialog, _event: Event, _target: HTMLElement): Promise<void> {
        // Create confirmation roll (d100)
        this.confirmationRoll = new Roll('1d100', {});
        await this.confirmationRoll.evaluate();
        const rollTotal = this.confirmationRoll.total ?? 0;
        const targetNumber = this.target;

        // Check success
        this.success = rollTotal <= targetNumber;

        if (this.success) {
            // Calculate degrees of success
            this.dos = Math.floor(targetNumber / 10) - Math.floor(rollTotal / 10);
        }

        // Re-render to show result
        await this.render({ force: true });
    }

    /* -------------------------------------------- */

    /**
     * Handle cancel button click.
     * @this {RighteousFuryDialog}
     * @param {Event} event - Triggering click event
     * @param {HTMLElement} target - Button that was clicked
     */
    static async #onCancel(this: RighteousFuryDialog, _event: Event, _target: HTMLElement): Promise<void> {
        const rolled = this.confirmationRoll !== null;
        // Preserve the dual-callback adapter: onConfirm on a successful confirmation
        // roll, onFail on a failed one, neither when the dialog is cancelled unrolled.
        if (rolled && this.success) {
            await this.onConfirm?.();
        } else if (rolled) {
            await this.onFail?.();
        }
        // Route the boolean outcome through the shared resolver (#287). An unrolled
        // cancel resolves false, matching the close-dismissal default.
        this.#resolution.resolve(rolled && this.success);
        await this.close();
    }

    /* -------------------------------------------- */
    /*  Public API                                  */
    /* -------------------------------------------- */

    /**
     * Render the dialog and await its boolean outcome: true on a successful
     * confirmation roll, false on a failed one or a dismissal. Shares the
     * {@link DialogResolution} plumbing used by the other #287 dialogs.
     */
    async wait(): Promise<boolean> {
        const result = this.#resolution.track();
        // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 mixes EventTarget at runtime but TypeScript doesn't know; cast needed for addEventListener
        (this as unknown as EventTarget).addEventListener('close', () => this.#resolution.resolveDefault(), { once: true });
        void this.render({ force: true });
        return result;
    }
}

/* -------------------------------------------- */
/*  Helper Function                             */
/* -------------------------------------------- */

/**
 * Open a Righteous Fury confirmation dialog.
 * @param {object} options - Dialog options
 * @returns {Promise<boolean>} - True if confirmed, false if failed
 */
export async function promptRighteousFury(options: RighteousFuryDialogOptions): Promise<boolean> {
    return new RighteousFuryDialog(options).wait();
}
