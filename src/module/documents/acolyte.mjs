import { prepareSimpleRoll } from '../prompts/simple-prompt.mjs';
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

export class RogueTraderAcolyte extends RogueTraderBaseActor {

    get backpack() {
        return this.system.backpack;
    }

    get skills() {
        return this.system.skills;
    }

    get fatigue() {
        return this.system.fatigue;
    }

    get fate() {
        return this.system.fate;
    }

    get psy() {
        return this.system.psy;
    }

    get bio() {
        return this.system.bio;
    }

    get experience() {
        return this.system.experience;
    }

    get insanity() {
        return this.system.insanity;
    }

    get corruption() {
        return this.system.corruption;
    }

    get aptitudes() {
        return this.system.aptitudes;
    }

    get armour() {
        return this.system.armour;
    }

    get encumbrance() {
        return this.system.encumbrance;
    }

    get backgroundEffects() {
        return this.system.backgroundEffects;
    }

    get originPath() {
        return this.system.originPath;
    }

    get originPathItems() {
        return this.items.filter((item) => item.isOriginPath);
    }

    get navigatorPowers() {
        return this.items.filter((item) => item.isNavigatorPower);
    }

    get shipRoles() {
        return this.items.filter((item) => item.isShipRole);
    }

    get conditions() {
        return this.items.filter((item) => item.isCondition);
    }

    async prepareData() {
        this.system.backgroundEffects = {
            abilities: [],
        };
        // Initialize modifier tracking
        this._initializeModifierTracking();
        this._computeOriginPathEffects();
        // Apply modifiers from ALL item types (talents, traits, conditions, equipment)
        this._computeItemModifiers();
        this._computeCharacteristics();
        this._computeSkills();
        this._computeExperience();
        this._computeArmour();
        this._computeMovement();
        this._computeEncumbrance();
        await super.prepareData();
    }

    /**
     * Initialize tracking objects for modifiers from various sources.
     * This allows displaying breakdowns of where bonuses come from.
     */
    _initializeModifierTracking() {
        this.system.modifierSources = {
            characteristics: {},
            skills: {},
            combat: {
                toHit: [],
                damage: [],
                initiative: [],
                defence: []
            },
            wounds: [],
            fate: [],
            movement: []
        };
    }

    /**
     * Compute modifiers from ALL item types - talents, traits, conditions, equipment.
     * This provides universal dynamic stat injection across the board.
     */
    _computeItemModifiers() {
        // Process each item type that can have modifiers
        const modifierItems = this.items.filter(item => 
            item.isTalent || 
            item.isTrait || 
            item.isCondition ||
            (item.type === 'armour' && item.system.equipped) ||
            (item.type === 'cybernetic' && item.system.equipped) ||
            (item.type === 'gear' && item.system.equipped)
        );

        for (const item of modifierItems) {
            this._applyItemModifiers(item);
        }
    }

    /**
     * Apply modifiers from a single item to the character.
     * @param {Item} item - The item to process modifiers from
     */
    _applyItemModifiers(item) {
        const mods = item.system?.modifiers;
        if (!mods) return;

        const source = {
            name: item.name,
            type: item.type,
            id: item.id
        };

        // Characteristic modifiers
        if (mods.characteristics) {
            for (const [charKey, value] of Object.entries(mods.characteristics)) {
                if (value && typeof value === 'number') {
                    if (!this.system.modifierSources.characteristics[charKey]) {
                        this.system.modifierSources.characteristics[charKey] = [];
                    }
                    this.system.modifierSources.characteristics[charKey].push({
                        ...source,
                        value: value
                    });
                }
            }
        }

        // Skill modifiers
        if (mods.skills) {
            for (const [skillKey, value] of Object.entries(mods.skills)) {
                if (value && typeof value === 'number') {
                    if (!this.system.modifierSources.skills[skillKey]) {
                        this.system.modifierSources.skills[skillKey] = [];
                    }
                    this.system.modifierSources.skills[skillKey].push({
                        ...source,
                        value: value
                    });
                }
            }
        }

        // Combat modifiers
        if (mods.combat) {
            for (const [combatKey, value] of Object.entries(mods.combat)) {
                if (value && typeof value === 'number' && this.system.modifierSources.combat[combatKey]) {
                    this.system.modifierSources.combat[combatKey].push({
                        ...source,
                        value: value
                    });
                }
            }
        }

        // Wounds modifier
        if (mods.wounds && typeof mods.wounds === 'number') {
            this.system.modifierSources.wounds.push({
                ...source,
                value: mods.wounds
            });
        }

        // Fate modifier
        if (mods.fate && typeof mods.fate === 'number') {
            this.system.modifierSources.fate.push({
                ...source,
                value: mods.fate
            });
        }

        // Movement modifier
        if (mods.movement && typeof mods.movement === 'number') {
            this.system.modifierSources.movement.push({
                ...source,
                value: mods.movement
            });
        }
    }

