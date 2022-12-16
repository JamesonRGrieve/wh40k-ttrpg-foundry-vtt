import { prepareSimpleRoll } from '../prompts/simple-prompt.mjs';
import { SimpleSkillData } from '../rolls/action-data.mjs';
import { toCamelCase } from '../handlebars/handlebars-helpers.mjs';

export class DarkHeresyBaseActor extends Actor {

    async _preCreate(data, options, user) {
        await super._preCreate(data, options, user);
        let initData = {
            'token.bar1': { 'attribute': 'wounds' },
            'token.bar2': { 'attribute': 'fate' },
            'token.displayName': CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER,
            'token.displayBars': CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER,
            'token.disposition': CONST.TOKEN_DISPOSITIONS.NEUTRAL,
            'token.name': data.name,
        };
        if (data.type === 'vehicle') {
            initData['token.bar1'] = { 'attribute': 'integrity' };
            initData['token.bar2'] = undefined;
        }
        if (data.type === 'acolyte') {
            initData['token.vision'] = true;
            initData['token.actorLink'] = true;
        }
        this.updateSource(initData);
    }

    get characteristics() {
        return this.system.characteristics;
    }

    get initiative() {
        return this.system.initiative;
    }

    get wounds() {
        return this.system.wounds;
    }

    get size() {
        return Number.parseInt(this.system.size);
    }

    get movement() {
        return this.system.movement;
    }

    async prepareData() {
        await super.prepareData();
        this._computeCharacteristics();
        this._computeMovement();
    }

    async rollCharacteristic(characteristicName, override) {
        const characteristic = this.characteristics[characteristicName];

        const simpleSkillData = new SimpleSkillData();
        const rollData = simpleSkillData.rollData;
        rollData.actor = this;
        rollData.nameOverride = characteristic.label;
        rollData.type = override ? override : 'Characteristic';
        rollData.baseTarget = characteristic.total;
        rollData.modifiers.modifier = 0;
        await prepareSimpleRoll(simpleSkillData);
    }

    getCharacteristicFuzzy(char) {
        // This tries to account for case sensitivity and abbreviations
        for (const [name, characteristic] of Object.entries(this.characteristics)) {
            if (char.toUpperCase() === name.toUpperCase() || char.toLocaleString() === characteristic.short.toUpperCase()) {
                return characteristic;
            }
        }
    }

    _computeCharacteristics() {
        for (const [name, characteristic] of Object.entries(this.characteristics)) {
            characteristic.total = characteristic.base + characteristic.advance * 5 + characteristic.modifier;
            characteristic.bonus = Math.floor(characteristic.total / 10) + characteristic.unnatural;
        }

        this.initiative.bonus = this.characteristics[this.initiative.characteristic].bonus;
    }

    _computeMovement() {
        let agility = this.characteristics.agility;
        let size = this.size;
        this.system.movement = {
            half: agility.bonus + size - 4,
            full: (agility.bonus + size - 4) * 2,
            charge: (agility.bonus + size - 4) * 3,
            run: (agility.bonus + size - 4) * 6,
        };
    }

    _findCharacteristic(short) {
        for (let characteristic of Object.values(this.characteristics)) {
            if (characteristic.short === short) {
                return characteristic;
            }
        }
        return { total: 0 };
    }

    async addSpecialitySkill(skill, speciality) {
        const parent = this.system.skills[skill];
        const specialityKey = toCamelCase(speciality);

        if(parent.specialities[specialityKey]) {
            ui.notifications.warn(`Speciality already exists. Unable to create.`);
            return;
        }

        await this.update({
            system: {
                skills: {
                    [skill]: {
                        specialities:{
                            [specialityKey]: {
                                label: speciality,
                                advance: 0,
                                cost: 0,
                                taken: true,
                                custom: true
                            }
                        }
                    }
                }
            }
        });
    }

}
