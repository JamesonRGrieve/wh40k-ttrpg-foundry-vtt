import { DHBasicActionManager } from '../actions/basic-action-manager.ts';
import { DHTargetedActionManager } from '../actions/targeted-action-manager.ts';
import { prepareDamageRoll } from '../applications/prompts/damage-roll-dialog.ts';
import { prepareUnifiedRoll } from '../applications/prompts/unified-roll-dialog.ts';
import { SYSTEM_ID } from '../constants.ts';
import { D100Roll } from '../dice/_module.ts';
import type { ActionData } from '../rolls/action-data.ts';
import { ForceFieldData } from '../rolls/force-field-data.ts';
import { WH40KSettings } from '../wh40k-rpg-settings.ts';
import { WH40KBaseActor } from './base-actor.ts';
import type { WH40KItem } from './item.ts';
import type {
    WH40KItemDocument,
    WH40KActorSystemData,
    WH40KFatigue,
    WH40KFate,
    WH40KPsy,
    WH40KActorBio,
    WH40KExperience,
    WH40KEncumbrance,
    WH40KBackpack,
    WH40KArmourLocation,
    WH40KSkill,
} from '../types/global.d.ts';

/** Typed shape of the modifierSources object on a character actor's system data. */
interface CharacterModifierSources {
    characteristics: Record<string, Array<{ value: number }>>;
    skills: Record<string, Array<{ value: number }>>;
    combat: Record<string, Array<{ value: number }>>;
    wounds: Array<{ value: number }>;
    fate: Array<{ value: number }>;
    movement: Array<{ value: number; label?: string }>;
}

/**
 * Narrowed system-data type for character (acolyte) actors.
 * Intersects WH40KActorSystemData with the character-specific overrides so the
 * acolyte document can access required fields without undefined guards.
 * The more-specific field types shadow the optional/looser types from the base.
 */
type WH40KCharacterSystemData = WH40KActorSystemData & {
    insanity: number;
    corruption: number;
    fatigue: WH40KFatigue;
    fate: WH40KFate;
    psy: WH40KPsy;
    bio: WH40KActorBio;
    experience: WH40KExperience;
    aptitudes: string[];
    armour: Record<string, WH40KArmourLocation>;
    encumbrance: WH40KEncumbrance;
    backgroundEffects: unknown[];
    originPath: Record<string, unknown>;
    backpack: WH40KBackpack;
    modifierSources: CharacterModifierSources;
    totalWoundsModifier: number;
    totalFateModifier: number;
    _getTotalCharacteristicModifier(charKey: string): number;
    _getTotalSkillModifier(skillKey: string): number;
    _getTotalCombatModifier(combatKey: string): number;
};

/** Interface representing a resolved D100Roll result used in opposed tests. */
interface D100RollResult {
    isSuccess: boolean;
    degreesOfSuccess: number;
}

/** Interface representing a skill entry (specialist skill speciality). */
interface SkillEntry {
    name?: string;
    label?: string;
    current?: number;
}

const SKILL_ALIASES: Record<string, string> = {
    navigate: 'navigation',
};

/**
 * Actor document for Character (Acolyte) actors.
 * Handles roll methods, actions, and API surface.
 * Data preparation is handled by the CharacterData DataModel.
 * @extends {WH40KBaseActor}
 */
export class WH40KAcolyte extends WH40KBaseActor {
    declare system: WH40KCharacterSystemData;

    /* -------------------------------------------- */
    /*  Getters                                     */
    /* -------------------------------------------- */