    /**
     * Get the total modifier for a characteristic from all sources.
     * @param {string} charKey - The characteristic key
     * @returns {number} The total modifier
     */
    getTotalCharacteristicModifier(charKey) {
        const sources = this.system.modifierSources?.characteristics?.[charKey] || [];
        return sources.reduce((total, src) => total + (src.value || 0), 0);
    }

    /**
     * Get the total modifier for a skill from all sources.
     * @param {string} skillKey - The skill key
     * @returns {number} The total modifier
     */
    getTotalSkillModifier(skillKey) {
        const sources = this.system.modifierSources?.skills?.[skillKey] || [];
        return sources.reduce((total, src) => total + (src.value || 0), 0);
    }

    /**
     * Get the total modifier for a combat stat from all sources.
     * @param {string} combatKey - The combat stat key (toHit, damage, initiative, defence)
     * @returns {number} The total modifier
     */
    getTotalCombatModifier(combatKey) {
        const sources = this.system.modifierSources?.combat?.[combatKey] || [];
        return sources.reduce((total, src) => total + (src.value || 0), 0);
    }

    /**
     * Get total wounds modifier from all sources (items + origin path).
     * @returns {number} The total wounds modifier
     */
    getTotalWoundsModifier() {
        const itemSources = this.system.modifierSources?.wounds || [];
        const itemTotal = itemSources.reduce((total, src) => total + (src.value || 0), 0);
        return itemTotal + this._getOriginPathWoundsModifier();
    }

    /**
     * Get total fate modifier from all sources (items + origin path).
     * @returns {number} The total fate modifier
     */
    getTotalFateModifier() {
        const itemSources = this.system.modifierSources?.fate || [];
        const itemTotal = itemSources.reduce((total, src) => total + (src.value || 0), 0);
        return itemTotal + this._getOriginPathFateModifier();
    }

    /**
     * Get total movement modifier from all sources.
     * @returns {number} The total movement modifier
     */
    getTotalMovementModifier() {
        const sources = this.system.modifierSources?.movement || [];
        return sources.reduce((total, src) => total + (src.value || 0), 0);
    }

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
        await prepareSimpleRoll(simpleSkillData);
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

    /**
     * Computes origin path effects from items on the character.
     * Origin path items are traits with rt.kind === 'origin' flag.
     * Each origin path step (Home World, Birthright, etc.) adds abilities to the character.
     */
    _computeOriginPathEffects() {
        // Get all origin path items from the character's items
        const originItems = this.items.filter((item) => item.isOriginPath);
        
        // Group by step for easy reference
        const stepMap = {
            'Home World': null,
            'Birthright': null,
            'Lure of the Void': null,
            'Trials and Travails': null,
            'Motivation': null,
            'Career': null
        };

        for (const item of originItems) {
            const step = item.flags?.rt?.step || item.system?.step || '';
            if (stepMap.hasOwnProperty(step)) {
                stepMap[step] = item;
            }

            // Add to background abilities for display
            this.backgroundEffects.abilities.push({
                source: step || 'Origin Path',
                name: item.name,
                benefit: item.system?.effects || item.system?.descriptionText || item.system?.description?.value || '',
            });
        }

        // Store origin path selections for easy access
        this.backgroundEffects.originPath = stepMap;

        // Update the originPath system data with the names
        if (this.system.originPath) {
            this.system.originPath.homeWorld = stepMap['Home World']?.name || '';
            this.system.originPath.birthright = stepMap['Birthright']?.name || '';
            this.system.originPath.lureOfTheVoid = stepMap['Lure of the Void']?.name || '';
            this.system.originPath.trialsAndTravails = stepMap['Trials and Travails']?.name || '';
            this.system.originPath.motivation = stepMap['Motivation']?.name || '';
            this.system.originPath.career = stepMap['Career']?.name || '';
        }
    }

