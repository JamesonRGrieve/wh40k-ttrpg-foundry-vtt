/**
 * Unified Grants Processor
 *
 * Single source of truth for processing grants from items (talents, traits, origins).
 * Supports both immediate application (for talents) and batch processing (for origins).
 */

import { SkillKeyHelper } from '../helpers/skill-key-helper.ts';
import { evaluateWoundsFormula, evaluateFateFormula } from './formula-evaluator.ts';
import type { WH40KItem } from '../documents/item.ts';
import type { WH40KBaseActor as WH40KActor } from '../documents/base-actor.ts';
import type { ItemGrantData, SkillGrantData, CharacteristicGrantData, ChoiceGrantData, ResourceGrantData } from '../data/grant/_module.ts';

type GrantDataModel = ItemGrantData | SkillGrantData | CharacteristicGrantData | ChoiceGrantData | ResourceGrantData;

export interface Grant {
    name: string;
    level?: string | number;
    specialization?: string;
    uuid?: string;
    quantity?: number;
}

export interface GrantResult {
    characteristics: Record<string, number>;
    itemsToCreate: Array<Record<string, unknown>>;
    skillUpdates: Record<string, unknown>;
    woundsBonus: number;
    fateBonus: number;
    corruptionBonus: number;
    insanityBonus: number;
    aptitudes: string[];
    notifications: string[];
}

export interface ProcessingOptions {
    mode?: string;
    depth?: number;
    maxDepth?: number;
    dryRun?: boolean;
    showNotification?: boolean;
    sourceItem?: WH40KItem | null;
}

export interface ApplyOptions {
    showNotification?: boolean;
}

/**
 * Processing modes
 */
export const GRANT_MODE = {
    IMMEDIATE: 'immediate', // Apply grants immediately (talents, traits)
    BATCH: 'batch', // Collect grants for batch application (origins)
};

/**
 * Context object for grant processing
 */
class GrantContext {
    actor: WH40KActor;
    mode: string;
    depth: number;
    maxDepth: number;
    dryRun: boolean;
    showNotification: boolean;
    sourceItem: WH40KItem | null;
    result: GrantResult;

    constructor(actor: WH40KActor, options: ProcessingOptions = {}) {
        this.actor = actor;
        this.mode = options.mode || GRANT_MODE.IMMEDIATE;
        this.depth = options.depth || 0;
        this.maxDepth = options.maxDepth || 3;
        this.dryRun = options.dryRun || false;
        this.showNotification = options.showNotification ?? true;
        this.sourceItem = options.sourceItem || null;

        // Accumulated results
        this.result = {
            characteristics: {},
            itemsToCreate: [],
            skillUpdates: {},
            woundsBonus: 0,
            fateBonus: 0,
            corruptionBonus: 0,
            insanityBonus: 0,
            aptitudes: [],
            notifications: [],
        } as GrantResult;
    }
}

export class GrantsProcessor {
    /* -------------------------------------------- */
    /*  Main Entry Points                           */
    /* -------------------------------------------- */

    /**
     * Process grants from an item.
     */
    static async processGrants(item: WH40KItem, actor: WH40KActor, options: ProcessingOptions = {}): Promise<GrantResult> {
        if (!item || !actor) {
            console.warn('GrantsProcessor: Missing item or actor');
            return {} as GrantResult;
        }

        const context = new GrantContext(actor, options);

        // Check recursion depth
        if (context.depth >= context.maxDepth) {
            console.warn(`GrantsProcessor: Maximum recursion depth (${context.maxDepth}) reached for item: ${item.name}`);
            return context.result;
        }

        // Check if item has grants
        const grants = (item.system as { grants?: unknown }).grants;
        if (!grants) {
            game.wh40k?.log(`GrantsProcessor: No grants found on item: ${item.name}`);
            return context.result;
        }

        // Check if this is a talent with the hasGrants flag
        if (item.type === 'talent' && !(item.system as { hasGrants?: boolean }).hasGrants) {
            game.wh40k?.log(`GrantsProcessor: Talent ${item.name} has no hasGrants flag`);
            return context.result;
        }

        game.wh40k?.log(`GrantsProcessor: Processing grants from ${item.type}: ${item.name} (mode: ${context.mode}, depth: ${context.depth})`);

        // Process based on item type
        if (item.type === 'originPath' || (item.flags?.rt as { kind?: string })?.kind === 'origin') {
            await this._processOriginGrants(item, context);
        } else if (item.type === 'talent' || item.type === 'trait') {
            await this._processItemGrants(item, context);
        } else {
            console.warn(`GrantsProcessor: Unsupported item type: ${item.type}`);
            return context.result;
        }

        // Apply grants if in immediate mode and not dry run
        if (context.mode === GRANT_MODE.IMMEDIATE && !context.dryRun) {
            await this._applyGrantsImmediate(context);
        }

        return context.result;
    }

