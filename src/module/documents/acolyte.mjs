import { prepareEnhancedSkillRoll } from '../applications/prompts/enhanced-skill-dialog.mjs';
import { DHTargetedActionManager } from '../actions/targeted-action-manager.mjs';
import { prepareDamageRoll } from '../prompts/damage-prompt.mjs';
import { SimpleSkillData } from '../rolls/action-data.mjs';
import { RogueTraderBaseActor } from './base-actor.mjs';
import { ForceFieldData } from '../rolls/force-field-data.mjs';
import { prepareForceFieldRoll } from '../prompts/force-field-prompt.mjs';
import { DHBasicActionManager } from '../actions/basic-action-manager.mjs';
import { getDegree, roll1d100 } from '../rolls/roll-helpers.mjs';
import { SYSTEM_ID } from '../hooks-manager.mjs';
import { RogueTraderSettings } from '../rogue-trader-settings.mjs';

const SKILL_ALIASES = {
    navigate: 'navigation',
};

/**
 * Actor document for Character (Acolyte) actors.
 * Handles roll methods, actions, and API surface.
 * Data preparation is handled by the CharacterData DataModel.
 * @extends {RogueTraderBaseActor}
 */
export class RogueTraderAcolyte extends RogueTraderBaseActor {

    /* -------------------------------------------- */
    /*  Getters                                     */
    /* -------------------------------------------- */

    get backpack() { return this.system.backpack; }
    get skills() { return this.system.skills; }
    get fatigue() { return this.system.fatigue; }
    get fate() { return this.system.fate; }
    get psy() { return this.system.psy; }
    get bio() { return this.system.bio; }
    get experience() { return this.system.experience; }
    get insanity() { return this.system.insanity; }
    get corruption() { return this.system.corruption; }
    get aptitudes() { return this.system.aptitudes; }
    get armour() { return this.system.armour; }
    get encumbrance() { return this.system.encumbrance; }
    get backgroundEffects() { return this.system.backgroundEffects; }
    get originPath() { return this.system.originPath; }
    get originPathItems() { return this.items.filter((item) => item.isOriginPath); }
    get navigatorPowers() { return this.items.filter((item) => item.isNavigatorPower); }
    get shipRoles() { return this.items.filter((item) => item.isShipRole); }
    get conditions() { return this.items.filter((item) => item.isCondition); }

    /* -------------------------------------------- */
    /*  Data Preparation                            */
    /* -------------------------------------------- */

    /**
     * Prepare data for the actor.
     * The DataModel handles base calculations via prepareDerivedData().
     * This method triggers item-based calculations via prepareEmbeddedData().
     * @override
     */
    prepareData() {
        // Initialize defaults before DataModel runs
        if (this.system.corruption == null) this.system.corruption = 0;
        if (this.system.insanity == null) this.system.insanity = 0;

        // Let the DataModel do base preparation first
        super.prepareData();

        // Now run item-based calculations (DataModel has access to this.parent.items)
        if (typeof this.system.prepareEmbeddedData === 'function') {
            this.system.prepareEmbeddedData();
        }
    }

    /* -------------------------------------------- */
    /*  Modifier Getters (delegate to DataModel)    */
    /* -------------------------------------------- */

    /**
     * Get the total modifier for a characteristic from all sources.
     * @param {string} charKey - The characteristic key
     * @returns {number} The total modifier
     */
    getTotalCharacteristicModifier(charKey) {
        return this.system._getTotalCharacteristicModifier?.(charKey) ?? 0;
    }

    /**
     * Get the total modifier for a skill from all sources.
     * @param {string} skillKey - The skill key
     * @returns {number} The total modifier
     */
    getTotalSkillModifier(skillKey) {
        return this.system._getTotalSkillModifier?.(skillKey) ?? 0;
    }

    /**
     * Get the total modifier for a combat stat from all sources.
     * @param {string} combatKey - The combat stat key
     * @returns {number} The total modifier
     */
    getTotalCombatModifier(combatKey) {
        return this.system._getTotalCombatModifier?.(combatKey) ?? 0;
    }

