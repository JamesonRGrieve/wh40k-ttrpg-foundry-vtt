/**
 * @file WeaponAttackDialog - V2 dialog for weapon attack configuration
 */

import BaseRollDialog from './base-roll-dialog.ts';

/**
 * Dialog for configuring weapon attacks.
 */
export default class WeaponAttackDialog extends BaseRollDialog {
    declare weaponAttackData: Record<string, any>;

    /**
     * @param {Record<string, any>} weaponActionData  The weapon action data.
     * @param {ApplicationV2Config.DefaultOptions} [options={}]                Dialog options.
     */
    constructor(weaponActionData: Record<string, any> = {}, options: ApplicationV2Config.DefaultOptions = {}) {
        super(weaponActionData.rollData, options);
        this.weaponAttackData = weaponActionData;
    }

    /* -------------------------------------------- */

    /** @override */
    static DEFAULT_OPTIONS: ApplicationV2Config.DefaultOptions = {
        ...BaseRollDialog.DEFAULT_OPTIONS,
        classes: ['weapon-attack'],
        actions: {
            ...BaseRollDialog.DEFAULT_OPTIONS.actions,
            selectWeapon: WeaponAttackDialog.#onSelectWeapon as unknown as ApplicationV2Config.DefaultOptions['actions'],
        },
        window: {
            title: 'Weapon Attack',
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS: Record<string, ApplicationV2Config.PartConfiguration> = {
        form: {
            template: 'systems/wh40k-rpg/templates/prompt/weapon-roll-prompt.hbs',
            classes: [],
            scrollable: [],
        },
    };

    /* -------------------------------------------- */
    /*  Event Listeners                             */
    /* -------------------------------------------- */

    /** @inheritDoc */
    async _onRender(context: Record<string, unknown>, options: ApplicationV2Config.RenderOptions): Promise<void> {
        await super._onRender(context, options);

        // Set up weapon selection listeners
        this.element.querySelectorAll('.weapon-select').forEach((el) => {
            el.addEventListener('change', this._onWeaponSelectChange.bind(this) as EventListener);
        });

        // Set up button listeners
        this.element.querySelector('#attack-roll')?.addEventListener('click', this._onAttackRoll.bind(this) as EventListener);
        this.element.querySelector('#attack-cancel')?.addEventListener('click', this._onAttackCancel.bind(this) as EventListener);
    }

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
     */
    async _onWeaponSelectChange(event: Event): Promise<void> {
        this.rollData.selectWeapon?.((event.target as HTMLInputElement).name);
        await this.rollData.update?.();
        void this.render();
    }

    /* -------------------------------------------- */

    /**
     * Handle attack roll button click.
     */
    async _onAttackRoll(event: Event): Promise<void> {
        event.preventDefault();
        await this._performRoll();
    }

    /* -------------------------------------------- */

    /**
     * Handle attack cancel button click.
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
     */
    static async #onSelectWeapon(this: WeaponAttackDialog, event: Event, target: HTMLElement): Promise<void> {
        (this.rollData as any).selectWeapon?.(target.getAttribute('name'));
        await this.rollData.update?.();
        void this.render();
    }

    /* -------------------------------------------- */
    /*  Roll Methods                                */
    /* -------------------------------------------- */

    /** @override */
    _validateRoll(): boolean {
        if ((this.rollData.fireRate as number) === 0) {
            ui.notifications.warn('Not enough ammo to perform action. Do you need to reload?');
            return false;
        }
        return true;
    }

    /* -------------------------------------------- */

    /** @override */
    async _performRoll(): Promise<void> {
        if (!this._validateRoll()) return;

        await this.rollData.finalize?.();
        await this.weaponAttackData.performActionAndSendToChat?.();
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
export function prepareWeaponRoll(weaponAttackData) {
    const prompt = new WeaponAttackDialog(weaponAttackData);
    prompt.render(true);
}