    /**
     * Apply accumulated grants to an actor (batch mode).
     * Used by origin path builder to commit all selected origins at once.
     */
    static async applyGrants(actor: WH40KActor, result: GrantResult, options: ApplyOptions = {}): Promise<void> {
        if (!actor || !result) return;

        const updates: Record<string, any> = {};

        // Apply characteristic advances
        if (result.characteristics && Object.keys(result.characteristics).length > 0) {
            for (const [char, value] of Object.entries(result.characteristics)) {
                if (value !== 0) {
                    const actorSystem = actor.system as { characteristics: Record<string, { advance: number }> };
                    const currentAdvance = actorSystem.characteristics[char]?.advance || 0;
                    updates[`system.characteristics.${char}.advance`] = currentAdvance + Number(value);
                }
            }
        }

        // Apply wounds bonus
        if (result.woundsBonus) {
            const actorSystem = actor.system as { wounds?: { value: number; max: number } };
            const current = actorSystem.wounds?.value || 0;
            const max = actorSystem.wounds?.max || 0;
            updates['system.wounds.value'] = current + result.woundsBonus;
            updates['system.wounds.max'] = max + result.woundsBonus;
        }

        // Apply fate bonus
        if (result.fateBonus) {
            const actorSystem = actor.system as { fate?: { value: number; max: number } };
            const current = actorSystem.fate?.value || 0;
            const max = actorSystem.fate?.max || 0;
            updates['system.fate.value'] = current + result.fateBonus;
            updates['system.fate.max'] = max + result.fateBonus;
        }

        // Apply corruption/insanity
        if (result.corruptionBonus) {
            const actorSystem = actor.system as { corruption?: { value: number } };
            const current = actorSystem.corruption?.value || 0;
            updates['system.corruption.value'] = current + result.corruptionBonus;
        }
        if (result.insanityBonus) {
            const actorSystem = actor.system as { insanity?: { value: number } };
            const current = actorSystem.insanity?.value || 0;
            updates['system.insanity.value'] = current + result.insanityBonus;
        }

        // Apply actor updates
        if (Object.keys(updates).length > 0) {
            await actor.update(updates as Record<string, unknown>);
        }

        // Create items
        const itemsToAdd = result.itemsToCreate.filter((i) => !i._upgradeExisting);
        if (itemsToAdd.length > 0) {
            await actor.createEmbeddedDocuments('Item', itemsToAdd as any[]);
        }

        // Apply skill upgrades
        const upgrades = result.itemsToCreate.filter((i) => i._upgradeExisting);
        for (const upgrade of upgrades) {
            const existingSkill = actor.items.get(upgrade._existingId as string);
            if (existingSkill) {
                const skillUpdates: Record<string, unknown> = {};
                const upgradeSystem = upgrade.system as { trained?: boolean; plus10?: boolean; plus20?: boolean };
                if (upgradeSystem.trained) skillUpdates['system.trained'] = true;
                if (upgradeSystem.plus10) skillUpdates['system.plus10'] = true;
                if (upgradeSystem.plus20) skillUpdates['system.plus20'] = true;
                if (Object.keys(skillUpdates).length > 0) {
                    await existingSkill.update(skillUpdates);
                }
            }
        }

        // Show notification
        if (options.showNotification !== false && result.itemsToCreate.length > 0) {
            ui.notifications.info(`Applied grants: ${result.itemsToCreate.length} items created/upgraded`);
        }
    }