    /**
     * Gets the total characteristic modifier from all origin path items.
     * @param {string} charKey - The characteristic key (e.g., 'strength', 'willpower')
     * @returns {number} The total modifier from origin path items
     */
    _getOriginPathCharacteristicModifier(charKey) {
        let total = 0;
        const originItems = this.items.filter((item) => item.isOriginPath);
        
        for (const item of originItems) {
            const mods = item.system?.modifiers?.characteristics;
            if (mods && mods[charKey]) {
                total += mods[charKey];
            }
        }
        
        return total;
    }

    /**
     * Gets the total wound modifier from all origin path items.
     * @returns {number} The total wound modifier
     */
    _getOriginPathWoundsModifier() {
        let total = 0;
        const originItems = this.items.filter((item) => item.isOriginPath);
        
        for (const item of originItems) {
            if (item.system?.modifiers?.wounds) {
                total += item.system.modifiers.wounds;
            }
        }
        
        return total;
    }

    /**
     * Gets the total fate modifier from all origin path items.
     * @returns {number} The total fate modifier
     */
    _getOriginPathFateModifier() {
        let total = 0;
        const originItems = this.items.filter((item) => item.isOriginPath);
        
        for (const item of originItems) {
            if (item.system?.modifiers?.fate) {
                total += item.system.modifiers.fate;
            }
        }
        
        return total;
    }

    _computeCharacteristics() {
        for (const [name, characteristic] of Object.entries(this.characteristics)) {
            // Get origin path modifier for this characteristic
            const originPathMod = this._getOriginPathCharacteristicModifier(name);
            // Get item modifiers (talents, traits, conditions, equipment)
            const itemMod = this.getTotalCharacteristicModifier(name);
            
            // Calculate total: base + advances + manual modifier + origin path modifier + item modifiers
            characteristic.originPathModifier = originPathMod;
            characteristic.itemModifier = itemMod;
            characteristic.totalModifier = originPathMod + itemMod;
            characteristic.total = characteristic.base + characteristic.advance * 5 + characteristic.modifier + originPathMod + itemMod;
            characteristic.bonus = Math.floor(characteristic.total / 10) + characteristic.unnatural;

            if (this.fatigue.value > characteristic.bonus) {
                characteristic.total = Math.ceil(characteristic.total / 2);
                characteristic.bonus = Math.floor(characteristic.total / 10) + characteristic.unnatural;
            }
        }

        this.system.insanityBonus = Math.floor(this.insanity / 10);
        this.system.corruptionBonus = Math.floor(this.corruption / 10);
        this.psy.currentRating = this.psy.rating - this.psy.sustained;
        
        // Apply initiative modifier from items
        const initMod = this.getTotalCombatModifier('initiative');
        this.initiative.bonus = this.characteristics[this.initiative.characteristic].bonus + initMod;
        this.initiative.itemModifier = initMod;
        
        this.fatigue.max = this.characteristics.toughness.bonus + this.characteristics.willpower.bonus;
        
        // Apply total wounds and fate modifiers from all sources
        this.system.totalWoundsModifier = this.getTotalWoundsModifier();
        this.system.totalFateModifier = this.getTotalFateModifier();
        
        // Store combat modifiers for display
        this.system.combatModifiers = {
            toHit: this.getTotalCombatModifier('toHit'),
            damage: this.getTotalCombatModifier('damage'),
            initiative: initMod,
            defence: this.getTotalCombatModifier('defence')
        };
    }

