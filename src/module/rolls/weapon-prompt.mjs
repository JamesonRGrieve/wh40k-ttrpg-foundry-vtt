import { rollDifficulties } from './roll-difficulties.mjs';
import { weaponRoll } from './weapon-roll.mjs';
import { combatActions } from '../rules/combat-actions.mjs';

export class WeaponAttackDialog extends FormApplication {
    constructor(attackData = {}, options = {}) {
        super(attackData, options);
        this.data = attackData;
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

    _updateBaseTarget() {
        if (this.data.weapon.isRanged) {
            this.data.baseTarget = this.data.actor?.characteristics?.ballisticSkill?.total ?? 0;
        } else {
            this.data.baseTarget = this.data.actor?.characteristics?.weaponSkill?.total ?? 0;
        }
    }

    async _updateWeapon(event) {
        console.log('Weapon Change', event);
        this.data.weapons
            .filter(weapon => weapon.id !== event.target.name)
            .forEach(weapon => weapon.isSelected = false);

        const weapon = this.data.weapons.find(weapon => weapon.id === event.target.name);
        weapon.isSelected = true;
        this.data.weapon = weapon;
        this._updateAvailableActions();
        this._updateAction();
        this._updateBaseTarget();

        this.render(true);
    }

    _recalculateWeaponMods() {

    }

    _updateAvailableActions() {
        this.data.actions = {};
        this.availableActions = combatActions()
            .filter(action => action.subtype.includes('Attack'))
            .filter(action => {
                if (this.data.weapon.isRanged) {
                    return action.subtype.includes('Ranged');
                } else {
                    return action.subtype.includes('Melee');
                }
            });
        for (let action of this.availableActions) {
            this.data.actions[action.name] = action.name;
        }
        // If action no longer exists -- set to first available
        if (!Object.keys(this.data.actions).find(a => a === this.data.action)) {
            this.data.action = this.data.actions[Object.keys(this.data.actions)[0]];
        }
    }

    _updateAction() {
        const currentAction = this.availableActions.find(a => a.name === this.data.action);
        if (currentAction?.attack?.modifier) {
            this.data.attackModifier = currentAction.attack.modifier;
        } else {
            this.data.attackModifier = 0;
        }
    }

    async getData() {
        // Initial Values
        if (!this.initialized) {
            this.data.baseTarget = 0;
            this.data.attackModifier = 0;
            this.data.difficulty = 0;
            this.data.modifier = 0;

            this.data.weaponSelect = this.data.weapons.length > 1;

            const firstWeapon = this.data.weapons[0];
            this.data.weapon = firstWeapon;
            firstWeapon.isSelected = true;
            this.initialized = true;
        }

        this._updateAvailableActions();
        this._updateAction();
        this._updateBaseTarget();
        return this.data;
    }

    async _updateObject(event, formData) {
        for (let key of Object.keys(formData)) {
            this.data[key] = formData[key];
        }
        this.render(true);
    }

    async _cancelAttack(event) {
        await this.close();
    }

    async _rollAttack(event) {
        await weaponRoll(this.data);
        await this.close();
    }

}

export async function prepareWeaponRoll(rollData) {
    rollData.difficulties = rollDifficulties();
    const prompt = new WeaponAttackDialog(rollData);
    prompt.render(true);
}