    /**
     * Get a summary of what will be granted (dry run for previews).
     *
     * @param {WH40KItem} item - The item with grants
     * @param {WH40KActor} actor - The actor that would receive grants
     * @returns {Promise<object>} Summary object
     */
    static async getSummary(item, actor) {
        const result = await this.processGrants(item, actor, { dryRun: true, mode: GRANT_MODE.BATCH });

        return {
            characteristics: result.characteristics,
            wounds: result.woundsBonus,
            fate: result.fateBonus,
            corruption: result.corruptionBonus,
            insanity: result.insanityBonus,
            itemCount: result.itemsToCreate.length,
            items: result.itemsToCreate.map((i) => ({
                type: i.type,
                name: i.name,
                isUpgrade: i._upgradeExisting || false,
            })),
        };
    }

    /* -------------------------------------------- */
    /*  Origin Path Processing                      */
    /* -------------------------------------------- */

    /**
     * Process origin path grants (includes base + choice grants).
     * @private
     */
    static async _processOriginGrants(originItem: WH40KItem, context: GrantContext): Promise<void> {
        // 1. Process characteristic modifiers (from modifiers template)
        await this._processCharacteristicModifiers(originItem, context);

        // 2. Process base grants
        await this._processBaseGrants(originItem, context);

        // 3. Process selected choice grants
        await this._processChoiceGrants(originItem, context);
    }

    /**
     * Process characteristic modifiers from the modifiers template.
     * @private
     */
    static _processCharacteristicModifiers(originItem: WH40KItem, context: GrantContext): void {
        const charMods = (originItem.system as any)?.modifiers?.characteristics || {};
        for (const [char, value] of Object.entries(charMods as Record<string, number>)) {
            if (value !== 0) {
                context.result.characteristics[char] = (context.result.characteristics[char] || 0) + Number(value);
            }
        }
    }

    /**
     * Process base grants (always applied).
     * @private
     */
    static async _processBaseGrants(originItem: WH40KItem, context: GrantContext): Promise<void> {
        const grants = (originItem.system as any)?.grants || {};

        // Wounds - prefer formula over legacy field
        if (grants.woundsFormula) {
            const woundsValue = await this._evaluateWounds(grants.woundsFormula, context.actor, originItem);
            context.result.woundsBonus += woundsValue;
        } else if (grants.wounds && grants.wounds !== 0) {
            context.result.woundsBonus += grants.wounds;
            console.debug(`Origin "${originItem.name}" uses legacy grants.wounds field. Consider migrating to woundsFormula.`);
        }

        // Fate - prefer formula over legacy field
        if (grants.fateFormula) {
            const fateValue = await this._evaluateFate(grants.fateFormula, originItem);
            context.result.fateBonus += fateValue;
        } else if (grants.fateThreshold && grants.fateThreshold !== 0) {
            context.result.fateBonus += grants.fateThreshold;
            console.debug(`Origin "${originItem.name}" uses legacy grants.fateThreshold field. Consider migrating to fateFormula.`);
        }

        // Process grant arrays
        await this._processGrantArray(grants.skills, 'skill', context);
        await this._processGrantArray(grants.talents, 'talent', context);
        await this._processGrantArray(grants.traits, 'trait', context);
        await this._processGrantArray(grants.equipment, 'equipment', context);
        await this._processGrantArray(grants.specialAbilities, 'specialAbility', context);

        // Aptitudes (tracked but not created as items)
        if (grants.aptitudes && Array.isArray(grants.aptitudes)) {
            context.result.aptitudes.push(...grants.aptitudes);
        }

        // Direct corruption/insanity from base grants
        if (grants.corruption) {
            const corruptionValue = await this._evaluateDiceFormula(grants.corruption);
            context.result.corruptionBonus += corruptionValue;
        }
        if (grants.insanity) {
            const insanityValue = await this._evaluateDiceFormula(grants.insanity);
            context.result.insanityBonus += insanityValue;
        }
    }

