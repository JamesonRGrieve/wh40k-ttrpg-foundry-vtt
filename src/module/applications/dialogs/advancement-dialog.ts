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
            purchasePsyRating: AdvancementDialog.#purchasePsyRating,
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

        const tabs = [
            { id: 'characteristics', label: 'WH40K.Advancement.Tab.Characteristics', icon: 'fa-chart-bar', active: this.#activeTab === 'characteristics' },
            { id: 'skills', label: 'WH40K.Advancement.Tab.Skills', icon: 'fa-book', active: this.#activeTab === 'skills' },
            { id: 'talents', label: 'WH40K.Advancement.Tab.Talents', icon: 'fa-star', active: this.#activeTab === 'talents' },
        ];
        if (systemConfig?.usesAptitudes) {
            const psyRating = (this.actor.system as any).psy?.rating ?? 0;
            if (psyRating > 0) {
                tabs.push({ id: 'psychic', label: 'WH40K.Advancement.Tab.Psychic', icon: 'fa-brain', active: this.#activeTab === 'psychic' });
            }
            tabs.push({ id: 'traits', label: 'WH40K.Advancement.Tab.Traits', icon: 'fa-dna', active: this.#activeTab === 'traits' });
        }
        context.tabs = tabs;

        context.characteristics = this.#prepareCharacteristics(career, systemConfig);

        if (systemConfig?.usesCareerTables || !systemConfig) {
            const advances = career?.RANK_1_ADVANCES ?? [];
            context.skills = this.#prepareAdvances(advances.filter((a: any) => a.type === 'skill'));
            context.talents = this.#prepareAdvances(advances.filter((a: any) => a.type === 'talent'));
        } else {
            context.skills = this.#prepareAptitudeSkills(systemConfig);
            context.talents = await this.#prepareAptitudeTalents(systemConfig);
        }

        // Psychic Powers tab — psykers only
        if (systemConfig?.usesAptitudes) {
            const psyRating = (this.actor.system as any).psy?.rating ?? 0;
            context.isPsyker = psyRating > 0;
            if (context.isPsyker) {
                context.psychic = await this.#preparePsychic(systemConfig);
            }
            context.traits = await this.#prepareTraitPanel();
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

                // Aptitude match info (aptitude-based systems only; others get nulls)
                const match =
                    systemConfig && (systemConfig as any).usesAptitudes && typeof (systemConfig as any).getCharacteristicAptitudes === 'function'
                        ? (systemConfig as any).getAdvanceMatchInfo(this.actor, (systemConfig as any).getCharacteristicAptitudes(key))
                        : null;

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
                    aptitudeMatch: match,
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
        const ranks = systemConfig.getSkillRanks();

        const result: any[] = [];

        for (const skillKey of visibleSkills) {
            const skillData = actorSkills[skillKey];
            if (!skillData) continue;

            const label = skillData.label || skillKey;
            const skillAptitudes = systemConfig.getSkillAptitudes ? systemConfig.getSkillAptitudes(skillKey) : [];
            const match = systemConfig.getAdvanceMatchInfo ? systemConfig.getAdvanceMatchInfo(this.actor, skillAptitudes) : null;

            const hasEntries = Array.isArray(skillData.entries);

            if (hasEntries) {
                // Specialist skill: each entry (e.g. Common Lore: Imperium) is its own progression track.
                for (const entry of skillData.entries) {
                    const entryRank = entry.rank ?? entry.advance ?? 0;
                    const entryName = entry.name || entry.specialization || 'Unknown';
                    const entryLabel = `${label} (${entryName})`;
                    const isMaxed = entryRank >= ranks.length;
                    const cost = isMaxed ? null : systemConfig.getSkillAdvanceCost(this.actor, skillKey, entryRank);
                    const canPurchase = !isMaxed && cost != null && available >= cost;
                    const currentLabel = entryRank > 0 ? ranks[entryRank - 1]?.tooltip : 'Untrained';
                    const nextLabel = !isMaxed && ranks[entryRank] ? ranks[entryRank].tooltip : null;
                    const nextDisplay = nextLabel ? `${entryLabel} — ${nextLabel}` : entryLabel;

                    result.push({
                        id: `skill:${skillKey}:${entryName}`,
                        name: entryLabel,
                        displayName: nextDisplay,
                        type: 'skill',
                        skillKey,
                        specialization: entryName,
                        cost,
                        currentRank: entryRank,
                        currentLabel,
                        nextLabel,
                        owned: isMaxed,
                        canPurchase,
                        cantAfford: !isMaxed && cost != null && available < cost,
                        blocked: false,
                        aptitudeMatch: match,
                    });
                }

                // Also offer "Add new specialization" at Known rank
                const addCost = systemConfig.getSkillAdvanceCost(this.actor, skillKey, 0);
                if (addCost != null) {
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
            const canPurchase = !isMaxed && cost != null && available >= cost;

            const currentLabel = effectiveRank > 0 ? ranks[effectiveRank - 1]?.tooltip : 'Untrained';
            const nextLabel = !isMaxed && ranks[effectiveRank] ? ranks[effectiveRank].tooltip : null;
            const nextDisplay = nextLabel ? `${label} — ${nextLabel}` : label;

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
                cantAfford: !isMaxed && cost != null && available < cost,
                blocked: false,
                aptitudeMatch: match,
            });
        }

        result.sort((a, b) => a.name.localeCompare(b.name));
        result.forEach((r, i) => (r.index = i));
        return result;
    }

    async #prepareAptitudeTalents(systemConfig: any): Promise<any[]> {
        const available = getAvailableXP(this.actor);
        const gameSystem = (this.actor.system as any).gameSystem || 'dh2e';
        const result: any[] = [];

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
        const packs = game.packs.filter((p: any) => p.documentName === 'Item' && wanted.some((w) => p.metadata.id?.endsWith(w) || p.metadata.name === w));

        // Cache owned talents by (base name, specialization)
        const ownedByKey = new Map<string, any>();
        for (const item of this.actor.items) {
            if (item.type !== 'talent') continue;
            const sys = item.system as any;
            const spec = (sys?.specialization ?? '').toString().toLowerCase().trim();
            const base = item.name
                .replace(/\s*\([^)]+\)\s*$/, '')
                .trim()
                .toLowerCase();
            ownedByKey.set(`${base}|${spec}`, item);
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
            for (const entry of index) {
                if (entry.type !== 'talent') continue;
                const system = entry.system ?? {};
                const tier = system.tier ?? 1;
                const aptitudes = Array.isArray(system.aptitudes) ? system.aptitudes : [];
                const stackable = !!system.stackable;
                const hasSpec = !!system.hasSpecialization;
                const baseName = entry.name;
                const baseKey = baseName.toLowerCase();

                const cost = systemConfig.getTalentAdvanceCost?.(this.actor, { system });
                if (cost == null) continue;

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
                        uuid: entry.uuid,
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
                        prereqDisplay: prereqResult.unmet,
                        aptitudeMatch: match,
                    });
                    continue;
                }

                if (stackable) {
                    // Stackable talent: one item on actor, rank increments
                    const owned = ownedByKey.get(`${baseKey}|`);
                    const currentRank = (owned?.system as any)?.rank ?? 0;
                    result.push({
                        id: `talent-rank:${baseName}`,
                        uuid: entry.uuid,
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
                        prereqDisplay: prereqResult.unmet,
                        aptitudeMatch: match,
                    });
                    continue;
                }

                // Single-instance talent: hide once owned
                if (ownedByKey.has(`${baseKey}|`)) continue;
                result.push({
                    id: `talent:${baseName}`,
                    uuid: entry.uuid,
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
                    prereqDisplay: prereqResult.unmet,
                    aptitudeMatch: match,
                });
            }
        }

        result.sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name));
        result.forEach((r, i) => (r.index = i));
        return result;
    }

    /** Check talent prereqs (characteristics / skills / talents) against this actor. */
    #checkTalentPrereqs(prereqs: { characteristics?: Record<string, number>; skills?: unknown; talents?: unknown }): { valid: boolean; unmet: string[] } {
        const unmet: string[] = [];
        const sys: any = this.actor.system;
        const chars = sys?.characteristics ?? {};

        // Some compendium entries store these as {} (Record) rather than [] (Array) — coerce defensively.
        const coerceList = (value: unknown): string[] => {
            if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
            if (value && typeof value === 'object') return Object.values(value).filter((v): v is string => typeof v === 'string');
            return [];
        };

        const charReqs = prereqs?.characteristics;
        if (charReqs && typeof charReqs === 'object') {
            for (const [charKey, min] of Object.entries(charReqs)) {
                const actual = (chars as any)[charKey]?.total ?? 0;
                if (actual < (min as number)) unmet.push(`${charKey} ${min}+`);
            }
        }

        const skills = sys?.skills ?? {};
        for (const skillReq of coerceList(prereqs?.skills)) {
            const m = skillReq.match(/^(.+?)\s*\+?(\d+)?$/);
            const name = (m ? m[1] : skillReq).toLowerCase().trim();
            const bonus = m && m[2] ? parseInt(m[2], 10) : 0;
            const skillKey = Object.keys(skills).find((k) => (skills[k]?.label ?? '').toLowerCase() === name);
            const rank = skillKey ? skills[skillKey]?.rank ?? 0 : 0;
            const rankThreshold = bonus === 0 ? 1 : bonus === 10 ? 2 : bonus === 20 ? 3 : bonus === 30 ? 4 : 1;
            if (rank < rankThreshold) unmet.push(skillReq);
        }

        const ownedTalents = new Set(this.actor.items.filter((i: any) => i.type === 'talent').map((i: any) => i.name.toLowerCase()));
        for (const talentReq of coerceList(prereqs?.talents)) {
            if (!ownedTalents.has(talentReq.toLowerCase())) unmet.push(talentReq);
        }
        return { valid: unmet.length === 0, unmet };
    }

    async #preparePsychic(systemConfig: any): Promise<any> {
        const available = getAvailableXP(this.actor);
        const gameSystem = (this.actor.system as any).gameSystem || 'dh2e';
        const sys: any = this.actor.system;
        const currentRating = sys?.psy?.rating ?? 0;

        // DH2 RAW: cost to advance PR N→N+1 is (N+1) × 200, cap 10
        const nextRating = currentRating + 1;
        const ratingCost = nextRating <= 10 ? nextRating * 200 : null;

        const psyAdvance = {
            currentRating,
            nextRating,
            cost: ratingCost,
            canPurchase: ratingCost != null && available >= ratingCost,
            cantAfford: ratingCost != null && available < ratingCost,
            maxed: nextRating > 10,
        };

        // Whitelist psychic power packs
        const packMap: Record<string, string[]> = {
            dh2e: ['dh2-core-stats-psychic-powers', 'dh2-beyond-stats-psychic-powers', 'dh2-within-stats-psychic-powers', 'dh2-without-stats-psychic-powers'],
            bc: ['bc-core-stats-psychic-powers'],
            ow: ['ow-core-stats-psychic-powers'],
        };
        const wanted = packMap[gameSystem] ?? [];
        const packs = game.packs.filter((p: any) => p.documentName === 'Item' && wanted.some((w) => p.metadata.id?.endsWith(w) || p.metadata.name === w));

        const ownedPowers = new Set(this.actor.items.filter((i: any) => i.type === 'psychicPower').map((i: any) => i.name.toLowerCase()));

        const powers: any[] = [];
        for (const pack of packs) {
            const index = await pack.getIndex({ fields: ['name', 'type', 'system.discipline', 'system.prCost'] });
            for (const entry of index) {
                if (entry.type !== 'psychicPower') continue;
                const prCost = entry.system?.prCost ?? 1;
                // Heuristic XP cost: max(100, 200 × prCost). Powers in DH2 core range 100-600 XP.
                const cost = Math.max(100, 200 * prCost);
                const owned = ownedPowers.has(entry.name.toLowerCase());
                const blocked = prCost > currentRating;
                const discipline = (entry.system?.discipline ?? 'unknown').toString();

                powers.push({
                    id: `psy:${entry.name}`,
                    uuid: entry.uuid,
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
        const grouped: Record<string, any[]> = {};
        powers.sort((a, b) => a.prCost - b.prCost || a.name.localeCompare(b.name));
        powers.forEach((p, i) => (p.index = i));
        for (const p of powers) {
            if (!grouped[p.disciplineLabel]) grouped[p.disciplineLabel] = [];
            grouped[p.disciplineLabel].push(p);
        }
        const disciplines = Object.entries(grouped)
            .map(([label, items]) => ({ label, items }))
            .sort((a, b) => a.label.localeCompare(b.label));

        return { psyAdvance, disciplines };
    }

    async #prepareTraitPanel(): Promise<any> {
        const actor: any = this.actor;
        const ownedTraits = actor.items.filter((i: any) => i.type === 'trait');

        // Collapse duplicates by name + specialization (pre-fix grant runs may have left some behind)
        const traitMap = new Map<string, any>();
        for (const t of ownedTraits) {
            const spec = (t.system?.specialization ?? '').toString().toLowerCase().trim();
            const key = `${t.name.toLowerCase()}|${spec}`;
            if (!traitMap.has(key)) traitMap.set(key, t);
        }

        const list = [...traitMap.values()].map((t: any) => {
            const origin = actor.items.find(
                (i: any) => i.isOriginPath && (i.system?.grants?.traits ?? []).some((g: any) => (g.name ?? '').toLowerCase() === t.name.toLowerCase()),
            );
            const source = origin ? origin.name : 'Innate / Granted';
            return {
                id: t.id,
                name: t.name,
                description: t.system?.description?.value ?? t.system?.effect ?? '',
                source,
            };
        });
        list.sort((a: any, b: any) => a.name.localeCompare(b.name));

        // Elite Advance tiles
        const available = getAvailableXP(this.actor);
        const gameSystem = (this.actor.system as any).gameSystem || 'dh2e';
        const elitePacks: Record<string, string[]> = {
            dh2e: ['dh2-core-stats-elite-advances'],
        };
        const wanted = elitePacks[gameSystem] ?? [];
        const packs = game.packs.filter((p: any) => p.documentName === 'Item' && wanted.some((w) => p.metadata.id?.endsWith(w) || p.metadata.name === w));

        const ownedElites = new Set(actor.items.filter((i: any) => i.isOriginPath && i.system?.step === 'elite').map((i: any) => i.name.toLowerCase()));

        const elitesByName = new Map<string, any>();
        for (const pack of packs) {
            const index = await pack.getIndex({ fields: ['name', 'type', 'system.step', 'system.description.value'] });
            for (const entry of index) {
                if (entry.system?.step !== 'elite') continue;
                const key = entry.name.toLowerCase();
                if (elitesByName.has(key)) continue;
                const owned = ownedElites.has(key);
                // Parse XP cost from description HTML (falls back to 1000)
                const descHtml = entry.system?.description?.value ?? '';
                const xpMatch = descHtml.match(/Experience Cost<\/h3>\s*<p>\s*([\d,]+)\s*xp/i) ?? descHtml.match(/([\d,]+)\s*xp/i);
                const cost = xpMatch ? parseInt(xpMatch[1].replace(/,/g, ''), 10) : 1000;
                // Short blurb: first <p> after <h2>
                const summaryMatch = descHtml.match(/<h2>[^<]*<\/h2>\s*<p>([^<]+)<\/p>/);
                const summary = summaryMatch ? summaryMatch[1].trim() : '';

                elitesByName.set(key, {
                    id: `elite:${entry.name}`,
                    uuid: entry.uuid,
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
        elites.forEach((e, i) => (e.index = i));

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

        const systemConfig = SystemConfigRegistry.getOrNull((this.actor.system as any)?.gameSystem);
        if (systemConfig?.usesAptitudes && advanceType === 'skill') {
            await this.#purchaseAptitudeSkillAt(advanceIndex, systemConfig);
            return;
        }
        if (systemConfig?.usesAptitudes && advanceType === 'talent') {
            await this.#purchaseAptitudeTalentAt(advanceIndex, systemConfig);
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

    async #purchaseAptitudeSkillAt(advanceIndex: number, systemConfig: BaseSystemConfig): Promise<void> {
        const prepared = this.#prepareAptitudeSkills(systemConfig);
        const entry = prepared[advanceIndex];
        if (!entry || entry.owned || entry.cost == null) return;

        const actorSkill = (this.actor.system as any).skills?.[entry.skillKey];
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
            const existing = (actorSkill.entries ?? []).some((e: any) => (e.name ?? '').toLowerCase() === specName.toLowerCase());
            if (existing) {
                ui.notifications.warn(`${entry.name.replace(' — add specialization', '')} (${specName}) already exists on this character.`);
                return;
            }

            const displayName = `${entry.name.replace(' — add specialization', '')} (${specName}) — ${entry.nextLabel}`;
            const confirmed = await Dialog.confirm({
                title: game.i18n.localize('WH40K.Advancement.Title'),
                content: game.i18n.format('WH40K.Advancement.ConfirmPurchase', { cost: entry.cost, name: displayName }),
            });
            if (!confirmed) return;

            const result = await spendXP(this.actor, entry.cost, displayName);
            if (!result.success) {
                ui.notifications.error(result.error);
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
            ui.notifications.info(game.i18n.format('WH40K.Advancement.Purchased', { name: displayName, cost: entry.cost }));
            this.render();
            setTimeout(() => this.#recentPurchases.delete(entry.id), 2000);
            return;
        }

        // Specialist skill: bumping an existing entry
        if (entry.specialization) {
            const entryIndex = (actorSkill.entries ?? []).findIndex((e: any) => (e.name ?? '').toLowerCase() === entry.specialization.toLowerCase());
            if (entryIndex < 0) return;

            const displayName = entry.nextLabel ? `${entry.name} — ${entry.nextLabel}` : entry.name;
            const confirmed = await Dialog.confirm({
                title: game.i18n.localize('WH40K.Advancement.Title'),
                content: game.i18n.format('WH40K.Advancement.ConfirmPurchase', { cost: entry.cost, name: displayName }),
            });
            if (!confirmed) return;

            const result = await spendXP(this.actor, entry.cost, displayName);
            if (!result.success) {
                ui.notifications.error(result.error);
                return;
            }

            const currentAdvance = actorSkill.entries[entryIndex].advance ?? 0;
            const currentCost = actorSkill.entries[entryIndex].cost ?? 0;
            await this.actor.update({
                [`system.skills.${entry.skillKey}.entries.${entryIndex}.advance`]: currentAdvance + 1,
                [`system.skills.${entry.skillKey}.entries.${entryIndex}.cost`]: currentCost + entry.cost,
            });

            this.#recentPurchases.add(entry.id);
            ui.notifications.info(game.i18n.format('WH40K.Advancement.Purchased', { name: displayName, cost: entry.cost }));
            this.render();
            setTimeout(() => this.#recentPurchases.delete(entry.id), 2000);
            return;
        }

        // Basic skill: single track
        const displayName = entry.nextLabel ? `${entry.name} (${entry.nextLabel})` : entry.name;
        const confirmed = await Dialog.confirm({
            title: game.i18n.localize('WH40K.Advancement.Title'),
            content: game.i18n.format('WH40K.Advancement.ConfirmPurchase', { cost: entry.cost, name: displayName }),
        });
        if (!confirmed) return;

        const result = await spendXP(this.actor, entry.cost, displayName);
        if (!result.success) {
            ui.notifications.error(result.error);
            return;
        }

        const currentAdvance = actorSkill.advance ?? 0;
        const currentCost = actorSkill.cost ?? 0;
        await this.actor.update({
            [`system.skills.${entry.skillKey}.advance`]: currentAdvance + 1,
            [`system.skills.${entry.skillKey}.cost`]: currentCost + entry.cost,
        });

        this.#recentPurchases.add(entry.id);
        ui.notifications.info(game.i18n.format('WH40K.Advancement.Purchased', { name: displayName, cost: entry.cost }));
        this.render();
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

    async #purchaseAptitudeTalentAt(advanceIndex: number, systemConfig: BaseSystemConfig): Promise<void> {
        const prepared = await this.#prepareAptitudeTalents(systemConfig as any);
        const entry = prepared[advanceIndex];
        if (!entry || entry.blocked || entry.cost == null) return;

        if (!canAfford(this.actor, entry.cost)) {
            ui.notifications.warn(game.i18n.localize('WH40K.Advancement.Error.CannotAfford'));
            return;
        }

        // Resolve compendium doc to get full data
        const sourceDoc: any = await fromUuid(entry.uuid);
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
            content: game.i18n.format('WH40K.Advancement.ConfirmPurchase', { cost: entry.cost, name: displayName }),
        });
        if (!confirmed) return;

        const result = await spendXP(this.actor, entry.cost, displayName);
        if (!result.success) {
            ui.notifications.error(result.error);
            return;
        }

        if (entry.kind === 'stackable') {
            // Find existing talent item on actor, bump rank; create if missing
            const base = entry.name.toLowerCase();
            const existing = this.actor.items.find((i: any) => i.type === 'talent' && i.name.toLowerCase() === base);
            if (existing) {
                const currentRank = (existing.system as any).rank ?? 1;
                await existing.update({ 'system.rank': currentRank + 1 });
            } else {
                const data = sourceDoc.toObject();
                data._id = foundry.utils.randomID();
                (data.system as any).rank = 1;
                await this.actor.createEmbeddedDocuments('Item', [data]);
            }
        } else {
            const data = sourceDoc.toObject();
            data._id = foundry.utils.randomID();
            if (specialization) {
                data.name = `${entry.name} (${specialization})`;
                (data.system as any).specialization = specialization;
                (data.system as any).hasSpecialization = true;
            }
            await this.actor.createEmbeddedDocuments('Item', [data]);
        }

        this.#recentPurchases.add(entry.id);
        ui.notifications.info(game.i18n.format('WH40K.Advancement.Purchased', { name: displayName, cost: entry.cost }));
        this.render();
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
                                ui.notifications.warn('That specialization is already owned.');
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
        const sys: any = this.actor.system;
        const currentRating = sys?.psy?.rating ?? 0;
        const nextRating = currentRating + 1;
        if (nextRating > 10) {
            ui.notifications.warn('Psy Rating is already at maximum (10).');
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
            ui.notifications.error(result.error);
            return;
        }

        await this.actor.update({ 'system.psy.rating': nextRating });
        ui.notifications.info(game.i18n.format('WH40K.Advancement.Purchased', { name: `Psy Rating ${nextRating}`, cost: String(cost) }));
        this.render();
    }

    async #purchasePsychicPowerAt(advanceIndex: number): Promise<void> {
        const systemConfig = SystemConfigRegistry.getOrNull((this.actor.system as any)?.gameSystem);
        if (!systemConfig) return;
        const psy = await this.#preparePsychic(systemConfig);
        // Flat index across disciplines, assigned in preparePsychic
        const flat = psy.disciplines.flatMap((d: any) => d.items);
        const entry = flat.find((p: any) => p.index === advanceIndex);
        if (!entry || entry.owned || entry.blocked) return;

        if (!canAfford(this.actor, entry.cost)) {
            ui.notifications.warn(game.i18n.localize('WH40K.Advancement.Error.CannotAfford'));
            return;
        }

        const sourceDoc: any = await fromUuid(entry.uuid);
        if (!sourceDoc) {
            ui.notifications.error(`Could not load power from compendium: ${entry.name}`);
            return;
        }

        const confirmed = await Dialog.confirm({
            title: game.i18n.localize('WH40K.Advancement.Title'),
            content: game.i18n.format('WH40K.Advancement.ConfirmPurchase', { cost: entry.cost, name: entry.name }),
        });
        if (!confirmed) return;

        const result = await spendXP(this.actor, entry.cost, entry.name);
        if (!result.success) {
            ui.notifications.error(result.error);
            return;
        }

        const data = sourceDoc.toObject();
        data._id = foundry.utils.randomID();
        await this.actor.createEmbeddedDocuments('Item', [data]);

        this.#recentPurchases.add(entry.id);
        ui.notifications.info(game.i18n.format('WH40K.Advancement.Purchased', { name: entry.name, cost: entry.cost }));
        this.render();
        setTimeout(() => this.#recentPurchases.delete(entry.id), 2000);
    }

    async #purchaseEliteAt(advanceIndex: number): Promise<void> {
        const panel = await this.#prepareTraitPanel();
        const entry = panel.elites?.find((e: any) => e.index === advanceIndex);
        if (!entry || entry.owned) return;

        if (!canAfford(this.actor, entry.cost)) {
            ui.notifications.warn(game.i18n.localize('WH40K.Advancement.Error.CannotAfford'));
            return;
        }

        const sourceDoc: any = await fromUuid(entry.uuid);
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
            ui.notifications.error(result.error);
            return;
        }

        // Apply the elite origin-path item via GrantsManager so grants (traits, talents, aptitudes, etc.) are applied
        const itemData = sourceDoc.toObject();
        itemData._id = foundry.utils.randomID();
        itemData.type = 'originPath';
        const [created] = (await this.actor.createEmbeddedDocuments('Item', [itemData])) as any[];

        try {
            const { default: GrantsManager } = await import('../../managers/grants-manager.ts');
            await GrantsManager.applyItemGrants(created, this.actor, { showNotification: false });
        } catch (err) {
            console.warn('Elite grant application failed (item was still added):', err);
        }

        ui.notifications.info(game.i18n.format('WH40K.Advancement.Purchased', { name: entry.name, cost: String(entry.cost) }));
        this.render();
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
