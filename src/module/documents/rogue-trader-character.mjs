import { prepareSimpleRoll } from '../prompts/simple-prompt.mjs';
import { SimpleSkillData } from '../rolls/action-data.mjs';
import { RogueTraderBaseActor } from './base-actor.mjs';

export class RogueTraderCharacter extends RogueTraderBaseActor {
    get skills() {
        return this.system.skills;
    }

    get fatigue() {
        return this.system.fatigue;
    }

    async prepareData() {
        await super.prepareData();
        this._computeSkills();
    }

    async rollSkill(skillName) {
        const skill = this.skills[skillName];
        if (!skill) return;

        const simpleSkillData = new SimpleSkillData();
        const rollData = simpleSkillData.rollData;
        rollData.actor = this;
        rollData.nameOverride = skill.label;
        rollData.type = 'Skill';
        rollData.baseTarget = skill.target;
        rollData.modifiers.modifier = 0;
        await prepareSimpleRoll(simpleSkillData);
    }

    _computeCharacteristics() {
        const fatiguePenalty = this.fatigue?.penaltyActive ? 10 : 0;
        if (this.fatigue) {
            this.fatigue.penalty = fatiguePenalty;
        }

        for (const characteristic of Object.values(this.characteristics)) {
            const starting = Number.parseInt(characteristic.starting ?? 0, 10);
            const advances = Number.parseInt(characteristic.advances ?? 0, 10);
            const modifier = Number.parseInt(characteristic.modifier ?? 0, 10);

            characteristic.total = starting + advances + modifier - fatiguePenalty;
            characteristic.bonus = Math.floor(characteristic.total / 10);
        }

        if (this.fatigue && this.characteristics.toughness?.bonus !== undefined) {
            this.fatigue.max = this.characteristics.toughness.bonus;
        }
    }

    _computeSkills() {
        for (const skill of Object.values(this.skills)) {
            const characteristic = this.characteristics[skill.characteristic];
            const characteristicTotal = characteristic?.total ?? 0;
            const rank10 = skill.rank10 ? 10 : 0;
            const rank20 = skill.rank20 ? 20 : 0;
            const talentBonus = Number.parseInt(skill.talentBonus ?? 0, 10);
            const otherBonus = Number.parseInt(skill.otherBonus ?? 0, 10);

            if (skill.advanced && !skill.trained) {
                skill.target = 0;
                continue;
            }

            const base = skill.trained ? characteristicTotal : Math.floor(characteristicTotal / 2);
            skill.target = base + rank10 + rank20 + talentBonus + otherBonus;
        }
    }
}