    /**
     * Get total wounds modifier from all sources.
     * @returns {number} The total wounds modifier
     */
    getTotalWoundsModifier() {
        return this.system.totalWoundsModifier ?? 0;
    }

    /**
     * Get total fate modifier from all sources.
     * @returns {number} The total fate modifier
     */
    getTotalFateModifier() {
        return this.system.totalFateModifier ?? 0;
    }

    /**
     * Get total movement modifier from all sources.
     * @returns {number} The total movement modifier
     */
    getTotalMovementModifier() {
        const sources = this.system.modifierSources?.movement || [];
        return sources.reduce((total, src) => total + (src.value || 0), 0);
    }

    /* -------------------------------------------- */
    /*  Roll Methods                                */
    /* -------------------------------------------- */

    async rollWeaponDamage(weapon) {
        if (!weapon.system.equipped) {
            ui.notifications.warn('Actor must have weapon equipped!');
            return;
        }
        await prepareDamageRoll({
            name: weapon.name,
            damage: weapon.system.damage,
            damageType: weapon.system.damageType,
            penetration: weapon.system.penetration,
            targetActor: () => {
                const targetedObjects = game.user.targets;
                if (targetedObjects && targetedObjects.size > 0) {
                    const target = targetedObjects.values().next().value;
                    return target.actor;
                }
            }
        });
    }

    async rollPsychicPowerDamage(power) {
        await prepareDamageRoll({
            psychicPower: true,
            pr: this.psy.currentRating,
            name: power.name,
            damage: power.system.damage,
            damageType: power.system.damageType,
            penetration: power.system.penetration,
        });
    }

    async rollSkill(skillName, specialityName) {
        const resolvedSkillName = this._resolveSkillName(skillName);
        let skill = this.skills[resolvedSkillName];
        if (!skill) {
            ui.notifications.warn(`Unable to find skill ${skillName}`);
            return;
        }
        let label = skill.label;

        if (specialityName !== undefined && Array.isArray(skill?.entries)) {
            const speciality = this._findSpecialistSkill(skill, specialityName);
            if (speciality) {
                skill = speciality;
                const specialityLabel = speciality.name ?? speciality.label ?? specialityName;
                label = `${label}: ${specialityLabel}`;
            }
        }

        const simpleSkillData = new SimpleSkillData();
        const rollData = simpleSkillData.rollData;
        rollData.actor = this;
        rollData.nameOverride = label;
        rollData.type = 'Skill';
        rollData.baseTarget = skill.current;
        rollData.modifiers.modifier = 0;
        await prepareEnhancedSkillRoll(simpleSkillData);
    }

    async rollItem(itemId) {
        game.rt.log('RollItem', itemId);
        const item = this.items.get(itemId);
        switch (item.type) {
            case 'weapon':
                if (!item.system.equipped) {
                    ui.notifications.warn('Actor must have weapon equipped!');
                    return;
                }
                if(game.settings.get(SYSTEM_ID, RogueTraderSettings.SETTINGS.simpleAttackRolls)) {
                    if(item.isRanged) {
                        await this.rollCharacteristic('ballisticSkill', item.name);
                    } else {
                        await this.rollCharacteristic('weaponSkill',  item.name);
                    }
                } else {
                    await DHTargetedActionManager.performWeaponAttack(this, null, item);
                }
                return;
            case 'psychicPower':
                if(game.settings.get(SYSTEM_ID, RogueTraderSettings.SETTINGS.simplePsychicRolls)) {
                    await this.rollCharacteristic('willpower',  item.name)
                } else {
                    await DHTargetedActionManager.performPsychicAttack(this, null, item);
                }
                return;
            case 'forceField':
                if (!item.system.equipped || !item.system.activated) {
                    ui.notifications.warn('Actor must have force field equipped and activated!');
                    return;
                }
                await prepareForceFieldRoll(new ForceFieldData(this, item));
                return;
            default:
                await DHBasicActionManager.sendItemVocalizeChat({
                    actor: this.name,
                    name: item.name,
                    type: item.type?.toUpperCase(),
                    description: await TextEditor.enrichHTML(item.system.benefit ?? item.system.description, {
                        rollData: {
                            actor: this,
                            item: item,
                            pr: this.psy.rating
                        }
                    }),
                });
        }
    }