    /**
     * Process choice grants from selectedChoices.
     * @private
     */
    static async _processChoiceGrants(originItem: WH40KItem, context: GrantContext): Promise<void> {
        const grants = (originItem.system as any)?.grants || {};
        const choices = grants.choices || [];
        const selectedChoices = (originItem.system as any)?.selectedChoices || {};

        for (const choice of choices) {
            const selected = selectedChoices[choice.label] || [];

            for (const selectedValue of selected) {
                const option = choice.options.find((opt: any) => opt.value === selectedValue);
                if (!option?.grants) {
                    console.warn(`Origin "${originItem.name}" choice "${choice.label}" has selection "${selectedValue}" but no grants found.`);
                    continue;
                }

                const optionGrants = option.grants;

                // Characteristics from choice
                if (optionGrants.characteristics) {
                    for (const [char, value] of Object.entries(optionGrants.characteristics as Record<string, number>)) {
                        if (value !== 0) {
                            context.result.characteristics[char] = (context.result.characteristics[char] || 0) + Number(value);
                            game.wh40k?.log(`Origin choice "${choice.label}" grants ${Number(value) >= 0 ? '+' : ''}${value} ${char}`);
                        }
                    }
                }

                // Process grant arrays from choice
                await this._processGrantArray(optionGrants.skills, 'skill', context, choice.label);
                await this._processGrantArray(optionGrants.talents, 'talent', context, choice.label);
                await this._processGrantArray(optionGrants.traits, 'trait', context, choice.label);
                await this._processGrantArray(optionGrants.equipment, 'equipment', context, choice.label);

                // Corruption/Insanity from choice
                if (optionGrants.corruption) {
                    const corruptionValue = await this._evaluateDiceFormula(optionGrants.corruption);
                    context.result.corruptionBonus += corruptionValue;
                    game.wh40k?.log(`Origin choice "${choice.label}" grants ${corruptionValue} corruption`);
                }
                if (optionGrants.insanity) {
                    const insanityValue = await this._evaluateDiceFormula(optionGrants.insanity);
                    context.result.insanityBonus += insanityValue;
                    game.wh40k?.log(`Origin choice "${choice.label}" grants ${insanityValue} insanity`);
                }
            }
        }
    }

    /* -------------------------------------------- */
    /*  Item Grant Processing (Talents/Traits)      */
    /* -------------------------------------------- */

    /**
     * Process grants from a talent or trait item.
     * @private
     */
    static async _processItemGrants(item: WH40KItem, context: GrantContext): Promise<void> {
        const grants = (item.system as any)?.grants;
        if (!grants) return;

        // Process grant arrays
        await this._processGrantArray(grants.talents, 'talent', context);
        await this._processGrantArray(grants.skills, 'skill', context);
        await this._processGrantArray(grants.traits, 'trait', context);
        await this._processGrantArray(grants.equipment, 'equipment', context);
    }

    /**
     * Process an array of grants.
     * @private
     */
    static async _processGrantArray(grantArray: any[], type: string, context: GrantContext, choiceLabel: string | null = null): Promise<void> {
        if (!grantArray || !Array.isArray(grantArray) || grantArray.length === 0) return;

        for (const grant of grantArray) {
            switch (type) {
                case 'skill':
                    await this._processSkillGrant(grant, context);
                    break;
                case 'talent':
                    await this._processTalentGrant(grant, context);
                    break;
                case 'trait':
                    await this._processTraitGrant(grant, context);
                    break;
                case 'equipment':
                    await this._processEquipmentGrant(grant, context);
                    break;
                case 'specialAbility':
                    await this._processSpecialAbilityGrant(grant, context);
                    break;
            }

            if (choiceLabel && context.showNotification) {
                context.result.notifications.push(`${choiceLabel}: ${grant.name || grant}`);
            }
        }
    }

    /* -------------------------------------------- */
    /*  Individual Grant Type Processors            */
    /* -------------------------------------------- */

