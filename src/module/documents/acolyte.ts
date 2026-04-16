import { DHBasicActionManager } from '../actions/basic-action-manager.ts';
import { DHTargetedActionManager } from '../actions/targeted-action-manager.ts';
import { prepareDamageRoll } from '../applications/prompts/damage-roll-dialog.ts';
import { prepareUnifiedRoll } from '../applications/prompts/unified-roll-dialog.ts';
import { SYSTEM_ID } from '../constants.ts';
import { D100Roll } from '../dice/_module.ts';
import { SimpleSkillData } from '../rolls/action-data.ts';
import { ForceFieldData } from '../rolls/force-field-data.ts';
import { WH40KSettings } from '../wh40k-rpg-settings.ts';
import { WH40KBaseActor } from './base-actor.ts';

const SKILL_ALIASES = {
    navigate: 'navigation',
};

/**
 * Actor document for Character (Acolyte) actors.
 * Handles roll methods, actions, and API surface.
 * Data preparation is handled by the CharacterData DataModel.
 * @extends {WH40KBaseActor}
 */
export class WH40KAcolyte extends WH40KBaseActor {
    [key: string]: any;
    /* -------------------------------------------- */
    /*  Getters                                     */
    /* -------------------------------------------- */

    get backpack(): any {
        return this.system.backpack;
    }
    get skills(): Record<string, any> {
        return this.system.skills;
    }
    get fatigue(): any {
        return this.system.fatigue;
    }
    get fate(): any {
        return this.system.fate;
    }
    get psy(): any {
        return this.system.psy;
    }
    get bio(): any {
        return this.system.bio;
    }
    get experience(): any {
        return this.system.experience;
    }
    get insanity(): any {
        return this.system.insanity;
    }
    get corruption(): any {
        return this.system.corruption;
    }
    get aptitudes(): any {
        return this.system.aptitudes;
    }
    get armour(): any {
        return this.system.armour;
    }
    get encumbrance(): any {
        return this.system.encumbrance;
    }
    get backgroundEffects(): any {
        return this.system.backgroundEffects;
    }
    get originPath(): any {
        return this.system.originPath;
    }
    get originPathItems(): Item[] {
        return this.items.filter((item: any) => item.isOriginPath);
    }
    get navigatorPowers(): Item[] {
        return this.items.filter((item: any) => item.isNavigatorPower);
    }
    get shipRoles(): Item[] {
        return this.items.filter((item: any) => item.isShipRole);
    }
    get conditions(): Item[] {
        return this.items.filter((item: any) => item.isCondition);
    }

    /* -------------------------------------------- */
    /*  Data Preparation                            */
    /* -------------------------------------------- */