    _computeSkills() {
        const trainingValue = (skill) => {
            if (skill.plus20) return 30;
            if (skill.plus10) return 20;
            if (skill.trained) return 10;
            if (skill.basic) return 0;
            return -20;
        };

        const characteristicTotal = (characteristicKey) => {
            const characteristic = this._findCharacteristic(characteristicKey);
            return characteristic?.total ?? 0;
        };

        for (let [skillKey, skill] of Object.entries(this.skills)) {
            const baseCharacteristic = skill.characteristic;
            const baseTotal = characteristicTotal(baseCharacteristic);
            const bonus = Number(skill.bonus ?? 0);
            // Get item modifiers for this skill
            const itemMod = this.getTotalSkillModifier(skillKey);
            skill.itemModifier = itemMod;
            skill.current = baseTotal + trainingValue(skill) + bonus + itemMod;

            if (Array.isArray(skill.entries)) {
                for (let speciality of skill.entries) {
                    if (!speciality.characteristic) speciality.characteristic = baseCharacteristic;
                    const specialityCharacteristic = speciality.characteristic || baseCharacteristic;
                    const specialityBonus = Number(speciality.bonus ?? 0);
                    speciality.current = characteristicTotal(specialityCharacteristic) + trainingValue(speciality) + specialityBonus + itemMod;
                }
            }
        }
    }

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

    _computeExperience() {
        if(!this.experience) return;
        this.experience.spentCharacteristics = 0;
        this.experience.spentSkills = 0;
        this.experience.spentTalents = 0;
        this.experience.spentPsychicPowers = this.psy.cost;
        for (let characteristic of Object.values(this.characteristics)) {
            this.experience.spentCharacteristics += parseInt(characteristic.cost, 10);
        }
        for (let skill of Object.values(this.skills)) {
            if (Array.isArray(skill.entries)) {
                for (let speciality of skill.entries) {
                    this.experience.spentSkills += parseInt(speciality.cost ?? 0, 10);
                }
            } else {
                this.experience.spentSkills += parseInt(skill.cost ?? 0, 10);
            }
        }
        for (let item of this.items) {
            if (item.isTalent) {
                this.experience.spentTalents += parseInt(item.cost, 10);
            } else if (item.isPsychicPower) {
                this.experience.spentPsychicPowers += parseInt(item.cost, 10);
            }
        }
        this.experience.calculatedTotal =
            this.experience.spentCharacteristics + this.experience.spentSkills + this.experience.spentTalents + this.experience.spentPsychicPowers;
        this.experience.available = this.experience.total - this.experience.used;
    }

    _computeArmour() {
        let locations = [
            'body',
            'head',
            'leftArm',
            'rightArm',
            'leftLeg',
            'rightLeg'
        ]
        let toughness = this.characteristics.toughness;
        let traitBonus = 0;

        // Compute Top Trait Bonus
        const traits = this.items.filter((item) => item.type === 'trait');
        for (const trait of traits) {
            switch(trait.name) {
                case 'Machine':
                    if(trait.system.level > traitBonus) {
                        traitBonus = trait.system.level;
                    }
                    break;
                case 'Natural Armor':
                    if(trait.system.level > traitBonus) {
                        traitBonus = trait.system.level;
                    }
                    break;
            }
        }

        // Create Basic Armour Point Object
        this.system.armour = locations.reduce(
            (accumulator, location) =>
                Object.assign(accumulator, {
                    [location]: {
                        total: toughness.bonus + traitBonus,
                        toughnessBonus: toughness.bonus,
                        traitBonus: traitBonus,
                        value: 0,
                    },
                }),
            {},
        );

        // Add Cybernetics -- these are cumulative?
        this.items
            .filter((item) => item.type === 'cybernetic' )
            .filter((item) => item.system.equipped)
            .filter((item) => item.system.hasArmourPoints)
            .forEach((cybernetic) => {
                locations.forEach((location) => {
                    let armourVal = cybernetic.system.armourPoints[location] || 0;
                    this.armour[location].total += Number(armourVal);
                });
            });

        // object for storing the max armour
        let maxArmour = locations.reduce((acc, location) => Object.assign(acc, { [location]: 0 }), {});

        // for each item, find the maximum armour val per location
        this.items
            .filter((item) => item.type === 'armour' )
            .filter((item) => item.system.equipped)
            .reduce((acc, armour) => {
                locations.forEach((location) => {
                    let armourVal = armour.system.armourPoints[location] || 0;
                    // Coerce -- sometimes this is a string??
                    armourVal = Number(armourVal);
                    if (armourVal > acc[location]) {
                        acc[location] = armourVal;
                    }
                });
                return acc;
            }, maxArmour);

        this.armour.head.value = maxArmour['head'];
        this.armour.leftArm.value = maxArmour['leftArm'];
        this.armour.rightArm.value = maxArmour['rightArm'];
        this.armour.body.value = maxArmour['body'];
        this.armour.leftLeg.value = maxArmour['leftLeg'];
        this.armour.rightLeg.value = maxArmour['rightLeg'];

        this.armour.head.total += this.armour.head.value;
        this.armour.leftArm.total += this.armour.leftArm.value;
        this.armour.rightArm.total += this.armour.rightArm.value;
        this.armour.body.total += this.armour.body.value;
        this.armour.leftLeg.total += this.armour.leftLeg.value;
        this.armour.rightLeg.total += this.armour.rightLeg.value;
    }

