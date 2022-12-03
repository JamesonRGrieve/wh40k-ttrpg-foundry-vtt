import { recursiveUpdate } from '../rolls/roll-helpers.mjs';
import { PsychicRollData } from '../rolls/roll-data.mjs';
import { PsychicActionData } from '../rolls/action-data.mjs';

export class PsychicPowerDialog extends FormApplication {
    /**
     * @param psychicAttackData {PsychicActionData}
     */
    constructor(psychicAttackData = {}, options = {}) {
        super(psychicAttackData.rollData, options);
        this.psychicAttackData = psychicAttackData;
        this.data = psychicAttackData.rollData;
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
        game.dh.log('_updateObject', { event, formData });
        recursiveUpdate(this.data, formData);
        await this.data.update();
        this.render(true);
    }

    async _cancelPower(event) {
        await this.close();
    }

    async _rollPower(event) {
        await this.data.finalize();
        await this.psychicAttackData.performActionAndSendToChat();
        await this.close();
    }
}

/**
 * @param psychicAttackData {PsychicActionData}
 */
export async function preparePsychicPowerRoll(psychicAttackData) {
    const prompt = new PsychicPowerDialog(psychicAttackData);
    prompt.render(true);
}
