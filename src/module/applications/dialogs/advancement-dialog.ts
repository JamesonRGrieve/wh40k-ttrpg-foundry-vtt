/**
 * Advancement Dialog
 *
 * Interactive dialog for purchasing character advancements using XP.
 * Supports characteristic advances, skills, and talents based on career.
 */

import { getCareerAdvancements, getNextCharacteristicCost, getCareerKeyFromName, TIER_ORDER } from '../../config/advancements/index.ts';
import type { BaseSystemConfig } from '../../config/game-systems/base-system-config.ts';
import { SystemConfigRegistry } from '../../config/game-systems/index.ts';
import { SkillKeyHelper } from '../../helpers/skill-key-helper.ts';
import { checkPrerequisites } from '../../utils/prerequisite-validator.ts';
import { getAvailableXP, spendXP, canAfford } from '../../utils/xp-transaction.ts';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export default class AdvancementDialog extends HandlebarsApplicationMixin(ApplicationV2) {
    /* -------------------------------------------- */
    /*  Configuration                               */
    /* -------------------------------------------- */

    /** @override */
    static DEFAULT_OPTIONS = {
        id: 'advancement-dialog-{id}',
        classes: ['wh40k-rpg', 'advancement-dialog'],
        tag: 'div',
        window: {
            title: 'WH40K.Advancement.Title',
            icon: 'fa-solid fa-chart-line',
            minimizable: true,
            resizable: true,
        },
        position: {
            width: 700,
            height: 650,
        },
        actions: {
            purchaseCharacteristic: AdvancementDialog.#purchaseCharacteristic,
            purchaseAdvance: AdvancementDialog.#purchaseAdvance,
            switchTab: AdvancementDialog.#switchTab,
            openCompendiumItem: AdvancementDialog.#openCompendiumItem,
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        dialog: {
            template: 'systems/wh40k-rpg/templates/dialogs/advancement-dialog.hbs',
            scrollable: ['.wh40k-adv__content'],
        },
    };

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /** @type {Actor} */
    actor = null;

    /** @type {string} */
    careerKey = 'rogueTrader';

    /** @type {string} */
    #activeTab = 'characteristics';

    /** @type {Set<string>} Track purchased advances this session for animation */
    #recentPurchases = new Set();

    /* -------------------------------------------- */
    /*  Construction                                */
    /* -------------------------------------------- */

    /**
     * @param {Actor} actor - The actor to advance
     * @param {object} options - Additional options
     * @param {string} [options.careerKey] - Career key for advancement options
     */
    constructor(actor, options: Record<string, unknown> = {}) {
        super(options);
        this.actor = actor;
        this.careerKey = options.careerKey ?? 'rogueTrader';
    }

    /* -------------------------------------------- */

    /** @override */
    get title(): string {
        const systemConfig = SystemConfigRegistry.getOrNull(this.actor?.system?.gameSystem);
        if (systemConfig && !systemConfig.usesCareerTables) {
            return game.i18n.localize('WH40K.Advancement.Title') || 'Advancement';
        }
        const careerLabel = game.i18n.localize(CONFIG.wh40k?.careers?.[this.careerKey]?.label ?? this.careerKey);
        return game.i18n.format('WH40K.Advancement.TitleWithCareer', { career: careerLabel });
    }

    /* -------------------------------------------- */
    /*  Static Factory                              */
    /* -------------------------------------------- */

    /**
     * Open the advancement dialog for an actor
     * @param {Actor} actor - The actor
     * @param {object} options - Options
     * @returns {AdvancementDialog}
     */
    static open(actor: any, options: Record<string, unknown> = {}): any {
        const dialog = new this(actor, options);
        void dialog.render(true);
        return dialog;
    }

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @override */
    async _prepareContext(options: Record<string, unknown>): Promise<any> {
        const context: any = await super._prepareContext(options);

        // Get system config early — determines career-based vs aptitude-based flow
        const systemConfig = SystemConfigRegistry.getOrNull(this.actor.system?.gameSystem);
        context.systemConfig = systemConfig;
        context.usesAptitudes = systemConfig?.usesAptitudes ?? false;
        context.usesCareerTables = systemConfig?.usesCareerTables ?? true;

        let career: any = null;

        if (systemConfig?.usesCareerTables || !systemConfig) {
            // Career-based systems (RT, DH1e, DW): require a career selection
            const originCareer = this.actor.system.originPath?.career;
            const careerKey = getCareerKeyFromName(originCareer);
            context.hasCareer = !!careerKey;
            context.originCareerName = originCareer || null;

            if (!context.hasCareer) {
                context.xp = {
                    total: this.actor.system.experience?.total ?? 0,
                    used: this.actor.system.experience?.used ?? 0,
                    available: getAvailableXP(this.actor),
                    usedPercent: 0,
                };
                return context;
            }

            this.careerKey = careerKey;
            career = getCareerAdvancements(this.careerKey);
        } else {
            // Aptitude-based systems (DH2e, BC, OW): no career needed
            context.hasCareer = true;
            context.originCareerName = null;
        }

        // XP Summary
        const total = this.actor.system.experience?.total ?? 0;
        const used = this.actor.system.experience?.used ?? 0;
        context.xp = {
            total,
            used,
            available: getAvailableXP(this.actor),
            usedPercent: total > 0 ? Math.round((used / total) * 100) : 0,
        };

        // Active tab
        context.activeTab = this.#activeTab;

        // Prepare tabs
        context.tabs = [
            { id: 'characteristics', label: 'WH40K.Advancement.Tab.Characteristics', icon: 'fa-chart-bar', active: this.#activeTab === 'characteristics' },
            { id: 'skills', label: 'WH40K.Advancement.Tab.Skills', icon: 'fa-book', active: this.#activeTab === 'skills' },
            { id: 'talents', label: 'WH40K.Advancement.Tab.Talents', icon: 'fa-star', active: this.#activeTab === 'talents' },
        ];

        // Prepare characteristic advances
        context.characteristics = this.#prepareCharacteristics(career, systemConfig);

        // Prepare skill and talent advances
        if (systemConfig?.usesCareerTables || !systemConfig) {
            // Career-based: use fixed advance list
            const advances = career?.RANK_1_ADVANCES ?? [];
            context.skills = this.#prepareAdvances(advances.filter((a) => a.type === 'skill'));
            context.talents = this.#prepareAdvances(advances.filter((a) => a.type === 'talent'));
        } else {
            // Aptitude-based: prepare skills from actor's skill items with aptitude costs
            context.skills = this.#prepareAptitudeSkills(systemConfig);
            context.talents = this.#prepareAptitudeTalents(systemConfig);
        }

        // Recent purchases for animation
        context.recentPurchases = [...this.#recentPurchases];

        return context;
    }

    /* -------------------------------------------- */

    /**
     * Prepare characteristic advancement data.
     * Uses system config for cost calculation when available, falls back to career registry.
     * @param {Object} career - Career advancement data (for career-based systems)
     * @param {BaseSystemConfig|null} systemConfig - System config (for all systems)
     * @returns {Array}
     */
    #prepareCharacteristics(career: any, systemConfig: BaseSystemConfig | null): any {
        const characteristics = this.actor.system.characteristics ?? {};
        const available = getAvailableXP(this.actor);

        // Use system config tier order if available, fall back to career registry
        const tierOrder = systemConfig ? systemConfig.characteristicTierOrder : TIER_ORDER;

        return Object.entries(CONFIG.wh40k?.characteristics ?? {})
            .filter(([key]) => key !== 'influence')
            .map(([key, config]) => {
                const char = characteristics[key] ?? {};
                const currentAdvances = char.advance ?? 0;

                // Compute cost using system config or career registry
                const nextCost = systemConfig
                    ? systemConfig.getCharacteristicAdvanceCost(this.actor, key, currentAdvances)
                    : getNextCharacteristicCost(this.careerKey, key, currentAdvances);

                const isMaxed = currentAdvances >= tierOrder.length;
                const canPurchase = !isMaxed && nextCost && available >= nextCost.cost;

                // Build tier display from system config tiers
                const tiers = tierOrder.map((tier, index) => ({
                    tier,
                    label: game.i18n.localize(CONFIG.wh40k?.advancementTiers?.[tier]?.label ?? tier),
                    purchased: index < currentAdvances,
                    current: index === currentAdvances,
                }));

                return {
                    key,
                    label: game.i18n.localize(config.label),
                    abbreviation: config.abbreviation,
                    currentValue: char.total ?? 0,
                    currentAdvances,
                    tiers,
                    nextCost: nextCost?.cost ?? null,
                    nextTier: nextCost?.tier ?? null,
                    nextTierLabel: nextCost ? game.i18n.localize(CONFIG.wh40k?.advancementTiers?.[nextCost.tier]?.label ?? nextCost.tier) : null,
                    isMaxed,
                    canPurchase,
                    cantAfford: !isMaxed && nextCost && available < nextCost.cost,
                    recentlyPurchased: this.#recentPurchases.has(`char:${key}`),
                };
            });
    }

    /* -------------------------------------------- */

    /**
     * Prepare skill/talent advancement data
     * @param {Array} advances - Array of advancement definitions
     * @returns {Array}
     */
    #prepareAdvances(advances: unknown[]): any {
        const available = getAvailableXP(this.actor);

        return advances.map((advance, index) => {
            const id = `${advance.type}:${advance.name}:${advance.specialization ?? ''}`;

            // Check if already owned
            const owned = this.#checkOwnership(advance);

            // Check prerequisites
            const prereqResult = checkPrerequisites(this.actor, advance.prerequisites ?? []);

            // Determine state
            const canPurchase = !owned && prereqResult.valid && available >= advance.cost;
            const cantAfford = !owned && prereqResult.valid && available < advance.cost;
            const blocked = !owned && !prereqResult.valid;

            // Display name
            const displayName = advance.specialization ? `${advance.name} (${advance.specialization})` : advance.name;

            return {
                id,
                index,
                name: advance.name,
                specialization: advance.specialization ?? null,
                displayName,
                cost: advance.cost,
                type: advance.type,
                prerequisites: advance.prerequisites ?? [],
                prereqDisplay: prereqResult.unmet,
                owned,
                canPurchase,
                cantAfford,
                blocked,
                recentlyPurchased: this.#recentPurchases.has(id),
            };
        });
    }

    /* -------------------------------------------- */

    /**
     * Prepare skill advances for aptitude-based systems (DH2e, BC, OW).
     * Lists all visible skills with their current rank, next cost, and aptitude match count.
     */
    #prepareAptitudeSkills(systemConfig: any): unknown[] {
        const available = getAvailableXP(this.actor);
        const actorSkills = this.actor.system.skills ?? {};
        const visibleSkills = systemConfig.getVisibleSkills?.() ?? new Set<string>();
        const skillConfigs = CONFIG.wh40k?.skills ?? {};
        const ranks = systemConfig.getSkillRanks();

        const result: unknown[] = [];

        for (const skillKey of visibleSkills) {
            const config = skillConfigs[skillKey];
            if (!config) continue;
            const skillData = actorSkills[skillKey] ?? {};
            const currentRank = skillData.advance ?? 0;
            const isMaxed = currentRank >= ranks.length;
            const cost = isMaxed ? null : systemConfig.getSkillAdvanceCost(this.actor, skillKey, currentRank);
            const canPurchase = !isMaxed && cost != null && available >= cost;

            const currentLabel = currentRank > 0 ? ranks[currentRank - 1]?.tooltip : 'Untrained';
            const nextLabel = !isMaxed && ranks[currentRank] ? ranks[currentRank].tooltip : null;

            result.push({
                id: `skill:${skillKey}`,
                name: config.label ?? skillKey,
                displayName: config.label ?? skillKey,
                type: 'skill',
                skillKey,
                cost,
                currentRank,
                currentLabel,
                nextLabel,
                owned: isMaxed,
                canPurchase,
                cantAfford: !isMaxed && cost != null && available < cost,
                blocked: false,
            });
        }

        return result.sort((a, b) => a.name.localeCompare(b.name));
    }

    /* -------------------------------------------- */

    /**
     * Prepare talent advances for aptitude-based systems (DH2e, BC, OW).
     * Lists actor's existing talents that can be ranked up, plus a note about browsing compendiums.
     */
    #prepareAptitudeTalents(systemConfig: any): unknown[] {
        const available = getAvailableXP(this.actor);
        const result: unknown[] = [];

        // List existing talents that are stackable (can be ranked up)
        for (const item of this.actor.items) {
            if (item.type !== 'talent') continue;
            if (!item.system.stackable) continue;

            const cost = systemConfig.getTalentAdvanceCost?.(this.actor, item);
            const canPurchase = cost != null && available >= cost;

            result.push({
                id: `talent:${item.name}:rank`,
                name: item.name,
                displayName: `${item.name} (Rank ${(item.system.rank ?? 1) + 1})`,
                type: 'talent',
                cost,
                owned: false,
                canPurchase,
                cantAfford: cost != null && available < cost,
                blocked: false,
            });
        }

        return result.sort((a, b) => a.name.localeCompare(b.name));
    }

    /* -------------------------------------------- */

    /**
     * Check if actor already owns an advancement
     * @param {Object} advance - Advancement definition
     * @returns {boolean}
     */
    #checkOwnership(advance: any): boolean {
        if (advance.type === 'skill') {
            return this.#hasSkillTrained(advance.name, advance.specialization);
        } else if (advance.type === 'talent') {
            return this.#hasTalent(advance.name, advance.specialization);
        }
        return false;
    }

    /* -------------------------------------------- */

    /**
     * Check if actor has a skill trained
     * @param {string} skillName - Skill name
     * @param {string} [specialization] - Optional specialization
     * @returns {boolean}
     */
    #hasSkillTrained(skillName: string, specialization: string): boolean {
        const skills = this.actor.system.skills;
        if (!skills) return false;

        // Map skill names to keys
        const keyMap = {
            'awareness': 'awareness',
            'command': 'command',
            'commerce': 'commerce',
            'charm': 'charm',
            'ciphers': 'ciphers',
            'common lore': 'commonLore',
            'dodge': 'dodge',
            'evaluate': 'evaluate',
            'literacy': 'literacy',
            'pilot': 'pilot',
            'scholastic lore': 'scholasticLore',
            'secret tongue': 'secretTongue',
            'speak language': 'speakLanguage',
        };

        const skillKey = keyMap[skillName.toLowerCase()] ?? skillName.toLowerCase().replace(/\s+/g, '');
        const skill = skills[skillKey];

        if (!skill) return false;

        // Non-specialist skill
        if (!specialization) {
            return skill.trained === true;
        }

        // Specialist skill - check entries
        if (skill.entries) {
            return skill.entries.some(
                (entry) =>
                    (entry.name?.toLowerCase() === specialization.toLowerCase() || entry.slug?.toLowerCase() === specialization.toLowerCase()) &&
                    entry.trained === true,
            );
        }

        return false;
    }

    /* -------------------------------------------- */

    /**
     * Check if actor has a talent
     * @param {string} talentName - Talent name
     * @param {string} [specialization] - Optional specialization
     * @returns {boolean}
     */
    #hasTalent(talentName: string, specialization: string): boolean {
        const searchName = specialization ? `${talentName} (${specialization})`.toLowerCase() : talentName.toLowerCase();

        return this.actor.items.some((item) => item.type === 'talent' && item.name.toLowerCase() === searchName);
    }

    /* -------------------------------------------- */
    /*  Actions                                     */
    /* -------------------------------------------- */

    /**
     * Switch active tab
     * @param {Event} event
     * @param {HTMLElement} target
     */
    static #switchTab(this: any, event: Event, target: HTMLElement): void {
        const tab = target.dataset.tab;
        if (tab) {
            this.#activeTab = tab;
            this.render();
        }
    }

    /* -------------------------------------------- */

    /**
     * Purchase a characteristic advance
     * @param {Event} event
     * @param {HTMLElement} target
     */
    static async #purchaseCharacteristic(this: any, event: Event, target: HTMLElement): Promise<void> {
        const charKey = target.dataset.characteristic;
        if (!charKey) return;

        const char = this.actor.system.characteristics?.[charKey];
        if (!char) return;

        const currentAdvances = char.advance ?? 0;

        // Use system config for cost calculation when available, fall back to career registry
        const systemConfig = SystemConfigRegistry.getOrNull(this.actor.system?.gameSystem);
        const nextCost = systemConfig
            ? systemConfig.getCharacteristicAdvanceCost(this.actor, charKey, currentAdvances)
            : getNextCharacteristicCost(this.careerKey, charKey, currentAdvances);

        if (!nextCost) {
            ui.notifications.warn(game.i18n.localize('WH40K.Advancement.Error.MaxedOut'));
            return;
        }

        if (!canAfford(this.actor, nextCost.cost)) {
            ui.notifications.warn(game.i18n.localize('WH40K.Advancement.Error.CannotAfford'));
            return;
        }

        // Get display info
        const charConfig = CONFIG.wh40k?.characteristics?.[charKey];
        const charLabel = charConfig ? game.i18n.localize(charConfig.label) : charKey;
        const tierLabel = game.i18n.localize(CONFIG.wh40k?.advancementTiers?.[nextCost.tier]?.label ?? nextCost.tier);

        // Confirm before spending
        const confirmed = await Dialog.confirm({
            title: game.i18n.localize('WH40K.Advancement.Title'),
            content: game.i18n.format('WH40K.Advancement.ConfirmPurchase', { cost: nextCost.cost, name: `${charLabel} (${tierLabel})` }),
        });
        if (!confirmed) return;

        // Spend XP
        const result = await spendXP(this.actor, nextCost.cost, `${charLabel} (${tierLabel})`);
        if (!result.success) {
            ui.notifications.error(result.error);
            return;
        }

        // Apply the characteristic advance
        const newAdvance = currentAdvances + 1;
        const currentCost = char.cost ?? 0;

        await this.actor.update({
            [`system.characteristics.${charKey}.advance`]: newAdvance,
            [`system.characteristics.${charKey}.cost`]: currentCost + nextCost.cost,
        });

        // Mark as recently purchased for animation
        this.#recentPurchases.add(`char:${charKey}`);

        // Notify success
        ui.notifications.info(
            game.i18n.format('WH40K.Advancement.PurchasedCharacteristic', {
                char: charLabel,
                tier: tierLabel,
                cost: nextCost.cost,
            }),
        );

        // Re-render to show updated state
        this.render();

        // Clear animation flag after delay
        setTimeout(() => {
            this.#recentPurchases.delete(`char:${charKey}`);
        }, 2000);
    }

    /* -------------------------------------------- */

    /**
     * Purchase a skill or talent advance
     * @param {Event} event
     * @param {HTMLElement} target
     */
    static async #purchaseAdvance(this: any, event: Event, target: HTMLElement): Promise<void> {
        const advanceIndex = parseInt(target.dataset.index, 10);
        const advanceType = target.dataset.type;

        const career = getCareerAdvancements(this.careerKey);
        const advances = career?.RANK_1_ADVANCES ?? [];
        const typeAdvances = advances.filter((a) => a.type === advanceType);
        const advance = typeAdvances[advanceIndex];

        if (!advance) return;

        // Validate
        if (!canAfford(this.actor, advance.cost)) {
            ui.notifications.warn(game.i18n.localize('WH40K.Advancement.Error.CannotAfford'));
            return;
        }

        const prereqResult = checkPrerequisites(this.actor, advance.prerequisites ?? []);
        if (!prereqResult.valid) {
            ui.notifications.warn(
                game.i18n.format('WH40K.Advancement.Error.PrerequisitesNotMet', {
                    reasons: prereqResult.unmet.join(', '),
                }),
            );
            return;
        }

        const displayName = advance.specialization ? `${advance.name} (${advance.specialization})` : advance.name;

        // Confirm before spending
        const confirmed = await Dialog.confirm({
            title: game.i18n.localize('WH40K.Advancement.Title'),
            content: game.i18n.format('WH40K.Advancement.ConfirmPurchase', { cost: advance.cost, name: displayName }),
        });
        if (!confirmed) return;

        // Spend XP
        const result = await spendXP(this.actor, advance.cost, displayName);
        if (!result.success) {
            ui.notifications.error(result.error);
            return;
        }

        // Apply the advance
        if (advance.type === 'skill') {
            await this.#applySkillAdvance(advance);
        } else if (advance.type === 'talent') {
            await this.#applyTalentAdvance(advance);
        }

        // Mark as recently purchased
        const id = `${advance.type}:${advance.name}:${advance.specialization ?? ''}`;
        this.#recentPurchases.add(id);

        // Notify
        ui.notifications.info(
            game.i18n.format('WH40K.Advancement.Purchased', {
                name: displayName,
                cost: advance.cost,
            }),
        );

        // Re-render
        this.render();

        // Clear animation
        setTimeout(() => {
            this.#recentPurchases.delete(id);
        }, 2000);
    }

    /* -------------------------------------------- */

    /**
     * Apply a skill advance to the actor.
     * Increments the skill's `advance` field (XP-purchased rank increases).
     * Effective rank is computed at runtime from origin path rank + advance.
     * @param {Object} advance - Skill advance data
     */
    async #applySkillAdvance(advance: any): Promise<void> {
        const skillKey = SkillKeyHelper.nameToKey(advance.name);
        if (!skillKey) {
            console.warn(`AdvancementDialog: Unknown skill name "${advance.name}"`);
            return;
        }

        if (advance.specialization) {
            // Specialist skill — find or create entry, increment its advance
            const currentEntries = this.actor.system.skills?.[skillKey]?.entries ?? [];
            const entryIndex = currentEntries.findIndex((e) => (e.name || '').toLowerCase() === advance.specialization.toLowerCase());

            if (entryIndex >= 0) {
                // Existing entry — increment advance
                const currentAdvance = currentEntries[entryIndex].advance ?? 0;
                const currentCost = currentEntries[entryIndex].cost ?? 0;
                await this.actor.update({
                    [`system.skills.${skillKey}.entries.${entryIndex}.advance`]: currentAdvance + 1,
                    [`system.skills.${skillKey}.entries.${entryIndex}.cost`]: currentCost + advance.cost,
                });
            } else {
                // New specialist entry
                const newEntry = {
                    name: advance.specialization,
                    slug: advance.specialization.toLowerCase().replace(/\s+/g, '-'),
                    advance: 1,
                    bonus: 0,
                    cost: advance.cost,
                };
                await this.actor.update({
                    [`system.skills.${skillKey}.entries`]: [...currentEntries, newEntry],
                });
            }
        } else {
            // Standard skill — increment advance
            const currentAdvance = this.actor.system.skills?.[skillKey]?.advance ?? 0;
            const currentCost = this.actor.system.skills?.[skillKey]?.cost ?? 0;
            await this.actor.update({
                [`system.skills.${skillKey}.advance`]: currentAdvance + 1,
                [`system.skills.${skillKey}.cost`]: currentCost + advance.cost,
            });
        }
    }

    /* -------------------------------------------- */

    /**
     * Apply a talent advance to the actor
     * @param {Object} advance - Talent advance data
     */
    async #applyTalentAdvance(advance: any): Promise<void> {
        const talentName = advance.specialization ? `${advance.name} (${advance.specialization})` : advance.name;

        // Try to find talent in compendium
        let talentData = null;

        // Search in compendiums
        for (const pack of game.packs.filter((p) => p.documentName === 'Item')) {
            const index = await pack.getIndex({ fields: ['name', 'type'] });
            const match = index.find((i) => (i as any).type === 'talent' && (i as any).name.toLowerCase() === talentName.toLowerCase());

            if (match) {
                const doc = await pack.getDocument(match._id);
                talentData = doc.toObject();
                break;
            }
        }

        // If not found, create basic talent
        if (!talentData) {
            talentData = {
                name: talentName,
                type: 'talent',
                system: {
                    cost: advance.cost,
                    description: '',
                },
            };
        }

        // Ensure cost is set
        talentData.system.cost = advance.cost;

        // Create the item on the actor
        await this.actor.createEmbeddedDocuments('Item', [talentData]);
    }

    /* -------------------------------------------- */

    /**
     * Open compendium item sheet for reference
     * @param {Event} event
     * @param {HTMLElement} target
     */
    static async #openCompendiumItem(this: any, event: Event, target: HTMLElement): Promise<void> {
        event.preventDefault();
        event.stopPropagation();

        const itemName = target.dataset.name;
        const itemType = target.dataset.type;

        if (!itemName) return;

        // Search for the item in compendiums
        for (const pack of game.packs.filter((p) => p.documentName === 'Item')) {
            const index = await pack.getIndex({ fields: ['name', 'type'] });
            const match = index.find((i) => (i as any).type === itemType && (i as any).name.toLowerCase() === itemName.toLowerCase());

            if (match) {
                const doc = await pack.getDocument(match._id);
                void doc.sheet.render(true);
                return;
            }
        }

        // If not found as exact type, try searching all items
        for (const pack of game.packs.filter((p) => p.documentName === 'Item')) {
            const index = await pack.getIndex({ fields: ['name', 'type'] });
            const match = index.find((i) => (i as any).name.toLowerCase() === itemName.toLowerCase());

            if (match) {
                const doc = await pack.getDocument(match._id);
                void doc.sheet.render(true);
                return;
            }
        }

        // Not found
        ui.notifications.warn(game.i18n.format('WH40K.Advancement.ItemNotFound', { name: itemName }));
    }
}