    _computeEncumbrance() {
        // Current Weight
        let currentWeight = 0;

        // Backpack
        let backpackCurrentWeight = 0;
        let backpackMaxWeight = 0;
        if (this.backpack.hasBackpack) {
            backpackMaxWeight = this.backpack.weight.max;
            this.items.filter((item) => !item.isStorageLocation).forEach((item) => {
                if (item.system.backpack?.inBackpack) {
                    backpackCurrentWeight += item.totalWeight;
                } else {
                    currentWeight += item.totalWeight;
                }
            });

            if (this.backpack.isCombatVest) {
                currentWeight += backpackCurrentWeight;
            }
        } else {
            // No backpack -- add everything
            this.items.filter((item) => !item.isStorageLocation).forEach((item) => (currentWeight += item.totalWeight));
        }

        const attributeBonus = this.characteristics.strength.bonus + this.characteristics.toughness.bonus;
        this.system.encumbrance = {
            max: 0,
            value: currentWeight,
            encumbered: false,
            backpack_max: backpackMaxWeight,
            backpack_value: backpackCurrentWeight,
            backpack_encumbered: false,
        };
        switch (attributeBonus) {
            case 0:
                this.encumbrance.max = 0.9;
                break;
            case 1:
                this.encumbrance.max = 2.25;
                break;
            case 2:
                this.encumbrance.max = 4.5;
                break;
            case 3:
                this.encumbrance.max = 9;
                break;
            case 4:
                this.encumbrance.max = 18;
                break;
            case 5:
                this.encumbrance.max = 27;
                break;
            case 6:
                this.encumbrance.max = 36;
                break;
            case 7:
                this.encumbrance.max = 45;
                break;
            case 8:
                this.encumbrance.max = 56;
                break;
            case 9:
                this.encumbrance.max = 67;
                break;
            case 10:
                this.encumbrance.max = 78;
                break;
            case 11:
                this.encumbrance.max = 90;
                break;
            case 12:
                this.encumbrance.max = 112;
                break;
            case 13:
                this.encumbrance.max = 225;
                break;
            case 14:
                this.encumbrance.max = 337;
                break;
            case 15:
                this.encumbrance.max = 450;
                break;
            case 16:
                this.encumbrance.max = 675;
                break;
            case 17:
                this.encumbrance.max = 900;
                break;
            case 18:
                this.encumbrance.max = 1350;
                break;
            case 19:
                this.encumbrance.max = 1800;
                break;
            case 20:
                this.encumbrance.max = 2250;
                break;
            default:
                this.encumbrance.max = 2250;
                break;
        }

        if (this.encumbrance.value > this.encumbrance.max) {
            this.encumbrance.encumbered = true;
        }
        if (this.encumbrance.backpack_value > this.encumbrance.backpack_max) {
            this.encumbrance.backpack_encumbered = true;
        }
    }

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

    async spendFate() {
        await this.update({
            system: {
                fate: {
                    value: this.system.fate.value - 1
                }
            }
        });
    }

    async rollCharacteristicCheck(characteristic) {
        const char = this.getCharacteristicFuzzy(characteristic);
        if(!char) {
            game.rt.error('Unable to perform characteristic test. Could now find provided characteristic.', char);
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
