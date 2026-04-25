/**
 * @file RighteousFuryDialog - Confirmation dialog for Righteous Fury
 */

import ApplicationV2Mixin from '../api/application-v2-mixin.ts';

const { ApplicationV2 } = foundry.applications.api;

interface RighteousFuryDialogOptions {
    actor?: Actor;
    characteristic?: string;
    target?: number;
    weaponName?: string;
    isMelee?: boolean;
    onConfirm?: Function;
    onFail?: Function;
}

/**
 * Dialog for confirming Righteous Fury triggers.
 * Shows the confirmation roll (d100 vs BS/WS) and handles the result.
 */
export default class RighteousFuryDialog extends ApplicationV2Mixin(ApplicationV2) {
    /**
     * @param {RighteousFuryDialogOptions} options - Dialog options
     */
    constructor(options: RighteousFuryDialogOptions = {}) {
        super(options);
        this.actor = options.actor;
        this.characteristic = options.characteristic;
        this.target = options.target;
        this.weaponName = options.weaponName;
        this.isMelee = options.isMelee;
        this.onConfirm = options.onConfirm;
        this.onFail = options.onFail;
        this.confirmationRoll = null;
        this.success = false;
        this.dos = 0;
    }

    /* -------------------------------------------- */

    /** @override */
    static DEFAULT_OPTIONS = {
        tag: 'div',
        classes: ['wh40k-rpg', 'dialog', 'righteous-fury', 'standard-form'],
        actions: {
            roll: RighteousFuryDialog.#onRoll,
            cancel: RighteousFuryDialog.#onCancel,
        },
        position: {
            width: 400,
        },
        window: {
            title: '⚡ Righteous Fury! ⚡',
            minimizable: false,
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
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
    actor;

    /**
     * The characteristic to test (WS or BS)
     * @type {string}
     */
    characteristic;

    /**
     * Target number for confirmation
     * @type {number}
     */
    target;

    /**
     * Name of the weapon
     * @type {string}
     */
    weaponName;

    /**
     * Is this a melee weapon?
     * @type {boolean}
     */
    isMelee;

    /**
     * Callback for successful confirmation
     * @type {Function}
     */
    onConfirm;

    /**
     * Callback for failed confirmation
     * @type {Function}
     */
    onFail;

    /**
     * The confirmation roll result
     * @type {Roll|null}
     */
    confirmationRoll;

    /**
     * Was the confirmation successful?
     * @type {boolean}
     */
    success;

    /**
     * Degrees of success
     * @type {number}
     */
    dos;

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @inheritDoc */
    async _prepareContext(options: Record<string, unknown>): Promise<Record<string, unknown>> {
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
    static async #onRoll(this: RighteousFuryDialog, event: Event, target: HTMLElement): Promise<void> {
        // Create confirmation roll (d100)
        this.confirmationRoll = new Roll('1d100', {});
        await this.confirmationRoll.evaluate();

        // Check success
        this.success = this.confirmationRoll.total <= this.target;

        if (this.success) {
            // Calculate degrees of success
            this.dos = Math.floor(this.target / 10) - Math.floor(this.confirmationRoll.total / 10);
        }

        // Re-render to show result
        await this.render(true);
    }

    /* -------------------------------------------- */

    /**
     * Handle cancel button click.
     * @this {RighteousFuryDialog}
     * @param {Event} event - Triggering click event
     * @param {HTMLElement} target - Button that was clicked
     */
    static async #onCancel(this: RighteousFuryDialog, event: Event, target: HTMLElement): Promise<void> {
        if (this.confirmationRoll && this.success && this.onConfirm) {
            await this.onConfirm();
        } else if (this.confirmationRoll && !this.success && this.onFail) {
            await this.onFail();
        }
        await this.close();
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
export async function promptRighteousFury(options) {
    return new Promise((resolve) => {
        const dialog = new RighteousFuryDialog({
            ...options,
            onConfirm: () => resolve(true),
            onFail: () => resolve(false),
        });
        dialog.render(true);
    });
}
