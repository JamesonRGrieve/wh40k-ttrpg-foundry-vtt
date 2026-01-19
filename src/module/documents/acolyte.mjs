import { DHTargetedActionManager } from '../actions/targeted-action-manager.mjs';
import { prepareDamageRoll } from '../applications/prompts/damage-roll-dialog.mjs';
import { RogueTraderBaseActor } from './base-actor.mjs';
import { ForceFieldData } from '../rolls/force-field-data.mjs';
import { prepareForceFieldRoll } from '../applications/prompts/force-field-dialog.mjs';
import { DHBasicActionManager } from '../actions/basic-action-manager.mjs';
import { SYSTEM_ID } from '../constants.mjs';
import { RogueTraderSettings } from '../rogue-trader-settings.mjs';
import { D100Roll } from '../dice/_module.mjs';

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
    /*  Situational Modifiers                       */
    /* -------------------------------------------- */

    /**
     * Collect all situational modifiers from items that apply to a specific type.
     * @param {"characteristics"|"skills"|"combat"} type - The type of situational modifier
     * @param {string} [key] - Optional key to filter by (e.g., "weaponSkill", "dodge", "attack")
     * @returns {Array<{key: string, value: number, condition: string, icon: string, source: string, itemId: string}>}
     */
    getSituationalModifiers(type, key = null) {
        const modifiers = [];
        
        // Collect from all modifier-providing items
        const modifierItems = this.items.filter(item =>
            item.isTalent ||
            item.isTrait ||
            item.isCondition ||
            (item.type === 'armour' && item.system.equipped) ||
            (item.type === 'cybernetic' && item.system.equipped) ||
            (item.type === 'gear' && item.system.equipped)
        );

        for (const item of modifierItems) {
            const situational = item.system?.modifiers?.situational?.[type];
            if (!situational || !Array.isArray(situational)) continue;

            for (const mod of situational) {
                // Skip if key filter is provided and doesn't match
                if (key && mod.key !== key) continue;

                modifiers.push({
                    key: mod.key,
                    value: mod.value,
                    condition: mod.condition,
                    icon: mod.icon || "fa-solid fa-exclamation-triangle",
                    source: item.name,
                    itemId: item.id
                });
            }
        }

        return modifiers;
    }

    /**
     * Get situational modifiers for a characteristic roll.
     * @param {string} charKey - The characteristic key (e.g., "weaponSkill")
     * @returns {Array} Array of situational modifier objects
     */
    getCharacteristicSituationalModifiers(charKey) {
        return this.getSituationalModifiers("characteristics", charKey);
    }

    /**
     * Get situational modifiers for a skill roll.
     * @param {string} skillKey - The skill key (e.g., "dodge")
     * @returns {Array} Array of situational modifier objects
     */
    getSkillSituationalModifiers(skillKey) {
        return this.getSituationalModifiers("skills", skillKey);
    }

    /**
     * Get situational modifiers for combat rolls.
     * @param {string} [combatKey] - Optional combat key (e.g., "attack", "damage")
     * @returns {Array} Array of situational modifier objects
     */
    getCombatSituationalModifiers(combatKey = null) {
        return this.getSituationalModifiers("combat", combatKey);
    }

    /* -------------------------------------------- */
    /*  Roll Methods (New D100Roll System)          */
    /* -------------------------------------------- */

    /**
     * Roll a characteristic test using the new D100Roll system
     * @param {string} charKey - The characteristic key (e.g., "weaponSkill")
     * @param {string} [flavorOverride] - Optional flavor text override
     * @param {Object} [options] - Additional roll options
     * @returns {Promise<ChatMessage|null>}
     */
    async rollCharacteristic(charKey, flavorOverride, options = {}) {
        const char = this.system.characteristics?.[charKey];
        if (!char) {
            foundry.applications.api.Toast.warning(`Characteristic "${charKey}" not found`, {
                duration: 3000
            });
            return null;
        }

        const flavor = flavorOverride || `${char.label} Test`;

        // Collect situational modifiers for this characteristic
        const situationalModifiers = this.getCharacteristicSituationalModifiers(charKey);

        return D100Roll.build({
            actor: this,
            target: char.total,
            baseTarget: char.total,
            flavor: flavor,
            name: flavor,
            speaker: ChatMessage.getSpeaker({ actor: this }),
            type: "characteristic",
            characteristic: charKey,
            situationalModifiers,
            ...options
        });
    }

    /**
     * Roll a skill test using the new D100Roll system
     * @param {string} skillName - The skill key or name
     * @param {string} [specialityName] - Optional speciality name for specialist skills
     * @param {Object} [options] - Additional roll options
     * @returns {Promise<ChatMessage|null>}
     */
    async rollSkill(skillName, specialityName, options = {}) {
        const resolvedSkillName = this._resolveSkillName(skillName);
        let skill = this.skills[resolvedSkillName];
        if (!skill) {
            foundry.applications.api.Toast.warning(`Unable to find skill ${skillName}`, {
                duration: 3000
            });
            return null;
        }
        let label = skill.label;
        let targetValue = skill.current;

        // Handle specialist skills
        if (specialityName !== undefined && Array.isArray(skill?.entries)) {
            const speciality = this._findSpecialistSkill(skill, specialityName);
            if (speciality) {
                const specialityLabel = speciality.name ?? speciality.label ?? specialityName;
                label = `${label}: ${specialityLabel}`;
                targetValue = speciality.current ?? skill.current;
            }
        }

        // Collect situational modifiers for this skill
        const situationalModifiers = this.getSkillSituationalModifiers(resolvedSkillName);

        return D100Roll.build({
            actor: this,
            target: targetValue,
            baseTarget: targetValue,
            flavor: `${label} Test`,
            name: label,
            speaker: ChatMessage.getSpeaker({ actor: this }),
            type: "skill",
            skill: resolvedSkillName,
            situationalModifiers,
            ...options
        });
    }

    /**
     * Roll weapon damage
     * @param {Item} weapon - The weapon item
     */
    async rollWeaponDamage(weapon) {
        if (!weapon.system.equipped) {
            foundry.applications.api.Toast.warning('Actor must have weapon equipped!', {
                duration: 3000
            });
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

    /**
     * Roll psychic power damage
     * @param {Item} power - The psychic power item
     */
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

    /**
     * Roll/use an item
     * @param {string} itemId - The item ID
     */
    async rollItem(itemId) {
        game.rt.log('RollItem', itemId);
        const item = this.items.get(itemId);
        switch (item.type) {
            case 'weapon':
                if (!item.system.equipped) {
                    foundry.applications.api.Toast.warning('Actor must have weapon equipped!', {
                        duration: 3000
                    });
                    return;
                }
                if (game.settings.get(SYSTEM_ID, RogueTraderSettings.SETTINGS.simpleAttackRolls)) {
                    if (item.isRanged) {
                        await this.rollCharacteristic('ballisticSkill', item.name);
                    } else {
                        await this.rollCharacteristic('weaponSkill', item.name);
                    }
                } else {
                    await DHTargetedActionManager.performWeaponAttack(this, null, item);
                }
                return;
            case 'psychicPower':
                if (game.settings.get(SYSTEM_ID, RogueTraderSettings.SETTINGS.simplePsychicRolls)) {
                    await this.rollCharacteristic('willpower', item.name);
                } else {
                    await DHTargetedActionManager.performPsychicAttack(this, null, item);
                }
                return;
            case 'forceField':
                if (!item.system.equipped || !item.system.activated) {
                    foundry.applications.api.Toast.warning('Actor must have force field equipped and activated!', {
                        duration: 3000
                    });
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

    /**
     * Roll damage for an item
     * @param {string} itemId - The item ID
     */
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
                return foundry.applications.api.Toast.warning(`No actions implemented for item type: ${item.type}`, {
                    duration: 3000
                });
        }
    }

    /* -------------------------------------------- */
    /*  Quick Roll Methods (no dialog)              */
    /* -------------------------------------------- */

    /**
     * Perform a quick characteristic check without dialog
     * @param {string} characteristic - The characteristic key
     * @returns {Promise<D100Roll|null>} The evaluated roll
     */
    async rollCharacteristicCheck(characteristic) {
        const char = this.getCharacteristicFuzzy(characteristic);
        if (!char) {
            game.rt.error('Unable to perform characteristic test. Could not find provided characteristic.', characteristic);
            return null;
        }

        // Quick roll without dialog
        const roll = await D100Roll.evaluate({
            actor: this,
            target: char.total,
            configure: false
        });

        return roll;
    }

    /**
     * Perform a quick d100 check against a target number
     * @param {number} targetNumber - The target number
     * @returns {Promise<D100Roll>} The evaluated roll
     */
    async rollCheck(targetNumber) {
        const roll = await D100Roll.evaluate({
            actor: this,
            target: targetNumber,
            configure: false
        });

        return roll;
    }

    /**
     * Perform an opposed characteristic test
     * @param {Actor} targetActor - The opposing actor
     * @param {string} characteristic - The characteristic to test
     * @returns {Promise<Object>} The opposed test result
     */
    async opposedCharacteristicTest(targetActor, characteristic) {
        const sourceRoll = await this.rollCharacteristicCheck(characteristic);
        const targetRoll = targetActor ? await targetActor.rollCharacteristicCheck(characteristic) : null;
        return this.opposedTest(sourceRoll, targetRoll);
    }

    /**
     * Compare two roll results for opposed tests
     * @param {D100Roll} rollCheckSource - The source actor's roll
     * @param {D100Roll} rollCheckTarget - The target actor's roll
     * @returns {Object} The opposed test result
     */
    opposedTest(rollCheckSource, rollCheckTarget) {
        if (!rollCheckSource) return null;

        if (rollCheckTarget) {
            let success = false;
            if (rollCheckSource.isSuccess) {
                if (!rollCheckTarget.isSuccess) {
                    success = true;
                } else {
                    success = rollCheckSource.degreesOfSuccess >= rollCheckTarget.degreesOfSuccess;
                }
            }
            return {
                source: rollCheckSource,
                target: rollCheckTarget,
                success: success
            };
        } else {
            return {
                source: rollCheckSource,
                success: rollCheckSource.isSuccess
            };
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
            for (const word of words) {
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
            "system.fate.value": this.system.fate.value - 1
        });
    }
}
