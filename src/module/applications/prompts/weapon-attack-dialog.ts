/**
 * @file WeaponAttackDialog - V2 dialog for weapon attack configuration
 */

import BaseRollDialog from './base-roll-dialog.ts';

/**
 * Dialog for configuring weapon attacks.
 */
// @ts-expect-error - TS2417 static side inheritance
export default class WeaponAttackDialog extends BaseRollDialog {
    [key: string]: any;
    /**
     * @param {WeaponActionData} weaponActionData  The weapon action data.
     * @param {object} [options={}]                Dialog options.
     */
    constructor(weaponActionData = {}, options = {}) {
        super(weaponActionData.rollData, options);
        this.weaponAttackData = weaponActionData;
    }

    /* -------------------------------------------- */

    /** @override */
    static DEFAULT_OPTIONS = {
        classes: ['weapon-attack'],
        actions: {
            selectWeapon: WeaponAttackDialog.#onSelectWeapon,
        },
        window: {
            title: 'Weapon Attack',
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        form: {
            template: 'systems/wh40k-rpg/templates/prompt/weapon-roll-prompt.hbs',
            scrollable: [''],
        },
    };

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * The weapon action data.
     * @type {WeaponActionData}
     */
    weaponAttackData;

    /* -------------------------------------------- */
    /*  Event Listeners                             */
    /* -------------------------------------------- */

    /** @inheritDoc */
    async _onRender(context: Record<string, unknown>, options: Record<string, unknown>): Promise<void> {
        await super._onRender(context, options);

        // Auto-select number input values on focus for easy editing
        this.element.querySelectorAll('input[type="number"], input[data-dtype="Number"]').forEach((input) => {
            input.addEventListener('focus', (event) => {
                event.target.select();
            });
        });

        // Set up weapon selection listeners
        this.element.querySelectorAll('.weapon-select').forEach((el) => {
            el.addEventListener('change', this._onWeaponSelectChange.bind(this));
        });

        // Set up button listeners
        this.element.querySelector('#attack-roll')?.addEventListener('click', this._onAttackRoll.bind(this));
        this.element.querySelector('#attack-cancel')?.addEventListener('click', this._onAttackCancel.bind(this));
    }

    /* -------------------------------------------- */

    /**
     * Handle weapon selection change.
     * @param {Event} event  The change event.
     * @protected
     */
    async _onWeaponSelectChange(event: Event): Promise<void> {
        this.rollData.selectWeapon(event.target.name);
        await this.rollData.update();
        this.render();
    }

    /* -------------------------------------------- */

    /**
     * Handle attack roll button click.
     * @param {Event} event  The click event.
     * @protected
     */
    async _onAttackRoll(event: Event): Promise<void> {
        event.preventDefault();
        await this._performRoll();
    }

    /* -------------------------------------------- */

    /**
     * Handle attack cancel button click.
     * @param {Event} event  The click event.
     * @protected
     */
    async _onAttackCancel(event: Event): Promise<void> {
        event.preventDefault();
        await this.close();
    }

    /* -------------------------------------------- */
    /*  Action Handlers                             */
    /* -------------------------------------------- */

    /**
     * Handle weapon selection via action.
     * @this {WeaponAttackDialog}
     * @param {Event} event         Triggering event.
     * @param {HTMLElement} target  Element that triggered the action.
     */
    static async #onSelectWeapon(this: any, event: Event, target: HTMLElement): Promise<void> {
        this.rollData.selectWeapon(target.name);
        await this.rollData.update();
        this.render();
    }

    /* -------------------------------------------- */
    /*  Roll Methods                                */
    /* -------------------------------------------- */

    /** @override */
    _validateRoll(): boolean {
        if (this.rollData.fireRate === 0) {
            (ui.notifications as any).warn('Not enough ammo to perform action. Do you need to reload?');
            return false;
        }
        return true;
    }

    /* -------------------------------------------- */

    /** @override */
    async _performRoll(): Promise<void> {
        if (!this._validateRoll()) return;

        await this.rollData.finalize();
        await this.weaponAttackData.performActionAndSendToChat();
        await this.close();
    }
}

/* -------------------------------------------- */
/*  Helper Function                             */
/* -------------------------------------------- */

/**
 * Open a weapon attack dialog.
 * @param {WeaponActionData} weaponAttackData  The weapon action data.
 */
export async function prepareWeaponRoll(weaponAttackData) {
    const prompt = new WeaponAttackDialog(weaponAttackData);
    prompt.render(true);
}