    get backpack(): WH40KBackpack {
        return this.system.backpack;
    }
    get skills(): Record<string, WH40KSkill> {
        return this.system.skills;
    }
    get fatigue(): WH40KFatigue {
        return this.system.fatigue;
    }
    get fate(): WH40KFate {
        return this.system.fate;
    }
    get psy(): WH40KPsy {
        return this.system.psy;
    }
    get bio(): WH40KActorBio {
        return this.system.bio;
    }
    get experience(): WH40KExperience {
        return this.system.experience;
    }
    get insanity(): number {
        return this.system.insanity;
    }
    get corruption(): number {
        return this.system.corruption;
    }
    get aptitudes(): string[] {
        return this.system.aptitudes;
    }
    get armour(): Record<string, WH40KArmourLocation> {
        return this.system.armour;
    }
    get encumbrance(): WH40KEncumbrance {
        return this.system.encumbrance;
    }
    get backgroundEffects(): unknown[] {
        return this.system.backgroundEffects;
    }
    get originPath(): Record<string, unknown> {
        return this.system.originPath;
    }
    get originPathItems(): WH40KItem[] {
        return this.items.filter((item: WH40KItem) => item.isOriginPath);
    }
    get navigatorPowers(): WH40KItem[] {
        return this.items.filter((item: WH40KItem) => item.isNavigatorPower);
    }
    get shipRoles(): WH40KItem[] {
        return this.items.filter((item: WH40KItem) => item.isShipRole);
    }
    get conditions(): WH40KItem[] {
        return this.items.filter((item: WH40KItem) => item.isCondition);
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
        // Initialize defaults before DataModel runs (cast through unknown for legacy migration paths)
        if ((this.system as Record<string, unknown>).corruption == null) (this.system as Record<string, unknown>).corruption = 0;
        if ((this.system as Record<string, unknown>).insanity == null) (this.system as Record<string, unknown>).insanity = 0;

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
        return this.system._getTotalCharacteristicModifier(charKey);
    }

    /**
     * Get the total modifier for a skill from all sources.
     * @param {string} skillKey - The skill key
     * @returns {number} The total modifier
     */
    getTotalSkillModifier(skillKey: string): number {
        return this.system._getTotalSkillModifier(skillKey);
    }

    /**
     * Get the total modifier for a combat stat from all sources.
     * @param {string} combatKey - The combat stat key
     * @returns {number} The total modifier
     */
    getTotalCombatModifier(combatKey: string): number {
        return this.system._getTotalCombatModifier(combatKey);
    }

    /**
     * Get total wounds modifier from all sources.
     * @returns {number} The total wounds modifier
     */
    getTotalWoundsModifier(): number {
        return this.system.totalWoundsModifier;
    }

    /**
     * Get total fate modifier from all sources.
     * @returns {number} The total fate modifier
     */
    getTotalFateModifier(): number {
        return this.system.totalFateModifier;
    }

