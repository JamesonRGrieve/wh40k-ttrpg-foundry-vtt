/**
 * @file WeaponAttackDialog - V2 dialog for weapon attack configuration
 */

import BaseRollDialog from './base-roll-dialog.ts';

interface WeaponRollData {
    selectWeapon?: (name: string) => void;
    update?: () => Promise<void>;
    finalize?: () => Promise<void>;
    fireRate?: number;
}

interface WeaponAttackData {
    rollData: WeaponRollData;
    performActionAndSendToChat?: () => Promise<void>;
}

/**
 * Dialog for configuring weapon attacks.
 */
export default class WeaponAttackDialog extends BaseRollDialog {
    declare weaponAttackData: WeaponAttackData;

    /**
     * @param {WeaponAttackData} weaponActionData  The weapon action data.
     * @param {ApplicationV2Config.DefaultOptions} [options={}]                Dialog options.
     */
    constructor(weaponActionData: WeaponAttackData = { rollData: {} }, options: ApplicationV2Config.DefaultOptions = {}) {
        // eslint-disable-next-line no-restricted-syntax -- boundary: BaseRollDialog accepts an arbitrary roll-config record
        super(weaponActionData.rollData as Record<string, unknown>, options);
        this.weaponAttackData = weaponActionData;
    }

    /* -------------------------------------------- */

    /** @override */
    static override DEFAULT_OPTIONS: ApplicationV2Config.DefaultOptions = {
        ...BaseRollDialog.DEFAULT_OPTIONS,
        classes: ['weapon-attack'],
        actions: {
            ...BaseRollDialog.DEFAULT_OPTIONS.actions,
            // eslint-disable-next-line @typescript-eslint/unbound-method -- ApplicationV2 actions accept method references and bind `this` itself
            selectWeapon: WeaponAttackDialog.#onSelectWeapon,
        },
        window: {
            // eslint-disable-next-line no-restricted-syntax -- i18n: WH40K localization key resolved at runtime; rule fires on any literal in this position
            title: 'WH40K.Roll.WeaponAttack',
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static override PARTS: Record<string, ApplicationV2Config.PartConfiguration> = {
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
    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 _onRender accepts untyped context record
    override async _onRender(context: Record<string, unknown>, options: ApplicationV2Config.RenderOptions): Promise<void> {
        await super._onRender(context, options);

        // Set up weapon selection listeners
        this.element.querySelectorAll('.weapon-select').forEach((el) => {
            el.addEventListener('change', (e) => void this._onWeaponSelectChange(e));
        });

        // Set up button listeners
        this.element.querySelector('#attack-roll')?.addEventListener('click', (e) => void this._onAttackRoll(e));
        this.element.querySelector('#attack-cancel')?.addEventListener('click', (e) => void this._onAttackCancel(e));
    }

    /* -------------------------------------------- */

    /**
     * Handle weapon selection change.
     */
    async _onWeaponSelectChange(event: Event): Promise<void> {
        const data = this.weaponAttackData.rollData;
        if (typeof data.selectWeapon === 'function') data.selectWeapon((event.target as HTMLInputElement).name);
        if (typeof data.update === 'function') await data.update();
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
    static async #onSelectWeapon(this: WeaponAttackDialog, _event: Event, target: HTMLElement): Promise<void> {
        this.weaponAttackData.rollData.selectWeapon?.(target.getAttribute('name') ?? '');
        await this.weaponAttackData.rollData.update?.();
        void this.render();
    }

    /* -------------------------------------------- */
    /*  Roll Methods                                */
    /* -------------------------------------------- */

    /** @override */
    override _validateRoll(): boolean {
        if (this.weaponAttackData.rollData.fireRate === 0) {
            // eslint-disable-next-line no-restricted-syntax -- TODO: needs WH40K.Weapon.NotEnoughAmmo localization key
            ui.notifications.warn('Not enough ammo to perform action. Do you need to reload?');
            return false;
        }
        return true;
    }

    /* -------------------------------------------- */

    /** @override */
    override async _performRoll(): Promise<void> {
        if (!this._validateRoll()) return;

        await this.weaponAttackData.rollData.finalize?.();
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
export function prepareWeaponRoll(weaponAttackData: WeaponAttackData): void {
    const prompt = new WeaponAttackDialog(weaponAttackData);
    void prompt.render({ force: true });
}
