/**
 * Advancement Dialog
 *
 * Interactive dialog for purchasing character advancements using XP.
 * Supports characteristic advances, skills, and talents based on career.
 */

import { getCareerAdvancements, getNextCharacteristicCost, getCareerKeyFromName, TIER_ORDER } from '../../config/advancements/index.ts';
import { AptitudeBasedSystemConfig } from '../../config/game-systems/aptitude-based-system-config.ts';
import type { BaseSystemConfig } from '../../config/game-systems/base-system-config.ts';
import { SystemConfigRegistry } from '../../config/game-systems/index.ts';
import type { Prerequisite } from '../../config/game-systems/types.ts';
import type { WH40KBaseActor } from '../../documents/base-actor.ts';
import type { WH40KItem } from '../../documents/item.ts';
import { SkillKeyHelper } from '../../helpers/skill-key-helper.ts';
import { checkPrerequisites } from '../../utils/prerequisite-validator.ts';
import { getAvailableXP, spendXP, canAfford } from '../../utils/xp-transaction.ts';
import type { ApplicationV2Ctor } from '../api/application-types.ts';
const { ApplicationV2, HandlebarsApplicationMixin } =
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry global `foundry.applications` has no shipped type for the v2 api namespace
    (foundry.applications as unknown as { api: { ApplicationV2: ApplicationV2Ctor; HandlebarsApplicationMixin: <T extends ApplicationV2Ctor>(base: T) => T } })
        .api;

interface AdvancementAdvance {
    name: string;
    type: 'skill' | 'talent';
    cost: number;
    specialization?: string;
    prerequisites?: Prerequisite[];
}

interface AdvancementActorCharacteristic {
    advance?: number;
    advances?: number;
    total?: number;
    cost?: number;
}

interface AdvancementActorSkillEntry {
    name?: string;
    slug?: string;
    specialization?: string;
    rank?: number;
    advance?: number;
    cost?: number;
    trained?: boolean;
}

interface AdvancementActorSkill {
    label?: string;
    rank?: number;
    advance?: number;
    cost?: number;
    trained?: boolean;
    entries?: AdvancementActorSkillEntry[];
}

interface AdvancementActorSystem {
    gameSystem?: string;
    originPath?: { career?: string };
    experience?: { total?: number; used?: number };
    psy?: { rating?: number };
    characteristics?: Record<string, AdvancementActorCharacteristic>;
    skills?: Record<string, AdvancementActorSkill>;
}

interface AdvancementMatchInfo {
    matches: number;
    matched: string[];
    unmatched: string[];
    all: string[];
}

interface PreparedAdvance {
    id: string;
    index: number;
    name: string;
    displayName: string;
    type: 'skill' | 'talent';
    cost: number;
    specialization: string | null;
    prerequisites: Prerequisite[];
    prereqDisplay: string[];
    owned: boolean;
    canPurchase: boolean;
    cantAfford: boolean;
    blocked: boolean;
    recentlyPurchased: boolean;
}

interface PreparedSkillAdvance {
    id: string;
    index?: number;
    name: string;
    displayName: string;
    type: 'skill';
    skillKey: string;
    cost: number | null;
    specialization?: string;
    currentRank: number;
    currentLabel: string;
    nextLabel: string | null;
    owned: boolean;
    canPurchase: boolean;
    cantAfford: boolean;
    blocked: boolean;
    aptitudeMatch: AdvancementMatchInfo | null;
}

interface PreparedTalentAdvance {
    id: string;
    index?: number;
    uuid: string;
    name: string;
    displayName: string;
    type: 'talent';
    kind: 'specialist' | 'stackable' | 'single';
    tier: number;
    cost: number | null;
    owned: boolean;
    ownedSpecs?: string[];
    currentRank?: number;
    canPurchase: boolean;
    cantAfford: boolean;
    blocked: boolean;
    prereqDisplay: string[];
    aptitudeMatch: AdvancementMatchInfo | null;
}

interface PreparedPsychicPower {
    id: string;
    index?: number;
    uuid: string;
    name: string;
    displayName: string;
    discipline: string;
    disciplineLabel: string;
    prCost: number;
    cost: number;
    owned: boolean;
    canPurchase: boolean;
    cantAfford: boolean;
    blocked: boolean;
    prereqDisplay: string[];
}

interface PreparedPsychicPanel {
    psyAdvance: {
        currentRating: number;
        nextRating: number;
        cost: number | null;
        canPurchase: boolean;
        cantAfford: boolean;
        maxed: boolean;
    };
    disciplines: Array<{
        label: string;
        items: PreparedPsychicPower[];
        tiers: Array<{ prCost: number; label: string; accessible: boolean; items: PreparedPsychicPower[] }>;
    }>;
    chips: Array<{ key: string; label: string; count: number; accessible: number; active: boolean }>;
    availableOnly: boolean;
    hasBlocked: boolean;
}

interface PreparedEliteAdvance {
    id: string;
    index?: number;
    uuid: string;
    name: string;
    summary: string;
    cost: number;
    owned: boolean;
    canPurchase: boolean;
    cantAfford: boolean;
}

interface PreparedTraitPanel {
    owned: Array<{ id: string; name: string; description: string; source: string }>;
    elites: PreparedEliteAdvance[];
}