    /**
     * Process a single skill grant.
     * Uses SkillKeyHelper for robust name-to-key conversion.
     * @private
     */
    static _processSkillGrant(skillGrant: any, context: GrantContext): void {
        // Normalize skill grant (might be string or object)
        const normalized = typeof skillGrant === 'string' ? { name: skillGrant, level: 'trained' } : skillGrant;

        // Validate skill name using SkillKeyHelper
        const skillKey = SkillKeyHelper.nameToKey(normalized.name);
        const metadata = SkillKeyHelper.getSkillMetadata(skillKey);

        if (!metadata) {
            console.warn(`SkillGrant: Unknown skill "${normalized.name}", skipping`);
            return;
        }

        // Check if skill is specialist type
        const isSpecialist = metadata.isSpecialist;
        const displayName = metadata.name;

        // For specialist skills, the grant must specify a specialization
        if (isSpecialist && !normalized.specialization) {
            console.warn(`SkillGrant: Specialist skill "${displayName}" requires specialization, skipping`);
            return;
        }

        // Check if skill already exists on actor
        const existingSkill = context.actor.items.find(
            (i) =>
                i.type === 'skill' &&
                i.name.toLowerCase() === displayName.toLowerCase() &&
                (!normalized.specialization || (i.system as any)?.specialization === normalized.specialization),
        );

        if (existingSkill) {
            // Skill exists - mark for upgrade
            context.result.itemsToCreate.push({
                _upgradeExisting: true,
                _existingId: existingSkill.id,
                type: 'skill',
                name: displayName,
                system: {
                    characteristic: metadata.characteristic,
                    specialization: normalized.specialization || '',
                    trained: normalized.level === 'trained' || normalized.level === 'plus10' || normalized.level === 'plus20',
                    plus10: normalized.level === 'plus10' || normalized.level === 'plus20',
                    plus20: normalized.level === 'plus20',
                },
            });

            if (context.showNotification) {
                const fullName = normalized.specialization ? `${displayName} (${normalized.specialization})` : displayName;
                context.result.notifications.push(`Skill: ${fullName} (upgrade to ${normalized.level})`);
            }
        } else {
            // Create new skill item with proper metadata
            context.result.itemsToCreate.push({
                type: 'skill',
                name: displayName,
                system: {
                    characteristic: metadata.characteristic,
                    skillType: isSpecialist ? 'specialist' : metadata.isAdvanced ? 'advanced' : 'basic',
                    isBasic: !metadata.isAdvanced,
                    specialization: normalized.specialization || '',
                    trained: normalized.level === 'trained' || normalized.level === 'plus10' || normalized.level === 'plus20',
                    plus10: normalized.level === 'plus10' || normalized.level === 'plus20',
                    plus20: normalized.level === 'plus20',
                },
            });

            if (context.showNotification) {
                const fullName = normalized.specialization ? `${displayName} (${normalized.specialization})` : displayName;
                context.result.notifications.push(`Skill: ${fullName} (${normalized.level})`);
            }
        }
    }

    /**
     * Process a single talent grant.
     * May trigger recursive processing if talent has grants.
     * @private
     */
    static async _processTalentGrant(talentGrant: any, context: GrantContext): Promise<void> {
        // Check for duplicates
        const existing = context.actor.items.find(
            (i) =>
                i.type === 'talent' &&
                i.name === talentGrant.name &&
                (!talentGrant.specialization || (i.system as any)?.specialization === talentGrant.specialization),
        );

        if (existing) {
            game.wh40k?.log(`Talent ${talentGrant.name} already exists, skipping grant`);
            return;
        }

        // Fetch talent from UUID or compendium
        let talentItem: any = null;
        if (talentGrant.uuid) {
            try {
                talentItem = await fromUuid(talentGrant.uuid);
                if (!talentItem) {
                    console.warn(`Failed to resolve talent UUID: ${talentGrant.uuid} (${talentGrant.name})`);
                }
            } catch (err) {
                console.error(`Error loading talent ${talentGrant.uuid}:`, err);
            }
        }

        // Fallback: search all Item packs by name
        if (!talentItem) {
            talentItem = await this._findInAllPacks(talentGrant.name);
        }

        if (!talentItem) {
            console.warn(`Could not find talent: ${talentGrant.name}`);
            // Create basic talent as fallback
            this._createBasicTalent(talentGrant, context);
            return;
        }

        // Clone item data
        const itemData = talentItem.toObject();
        if (talentGrant.specialization) {
            (itemData.system as any).specialization = talentGrant.specialization;
            // Strip any existing "(X)" suffix so we don't produce "Name (X) (X)"
            const bareName = itemData.name.replace(/\s*\([^)]+\)\s*$/, '').trim();
            itemData.name = `${bareName} (${talentGrant.specialization})`;
        }

        // Mark as granted
        itemData.flags = itemData.flags || {};
        itemData.flags['wh40k-rpg'] = itemData.flags['wh40k-rpg'] || {};
        if (context.sourceItem) {
            itemData.flags['wh40k-rpg'].grantedBy = context.sourceItem.name;
            itemData.flags['wh40k-rpg'].grantedById = context.sourceItem.id;
            itemData.flags['wh40k-rpg'].autoGranted = true;
        }

        context.result.itemsToCreate.push(itemData as Record<string, unknown>);

        if (context.showNotification) {
            context.result.notifications.push(`Talent: ${talentGrant.name}`);
        }

