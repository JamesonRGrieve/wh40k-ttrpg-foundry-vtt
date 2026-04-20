/**
 * Advancement Dialog
 *
 * Interactive dialog for purchasing character advancements using XP.
 * Supports characteristic advances, skills, and talents based on career.
 */

import type { WH40KBaseActor } from '../../documents/base-actor.ts';
import { getCareerAdvancements, getNextCharacteristicCost, getCareerKeyFromName, TIER_ORDER } from '../../config/advancements/index.ts';
import type { BaseSystemConfig } from '../../config/game-systems/base-system-config.ts';
import { SystemConfigRegistry } from '../../config/game-systems/index.ts';
import { SkillKeyHelper } from '../../helpers/skill-key-helper.ts';
import { checkPrerequisites } from '../../utils/prerequisite-validator.ts';
import { getAvailableXP, spendXP, canAfford } from '../../utils/xp-transaction.ts';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

interface AdvancementAdvance {
    name: string;
    type: 'skill' | 'talent';
    cost: number;
    specialization?: string;
    prerequisites?: Array<{ key: string; value: number }>;
}

interface AdvancementContext extends Record<string, unknown> {
    systemConfig: BaseSystemConfig | null;
    usesAptitudes: boolean;
    usesCareerTables: boolean;
    hasCareer: boolean;
    originCareerName: string | null;
    xp: { total: number; used: number; available: number; usedPercent: number };
    activeTab: string;
    tabs: Array<{ id: string; label: string; icon: string; active: boolean }>;
    characteristics: Record<string, unknown>[];
    skills: Record<string, unknown>[];
    talents: Record<string, unknown>[];
    recentPurchases: string[];
}

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

    actor: WH40KBaseActor;
    careerKey: string;
    #activeTab = 'characteristics';
    #recentPurchases = new Set<string>();

    /* -------------------------------------------- */
    /*  Construction                                */
    /* -------------------------------------------- */

    constructor(actor: WH40KBaseActor, options: { careerKey?: string } & ApplicationV2Config.DefaultOptions = {}) {
        super(options);
        this.actor = actor;
        this.careerKey = options.careerKey ?? 'rogueTrader';
    }

    /* -------------------------------------------- */

    /** @override */
    get title(): string {
        const systemConfig = SystemConfigRegistry.getOrNull((this.actor.system as any)?.gameSystem);
        if (systemConfig && !systemConfig.usesCareerTables) {
            return game.i18n.localize('WH40K.Advancement.Title') || 'Advancement';
        }
        const careerLabel = game.i18n.localize(CONFIG.wh40k?.careers?.[this.careerKey]?.label ?? this.careerKey);
        return game.i18n.format('WH40K.Advancement.TitleWithCareer', { career: careerLabel });
    }

    /* -------------------------------------------- */
    /*  Static Factory                              */
    /* -------------------------------------------- */

    static open(actor: WH40KBaseActor, options: Record<string, unknown> = {}): AdvancementDialog {
        const dialog = new this(actor, options);
        void dialog.render(true);
        return dialog;
    }

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @override */
    async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<AdvancementContext> {
        const context = (await super._prepareContext(options)) as AdvancementContext;

        const systemConfig = SystemConfigRegistry.getOrNull((this.actor.system as any)?.gameSystem);
        context.systemConfig = systemConfig;
        context.usesAptitudes = systemConfig?.usesAptitudes ?? false;
        context.usesCareerTables = systemConfig?.usesCareerTables ?? true;

        let career: any = null;

        if (systemConfig?.usesCareerTables || !systemConfig) {
            const originCareer = (this.actor.system as any).originPath?.career;
            const careerKey = getCareerKeyFromName(originCareer);
            context.hasCareer = !!careerKey;
            context.originCareerName = originCareer || null;

            if (!context.hasCareer) {
                context.xp = {
                    total: (this.actor.system as any).experience?.total ?? 0,
                    used: (this.actor.system as any).experience?.used ?? 0,
                    available: getAvailableXP(this.actor),
                    usedPercent: 0,
                };
                return context;
            }

            this.careerKey = careerKey;
            career = getCareerAdvancements(this.careerKey);
        } else {
            context.hasCareer = true;
            context.originCareerName = null;
        }

        const total = (this.actor.system as any).experience?.total ?? 0;
        const used = (this.actor.system as any).experience?.used ?? 0;
        context.xp = {
            total,
            used,
            available: getAvailableXP(this.actor),
            usedPercent: total > 0 ? Math.round((used / total) * 100) : 0,
        };

        context.activeTab = this.#activeTab;

        context.tabs = [
            { id: 'characteristics', label: 'WH40K.Advancement.Tab.Characteristics', icon: 'fa-chart-bar', active: this.#activeTab === 'characteristics' },
            { id: 'skills', label: 'WH40K.Advancement.Tab.Skills', icon: 'fa-book', active: this.#activeTab === 'skills' },
            { id: 'talents', label: 'WH40K.Advancement.Tab.Talents', icon: 'fa-star', active: this.#activeTab === 'talents' },
        ];

        context.characteristics = this.#prepareCharacteristics(career, systemConfig);

        if (systemConfig?.usesCareerTables || !systemConfig) {
            const advances = career?.RANK_1_ADVANCES ?? [];
            context.skills = this.#prepareAdvances(advances.filter((a: any) => a.type === 'skill'));
            context.talents = this.#prepareAdvances(advances.filter((a: any) => a.type === 'talent'));
        } else {
            context.skills = this.#prepareAptitudeSkills(systemConfig);
            context.talents = this.#prepareAptitudeTalents(systemConfig);
        }

        context.recentPurchases = [...this.#recentPurchases];

        return context;
    }

    #prepareCharacteristics(career: any, systemConfig: BaseSystemConfig | null): Record<string, unknown>[] {
        const characteristics = (this.actor.system as any).characteristics ?? {};
        const available = getAvailableXP(this.actor);
        const tierOrder = systemConfig ? systemConfig.characteristicTierOrder : TIER_ORDER;

        return Object.entries(CONFIG.wh40k?.characteristics ?? {})
            .filter(([key]) => key !== 'influence')
            .map(([key, config]: [string, any]) => {
                const char = characteristics[key] ?? {};
                const currentAdvances = char.advance ?? 0;

                const nextCost = systemConfig
                    ? systemConfig.getCharacteristicAdvanceCost(this.actor, key, currentAdvances)
                    : getNextCharacteristicCost(this.careerKey, key, currentAdvances);

                const isMaxed = currentAdvances >= tierOrder.length;
                const canPurchase = !isMaxed && nextCost && available >= nextCost.cost;

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

    #prepareAdvances(advances: any[]): Record<string, unknown>[] {
        const available = getAvailableXP(this.actor);

        return advances.map((advance, index) => {
            const id = `${advance.type}:${advance.name}:${advance.specialization ?? ''}`;
            const owned = this.#checkOwnership(advance);
            const prereqResult = checkPrerequisites(this.actor, advance.prerequisites ?? []);
            const canPurchase = !owned && prereqResult.valid && available >= advance.cost;
            const cantAfford = !owned && prereqResult.valid && available < advance.cost;
            const blocked = !owned && !prereqResult.valid;
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

    #prepareAptitudeSkills(systemConfig: any): any[] {
        const available = getAvailableXP(this.actor);
        const actorSkills = (this.actor.system as any).skills ?? {};
        const visibleSkills = systemConfig.getVisibleSkills?.() ?? new Set<string>();
        const skillConfigs = CONFIG.wh40k?.skills ?? {};
        const ranks = systemConfig.getSkillRanks();

        const result: any[] = [];

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

    #prepareAptitudeTalents(systemConfig: any): any[] {
        const available = getAvailableXP(this.actor);
        const result: any[] = [];

        for (const item of this.actor.items) {
            if (item.type !== 'talent') continue;
            if (!(item.system as any).stackable) continue;

            const cost = systemConfig.getTalentAdvanceCost?.(this.actor, item);
            const canPurchase = cost != null && available >= cost;

            result.push({
                id: `talent:${item.name}:rank`,
                name: item.name,
                displayName: `${item.name} (Rank ${((item.system as any).rank ?? 1) + 1})`,
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

    #checkOwnership(advance: AdvancementAdvance): boolean {
        if (advance.type === 'skill') {
            return this.#hasSkillTrained(advance.name, advance.specialization ?? '');
        } else if (advance.type === 'talent') {
            return this.#hasTalent(advance.name, advance.specialization ?? '');
        }
        return false;
    }

    #hasSkillTrained(skillName: string, specialization: string): boolean {
        const skills = (this.actor.system as any).skills;
        if (!skills) return false;

        const keyMap: Record<string, string> = {
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

        if (!specialization) {
            return skill.trained === true;
        }

        if (skill.entries) {
            return skill.entries.some(
                (entry: any) =>
                    (entry.name?.toLowerCase() === specialization.toLowerCase() || entry.slug?.toLowerCase() === specialization.toLowerCase()) &&
                    entry.trained === true,
            );
        }

        return false;
    }

    #hasTalent(talentName: string, specialization: string): boolean {
        const searchName = specialization ? `${talentName} (${specialization})`.toLowerCase() : talentName.toLowerCase();
        return this.actor.items.some((item) => item.type === 'talent' && item.name.toLowerCase() === searchName);
    }

    static #switchTab(this: AdvancementDialog, event: Event, target: HTMLElement): void {
        const tab = target.dataset.tab;
        if (tab) {
            this.#activeTab = tab;
            this.render();
        }
    }

    static async #purchaseCharacteristic(this: AdvancementDialog, event: Event, target: HTMLElement): Promise<void> {
        const charKey = target.dataset.characteristic;
        if (!charKey) return;

        const char = (this.actor.system as any).characteristics?.[charKey];
        if (!char) return;

        const currentAdvances = char.advance ?? 0;
        const systemConfig = SystemConfigRegistry.getOrNull((this.actor.system as any)?.gameSystem);
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

        const charConfig = CONFIG.wh40k?.characteristics?.[charKey];
        const charLabel = charConfig ? game.i18n.localize(charConfig.label) : charKey;
        const tierLabel = game.i18n.localize(CONFIG.wh40k?.advancementTiers?.[nextCost.tier]?.label ?? nextCost.tier);

        const confirmed = await Dialog.confirm({
            title: game.i18n.localize('WH40K.Advancement.Title'),
            content: game.i18n.format('WH40K.Advancement.ConfirmPurchase', { cost: nextCost.cost, name: `${charLabel} (${tierLabel})` }),
        });
        if (!confirmed) return;

        const result = await spendXP(this.actor, nextCost.cost, `${charLabel} (${tierLabel})`);
        if (!result.success) {
            ui.notifications.error(result.error);
            return;
        }

        const newAdvance = currentAdvances + 1;
        const currentCost = char.cost ?? 0;

        await this.actor.update({
            [`system.characteristics.${charKey}.advance`]: newAdvance,
            [`system.characteristics.${charKey}.cost`]: currentCost + nextCost.cost,
        });

        this.#recentPurchases.add(`char:${charKey}`);

        ui.notifications.info(
            game.i18n.format('WH40K.Advancement.PurchasedCharacteristic', {
                char: charLabel,
                tier: tierLabel,
                cost: nextCost.cost,
            }),
        );

        this.render();

        setTimeout(() => {
            this.#recentPurchases.delete(`char:${charKey}`);
        }, 2000);
    }

    static async #purchaseAdvance(this: AdvancementDialog, event: Event, target: HTMLElement): Promise<void> {
        const advanceIndex = parseInt(target.dataset.index ?? '0', 10);
        const advanceType = target.dataset.type;

        const career = getCareerAdvancements(this.careerKey);
        const advances = career?.RANK_1_ADVANCES ?? [];
        const typeAdvances = advances.filter((a: any) => a.type === advanceType);
        const advance = typeAdvances[advanceIndex];

        if (!advance) return;

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

        const confirmed = await Dialog.confirm({
            title: game.i18n.localize('WH40K.Advancement.Title'),
            content: game.i18n.format('WH40K.Advancement.ConfirmPurchase', { cost: advance.cost, name: displayName }),
        });
        if (!confirmed) return;

        const result = await spendXP(this.actor, advance.cost, displayName);
        if (!result.success) {
            ui.notifications.error(result.error);
            return;
        }

        if (advance.type === 'skill') {
            await this.#applySkillAdvance(advance);
        } else if (advance.type === 'talent') {
            await this.#applyTalentAdvance(advance);
        }

        const id = `${advance.type}:${advance.name}:${advance.specialization ?? ''}`;
        this.#recentPurchases.add(id);

        ui.notifications.info(
            game.i18n.format('WH40K.Advancement.Purchased', {
                name: displayName,
                cost: advance.cost,
            }),
        );

        this.render();

        setTimeout(() => {
            this.#recentPurchases.delete(id);
        }, 2000);
    }

    async #applySkillAdvance(advance: any): Promise<void> {
        const skillKey = SkillKeyHelper.nameToKey(advance.name);
        if (!skillKey) {
            console.warn(`AdvancementDialog: Unknown skill name "${advance.name}"`);
            return;
        }

        if (advance.specialization) {
            const currentEntries = (this.actor.system as any).skills?.[skillKey]?.entries ?? [];
            const entryIndex = currentEntries.findIndex((e: any) => (e.name || '').toLowerCase() === advance.specialization.toLowerCase());

            if (entryIndex >= 0) {
                const currentAdvance = currentEntries[entryIndex].advance ?? 0;
                const currentCost = currentEntries[entryIndex].cost ?? 0;
                await this.actor.update({
                    [`system.skills.${skillKey}.entries.${entryIndex}.advance`]: currentAdvance + 1,
                    [`system.skills.${skillKey}.entries.${entryIndex}.cost`]: currentCost + advance.cost,
                });
            } else {
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
            const currentAdvance = (this.actor.system as any).skills?.[skillKey]?.advance ?? 0;
            const currentCost = (this.actor.system as any).skills?.[skillKey]?.cost ?? 0;
            await this.actor.update({
                [`system.skills.${skillKey}.advance`]: currentAdvance + 1,
                [`system.skills.${skillKey}.cost`]: currentCost + advance.cost,
            });
        }
    }

    async #applyTalentAdvance(advance: any): Promise<void> {
        const talentName = advance.specialization ? `${advance.name} (${advance.specialization})` : advance.name;
        let talentData: any = null;

        for (const pack of game.packs.filter((p: any) => p.documentName === 'Item')) {
            const index = await pack.getIndex({ fields: ['name', 'type'] });
            const match = index.find((i: any) => i.type === 'talent' && i.name.toLowerCase() === talentName.toLowerCase());

            if (match) {
                const doc = await pack.getDocument(match._id);
                talentData = doc.toObject();
                break;
            }
        }

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

        talentData.system.cost = advance.cost;
        await this.actor.createEmbeddedDocuments('Item', [talentData]);
    }

    static async #openCompendiumItem(this: AdvancementDialog, event: Event, target: HTMLElement): Promise<void> {
        event.preventDefault();
        event.stopPropagation();

        const itemName = target.dataset.name;
        const itemType = target.dataset.type;

        if (!itemName) return;

        for (const pack of game.packs.filter((p: any) => p.documentName === 'Item')) {
            const index = await pack.getIndex({ fields: ['name', 'type'] });
            const match = index.find((i: any) => i.type === itemType && i.name.toLowerCase() === itemName.toLowerCase());

            if (match) {
                const doc = await pack.getDocument(match._id);
                void doc.sheet.render(true);
                return;
            }
        }

        for (const pack of game.packs.filter((p: any) => p.documentName === 'Item')) {
            const index = await pack.getIndex({ fields: ['name', 'type'] });
            const match = index.find((i: any) => i.name.toLowerCase() === itemName.toLowerCase());

            if (match) {
                const doc = await pack.getDocument(match._id);
                void doc.sheet.render(true);
                return;
            }
        }

        ui.notifications.warn(game.i18n.format('WH40K.Advancement.ItemNotFound', { name: itemName }));
    }
}
