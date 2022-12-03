import { recursiveUpdate } from '../rolls/roll-helpers.mjs';
import { WeaponActionData } from '../rolls/action-data.mjs';

export class WeaponAttackDialog extends FormApplication {
    /**
     * @param weaponAttackData {WeaponActionData}
     * @param options
     */
    constructor(weaponAttackData = {}, options = {}) {
        super(weaponAttackData, options);
        this.weaponAttackData = weaponAttackData;
        this.data = weaponAttackData.rollData;
        this.initialized = false;
    }

    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            title: 'Weapon Attack',
            id: 'dh-weapon-attack-dialog',
            template: 'systems/dark-heresy-2nd/templates/prompt/weapon-roll-prompt.hbs',
            width: 500,
            closeOnSubmit: false,
            submitOnChange: true,
            classes: ['dialog'],
        });
    }

    activateListeners(html) {
        super.activateListeners(html);
        html.find('.weapon-select').change(async (ev) => await this._updateWeapon(ev));
        html.find('#attack-roll').click(async (ev) => await this._rollAttack(ev));
        html.find('#attack-cancel').click(async (ev) => await this._cancelAttack(ev));
    }

    async _updateWeapon(event) {
        this.data.selectWeapon(event.target.name);
        await this.data.update();
        this.render(true);
    }

    async getData() {
        // Initial Values
        if (!this.initialized) {
            this.data.initialize();
            this.initialized = true;
        }
        await this.data.update();
        return this.data;
    }

    async _updateObject(event, formData) {
        game.dh.log('_updateObject', { event, formData });
        recursiveUpdate(this.data, formData);
        game.dh.log('_updateObject complete', { 'data': this.data, formData });
        await this.data.update();
        this.render(true);
    }

    async _cancelAttack(event) {
        await this.close();
    }

    async _rollAttack(event) {
        if(this.data.fireRate === 0) {
            ui.notifications.warn(`Not enough ammo to perform action. Do you need to reload?`);
            return;
        }

        await this.data.finalize();
        await this.weaponAttackData.performActionAndSendToChat();
        await this.close();
    }
}

/**
 *
 * @param weaponAttackData {WeaponActionData}
 */
export async function prepareWeaponRoll(weaponAttackData) {
    const prompt = new WeaponAttackDialog(weaponAttackData);
    prompt.render(true);
}