        // Recursive processing for granted talent's grants (immediate mode only)
        if (context.mode === GRANT_MODE.IMMEDIATE && (talentItem.system as any)?.hasGrants) {
            const nestedContext = new GrantContext(context.actor, {
                mode: context.mode as any,
                depth: context.depth + 1,
                maxDepth: context.maxDepth,
                dryRun: context.dryRun,
                showNotification: false, // Suppress nested notifications
                sourceItem: talentItem,
            });

            await this._processItemGrants(talentItem, nestedContext);

            // Merge nested results into parent context
            this._mergeResults(context.result, nestedContext.result);
        }
    }

    /**
     * Create a basic talent item when full data is unavailable.
     * @private
     */
    static _createBasicTalent(talentGrant: any, context: GrantContext): void {
        const itemData = {
            type: 'talent',
            name: talentGrant.name,
            system: {
                specialization: talentGrant.specialization || '',
            },
        };

        context.result.itemsToCreate.push(itemData);

        if (context.showNotification) {
            context.result.notifications.push(`Talent: ${talentGrant.name} (basic)`);
        }
    }

    /**
     * Process a single trait grant.
     * @private
     */
    static async _processTraitGrant(traitGrant: any, context: GrantContext): Promise<void> {
        // Check for duplicates (stackable traits can increase level)
        const existing = context.actor.items.find((i) => i.type === 'trait' && i.name === traitGrant.name);

        if (existing && (existing.system as any).stackable && traitGrant.level != null) {
            // Increase stackable trait level
            const newLevel = ((existing.system as any).level || 1) + (traitGrant.level || 1);
            context.result.skillUpdates[`items.${existing.id}.system.level`] = newLevel;
            game.wh40k?.log(`Increased trait ${traitGrant.name} level to ${newLevel}`);
            return;
        } else if (existing) {
            game.wh40k?.log(`Trait ${traitGrant.name} already exists, skipping grant`);
            return;
        }

        // Fetch trait from UUID or compendium
        let traitItem: any = null;
        if (traitGrant.uuid) {
            try {
                traitItem = await fromUuid(traitGrant.uuid);
            } catch (err) {
                console.error(`Error loading trait ${traitGrant.uuid}:`, err);
            }
        }

        if (!traitItem) {
            traitItem = await this._findInAllPacks(traitGrant.name);
        }

        if (!traitItem) {
            console.warn(`Could not find trait: ${traitGrant.name}`);
            this._createBasicTrait(traitGrant, context);
            return;
        }

        // Clone item data
        const itemData = traitItem.toObject();
        if (traitGrant.level != null) {
            (itemData.system as any).level = traitGrant.level;
        }

        // Mark as granted
        itemData.flags = itemData.flags || {};
        itemData.flags['wh40k-rpg'] = itemData.flags['wh40k-rpg'] || {};
        if (context.sourceItem) {
            itemData.flags['wh40k-rpg'].grantedBy = context.sourceItem.name;
            itemData.flags['wh40k-rpg'].grantedById = context.sourceItem.id;
            itemData.flags['wh40k-rpg'].autoGranted = true;
        }

        context.result.itemsToCreate.push(itemData as Record<string, unknown>);

        if (context.showNotification) {
            context.result.notifications.push(`Trait: ${traitGrant.name}`);
        }
    }

    /**
     * Create a basic trait item when full data is unavailable.
     * @private
     */
    static _createBasicTrait(traitGrant: any, context: GrantContext): void {
        const itemData = {
            type: 'trait',
            name: traitGrant.name,
            system: {
                level: traitGrant.level || null,
            },
        };

        context.result.itemsToCreate.push(itemData);

        if (context.showNotification) {
            context.result.notifications.push(`Trait: ${traitGrant.name} (basic)`);
        }
    }

    /**
     * Process a single equipment grant.
     * @private
     */
    static async _processEquipmentGrant(equipGrant: any, context: GrantContext): Promise<void> {
        let doc: any = null;

        // Try UUID first
        if (equipGrant.uuid) {
            try {
                doc = await fromUuid(equipGrant.uuid);
                if (!doc) {
                    console.warn(`Could not find equipment with UUID: ${equipGrant.uuid}`);
                }
            } catch (err) {
                console.error(`Error fetching equipment ${equipGrant.uuid}:`, err);
            }
        }

        // Fallback: search all Item packs by name
        if (!doc && equipGrant.name) {
            doc = await this._findInAllPacks(equipGrant.name);
        }

        if (!doc) {
            console.warn(`Could not find equipment: ${equipGrant.name || equipGrant.uuid}`);
            return;
        }

        const itemData = doc.toObject();
        if (equipGrant.quantity && equipGrant.quantity > 1) {
            (itemData.system as any).quantity = equipGrant.quantity;
        }
        context.result.itemsToCreate.push(itemData as Record<string, unknown>);

        if (context.showNotification) {
            context.result.notifications.push(`Equipment: ${equipGrant.name}`);
        }
    }

    /**
     * Process a special ability grant.
     * @private
     */
    static _processSpecialAbilityGrant(abilityGrant: any, context: GrantContext): void {
        // Special abilities are descriptive text, not items
        // They could be stored as journal entries or just logged
        game.wh40k?.log(`Special ability granted: ${abilityGrant.name || abilityGrant}`);

        if (context.showNotification) {
            context.result.notifications.push(`Special Ability: ${abilityGrant.name || abilityGrant}`);
        }
    }

    /* -------------------------------------------- */
    /*  Application Methods                         */
    /* -------------------------------------------- */

    /**
     * Apply grants immediately (talent/trait mode).
     * @private
     */
    static async _applyGrantsImmediate(context: GrantContext): Promise<void> {
        // Create items
        const itemsToAdd = context.result.itemsToCreate.filter((i) => !i._upgradeExisting);
        if (itemsToAdd.length > 0) {
            await context.actor.createEmbeddedDocuments('Item', itemsToAdd);
        }

        // Apply skill upgrades
        const upgrades = context.result.itemsToCreate.filter((i) => i._upgradeExisting);
        for (const upgrade of upgrades) {
            const existingSkill = context.actor.items.get(upgrade._existingId as string);
            if (existingSkill) {
                const skillUpdates: Record<string, any> = {};
                if ((upgrade.system as any).trained) skillUpdates['system.trained'] = true;
                if ((upgrade.system as any).plus10) skillUpdates['system.plus10'] = true;
                if ((upgrade.system as any).plus20) skillUpdates['system.plus20'] = true;
                if (Object.keys(skillUpdates).length > 0) {
                    await (existingSkill as any).update(skillUpdates);
                }
            }
        }

        // Apply other skill updates
        if (Object.keys(context.result.skillUpdates).length > 0) {
            await context.actor.update(context.result.skillUpdates);
        }

        // Show notification (only at depth 0)
        if (context.depth === 0 && context.showNotification && context.result.notifications.length > 0) {
            const sourceItemName = context.sourceItem?.name || 'Item';
            const message = `<strong>${sourceItemName}</strong> granted:<br/>• ${context.result.notifications.join('<br/>• ')}`;
            ui.notifications.info(message, { permanent: false });
        }
    }

    /* -------------------------------------------- */
    /*  Formula Evaluation                          */
    /* -------------------------------------------- */

    /**
     * Evaluate wounds formula with optional stored roll.
     * @private
     */
    static _evaluateWounds(formula: string, actor: WH40KActor, originItem: WH40KItem): Promise<number> {
        const storedRoll = (originItem.system as any)?.rollResults?.wounds;

        if (storedRoll?.rolled !== null && storedRoll?.rolled !== undefined) {
            game.wh40k?.log(`Using stored wounds roll: ${storedRoll.rolled} (${storedRoll.breakdown})`);
            return Promise.resolve(storedRoll.rolled);
        }

        const evaluated = evaluateWoundsFormula(formula, actor);
        game.wh40k?.log(`Evaluated wounds formula "${formula}": ${evaluated}`);
        return Promise.resolve(evaluated);
    }

    /**
     * Evaluate fate formula with optional stored roll.
     * @private
     */
    static _evaluateFate(formula: string, originItem: WH40KItem): Promise<number> {
        const storedRoll = (originItem.system as any)?.rollResults?.fate;

        if (storedRoll?.rolled !== null && storedRoll?.rolled !== undefined) {
            game.wh40k?.log(`Using stored fate roll: ${storedRoll.rolled} (${storedRoll.breakdown})`);
            return Promise.resolve(storedRoll.rolled);
        }

        const evaluated = evaluateFateFormula(formula);
        game.wh40k?.log(`Evaluated fate formula "${formula}": ${evaluated}`);
        return Promise.resolve(evaluated);
    }

    /**
     * Evaluate a dice formula like "1d5" or "2d10".
     * @private
     */
    static async _evaluateDiceFormula(formula: string): Promise<number> {
        try {
            const roll = new Roll(formula);
            await roll.evaluate();
            return roll.total;
        } catch (err) {
            console.error(`Error evaluating dice formula "${formula}":`, err);
            const parsed = parseInt(formula);
            return isNaN(parsed) ? 0 : parsed;
        }
    }

    /* -------------------------------------------- */
    /*  Utility Methods                             */
    /* -------------------------------------------- */

    /**
     * Find an item in a compendium pack by name.
     * @private
     */
    static async _findInCompendium(packId: string, itemName: string): Promise<any> {
        const pack = game.packs.get(packId);
        if (!pack) {
            console.error(`Compendium pack not found: ${packId}`);
            return null;
        }

        const index = await pack.getIndex({ fields: ['name'] });
        const entry = index.find((i: any) => i.name === itemName);
        if (entry) {
            return await pack.getDocument(entry._id as string);
        }

        return null;
    }

    /**
     * Find an item by name across all Item compendium packs.
     * Talents/traits/gear are spread across system-specific packs
     * (dh2-core-stats-talents, rt-core-items-traits, etc.).
     * @private
     */
    static async _findInAllPacks(itemName: string): Promise<any> {
        if (!itemName) return null;

        const nameLower = itemName.toLowerCase();

        for (const pack of game.packs) {
            if (pack.documentName !== 'Item') continue;

            const index = await pack.getIndex({ fields: ['name'] });
            const entry = index.find((i: any) => i.name === itemName || (i.name as string).toLowerCase() === nameLower);
            if (entry) {
                return await pack.getDocument(entry._id as string);
            }
        }

        return null;
    }

    /**
     * Merge nested result into parent result.
     * @private
     */
    static _mergeResults(parent: GrantResult, child: GrantResult): void {
        // Merge characteristics
        for (const [char, value] of Object.entries(child.characteristics)) {
            parent.characteristics[char] = (parent.characteristics[char] || 0) + Number(value);
        }

        // Merge items
        parent.itemsToCreate.push(...child.itemsToCreate);

        // Merge skill updates
        Object.assign(parent.skillUpdates, child.skillUpdates);

        // Merge bonuses
        parent.woundsBonus += child.woundsBonus;
        parent.fateBonus += child.fateBonus;
        parent.corruptionBonus += child.corruptionBonus;
        parent.insanityBonus += child.insanityBonus;

        // Merge aptitudes
        parent.aptitudes.push(...child.aptitudes);

        // Merge notifications
        parent.notifications.push(...child.notifications);
    }
}