// eslint-disable-next-line no-restricted-syntax -- boundary: Foundry render context returned by _prepareContext is typed loosely
interface AdvancementContext extends Record<string, unknown> {
    systemConfig: BaseSystemConfig | null;
    _gameSystemId: string;
    usesAptitudes: boolean;
    usesCareerTables: boolean;
    hasCareer: boolean;
    originCareerName: string | null;
    xp: { total: number; used: number; available: number; usedPercent: number };
    activeTab: string;
    tabs: Array<{ id: string; label: string; icon: string; active: boolean }>;
    // eslint-disable-next-line no-restricted-syntax -- boundary: heterogeneous prepared rows passed straight to Handlebars
    characteristics: unknown[];
    // eslint-disable-next-line no-restricted-syntax -- boundary: heterogeneous prepared rows passed straight to Handlebars
    skills: unknown[];
    // eslint-disable-next-line no-restricted-syntax -- boundary: heterogeneous prepared rows passed straight to Handlebars
    talents: unknown[];
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
            // eslint-disable-next-line no-restricted-syntax -- localization key resolved by Foundry V14 ApplicationV2 at render
            title: 'WH40K.Advancement.Title' as const,
            icon: 'fa-solid fa-chart-line',
            minimizable: true,
            resizable: true,
        },
        position: {
            width: 700,
            height: 650,
        },
        /* eslint-disable @typescript-eslint/unbound-method -- ApplicationV2 actions accept method references and bind `this` itself */
        actions: {
            purchaseCharacteristic: AdvancementDialog.#purchaseCharacteristic,
            purchaseAdvance: AdvancementDialog.#purchaseAdvance,
            purchasePsyRating: AdvancementDialog.#purchasePsyRating,
            switchTab: AdvancementDialog.#switchTab,
            switchDiscipline: AdvancementDialog.#switchDiscipline,
            toggleAvailableOnly: AdvancementDialog.#toggleAvailableOnly,
            openCompendiumItem: AdvancementDialog.#openCompendiumItem,
        },
        /* eslint-enable @typescript-eslint/unbound-method */
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
    #activeDiscipline = 'all';
    #psyAvailableOnly = false;
    readonly #recentPurchases = new Set<string>();

    /* -------------------------------------------- */
    /*  Construction                                */
    /* -------------------------------------------- */

    constructor(actor: WH40KBaseActor, options: { careerKey?: string } & ApplicationV2Config.DefaultOptions = {}) {
        super(options);
        this.actor = actor;
        this.careerKey = options.careerKey ?? 'rogueTrader';
    }

    #getActorSystem(): AdvancementActorSystem {
        return this.actor.system;
    }

    #getSystemConfig(): BaseSystemConfig | null {
        return SystemConfigRegistry.getOrNull(this.#getActorSystem().gameSystem ?? '');
    }

    #getAptitudeConfig(systemConfig: BaseSystemConfig | null): AptitudeBasedSystemConfig | null {
        return systemConfig instanceof AptitudeBasedSystemConfig ? systemConfig : null;
    }

    #getGameSystemId(): string {
        const id = this.#getActorSystem().gameSystem;
        return id !== undefined && id.length > 0 ? id : 'dh2e';
    }

    /* -------------------------------------------- */

    /** @override */
    get title(): string {
        const systemConfig = this.#getSystemConfig();
        if (systemConfig !== null && !systemConfig.usesCareerTables) {
            const localized = game.i18n.localize('WH40K.Advancement.Title');
            return localized.length > 0 ? localized : 'Advancement';
        }
        const career = CONFIG.wh40k.careers[this.careerKey];
        const careerLabel = game.i18n.localize(career !== undefined ? career.label : this.careerKey);
        return game.i18n.format('WH40K.Advancement.TitleWithCareer', { career: careerLabel });
    }

    /* -------------------------------------------- */
    /*  Static Factory                              */
    /* -------------------------------------------- */

    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry ApplicationV2 constructor options bag
    static open(actor: WH40KBaseActor, options: Record<string, unknown> = {}): AdvancementDialog {
        const dialog = new this(actor, options);
        void dialog.render({ force: true });
        return dialog;
    }

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @override */
    async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<AdvancementContext> {
        // eslint-disable-next-line no-restricted-syntax -- boundary: super._prepareContext has a loose Foundry signature
        const context = (await super._prepareContext(options as unknown as never)) as AdvancementContext;
        const system = this.#getActorSystem();

        const systemConfig = this.#getSystemConfig();
        context.systemConfig = systemConfig;
        // eslint-disable-next-line no-restricted-syntax -- legacy actors may lack `gameSystem`; default to 'rt' for display only
        context._gameSystemId = this.#getActorSystem().gameSystem ?? 'rt';
        context.usesAptitudes = systemConfig?.usesAptitudes ?? false;
        context.usesCareerTables = systemConfig?.usesCareerTables ?? true;

        // eslint-disable-next-line no-restricted-syntax -- boundary: prerequisites coming from career module are heterogeneous before validation
        let career: { RANK_1_ADVANCES?: Array<{ name: string; cost: number; type: string; specialization?: string; prerequisites?: unknown[] }> } | null = null;

        if (systemConfig === null || systemConfig.usesCareerTables) {
            const originCareer = system.originPath?.career;
            const careerKey = getCareerKeyFromName(originCareer ?? '');
            context.hasCareer = careerKey !== null;
            context.originCareerName = originCareer !== undefined && originCareer.length > 0 ? originCareer : null;

            if (careerKey === null) {
                context.xp = {
                    total: system.experience?.total ?? 0,
                    used: system.experience?.used ?? 0,
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

        const total = system.experience?.total ?? 0;
        const used = system.experience?.used ?? 0;
        context.xp = {
            total,
            used,
            available: getAvailableXP(this.actor),
            usedPercent: total > 0 ? Math.round((used / total) * 100) : 0,
        };

        context.activeTab = this.#activeTab;

        const tabs = [
            { id: 'characteristics', label: 'WH40K.Advancement.Tab.Characteristics', icon: 'fa-chart-bar', active: this.#activeTab === 'characteristics' },
            { id: 'skills', label: 'WH40K.Advancement.Tab.Skills', icon: 'fa-book', active: this.#activeTab === 'skills' },
            { id: 'talents', label: 'WH40K.Advancement.Tab.Talents', icon: 'fa-star', active: this.#activeTab === 'talents' },
        ];
        if (systemConfig?.usesAptitudes === true) {
            const psyRating = system.psy?.rating ?? 0;
            if (psyRating > 0) {
                tabs.push({ id: 'psychic', label: 'WH40K.Advancement.Tab.Psychic', icon: 'fa-brain', active: this.#activeTab === 'psychic' });
            }
            tabs.push({ id: 'traits', label: 'WH40K.Advancement.Tab.Traits', icon: 'fa-dna', active: this.#activeTab === 'traits' });
        }
        context.tabs = tabs;

        context.characteristics = this.#prepareCharacteristics(career, systemConfig);

        if (systemConfig === null || systemConfig.usesCareerTables) {
            const advances = career?.RANK_1_ADVANCES ?? [];
            context.skills = this.#prepareAdvances(advances.filter((a) => a.type === 'skill') as AdvancementAdvance[]);
            context.talents = this.#prepareAdvances(advances.filter((a) => a.type === 'talent') as AdvancementAdvance[]);
        } else {
            const aptitudeConfig = this.#getAptitudeConfig(systemConfig);
            if (aptitudeConfig === null) return context;
            context.skills = this.#prepareAptitudeSkills(aptitudeConfig);
            context.talents = await this.#prepareAptitudeTalents(aptitudeConfig);
        }

        // Psychic Powers tab — psykers only
        if (systemConfig?.usesAptitudes === true) {
            const aptitudeConfig = this.#getAptitudeConfig(systemConfig);
            const psyRating = system.psy?.rating ?? 0;
            context.isPsyker = psyRating > 0;
            if (context.isPsyker && aptitudeConfig !== null) {
                context.psychic = await this.#preparePsychic(aptitudeConfig);
            }
            context.traits = await this.#prepareTraitPanel();
        }

        context.recentPurchases = [...this.#recentPurchases];

        return context;
    }

    #prepareCharacteristics(
        // eslint-disable-next-line no-restricted-syntax -- boundary: prerequisites coming from career module are heterogeneous before validation
        _career: { RANK_1_ADVANCES?: Array<{ name: string; cost: number; type: string; specialization?: string; prerequisites?: unknown[] }> } | null,
        systemConfig: BaseSystemConfig | null,
        // eslint-disable-next-line no-restricted-syntax -- boundary: prepared characteristics rows are heterogeneous and passed straight to Handlebars
    ): Record<string, unknown>[] {
        const characteristics = this.#getActorSystem().characteristics ?? {};
        const available = getAvailableXP(this.actor);
        const tierOrder = systemConfig ? systemConfig.characteristicTierOrder : TIER_ORDER;
        const aptitudeConfig = this.#getAptitudeConfig(systemConfig);

        return Object.entries(CONFIG.wh40k.characteristics)
            .filter(([key]) => key !== 'influence')
            .map(([key, config]: [string, { label: string; abbreviation?: string }]) => {
                const char = characteristics[key] ?? {};
                const currentAdvances = char.advance ?? 0;

                const nextCost =
                    systemConfig !== null
                        ? systemConfig.getCharacteristicAdvanceCost(this.actor, key, currentAdvances)
                        : getNextCharacteristicCost(this.careerKey, key, currentAdvances);

                const isMaxed = currentAdvances >= tierOrder.length;
                const canPurchase = !isMaxed && nextCost !== null && available >= nextCost.cost;

                const tiers = tierOrder.map((tier, index) => {
                    const tierConfig = CONFIG.wh40k.advancementTiers[tier];
                    return {
                        tier,
                        label: game.i18n.localize(tierConfig !== undefined ? tierConfig.label : tier),
                        purchased: index < currentAdvances,
                        current: index === currentAdvances,
                    };
                });

                // Aptitude match info (aptitude-based systems only; others get nulls)
                const match = aptitudeConfig !== null ? aptitudeConfig.getAdvanceMatchInfo(this.actor, aptitudeConfig.getCharacteristicAptitudes(key)) : null;

                return {
                    key,
                    label: game.i18n.localize(config.label),
                    abbreviation: config.abbreviation,
                    currentValue: char.total ?? 0,
                    currentAdvances,
                    tiers,
                    nextCost: nextCost?.cost ?? null,
                    nextTier: nextCost?.tier ?? null,
                    nextTierLabel:
                        nextCost !== null
                            ? game.i18n.localize(
                                  CONFIG.wh40k.advancementTiers[nextCost.tier] !== undefined
                                      ? CONFIG.wh40k.advancementTiers[nextCost.tier].label
                                      : nextCost.tier,
                              )
                            : null,
                    isMaxed,
                    canPurchase,
                    cantAfford: !isMaxed && nextCost !== null && available < nextCost.cost,
                    recentlyPurchased: this.#recentPurchases.has(`char:${key}`),
                    aptitudeMatch: match,
                };
            });
    }

    #prepareAdvances(advances: AdvancementAdvance[]): PreparedAdvance[] {
        const available = getAvailableXP(this.actor);

        return advances.map((advance, index) => {
            const id = `${advance.type}:${advance.name}:${advance.specialization ?? ''}`;
            const owned = this.#checkOwnership(advance);
            const prereqResult = checkPrerequisites(this.actor, advance.prerequisites ?? []);
            const canPurchase = !owned && prereqResult.valid && available >= advance.cost;
            const cantAfford = !owned && prereqResult.valid && available < advance.cost;
            const blocked = !owned && !prereqResult.valid;
            const displayName =
                advance.specialization !== undefined && advance.specialization.length > 0 ? `${advance.name} (${advance.specialization})` : advance.name;

            return {
                id,
                index,
                name: advance.name,
                specialization: advance.specialization ?? null,
                displayName,
                cost: advance.cost,
                type: advance.type,
                prerequisites: advance.prerequisites ?? [],
                prereqDisplay: prereqResult.unmet.filter((s): s is string => s !== undefined),
                owned,
                canPurchase,
                cantAfford,
                blocked,
                recentlyPurchased: this.#recentPurchases.has(id),
            };
        });
    }

    #prepareAptitudeSkills(systemConfig: AptitudeBasedSystemConfig): PreparedSkillAdvance[] {
        const available = getAvailableXP(this.actor);
        const actorSkills = this.#getActorSystem().skills ?? {};
        const visibleSkills = systemConfig.getVisibleSkills?.() ?? new Set<string>();
        const ranks = systemConfig.getSkillRanks();

        const result: PreparedSkillAdvance[] = [];

        for (const skillKey of visibleSkills) {
            const skillData = actorSkills[skillKey];
            if (skillData === undefined) continue;

            const label = skillData.label !== undefined && skillData.label.length > 0 ? skillData.label : skillKey;
            const skillAptitudes = typeof systemConfig.getSkillAptitudes === 'function' ? systemConfig.getSkillAptitudes(skillKey) : [];
            const match = typeof systemConfig.getAdvanceMatchInfo === 'function' ? systemConfig.getAdvanceMatchInfo(this.actor, skillAptitudes) : null;

            const hasEntries = Array.isArray(skillData.entries);

            if (hasEntries) {
                // Specialist skill: each entry (e.g. Common Lore: Imperium) is its own progression track.
                for (const entry of skillData.entries ?? []) {
                    const entryRank = entry.rank ?? entry.advance ?? 0;
                    const entryName =
                        entry.name !== undefined && entry.name.length > 0
                            ? entry.name
                            : entry.specialization !== undefined && entry.specialization.length > 0
                            ? entry.specialization
                            : 'Unknown';
                    const entryLabel = `${label} (${entryName})`;
                    const entryIsMaxed = entryRank >= ranks.length;
                    const entryCost = entryIsMaxed ? null : systemConfig.getSkillAdvanceCost(this.actor, skillKey, entryRank);
                    const entryCanPurchase = !entryIsMaxed && entryCost !== null && available >= entryCost;
                    const entryCurrentLabel = entryRank > 0 ? ranks[entryRank - 1]?.tooltip ?? 'Untrained' : 'Untrained';
                    const entryNextRank = ranks[entryRank];
                    const entryNextLabel = !entryIsMaxed && entryNextRank !== undefined ? entryNextRank.tooltip : null;
                    const entryNextDisplay = entryNextLabel !== null && entryNextLabel.length > 0 ? `${entryLabel} — ${entryNextLabel}` : entryLabel;

                    result.push({
                        id: `skill:${skillKey}:${entryName}`,
                        name: entryLabel,
                        displayName: entryNextDisplay,
                        type: 'skill',
                        skillKey,
                        specialization: entryName,
                        cost: entryCost,
                        currentRank: entryRank,
                        currentLabel: entryCurrentLabel,
                        nextLabel: entryNextLabel,
                        owned: entryIsMaxed,
                        canPurchase: entryCanPurchase,
                        cantAfford: !entryIsMaxed && entryCost !== null && available < entryCost,
                        blocked: false,
                        aptitudeMatch: match,
                    });
                }

                // Also offer "Add new specialization" at Known rank
                const addCost = systemConfig.getSkillAdvanceCost(this.actor, skillKey, 0);
                if (addCost !== null) {
                    result.push({
                        id: `skill:${skillKey}:__new`,
                        name: `${label} — add specialization`,
                        displayName: `${label} — add specialization`,
                        type: 'skill',
                        skillKey,
                        specialization: '__new',
                        cost: addCost,
                        currentRank: 0,
                        currentLabel: 'Untrained',
                        nextLabel: ranks[0]?.tooltip ?? 'Known',
                        owned: false,
                        canPurchase: available >= addCost,
                        cantAfford: available < addCost,
                        blocked: false,
                        aptitudeMatch: match,
                    });
                }
                continue;
            }

            // Basic skill: single track
            const effectiveRank = skillData.rank ?? skillData.advance ?? 0;
            const isMaxed = effectiveRank >= ranks.length;
            const cost = isMaxed ? null : systemConfig.getSkillAdvanceCost(this.actor, skillKey, effectiveRank);
            const canPurchase = !isMaxed && cost !== null && available >= cost;

            const currentLabel = effectiveRank > 0 ? ranks[effectiveRank - 1]?.tooltip ?? 'Untrained' : 'Untrained';
            const nextRank = ranks[effectiveRank];
            const nextLabel = !isMaxed && nextRank !== undefined ? nextRank.tooltip : null;
            const nextDisplay = nextLabel !== null && nextLabel.length > 0 ? `${label} — ${nextLabel}` : label;

            result.push({
                id: `skill:${skillKey}`,
                name: label,
                displayName: nextDisplay,
                type: 'skill',
                skillKey,
                cost,
                currentRank: effectiveRank,
                currentLabel,
                nextLabel,
                owned: isMaxed,
                canPurchase,
                cantAfford: !isMaxed && cost !== null && available < cost,
                blocked: false,
                aptitudeMatch: match,
            });
        }

        result.sort((a, b) => a.name.localeCompare(b.name));
        result.forEach((r, i) => {
            r.index = i;
        });
        return result;
    }

    async #prepareAptitudeTalents(systemConfig: AptitudeBasedSystemConfig): Promise<PreparedTalentAdvance[]> {
        const available = getAvailableXP(this.actor);
        const gameSystem = this.#getGameSystemId();
        const result: PreparedTalentAdvance[] = [];

        // Whitelist talent packs by game system
        const prefixMap: Record<string, string[]> = {
            dh2e: [
                'dh2-core-stats-talents',
                'dh2-core-stats-talents-specializations',
                'dh2-beyond-stats-talents',
                'dh2-within-stats-talents',
                'dh2-without-stats-talents',
            ],
            bc: ['bc-core-items-talents'],
            ow: ['ow-core-stats-talents'],
            dh1e: [],
            rt: [],
            dw: [],
        };
        const wanted = prefixMap[gameSystem] ?? [];
        const packs = game.packs.filter((p) => p.documentName === 'Item' && wanted.some((w) => p.metadata.id?.endsWith(w) || p.metadata.name === w));

        // Cache owned talents by (base name, specialization)
        const ownedByKey = new Map<string, Item>();
        for (const item of this.actor.items) {
            if (item.type !== 'talent') continue;
            const sys = item.system as { specialization?: string; rank?: number };
            const spec = (sys.specialization ?? '').toLowerCase().trim();
            const base = item.name
                .replace(/\s*\([^)]+\)\s*$/, '')
                .trim()
                .toLowerCase();
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry Item vs document type mismatch in Item collection iteration
            ownedByKey.set(`${base}|${spec}`, item as unknown as Item);
        }

        for (const pack of packs) {
            const index = await pack.getIndex({
                fields: [
                    'name',
                    'type',
                    'system.tier',
                    'system.aptitudes',
                    'system.stackable',
                    'system.hasSpecialization',
                    'system.specialization',
                    'system.prerequisites',
                    'system.benefit',
                    'system.description',
                ],
            });
            for (const rawEntry of index) {
                const entry = rawEntry as CompendiumIndexEntry;
                if (entry.type !== 'talent') continue;
                // eslint-disable-next-line no-restricted-syntax -- boundary: compendium index entry `system` is loosely typed at the Foundry layer
                const system = (entry.system ?? {}) as {
                    tier?: number;
                    aptitudes?: string[];
                    stackable?: boolean;
                    hasSpecialization?: boolean;
                    // eslint-disable-next-line no-restricted-syntax -- boundary: prerequisites payload from compendium has loose skills/talents shape
                    prerequisites?: { characteristics?: Record<string, number>; skills?: unknown; talents?: unknown };
                };
                const tier = system.tier ?? 1;
                const aptitudes = Array.isArray(system.aptitudes) ? system.aptitudes : [];
                const stackable = !!system.stackable;
                const hasSpec = !!system.hasSpecialization;
                const baseName = entry.name;
                const baseKey = baseName.toLowerCase();

                const cost = systemConfig.getTalentAdvanceCost(this.actor, { system });
                if (cost === null) continue;

                const prereqs = system.prerequisites ?? { characteristics: {}, skills: [], talents: [] };
                const prereqResult = this.#checkTalentPrereqs(prereqs);
                const blocked = !prereqResult.valid;
                const match = systemConfig.getAdvanceMatchInfo ? systemConfig.getAdvanceMatchInfo(this.actor, aptitudes) : null;

                if (hasSpec) {
                    // Specialist talent: allow multiple instances with different specs
                    const ownedSpecs = [...ownedByKey.keys()]
                        .filter((k) => k.startsWith(`${baseKey}|`))
                        .map((k) => k.split('|')[1])
                        .filter(Boolean);
                    result.push({
                        id: `talent-spec:${baseName}`,
                        uuid: entry.uuid ?? '',
                        name: baseName,
                        displayName: ownedSpecs.length ? `${baseName} (+ specialization)` : baseName,
                        type: 'talent',
                        kind: 'specialist',
                        tier,
                        cost,
                        owned: false,
                        ownedSpecs,
                        canPurchase: !blocked && available >= cost,
                        cantAfford: !blocked && available < cost,
                        blocked,
                        prereqDisplay: prereqResult.unmet.filter((s): s is string => s !== undefined),
                        aptitudeMatch: match,
                    });
                    continue;
                }

                if (stackable) {
                    // Stackable talent: one item on actor, rank increments
                    const owned = ownedByKey.get(`${baseKey}|`);
                    const currentRank = (owned?.system as { rank?: number } | undefined)?.rank ?? 0;
                    result.push({
                        id: `talent-rank:${baseName}`,
                        uuid: entry.uuid ?? '',
                        name: baseName,
                        displayName: owned ? `${baseName} (Rank ${currentRank + 1})` : baseName,
                        type: 'talent',
                        kind: 'stackable',
                        tier,
                        cost,
                        owned: false,
                        currentRank,
                        canPurchase: !blocked && available >= cost,
                        cantAfford: !blocked && available < cost,
                        blocked,
                        prereqDisplay: prereqResult.unmet.filter((s): s is string => s !== undefined),
                        aptitudeMatch: match,
                    });
                    continue;
                }

                // Single-instance talent: hide once owned
                if (ownedByKey.has(`${baseKey}|`)) continue;
                result.push({
                    id: `talent:${baseName}`,
                    uuid: entry.uuid ?? '',
                    name: baseName,
                    displayName: baseName,
                    type: 'talent',
                    kind: 'single',
                    tier,
                    cost,
                    owned: false,
                    canPurchase: !blocked && available >= cost,
                    cantAfford: !blocked && available < cost,
                    blocked,
                    prereqDisplay: prereqResult.unmet.filter((s): s is string => s !== undefined),
                    aptitudeMatch: match,
                });
            }
        }

        result.sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name));
        result.forEach((r, i) => {
            r.index = i;
        });
        return result;
    }

    /** Check talent prereqs (characteristics / skills / talents) against this actor. */
    // eslint-disable-next-line no-restricted-syntax -- boundary: prerequisites payload originates from compendium and may be Record or Array
    #checkTalentPrereqs(prereqs: { characteristics?: Record<string, number>; skills?: unknown; talents?: unknown }): { valid: boolean; unmet: string[] } {
        const unmet: string[] = [];
        const sys = this.#getActorSystem();
        const chars = sys?.characteristics ?? {};

        // Some compendium entries store these as {} (Record) rather than [] (Array) — coerce defensively.
        // eslint-disable-next-line no-restricted-syntax -- boundary: value is the parameter to this type guard
        const coerceList = (value: unknown): string[] => {
            if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
            if (value && typeof value === 'object') return Object.values(value).filter((v): v is string => typeof v === 'string');
            return [];
        };

        const charReqs = prereqs?.characteristics;
        if (charReqs && typeof charReqs === 'object') {
            for (const [charKey, min] of Object.entries(charReqs)) {
                const actual = chars[charKey]?.total ?? 0;
                if (actual < min) unmet.push(`${charKey} ${min}+`);
            }
        }

        const skills = sys?.skills ?? {};
        for (const skillReq of coerceList(prereqs?.skills)) {
            const m = skillReq.match(/^(.+?)\s*\+?(\d+)?$/);
            const name = (m ? m[1] : skillReq).toLowerCase().trim();
            const bonus = m?.[2] ? parseInt(m[2], 10) : 0;
            const skillKey = Object.keys(skills).find((k) => (skills[k]?.label ?? '').toLowerCase() === name);
            const rank = skillKey ? skills[skillKey]?.rank ?? 0 : 0;
            const rankThreshold = bonus === 0 ? 1 : bonus === 10 ? 2 : bonus === 20 ? 3 : bonus === 30 ? 4 : 1;
            if (rank < rankThreshold) unmet.push(skillReq);
        }

        const ownedTalents = new Set(this.actor.items.filter((i) => i.type === 'talent').map((i) => i.name.toLowerCase()));
        for (const talentReq of coerceList(prereqs?.talents)) {
            if (!ownedTalents.has(talentReq.toLowerCase())) unmet.push(talentReq);
        }
        return { valid: unmet.length === 0, unmet };
    }

    async #preparePsychic(_systemConfig: AptitudeBasedSystemConfig): Promise<PreparedPsychicPanel> {
        const available = getAvailableXP(this.actor);
        const gameSystem = this.#getGameSystemId();
        const sys = this.#getActorSystem();
        const currentRating = sys?.psy?.rating ?? 0;

        // DH2 RAW: cost to advance PR N→N+1 is (N+1) × 200, cap 10
        const nextRating = currentRating + 1;
        const ratingCost = nextRating <= 10 ? nextRating * 200 : null;

        const psyAdvance = {
            currentRating,
            nextRating,
            cost: ratingCost,
            canPurchase: ratingCost !== null && available >= ratingCost,
            cantAfford: ratingCost !== null && available < ratingCost,
            maxed: nextRating > 10,
        };

        // Whitelist psychic power packs
        const packMap: Record<string, string[]> = {
            dh2e: ['dh2-core-stats-psychic-powers', 'dh2-beyond-stats-psychic-powers', 'dh2-within-stats-psychic-powers', 'dh2-without-stats-psychic-powers'],
            bc: ['bc-core-stats-psychic-powers'],
            ow: ['ow-core-stats-psychic-powers'],
        };
        const wanted = packMap[gameSystem] ?? [];
        const packs = game.packs.filter((p) => p.documentName === 'Item' && wanted.some((w) => p.metadata.id?.endsWith(w) || p.metadata.name === w));

        const ownedPowers = new Set(this.actor.items.filter((i) => i.type === 'psychicPower').map((i) => i.name.toLowerCase()));

        const powers: PreparedPsychicPower[] = [];
        for (const pack of packs) {
            const index = await pack.getIndex({ fields: ['name', 'type', 'system.discipline', 'system.prCost'] });
            for (const rawEntry of index) {
                const entry = rawEntry as CompendiumIndexEntry;
                if (entry.type !== 'psychicPower') continue;
                const entrySys = entry.system as { prCost?: number; discipline?: string } | null | undefined;
                const prCost = entrySys?.prCost ?? 1;
                // Heuristic XP cost: max(100, 200 × prCost). Powers in DH2 core range 100-600 XP.
                const cost = Math.max(100, 200 * prCost);
                const owned = ownedPowers.has(entry.name.toLowerCase());
                const blocked = prCost > currentRating;
                const discipline = (entrySys?.discipline ?? 'unknown').toString();

                powers.push({
                    id: `psy:${entry.name}`,
                    uuid: entry.uuid ?? '',
                    name: entry.name,
                    displayName: entry.name,
                    discipline,
                    disciplineLabel: discipline.charAt(0).toUpperCase() + discipline.slice(1),
                    prCost,
                    cost,
                    owned,
                    canPurchase: !owned && !blocked && available >= cost,
                    cantAfford: !owned && !blocked && available < cost,
                    blocked,
                    prereqDisplay: blocked ? [`Psy Rating ${prCost}`] : [],
                });
            }
        }

        // Group by discipline for the template
        const grouped: Record<string, PreparedPsychicPower[]> = {};
        powers.sort((a, b) => a.prCost - b.prCost || a.name.localeCompare(b.name));
        powers.forEach((p, i) => {
            p.index = i;
        });
        for (const p of powers) {
            if (!grouped[p.disciplineLabel]) grouped[p.disciplineLabel] = [];
            grouped[p.disciplineLabel].push(p);
        }

        const availableOnly = this.#psyAvailableOnly;
        const activeDiscipline = this.#activeDiscipline;

        // Chips: "All" plus one per discipline, with count + accessible (not-blocked) count
        const disciplineKeys = Object.keys(grouped).sort();
        const chips: Array<{ key: string; label: string; count: number; accessible: number; active: boolean }> = [
            {
                key: 'all',
                label: 'All',
                count: powers.length,
                accessible: powers.filter((p) => !p.blocked).length,
                active: activeDiscipline === 'all',
            },
            ...disciplineKeys.map((label) => ({
                key: label,
                label,
                count: grouped[label].length,
                accessible: grouped[label].filter((p) => !p.blocked).length,
                active: activeDiscipline === label,
            })),
        ];

        // Build the filtered discipline sections the template iterates over.
        // PROTOTYPE: also bucket items by `prCost` so the template can render a
        // tier-grouped "tree" view rather than a flat list. Lower PR tiers represent
        // foundational powers; higher tiers gate behind PR advancement.
        const visibleLabels = activeDiscipline === 'all' ? disciplineKeys : disciplineKeys.filter((l) => l === activeDiscipline);
        const disciplines = visibleLabels
            .map((label) => {
                const items = grouped[label].filter((p) => !availableOnly || !p.blocked);
                const byTierMap = new Map<number, PreparedPsychicPower[]>();
                for (const power of items) {
                    const tier = power.prCost;
                    if (!byTierMap.has(tier)) byTierMap.set(tier, []);
                    byTierMap.get(tier)?.push(power);
                }
                const tiers = [...byTierMap.entries()]
                    .sort(([a], [b]) => a - b)
                    .map(([prCost, tierItems]) => ({
                        prCost,
                        label: `PR ${prCost}`,
                        accessible: prCost <= currentRating,
                        items: tierItems,
                    }));
                return { label, items, tiers };
            })
            .filter((d) => d.items.length > 0);

        return {
            psyAdvance,
            disciplines,
            chips,
            availableOnly,
            hasBlocked: powers.some((p) => p.blocked),
        };
    }

    async #prepareTraitPanel(): Promise<PreparedTraitPanel> {
        const actor = this.actor;
        const ownedTraits = actor.items.filter((i) => i.type === 'trait');

        // Collapse duplicates by name + specialization (pre-fix grant runs may have left some behind)
        const traitMap = new Map<string, Item>();
        for (const t of ownedTraits) {
            // eslint-disable-next-line no-restricted-syntax -- legacy trait items may lack `specialization`; default to '' for grouping only
            const spec = ((t.system as { specialization?: string }).specialization ?? '').toLowerCase().trim();
            const key = `${t.name.toLowerCase()}|${spec}`;
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry Item document vs collection-item type mismatch
            if (!traitMap.has(key)) traitMap.set(key, t as unknown as Item);
        }

        const list = [...traitMap.values()].map((t) => {
            const origin = actor.items.find(
                (i) =>
                    i.isOriginPath &&
                    ((i.system as { grants?: { traits?: Array<{ name?: string }> } }).grants?.traits ?? []).some(
                        (g) => (g.name ?? '').toLowerCase() === t.name.toLowerCase(),
                    ),
            );
            const source = origin ? origin.name : 'Innate / Granted';
            return {
                id: t.id ?? '',
                name: t.name,
                description:
                    (t.system as { description?: { value?: string }; effect?: string }).description?.value ?? (t.system as { effect?: string }).effect ?? '',
                source,
            };
        });
        list.sort((a, b) => a.name.localeCompare(b.name));

        // Elite Advance tiles
        const available = getAvailableXP(this.actor);
        const gameSystem = this.#getGameSystemId();
        const elitePacks: Record<string, string[]> = {
            dh2e: ['dh2-core-stats-elite-advances'],
        };
        const wanted = elitePacks[gameSystem] ?? [];
        const packs = game.packs.filter((p) => p.documentName === 'Item' && wanted.some((w) => p.metadata.id?.endsWith(w) || p.metadata.name === w));

        const ownedElites = new Set(
            actor.items.filter((i) => i.isOriginPath && (i.system as { step?: string }).step === 'elite').map((i) => i.name.toLowerCase()),
        );

        const elitesByName = new Map<string, PreparedEliteAdvance>();
        for (const pack of packs) {
            const index = await pack.getIndex({ fields: ['name', 'type', 'system.step', 'system.description.value'] });
            for (const rawEntry of index) {
                const entry = rawEntry as CompendiumIndexEntry;
                const eliteSys = entry.system as { step?: string; description?: { value?: string } } | null | undefined;
                if (eliteSys?.step !== 'elite') continue;
                const key = entry.name.toLowerCase();
                if (elitesByName.has(key)) continue;
                const owned = ownedElites.has(key);
                // Parse XP cost from description HTML (falls back to 1000)
                const descHtml = eliteSys?.description?.value ?? '';
                const xpMatch = descHtml.match(/Experience Cost<\/h3>\s*<p>\s*([\d,]+)\s*xp/i) ?? descHtml.match(/([\d,]+)\s*xp/i);
                const cost = xpMatch ? parseInt(xpMatch[1].replace(/,/g, ''), 10) : 1000;
                // Short blurb: first <p> after <h2>
                const summaryMatch = descHtml.match(/<h2>[^<]*<\/h2>\s*<p>([^<]+)<\/p>/);
                const summary = summaryMatch ? summaryMatch[1].trim() : '';

                elitesByName.set(key, {
                    id: `elite:${entry.name}`,
                    uuid: entry.uuid ?? '',
                    name: entry.name,
                    summary,
                    cost,
                    owned,
                    canPurchase: !owned && available >= cost,
                    cantAfford: !owned && available < cost,
                });
            }
        }
        const elites = [...elitesByName.values()];
        elites.sort((a, b) => a.name.localeCompare(b.name));
        elites.forEach((e, i) => {
            e.index = i;
        });

        return { owned: list, elites };
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
        const skills = this.#getActorSystem().skills;
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
                (entry) =>
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
            void this.render();
        }
    }

    static #switchDiscipline(this: AdvancementDialog, event: Event, target: HTMLElement): void {
        const discipline = target.dataset.discipline;
        if (discipline) {
            this.#activeDiscipline = discipline;
            void this.render();
        }
    }

    static #toggleAvailableOnly(this: AdvancementDialog, _event: Event, _target: HTMLElement): void {
        this.#psyAvailableOnly = !this.#psyAvailableOnly;
        void this.render();
    }

    static async #purchaseCharacteristic(this: AdvancementDialog, event: Event, target: HTMLElement): Promise<void> {
        const charKey = target.dataset.characteristic;
        if (!charKey) return;

        const char = this.#getActorSystem().characteristics?.[charKey];
        if (!char) return;

        const currentAdvances = char.advance ?? 0;
        const systemConfig = this.#getSystemConfig();
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

        const charConfig = CONFIG.wh40k.characteristics[charKey];
        const charLabel = charConfig ? game.i18n.localize(charConfig.label) : charKey;
        const tierLabel = game.i18n.localize(CONFIG.wh40k.advancementTiers[nextCost.tier]?.label ?? nextCost.tier);

        const confirmed = await Dialog.confirm({
            title: game.i18n.localize('WH40K.Advancement.Title'),
            content: game.i18n.format('WH40K.Advancement.ConfirmPurchase', { cost: String(nextCost.cost), name: `${charLabel} (${tierLabel})` }),
        });
        if (!confirmed) return;

        const result = await spendXP(this.actor, nextCost.cost, `${charLabel} (${tierLabel})`);
        if (!result.success) {
            ui.notifications.error(result.error ?? '');
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
                cost: String(nextCost.cost),
            }),
        );

        void this.render();

        setTimeout(() => {
            this.#recentPurchases.delete(`char:${charKey}`);
        }, 2000);
    }

    static async #purchaseAdvance(this: AdvancementDialog, event: Event, target: HTMLElement): Promise<void> {
        const advanceIndex = parseInt(target.dataset.index ?? '0', 10);
        const advanceType = target.dataset.type;

        const systemConfig = this.#getSystemConfig();
        if (systemConfig?.usesAptitudes && advanceType === 'skill') {
            const aptitudeConfig = this.#getAptitudeConfig(systemConfig);
            if (!aptitudeConfig) return;
            await this.#purchaseAptitudeSkillAt(advanceIndex, aptitudeConfig);
            return;
        }
        if (systemConfig?.usesAptitudes && advanceType === 'talent') {
            const aptitudeConfig = this.#getAptitudeConfig(systemConfig);
            if (!aptitudeConfig) return;
            await this.#purchaseAptitudeTalentAt(advanceIndex, aptitudeConfig);
            return;
        }
        if (systemConfig?.usesAptitudes && advanceType === 'psychic-power') {
            await this.#purchasePsychicPowerAt(advanceIndex);
            return;
        }
        if (systemConfig?.usesAptitudes && advanceType === 'elite') {
            await this.#purchaseEliteAt(advanceIndex);
            return;
        }

        const career = getCareerAdvancements(this.careerKey);
        const advances = (career?.RANK_1_ADVANCES ?? []) as AdvancementAdvance[];
        const typeAdvances = advances.filter((a) => a.type === advanceType);
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
            content: game.i18n.format('WH40K.Advancement.ConfirmPurchase', { cost: String(advance.cost), name: displayName }),
        });
        if (!confirmed) return;

        const result = await spendXP(this.actor, advance.cost, displayName);
        if (!result.success) {
            ui.notifications.error(result.error ?? '');
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
                cost: String(advance.cost),
            }),
        );

        void this.render();

        setTimeout(() => {
            this.#recentPurchases.delete(id);
        }, 2000);
    }

    async #purchaseAptitudeSkillAt(advanceIndex: number, systemConfig: AptitudeBasedSystemConfig): Promise<void> {
        const prepared = this.#prepareAptitudeSkills(systemConfig);
        const entry = prepared[advanceIndex];
        if (!entry || entry.owned || entry.cost === null) return;

        const actorSkill = this.#getActorSystem().skills?.[entry.skillKey];
        if (!actorSkill) return;

        if (!canAfford(this.actor, entry.cost)) {
            ui.notifications.warn(game.i18n.localize('WH40K.Advancement.Error.CannotAfford'));
            return;
        }

        // Specialist skill: adding a new specialization (prompt for name)
        if (entry.specialization === '__new') {
            const specName = await this.#promptForSpecialization(entry.skillKey, entry.name);
            if (!specName) return;

            // Prevent dup
            const existing = (actorSkill.entries ?? []).some((e) => (e.name ?? '').toLowerCase() === specName.toLowerCase());
            if (existing) {
                ui.notifications.warn(`${entry.name.replace(' — add specialization', '')} (${specName}) already exists on this character.`);
                return;
            }

            const addDisplayName = `${entry.name.replace(' — add specialization', '')} (${specName}) — ${entry.nextLabel}`;
            const addConfirmed = await Dialog.confirm({
                title: game.i18n.localize('WH40K.Advancement.Title'),
                content: game.i18n.format('WH40K.Advancement.ConfirmPurchase', { cost: String(entry.cost), name: addDisplayName }),
            });
            if (!addConfirmed) return;

            const addResult = await spendXP(this.actor, entry.cost, addDisplayName);
            if (!addResult.success) {
                ui.notifications.error(addResult.error ?? '');
                return;
            }

            const newEntry = {
                name: specName,
                slug: specName.toLowerCase().replace(/\s+/g, '-'),
                advance: 1,
                bonus: 0,
                cost: entry.cost,
            };
            const currentEntries = actorSkill.entries ?? [];
            await this.actor.update({
                [`system.skills.${entry.skillKey}.entries`]: [...currentEntries, newEntry],
            });

            this.#recentPurchases.add(entry.id);
            ui.notifications.info(game.i18n.format('WH40K.Advancement.Purchased', { name: addDisplayName, cost: String(entry.cost) }));
            void this.render();
            setTimeout(() => this.#recentPurchases.delete(entry.id), 2000);
            return;
        }

        // Specialist skill: bumping an existing entry
        if (entry.specialization) {
            const entryIndex = (actorSkill.entries ?? []).findIndex((e) => (e.name ?? '').toLowerCase() === entry.specialization?.toLowerCase());
            if (entryIndex < 0) return;

            const bumpDisplayName = entry.nextLabel ? `${entry.name} — ${entry.nextLabel}` : entry.name;
            const bumpConfirmed = await Dialog.confirm({
                title: game.i18n.localize('WH40K.Advancement.Title'),
                content: game.i18n.format('WH40K.Advancement.ConfirmPurchase', { cost: String(entry.cost), name: bumpDisplayName }),
            });
            if (!bumpConfirmed) return;

            const bumpResult = await spendXP(this.actor, entry.cost, bumpDisplayName);
            if (!bumpResult.success) {
                ui.notifications.error(bumpResult.error ?? '');
                return;
            }

            const bumpCurrentAdvance = actorSkill.entries?.[entryIndex]?.advance ?? 0;
            const bumpCurrentCost = actorSkill.entries?.[entryIndex]?.cost ?? 0;
            await this.actor.update({
                [`system.skills.${entry.skillKey}.entries.${entryIndex}.advance`]: bumpCurrentAdvance + 1,
                [`system.skills.${entry.skillKey}.entries.${entryIndex}.cost`]: bumpCurrentCost + entry.cost,
            });

            this.#recentPurchases.add(entry.id);
            ui.notifications.info(game.i18n.format('WH40K.Advancement.Purchased', { name: bumpDisplayName, cost: String(entry.cost) }));
            void this.render();
            setTimeout(() => this.#recentPurchases.delete(entry.id), 2000);
            return;
        }

        // Basic skill: single track
        const displayName = entry.nextLabel ? `${entry.name} (${entry.nextLabel})` : entry.name;
        const confirmed = await Dialog.confirm({
            title: game.i18n.localize('WH40K.Advancement.Title'),
            content: game.i18n.format('WH40K.Advancement.ConfirmPurchase', { cost: String(entry.cost), name: displayName }),
        });
        if (!confirmed) return;

        const result = await spendXP(this.actor, entry.cost, displayName);
        if (!result.success) {
            ui.notifications.error(result.error ?? '');
            return;
        }

        const currentAdvance = actorSkill.advance ?? 0;
        const currentCost = actorSkill.cost ?? 0;
        await this.actor.update({
            [`system.skills.${entry.skillKey}.advance`]: currentAdvance + 1,
            [`system.skills.${entry.skillKey}.cost`]: currentCost + entry.cost,
        });

        this.#recentPurchases.add(entry.id);
        ui.notifications.info(game.i18n.format('WH40K.Advancement.Purchased', { name: displayName, cost: String(entry.cost) }));
        void this.render();
        setTimeout(() => this.#recentPurchases.delete(entry.id), 2000);
    }

    async #promptForSpecialization(skillKey: string, skillLabel: string): Promise<string | null> {
        const title = skillLabel.replace(' — add specialization', '');
        const content = `<div class="form-group">
            <label>Specialization</label>
            <input type="text" name="specialization" placeholder="e.g. Imperium, High Gothic, Wheeled"
                autofocus style="width:100%; margin-top:0.25em"/>
            <p class="notes">The new ${title} specialization will be purchased at Known (rank 1).</p>
        </div>`;
        return new Promise((resolve) => {
            new Dialog({
                title: `${title} — Add Specialization`,
                content,
                buttons: {
                    ok: {
                        icon: '<i class="fas fa-check"></i>',
                        label: 'Purchase',
                        callback: (html: JQuery) => {
                            const value = (html.find('input[name="specialization"]').val() as string | undefined)?.trim() || '';
                            resolve(value || null);
                        },
                    },
                    cancel: {
                        icon: '<i class="fas fa-times"></i>',
                        label: 'Cancel',
                        callback: () => resolve(null),
                    },
                },
                default: 'ok',
            }).render(true);
        });
    }

    async #purchaseAptitudeTalentAt(advanceIndex: number, systemConfig: AptitudeBasedSystemConfig): Promise<void> {
        const prepared = await this.#prepareAptitudeTalents(systemConfig);
        const entry = prepared[advanceIndex];
        if (!entry || entry.blocked || entry.cost === null) return;

        if (!canAfford(this.actor, entry.cost)) {
            ui.notifications.warn(game.i18n.localize('WH40K.Advancement.Error.CannotAfford'));
            return;
        }

        // Resolve compendium doc to get full data
        const sourceDoc = await fromUuid(entry.uuid);
        if (!sourceDoc) {
            ui.notifications.error(`Could not load talent from compendium: ${entry.name}`);
            return;
        }

        let specialization = '';
        let displayName = entry.name;
        if (entry.kind === 'specialist') {
            const spec = await this.#promptForTalentSpecialization(entry.name, entry.ownedSpecs ?? []);
            if (!spec) return;
            specialization = spec;
            displayName = `${entry.name} (${spec})`;
        } else if (entry.kind === 'stackable') {
            displayName = `${entry.name} (Rank ${(entry.currentRank ?? 0) + 1})`;
        }

        const confirmed = await Dialog.confirm({
            title: game.i18n.localize('WH40K.Advancement.Title'),
            content: game.i18n.format('WH40K.Advancement.ConfirmPurchase', { cost: String(entry.cost), name: displayName }),
        });
        if (!confirmed) return;

        const result = await spendXP(this.actor, entry.cost, displayName);
        if (!result.success) {
            ui.notifications.error(result.error ?? '');
            return;
        }

        if (entry.kind === 'stackable') {
            // Find existing talent item on actor, bump rank; create if missing
            const base = entry.name.toLowerCase();
            const existing = this.actor.items.find((i) => i.type === 'talent' && i.name.toLowerCase() === base);
            if (existing) {
                // eslint-disable-next-line no-restricted-syntax -- stackable talents default to rank 1 when not previously incremented
                const currentRank = (existing.system as { rank?: number }).rank ?? 1;
                await existing.update({ 'system.rank': currentRank + 1 });
            } else {
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry Document#toObject() returns a plain data payload typed as object
                const data = sourceDoc.toObject() as Record<string, unknown> & { system: Record<string, unknown> };
                data._id = foundry.utils.randomID();
                data.system.rank = 1;
                await this.actor.createEmbeddedDocuments('Item', [data] as never[]);
            }
        } else {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry Document#toObject() returns a plain data payload typed as object
            const data = sourceDoc.toObject() as Record<string, unknown> & { system: Record<string, unknown> };
            data._id = foundry.utils.randomID();
            if (specialization) {
                data.name = `${entry.name} (${specialization})`;
                data.system.specialization = specialization;
                data.system.hasSpecialization = true;
            }
            await this.actor.createEmbeddedDocuments('Item', [data] as never[]);
        }

        this.#recentPurchases.add(entry.id);
        ui.notifications.info(game.i18n.format('WH40K.Advancement.Purchased', { name: displayName, cost: String(entry.cost) }));
        void this.render();
        setTimeout(() => this.#recentPurchases.delete(entry.id), 2000);
    }

    async #promptForTalentSpecialization(talentName: string, ownedSpecs: string[]): Promise<string | null> {
        const ownedNote = ownedSpecs.length ? `<p class="notes">Already owned: ${ownedSpecs.join(', ')}</p>` : '';
        const content = `<div class="form-group">
            <label>Specialization</label>
            <input type="text" name="specialization" placeholder="e.g. Shock, Solid Projectile, Bolt"
                autofocus style="width:100%; margin-top:0.25em"/>
            ${ownedNote}
        </div>`;
        return new Promise((resolve) => {
            new Dialog({
                title: `${talentName} — Specialization`,
                content,
                buttons: {
                    ok: {
                        icon: '<i class="fas fa-check"></i>',
                        label: 'Purchase',
                        callback: (html: JQuery) => {
                            const value = (html.find('input[name="specialization"]').val() as string | undefined)?.trim() || '';
                            if (value && ownedSpecs.some((s) => s.toLowerCase() === value.toLowerCase())) {
                                ui.notifications.warn(game.i18n.localize('WH40K.Advancement.SpecializationAlreadyOwned'));
                                resolve(null);
                                return;
                            }
                            resolve(value || null);
                        },
                    },
                    cancel: {
                        icon: '<i class="fas fa-times"></i>',
                        label: 'Cancel',
                        callback: () => resolve(null),
                    },
                },
                default: 'ok',
            }).render(true);
        });
    }

    static async #purchasePsyRating(this: AdvancementDialog, _event: Event, _target: HTMLElement): Promise<void> {
        const sys = this.#getActorSystem();
        const currentRating = sys?.psy?.rating ?? 0;
        const nextRating = currentRating + 1;
        if (nextRating > 10) {
            ui.notifications.warn(game.i18n.localize('WH40K.Advancement.PsyRatingMaximum'));
            return;
        }
        const cost = nextRating * 200;
        if (!canAfford(this.actor, cost)) {
            ui.notifications.warn(game.i18n.localize('WH40K.Advancement.Error.CannotAfford'));
            return;
        }

        const confirmed = await Dialog.confirm({
            title: game.i18n.localize('WH40K.Advancement.Title'),
            content: game.i18n.format('WH40K.Advancement.ConfirmPurchase', { cost: String(cost), name: `Psy Rating ${nextRating}` }),
        });
        if (!confirmed) return;

        const result = await spendXP(this.actor, cost, `Psy Rating ${nextRating}`);
        if (!result.success) {
            ui.notifications.error(result.error ?? '');
            return;
        }

        await this.actor.update({ 'system.psy.rating': nextRating });
        ui.notifications.info(game.i18n.format('WH40K.Advancement.Purchased', { name: `Psy Rating ${nextRating}`, cost: String(cost) }));
        void this.render();
    }

    async #purchasePsychicPowerAt(advanceIndex: number): Promise<void> {
        const systemConfig = this.#getSystemConfig();
        const aptitudeConfig = this.#getAptitudeConfig(systemConfig);
        if (!aptitudeConfig) return;
        const psy = await this.#preparePsychic(aptitudeConfig);
        // Flat index across disciplines, assigned in preparePsychic
        const flat = psy.disciplines.flatMap((d) => d.items);
        const entry = flat.find((p) => p.index === advanceIndex);
        if (!entry || entry.owned || entry.blocked) return;

        if (!canAfford(this.actor, entry.cost)) {
            ui.notifications.warn(game.i18n.localize('WH40K.Advancement.Error.CannotAfford'));
            return;
        }

        const sourceDoc = await fromUuid(entry.uuid);
        if (!sourceDoc) {
            ui.notifications.error(`Could not load power from compendium: ${entry.name}`);
            return;
        }

        const confirmed = await Dialog.confirm({
            title: game.i18n.localize('WH40K.Advancement.Title'),
            content: game.i18n.format('WH40K.Advancement.ConfirmPurchase', { cost: String(entry.cost), name: entry.name }),
        });
        if (!confirmed) return;

        const result = await spendXP(this.actor, entry.cost, entry.name);
        if (!result.success) {
            ui.notifications.error(result.error ?? '');
            return;
        }

        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry Document#toObject() returns a plain data payload typed as object
        const data = sourceDoc.toObject() as Record<string, unknown> & { system: Record<string, unknown> };
        data._id = foundry.utils.randomID();
        await this.actor.createEmbeddedDocuments('Item', [data] as never[]);

        this.#recentPurchases.add(entry.id);
        ui.notifications.info(game.i18n.format('WH40K.Advancement.Purchased', { name: entry.name, cost: String(entry.cost) }));
        void this.render();
        setTimeout(() => this.#recentPurchases.delete(entry.id), 2000);
    }

    async #purchaseEliteAt(advanceIndex: number): Promise<void> {
        const panel = await this.#prepareTraitPanel();
        const entry = panel.elites?.find((e) => e.index === advanceIndex);
        if (!entry || entry.owned) return;

        if (!canAfford(this.actor, entry.cost)) {
            ui.notifications.warn(game.i18n.localize('WH40K.Advancement.Error.CannotAfford'));
            return;
        }

        const sourceDoc = await fromUuid(entry.uuid);
        if (!sourceDoc) {
            ui.notifications.error(`Could not load elite advance: ${entry.name}`);
            return;
        }

        const confirmed = await Dialog.confirm({
            title: game.i18n.localize('WH40K.Advancement.Title'),
            content: `<p>${game.i18n.format('WH40K.Advancement.ConfirmPurchase', { cost: String(entry.cost), name: entry.name })}</p>
                <p class="notes"><i class="fas fa-exclamation-triangle"></i> Elite advances represent large, lasting character changes. GM approval is expected per RAW.</p>`,
        });
        if (!confirmed) return;

        const result = await spendXP(this.actor, entry.cost, `Elite: ${entry.name}`);
        if (!result.success) {
            ui.notifications.error(result.error ?? '');
            return;
        }

        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry Document#toObject() returns a plain data payload typed as object
        const itemData = sourceDoc.toObject() as Record<string, unknown> & { system: Record<string, unknown> };
        itemData._id = foundry.utils.randomID();
        itemData.type = 'originPath';
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry createEmbeddedDocuments returns plain Document refs
        const [created] = (await this.actor.createEmbeddedDocuments('Item', [itemData] as never[])) as unknown as Item[];

        try {
            const { default: GrantsManager } = await import('../../managers/grants-manager.ts');
            // eslint-disable-next-line no-restricted-syntax -- boundary: cross-cast between Foundry Item and project WH40KItem
            await GrantsManager.applyItemGrants(created as unknown as WH40KItem, this.actor, { showNotification: false });
        } catch (err) {
            console.warn('Elite grant application failed (item was still added):', err);
        }

        ui.notifications.info(game.i18n.format('WH40K.Advancement.Purchased', { name: entry.name, cost: String(entry.cost) }));
        void this.render();
    }

    async #applySkillAdvance(advance: AdvancementAdvance): Promise<void> {
        const skillKey = SkillKeyHelper.nameToKey(advance.name);
        if (!skillKey) {
            console.warn(`AdvancementDialog: Unknown skill name "${advance.name}"`);
            return;
        }

        if (advance.specialization) {
            const currentEntries = this.#getActorSystem().skills?.[skillKey]?.entries ?? [];
            const entryIndex = currentEntries.findIndex((e) => (e.name || '').toLowerCase() === advance.specialization?.toLowerCase());

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
            const currentAdvance = this.#getActorSystem().skills?.[skillKey]?.advance ?? 0;
            const currentCost = this.#getActorSystem().skills?.[skillKey]?.cost ?? 0;
            await this.actor.update({
                [`system.skills.${skillKey}.advance`]: currentAdvance + 1,
                [`system.skills.${skillKey}.cost`]: currentCost + advance.cost,
            });
        }
    }

    async #applyTalentAdvance(advance: AdvancementAdvance): Promise<void> {
        const talentName = advance.specialization ? `${advance.name} (${advance.specialization})` : advance.name;
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry Document#toObject() returns a plain data payload
        let talentData: (Record<string, unknown> & { system: Record<string, unknown> }) | null = null;

        for (const pack of game.packs.filter((p) => p.documentName === 'Item')) {
            const index = await pack.getIndex({ fields: ['name', 'type'] });
            const match = index.find((rawI) => {
                const i = rawI as CompendiumIndexEntry;
                return i.type === 'talent' && i.name.toLowerCase() === talentName.toLowerCase();
            });

            if (match) {
                const doc = await pack.getDocument(match._id);
                if (doc) {
                    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry Document#toObject() returns a plain data payload
                    talentData = doc.toObject() as Record<string, unknown> & { system: Record<string, unknown> };
                }
                break;
            }
        }

        talentData ??= {
            name: talentName,
            type: 'talent',
            system: {
                cost: advance.cost,
                description: '',
            },
        };

        talentData.system.cost = advance.cost;
        await this.actor.createEmbeddedDocuments('Item', [talentData] as never[]);
    }

    static async #openCompendiumItem(this: AdvancementDialog, event: Event, target: HTMLElement): Promise<void> {
        event.preventDefault();
        event.stopPropagation();

        const itemName = target.dataset.name;
        const itemType = target.dataset.type;

        if (!itemName) return;

        for (const pack of game.packs.filter((p) => p.documentName === 'Item')) {
            const index = await pack.getIndex({ fields: ['name', 'type'] });
            const match = index.find((rawI) => {
                const i = rawI as CompendiumIndexEntry;
                return i.type === itemType && i.name.toLowerCase() === itemName.toLowerCase();
            });

            if (match) {
                const doc = await pack.getDocument(match._id);
                void doc?.sheet?.render(true);
                return;
            }
        }

        for (const pack of game.packs.filter((p) => p.documentName === 'Item')) {
            const index = await pack.getIndex({ fields: ['name', 'type'] });
            const match = index.find((rawI) => (rawI as CompendiumIndexEntry).name.toLowerCase() === itemName.toLowerCase());

            if (match) {
                const doc = await pack.getDocument(match._id);
                void doc?.sheet?.render(true);
                return;
            }
        }

        ui.notifications.warn(game.i18n.format('WH40K.Advancement.ItemNotFound', { name: itemName }));
    }
}