    /**
     * Get total movement modifier from all sources.
     * @returns {number} The total movement modifier
     */
    getTotalMovementModifier(): number {
        const sources = this.system.modifierSources.movement;
        return sources.reduce((total: number, src: { value: number }) => total + (src.value || 0), 0);
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
        const modifierItems = this.items.filter((item: WH40KItem) => {
            const doc = item as WH40KItemDocument;
            return !!(
                doc.isTalent ||
                doc.isTrait ||
                doc.isCondition ||
                (item.type === 'armour' && item.system.equipped) ||
                (item.type === 'cybernetic' && item.system.equipped) ||
                (item.type === 'gear' && item.system.equipped)
            );
        });

        for (const item of modifierItems) {
            const situationalModifiers = (item.system.modifiers as Record<string, unknown> | undefined)?.['situational'] as Record<string, unknown> | undefined;
            const situational = situationalModifiers?.[type];
            if (!situational || !Array.isArray(situational)) continue;

            for (const mod of situational) {
                // Skip if key filter is provided and doesn't match
                if (key && mod.key !== key) continue;

                modifiers.push({
                    key: mod.key,
                    value: mod.value,
                    condition: mod.condition,
                    icon: mod.icon || 'fa-solid fa-exclamation-triangle',
                    source: item.name ?? '',
                    itemId: item.id ?? '',
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
            ui.notifications.warn(`Characteristic "${charKey}" not found`);
            return;
        }

        const simpleSkillData = this._buildSimpleSkillRoll({
            key: charKey,
            type: 'characteristic',
            label: `${char.label} Test`,
            target: char.total,
            situationalKey: charKey,
            nameOverride: flavorOverride || undefined,
        });
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
            ui.notifications.warn(`Unable to find skill ${skillName}`);
            return;
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

        const simpleSkillData = this._buildSimpleSkillRoll({
            key: resolvedSkillName,
            type: 'skill',
            label: `${label} Test`,
            target: targetValue,
            situationalKey: resolvedSkillName,
        });
        await prepareUnifiedRoll(simpleSkillData);
    }

    /**
     * Roll weapon damage
     * @param {Item} weapon - The weapon item
     */
    async rollWeaponDamage(weapon: WH40KItem): Promise<void> {
        if (!weapon.system.equipped) {
            ui.notifications.warn('Actor must have weapon equipped!');
            return;
        }

        // Calculate damage with Strength Bonus for melee/thrown weapons
        const isMelee = weapon.system.melee || weapon.system.isMeleeWeapon;
        const isThrown = weapon.system.class === 'thrown';
        const special = weapon.system.special as string | string[] | undefined;
        const isGrenade = Array.isArray(special) ? special.includes('grenade') : typeof special === 'string' && special.includes('grenade');

        // Add SB for melee weapons and thrown weapons (except grenades)
        const includeStrengthBonus = isMelee || (isThrown && !isGrenade);
        const strengthBonus = includeStrengthBonus ? this.system.characteristics.strength.bonus : 0;

        // Build damage object with SB included
        // weapon.system.damage can be a string formula or an object with formula/bonus fields
        const rawDamage = weapon.system.damage as { formula?: string; value?: string; bonus?: number } | string | undefined;
        const damageFormula = typeof rawDamage === 'string' ? rawDamage : rawDamage?.formula ?? rawDamage?.value ?? '';
        const damageBonus = typeof rawDamage === 'object' && rawDamage !== null ? rawDamage.bonus ?? 0 : 0;
        const damageData = {
            formula: damageFormula,
            bonus: damageBonus + strengthBonus,
        };

        await prepareDamageRoll({
            name: weapon.name,
            damage: damageData,
            damageType: weapon.system.damageType,
            penetration: weapon.system.penetration,
            targetActor: () => {
                const targetedObjects = game.user.targets;
                if (targetedObjects && targetedObjects.size > 0) {
                    const target = targetedObjects.values().next().value as Token | undefined;
                    return target?.actor;
                }
                return undefined;
            },
        });
    }

    /**
     * Roll psychic power damage
     * @param {Item} power - The psychic power item
     */
    async rollPsychicPowerDamage(power: WH40KItem): Promise<void> {
        await prepareDamageRoll({
            psychicPower: true,
            pr: this.psy.rating,
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
        const item = this.items.get(itemId);
        if (!item) return;

        switch (item.type) {
            case 'weapon':
                if (!item.system.equipped) {
                    ui.notifications.warn('Actor must have weapon equipped!');
                    return;
                }
                if (game.settings.get(SYSTEM_ID, WH40KSettings.SETTINGS.simpleAttackRolls)) {
                    if (item.isRanged) {
                        await this.rollCharacteristic('ballisticSkill', item.name ?? undefined);
                    } else {
                        await this.rollCharacteristic('weaponSkill', item.name ?? undefined);
                    }
                } else {
                    await DHTargetedActionManager.performWeaponAttack(this, null, item);
                }
                return;
            case 'psychicPower':
                if (game.settings.get(SYSTEM_ID, WH40KSettings.SETTINGS.simplePsychicRolls)) {
                    await this.rollCharacteristic('willpower', item.name ?? undefined);
                } else {
                    await DHTargetedActionManager.performPsychicAttack(this, null, item);
                }
                return;
            case 'forceField':
                if (!item.system.equipped || !item.system.activated) {
                    ui.notifications.warn('Actor must have force field equipped and activated!');
                    return;
                }
                await prepareUnifiedRoll(new ForceFieldData(this, item) as unknown as ActionData);
                return;
            default:
                await DHBasicActionManager.sendItemVocalizeChat({
                    actor: this.name ?? '',
                    name: item.name ?? '',
                    type: item.type?.toUpperCase() ?? '',
                    description: await TextEditor.enrichHTML(
                        (typeof item.system.benefit === 'string' ? item.system.benefit : null) ??
                            (typeof item.system.description === 'string' ? item.system.description : item.system.description?.value) ??
                            '',
                        {
                            rollData: {
                                actor: this,
                                item: item,
                                pr: this.psy.rating,
                            },
                        },
                    ),
                });
        }
    }

    /**
     * Roll damage for an item
     * @param {string} itemId - The item ID
     */
    async damageItem(itemId: string): Promise<void> {
        const item = this.items.get(itemId);
        if (!item) return;
        switch (item.type) {
            case 'weapon':
                await this.rollWeaponDamage(item);
                return;
            case 'psychicPower':
                await this.rollPsychicPowerDamage(item);
                return;
            default:
                ui.notifications.warn(`No actions implemented for item type: ${item.type}`);
                return;
        }
    }

    /* -------------------------------------------- */
    /*  Quick Roll Methods (no dialog)              */
    /* -------------------------------------------- */

    /**
     * Perform a quick characteristic check without dialog
     * @param {string} characteristic - The characteristic key
     * @returns {Promise<D100RollResult|null>} The evaluated roll
     */
    async rollCharacteristicCheck(characteristic: string): Promise<D100RollResult | null> {
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

        return roll as D100RollResult | null;
    }

    /**
     * Perform a quick d100 check against a target number
     * @param {number} targetNumber - The target number
     * @returns {Promise<D100RollResult|null>} The evaluated roll
     */
    async rollCheck(targetNumber: number): Promise<D100RollResult | null> {
        const roll = await D100Roll.evaluate({
            actor: this,
            target: targetNumber,
            configure: false,
        });

        return roll as D100RollResult | null;
    }

    /**
     * Perform an opposed characteristic test
     * @param {Actor} targetActor - The opposing actor
     * @param {string} characteristic - The characteristic to test
     * @returns {Promise<Object>} The opposed test result
     */
    async opposedCharacteristicTest(targetActor: Actor | null, characteristic: string): Promise<unknown> {
        const sourceRoll = await this.rollCharacteristicCheck(characteristic);
        const wh40kTarget = targetActor as unknown as WH40KAcolyte | null;
        const targetRoll = wh40kTarget ? await wh40kTarget.rollCharacteristicCheck(characteristic) : null;
        return this.opposedTest(sourceRoll, targetRoll);
    }

    /**
     * Compare two roll results for opposed tests
     * @param {D100Roll} rollCheckSource - The source actor's roll
     * @param {D100Roll} rollCheckTarget - The target actor's roll
     * @returns {Object} The opposed test result
     */
    opposedTest(rollCheckSource: D100RollResult | null | undefined, rollCheckTarget: D100RollResult | null | undefined): unknown {
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

    getSkillFuzzy(skillName: string): unknown {
        const resolvedSkillName = this._resolveSkillName(skillName);
        const skill = this.skills[resolvedSkillName];
        if (skill) return skill;

        for (const [name, foundSkill] of Object.entries(this.skills)) {
            if (skillName.toUpperCase() === name.toUpperCase()) {
                return foundSkill;
            }
        }
        return undefined;
    }

    _findSpecialistSkill(skill: WH40KSkill, specialityName: string | number): SkillEntry | undefined {
        if (!Array.isArray(skill?.entries)) return undefined;
        const entries = skill.entries as SkillEntry[];
        if (Number.isInteger(specialityName)) return entries[specialityName as number];

        const index = Number.parseInt(String(specialityName), 10);
        if (!Number.isNaN(index) && entries[index]) return entries[index];

        return entries.find((entry) => entry.name?.toLowerCase() === `${specialityName}`.toLowerCase());
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
        return !!this.items.filter((i) => i.type === 'talent').find((t) => t.name === talent);
    }

    hasTalentFuzzyWords(words: string[]): boolean {
        return !!this.items
            .filter((i) => i.type === 'talent')
            .find((t) => {
                for (const word of words) {
                    if (!(t.name ?? '').includes(word)) return false;
                }
                return true;
            });
    }

    /* -------------------------------------------- */
    /*  Fate Actions                                */
    /* -------------------------------------------- */

    async spendFate(): Promise<void> {
        await this.update({
            'system.fate.value': this.system.fate.value - 1,
        });
    }
}