/**
 * Handle removal of an item that granted other items.
 * Prompts user to optionally remove granted items.
 *
 * @param {WH40KItem} item - The item being removed (talent/trait)
 * @param {WH40KActor} actor - The actor losing the item
 * @returns {Promise<void>}
 */
export async function handleGrantRemoval(item: WH40KItem, actor: WH40KActor): Promise<void> {
    if (!item || !actor) return;
    if (item.type !== 'talent' && item.type !== 'trait') return;
    if (item.type === 'talent' && !(item.system as any)?.hasGrants) return;

    // Find all items granted by this item
    const grantedItems = actor.items.filter((i: any) => (i.flags['wh40k-rpg'] as any)?.grantedById === item.id);

    if (grantedItems.length === 0) return;

    // Ask user if they want to remove granted items
    const itemNames = grantedItems.map((i) => i.name).join(', ');
    const content = `
    <p><strong>${item.name}</strong> granted the following abilities:</p>
    <p style="margin-left: 1em; color: #d4af37;">${itemNames}</p>
    <p>Do you want to remove these granted abilities as well?</p>
  `;

    const remove = await (Dialog as any).confirm({
        title: 'Remove Granted Abilities?',
        content: content,
        yes: () => true,
        no: () => false,
        defaultYes: false,
    });

    if (remove) {
        const ids = grantedItems.map((i) => i.id);
        await actor.deleteEmbeddedDocuments('Item', ids);
        ui.notifications.info(`Removed ${grantedItems.length} granted abilities from ${item.name}`);
    }
}