    /**
     * Prepare data for the actor.
     * The DataModel handles base calculations via prepareDerivedData().
     * This method triggers item-based calculations via prepareEmbeddedData().
     * @override
     */
    prepareData(): void {
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
    getTotalCharacteristicModifier(charKey: string): number {
        return this.system._getTotalCharacteristicModifier?.(charKey) ?? 0;
    }

    /**
     * Get the total modifier for a skill from all sources.
     * @param {string} skillKey - The skill key
     * @returns {number} The total modifier
     */
    getTotalSkillModifier(skillKey: string): number {
        return this.system._getTotalSkillModifier?.(skillKey) ?? 0;
    }

    /**
     * Get the total modifier for a combat stat from all sources.
     * @param {string} combatKey - The combat stat key
     * @returns {number} The total modifier
     */
    getTotalCombatModifier(combatKey: string): number {
        return this.system._getTotalCombatModifier?.(combatKey) ?? 0;
    }

    /**
     * Get total wounds modifier from all sources.
     * @returns {number} The total wounds modifier
     */
    getTotalWoundsModifier(): number {
        return this.system.totalWoundsModifier ?? 0;
    }

    /**
     * Get total fate modifier from all sources.
     * @returns {number} The total fate modifier
     */
    getTotalFateModifier(): number {
        return this.system.totalFateModifier ?? 0;
    }

    /**
     * Get total movement modifier from all sources.
     * @returns {number} The total movement modifier
     */
    getTotalMovementModifier(): number {
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
    getSituationalModifiers(
        type: 'characteristics' | 'skills' | 'combat',
        key: string | null = null,
    ): Array<{ key: string; value: number; condition: string; icon: string; source: string; itemId: string }> {
        const modifiers = [];

        // Collect from all modifier-providing items
        const modifierItems = (this.items as any).filter(
            (item: any) =>
                item.isTalent ||
                item.isTrait ||
                item.isCondition ||
                (item.type === 'armour' && item.system.equipped) ||
                (item.type === 'cybernetic' && item.system.equipped) ||
                (item.type === 'gear' && item.system.equipped),
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
                    icon: mod.icon || 'fa-solid fa-exclamation-triangle',
                    source: item.name,
                    itemId: item.id,
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
    getCharacteristicSituationalModifiers(
        charKey: string,
    ): Array<{ key: string; value: number; condition: string; icon: string; source: string; itemId: string }> {
        return this.getSituationalModifiers('characteristics', charKey);
    }

    /**
     * Get situational modifiers for a skill roll.
     * @param {string} skillKey - The skill key (e.g., "dodge")
     * @returns {Array} Array of situational modifier objects
     */
    getSkillSituationalModifiers(skillKey: string): Array<{ key: string; value: number; condition: string; icon: string; source: string; itemId: string }> {
        return this.getSituationalModifiers('skills', skillKey);
    }

    /**
     * Get situational modifiers for combat rolls.
     * @param {string} [combatKey] - Optional combat key (e.g., "attack", "damage")
     * @returns {Array} Array of situational modifier objects
     */
    getCombatSituationalModifiers(
        combatKey: string | null = null,
    ): Array<{ key: string; value: number; condition: string; icon: string; source: string; itemId: string }> {
        return this.getSituationalModifiers('combat', combatKey);
    }

    /* -------------------------------------------- */
    /*  Roll Methods (New D100Roll System)          */
    /* -------------------------------------------- */

    /**
     * Roll a characteristic test using the unified roll dialog
     * @param {string} charKey - The characteristic key (e.g., "weaponSkill")
     * @param {string} [flavorOverride] - Optional flavor text override
     * @param {Object} [options] - Additional roll options
     * @returns {Promise<ChatMessage|null>}
     */
    async rollCharacteristic(charKey: string, flavorOverride?: string, options: Record<string, unknown> = {}): Promise<void> {
        const char = this.system.characteristics?.[charKey];
        if (!char) {
            (ui.notifications as any).warn(`Characteristic "${charKey}" not found`);
            return null;
        }

        const flavor = flavorOverride || `${char.label} Test`;
        const situationalModifiers = this.getCharacteristicSituationalModifiers(charKey);

        const simpleSkillData = new SimpleSkillData();
        const rollData = simpleSkillData.rollData;
        rollData.actor = this;
        rollData.sourceActor = this;
        rollData.nameOverride = flavor;
        rollData.type = 'Characteristic';
        rollData.rollKey = charKey;
        rollData.baseTarget = char.total;
        rollData.modifiers.modifier = 0;
        if (situationalModifiers?.length) {
            let sitMod = 0;
            for (const mod of situationalModifiers) sitMod += mod.value || 0;
            if (sitMod !== 0) rollData.modifiers.situational = sitMod;
        }
        await prepareUnifiedRoll(simpleSkillData);
    }

    /**
     * Roll a skill test using the unified roll dialog
     * @param {string} skillName - The skill key or name
     * @param {string} [specialityName] - Optional speciality name for specialist skills
     * @param {Object} [options] - Additional roll options
     * @returns {Promise<ChatMessage|null>}
     */
    async rollSkill(skillName: string, specialityName?: string | number, options: Record<string, unknown> = {}): Promise<void> {
        const resolvedSkillName = this._resolveSkillName(skillName);
        const skill = this.skills[resolvedSkillName];
        if (!skill) {
            (ui.notifications as any).warn(`Unable to find skill ${skillName}`);
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

        const situationalModifiers = this.getSkillSituationalModifiers(resolvedSkillName);

        const simpleSkillData = new SimpleSkillData();
        const rollData = simpleSkillData.rollData;
        rollData.actor = this;
        rollData.sourceActor = this;
        rollData.nameOverride = `${label} Test`;
        rollData.type = 'Skill';
        rollData.rollKey = resolvedSkillName;
        rollData.baseTarget = targetValue;
        rollData.modifiers.modifier = 0;
        if (situationalModifiers?.length) {
            let sitMod = 0;
            for (const mod of situationalModifiers) sitMod += mod.value || 0;
            if (sitMod !== 0) rollData.modifiers.situational = sitMod;
        }
        await prepareUnifiedRoll(simpleSkillData);
    }

    /**
     * Roll weapon damage
     * @param {Item} weapon - The weapon item
     */
    async rollWeaponDamage(weapon: any): Promise<void> {
        if (!weapon.system.equipped) {
            (ui.notifications as any).warn('Actor must have weapon equipped!');
            return;
        }

        // Calculate damage with Strength Bonus for melee/thrown weapons
        const isMelee = weapon.system.melee || weapon.system.isMeleeWeapon;
        const isThrown = weapon.system.class === 'thrown';
        const isGrenade = weapon.system.special?.includes('grenade');

        // Add SB for melee weapons and thrown weapons (except grenades)
        const includeStrengthBonus = isMelee || (isThrown && !isGrenade);
        const strengthBonus = includeStrengthBonus ? this.system.characteristics.strength.bonus : 0;

        // Build damage object with SB included
        const damageData = {
            formula: weapon.system.damage.formula,
            bonus: (weapon.system.damage.bonus || 0) + strengthBonus,
        };

        await prepareDamageRoll({
            name: weapon.name,
            damage: damageData,
            damageType: weapon.system.damageType,
            penetration: weapon.system.penetration,
            targetActor: () => {
                const targetedObjects = game.user.targets;
                if (targetedObjects && targetedObjects.size > 0) {
                    const target = targetedObjects.values().next().value;
                    return target.actor;
                }
            },
        });
    }

    /**
     * Roll psychic power damage
     * @param {Item} power - The psychic power item
     */
    async rollPsychicPowerDamage(power: any): Promise<void> {
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
    async rollItem(itemId: string): Promise<void> {
        game.wh40k.log('RollItem', itemId);
        const item = this.items.get(itemId) as any;
        switch (item.type) {
            case 'weapon':
                if (!item.system.equipped) {
                    (ui.notifications as any).warn('Actor must have weapon equipped!');
                    return;
                }
                if ((game.settings as any).get(SYSTEM_ID, WH40KSettings.SETTINGS.simpleAttackRolls)) {
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
                if ((game.settings as any).get(SYSTEM_ID, WH40KSettings.SETTINGS.simplePsychicRolls)) {
                    await this.rollCharacteristic('willpower', item.name);
                } else {
                    await DHTargetedActionManager.performPsychicAttack(this, null, item);
                }
                return;
            case 'forceField':
                if (!item.system.equipped || !item.system.activated) {
                    (ui.notifications as any).warn('Actor must have force field equipped and activated!');
                    return;
                }
                await prepareUnifiedRoll(new ForceFieldData(this, item));
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
                            pr: this.psy.rating,
                        },
                    }),
                });
        }
    }

    /**
     * Roll damage for an item
     * @param {string} itemId - The item ID
     */
    async damageItem(itemId: string): Promise<void> {
        const item = this.items.get(itemId) as any;
        switch (item.type) {
            case 'weapon':
                await this.rollWeaponDamage(item);
                return;
            case 'psychicPower':
                await this.rollPsychicPowerDamage(item);
                return;
            default:
                return (ui.notifications as any).warn(`No actions implemented for item type: ${item.type}`);
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
    async rollCharacteristicCheck(characteristic: string): Promise<any> {
        const char = this.getCharacteristicFuzzy(characteristic);
        if (!char) {
            game.wh40k.error('Unable to perform characteristic test. Could not find provided characteristic.', characteristic);
            return null;
        }

        // Quick roll without dialog
        const roll = await D100Roll.evaluate({
            actor: this,
            target: char.total,
            configure: false,
        });

        return roll;
    }

    /**
     * Perform a quick d100 check against a target number
     * @param {number} targetNumber - The target number
     * @returns {Promise<D100Roll>} The evaluated roll
     */
    async rollCheck(targetNumber: number): Promise<any> {
        const roll = await D100Roll.evaluate({
            actor: this,
            target: targetNumber,
            configure: false,
        });

        return roll;
    }

    /**
     * Perform an opposed characteristic test
     * @param {Actor} targetActor - The opposing actor
     * @param {string} characteristic - The characteristic to test
     * @returns {Promise<Object>} The opposed test result
     */
    async opposedCharacteristicTest(targetActor: Actor | null, characteristic: string): Promise<any> {
        const sourceRoll = await this.rollCharacteristicCheck(characteristic);
        const targetRoll = targetActor ? await (targetActor as any).rollCharacteristicCheck(characteristic) : null;
        return this.opposedTest(sourceRoll, targetRoll);
    }

    /**
     * Compare two roll results for opposed tests
     * @param {D100Roll} rollCheckSource - The source actor's roll
     * @param {D100Roll} rollCheckTarget - The target actor's roll
     * @returns {Object} The opposed test result
     */
    opposedTest(rollCheckSource: any, rollCheckTarget: any): any {
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
                success: success,
            };
        } else {
            return {
                source: rollCheckSource,
                success: rollCheckSource.isSuccess,
            };
        }
    }

    /* -------------------------------------------- */
    /*  Skill Helpers                               */
    /* -------------------------------------------- */

    getSkillFuzzy(skillName: string): any {
        const resolvedSkillName = this._resolveSkillName(skillName);
        const skill = this.skills[resolvedSkillName];
        if (skill) return skill;

        for (const [name, foundSkill] of Object.entries(this.skills)) {
            if (skillName.toUpperCase() === name.toUpperCase()) {
                return foundSkill;
            }
        }
    }

    _findSpecialistSkill(skill: any, specialityName: string | number): any {
        if (!Array.isArray(skill?.entries)) return;
        if (Number.isInteger(specialityName)) return skill.entries[specialityName];

        const index = Number.parseInt(String(specialityName), 10);
        if (!Number.isNaN(index) && skill.entries[index]) return skill.entries[index];

        return skill.entries.find((entry) => entry.name?.toLowerCase() === `${specialityName}`.toLowerCase());
    }

    _resolveSkillName(skillName: string): string {
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

    hasTalent(talent: string): boolean {
        return !!(this.items as any).filter((i: any) => i.type === 'talent').find((t: any) => t.name === talent);
    }

    hasTalentFuzzyWords(words: string[]): boolean {
        return !!(this.items as any)
            .filter((i: any) => i.type === 'talent')
            .find((t: any) => {
                for (const word of words) {
                    if (!t.name.includes(word)) return false;
                }
                return true;
            });
    }

    /* -------------------------------------------- */
    /*  Fate Actions                                */
    /* -------------------------------------------- */

    async spendFate(): Promise<void> {
        await (this as any).update({
            'system.fate.value': this.system.fate.value - 1,
        });
    }
}
