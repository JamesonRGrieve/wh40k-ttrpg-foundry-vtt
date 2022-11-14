import { rollDifficulties } from '../rolls/roll-difficulties.mjs';
import { performRollAndSendToChat } from '../rolls/roll-manager.mjs';
import { calculateRange, recursiveUpdate } from '../rolls/roll-helpers.mjs';

export class PsychicPowerDialog extends FormApplication {
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

    _updateBaseTarget() {
        const characteristic = this.data.power.system.target.characteristic;
        this.data.baseTarget = 0;
        const actorCharacteristic = this.data.sourceActor.getCharacteristicFuzzy(characteristic);
        this.data.baseTarget = actorCharacteristic.total;
        this.data.baseChar = actorCharacteristic.short;
    }

    _updateOtherBonuses() {
        this.data.modifiers['bonus'] = 10 * Math.floor(this.data.sourceActor.psy.rating - this.data.pr);
        this.data.modifiers['focus'] = this.data.hasFocus ? 10 : 0;
    }

    async _updateRange() {
        console.log('Power Range Formula?', this.data.power.system.range)
        const rangeCalculation = new Roll(this.data.power.system.range, this.data);
        await rangeCalculation.evaluate({ async: true });

        console.log('Range roll?', rangeCalculation);
        const total = rangeCalculation.total ?? 0;

        const rangeData = calculateRange(total, this.data.distance, this.data.power);
        this.data.maxRange = total;
        this.data.rangeName = rangeData.name;

        // Psychic Abilities get no range bonus
        this.data.rangeBonus = 0;
    }

    async _updatePower(event) {
        console.log('Power Change', event);
        this.data.psychicPowers.filter((power) => power.id !== event.target.name).forEach((power) => (power.isSelected = false));

        const power = this.data.psychicPowers.find((power) => power.id === event.target.name);
        console.log('Power', power);
        power.isSelected = true;
        this.data.power = power;
        this.data.modifiers.bonus = power.system.target.bonus;
        this._updateBaseTarget();
        await this._updateRange();
        this.render(true);
    }

    async getData() {
        // Initial Values
        if (!this.initialized) {
            this.data.baseTarget = 0;
            this.data.modifiers['bonus'] = 0;
            this.data.modifiers['difficulty'] = 0;
            this.data.modifiers['modifier'] = 0;
            this.data.pr = this.data.sourceActor.psy.rating;
            this.data.hasFocus = !!this.data.sourceActor.psy.hasFocus;

            this.data.powerSelect = this.data.psychicPowers.length > 1;

            const firstPower = this.data.psychicPowers[0];
            this.data.power = firstPower;
            this.data.modifiers.bonus = this.data.power.system.target.bonus;
            await this._updateRange();

            firstPower.isSelected = true;
            this.initialized = true;
        }
        this._updateBaseTarget();
        this._updateOtherBonuses();
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
        await performRollAndSendToChat(this.data);
        await this.close();
    }
}

export async function preparePsychicPowerRoll(rollData) {
    rollData.difficulties = rollDifficulties();
    const prompt = new PsychicPowerDialog(rollData);
    prompt.render(true);
}
