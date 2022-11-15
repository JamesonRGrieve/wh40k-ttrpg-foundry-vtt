import { recursiveUpdate } from '../rolls/roll-helpers.mjs';
import { PsychicRollData } from '../rolls/roll-data.mjs';
import { performAttack } from '../actions/actions-manager.mjs';

export class PsychicPowerDialog extends FormApplication {
    /**
     * @param psychicRollData {PsychicRollData}
     */
    constructor(psychicRollData = {}, options = {}) {
        super(psychicRollData, options);
        this.data = psychicRollData;
        this.initialized = false;
    }

    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            title: 'Psychic Power',
            id: 'dh-psychic-power-dialog',
            template: 'systems/dark-heresy-2nd/templates/prompt/psychic-power-roll-prompt.hbs',
            width: 500,
            closeOnSubmit: false,
            submitOnChange: true,
            classes: ['dialog'],
        });
    }

    activateListeners(html) {
        super.activateListeners(html);
        html.find('.power-select').change(async (ev) => await this._updatePower(ev));
        html.find('#power-roll').click(async (ev) => await this._rollPower(ev));
        html.find('#power-cancel').click(async (ev) => await this._cancelPower(ev));
    }

    async _updatePower(event) {
        this.data.selectPower(event.target.name);
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
        recursiveUpdate(this.data, formData);
        this.render(true);
    }

    async _cancelPower(event) {
        await this.close();
    }

    async _rollPower(event) {
        await this.data.finalize();
        const attackData = new AttackData();
        attackData.rollData = this.data;
        await performAttack(attackData);
        await this.close();
    }
}

/**
 * @param rollData {PsychicRollData}
 */
export async function preparePsychicPowerRoll(rollData) {
    const prompt = new PsychicPowerDialog(rollData);
    prompt.render(true);
}