    async damageItem(itemId) {
        const item = this.items.get(itemId);
        switch (item.type) {
            case 'weapon':
                await this.rollWeaponDamage(item);
                return;
            case 'psychicPower':
                await this.rollPsychicPowerDamage(item);
                return;
            default:
                return ui.notifications.warn(`No actions implemented for item type: ${item.type}`);
        }
    }

    /* -------------------------------------------- */
    /*  Skill Helpers                               */
    /* -------------------------------------------- */

    getSkillFuzzy(skillName) {
        const resolvedSkillName = this._resolveSkillName(skillName);
        const skill = this.skills[resolvedSkillName];
        if (skill) return skill;

        for (const [name, foundSkill] of Object.entries(this.skills)) {
            if (skillName.toUpperCase() === name.toUpperCase()) {
                return foundSkill;
            }
        }
    }

    _findSpecialistSkill(skill, specialityName) {
        if (!Array.isArray(skill?.entries)) return;
        if (Number.isInteger(specialityName)) return skill.entries[specialityName];

        const index = Number.parseInt(specialityName, 10);
        if (!Number.isNaN(index) && skill.entries[index]) return skill.entries[index];

        return skill.entries.find((entry) => entry.name?.toLowerCase() === `${specialityName}`.toLowerCase());
    }

    _resolveSkillName(skillName) {
        if (!skillName) return skillName;
        if (this.skills[skillName]) return skillName;

        const alias = SKILL_ALIASES[skillName.toLowerCase()];
        if (alias && this.skills[alias]) {
            return alias;
        }

        return skillName;
    }

    /* -------------------------------------------- */
    /*  Talent Helpers                              */
    /* -------------------------------------------- */

    hasTalent(talent) {
        return !!this.items.filter((i) => i.type === 'talent').find((t) => t.name === talent);
    }

    hasTalentFuzzyWords(words) {
        return !!this.items.filter((i) => i.type === 'talent').find((t) => {
            for(const word of words) {
                if (!t.name.includes(word)) return false;
            }
            return true;
        });
    }

    /* -------------------------------------------- */
    /*  Fate Actions                                */
    /* -------------------------------------------- */

    async spendFate() {
        await this.update({
            system: {
                fate: {
                    value: this.system.fate.value - 1
                }
            }
        });
    }

    /* -------------------------------------------- */
    /*  Characteristic Tests                        */
    /* -------------------------------------------- */

    async rollCharacteristicCheck(characteristic) {
        const char = this.getCharacteristicFuzzy(characteristic);
        if(!char) {
            game.rt.error('Unable to perform characteristic test. Could not find provided characteristic.', char);
            return null;
        }
        return await this.rollCheck(char.total);
    }

    async opposedCharacteristicTest(targetActor, characteristic) {
        const sourceRoll = await this.rollCharacteristicCheck(characteristic);
        const targetRoll = targetActor ? await targetActor.rollCharacteristicCheck(characteristic) : null;
        return await this.opposedTest(sourceRoll, targetRoll);
    }

    async rollCheck(targetNumber) {
        const roll = await roll1d100();
        const success = roll.total === 1 || (roll.total <= targetNumber && roll.total !== 100);
        let dos = 0;
        let dof = 0;

        if(success) {
            dos = 1 + getDegree(targetNumber, roll.total);
        } else {
            dof = 1 + getDegree(roll.total, targetNumber);
        }

        return {
            roll: roll,
            target: targetNumber,
            success: success,
            dos: dos,
            dof: dof
        }
    }

    async opposedTest(rollCheckSource, rollCheckTarget) {
        if(!rollCheckSource) {
            return null;
        }
        if(rollCheckTarget) {
            let success = false;
            if(rollCheckSource.success) {
                if(!rollCheckTarget.success) {
                    success = true;
                } else {
                    success = rollCheckSource.dos >= rollCheckTarget.dos;
                }
            }
            return {
                source: rollCheckSource,
                target: rollCheckTarget,
                success: success
            }
        } else {
            return {
                source: rollCheckSource,
                success: true
            };
        }
    }
}
