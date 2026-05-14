/**
 * @file TooltipsWH40K - Rich tooltip system for WH40K RPG
 * Based on dnd5e's Tooltips5e pattern - uses Foundry's native TooltipManager
 * with MutationObserver to provide rich tooltip content.
 */

import { SystemConfigRegistry } from '../../config/game-systems/index.ts';
import type { WH40KBaseActor } from '../../documents/base-actor.ts';
import type { WH40KItem } from '../../documents/item.ts';
import type { WH40KCharacteristic, WH40KModifierEntry, WH40KSkill, WH40KArmourLocation } from '../../types/global.d.ts';

/** Minimal typed interface for the Foundry tooltip manager. */
interface TooltipManager {
    element: (HTMLElement & { dataset: DOMStringMap }) | null;
    _setAnchor?: (direction: string) => void;
}

/** Skill rank definition from system config. */
interface SkillRank {
    level: number;
    key: string;
    tooltip: string;
    bonus: number;
}

function localize(key: string): string {
    return game.i18n.localize(key);
}

/** Source modifier entry for tooltip breakdown. */
interface TooltipModifierSource {
    name: string;
    value: number;
}

/** Quality definition from config. */
interface QualityDefinition {
    label: string;
    description: string;
    hasLevel?: boolean;
    category?: string;
    mechanicalEffect?: boolean;
    source?: string | null;
}

/* -------------------------------------------- */
/*  Tooltip Payload Types                       */
/* -------------------------------------------- */

/** Shared cached skill info shape pulled from the compendium index. */
interface CachedSkillInfo {
    name: string | undefined;
    descriptor: string;
    uses: string;
    useTime: string;
    isBasic: boolean;
    aptitudes: string[];
}

/** Discriminated payloads serialised through `data-wh40k-tooltip-data`. */
interface CharacteristicTooltipPayload {
    name?: string;
    label?: string;
    base?: number;
    advance?: number;
    modifier?: number;
    unnatural?: number;
    total?: number;
    bonus?: number;
    sources?: TooltipModifierSource[];
}

interface SkillTooltipPayload {
    name?: string | undefined;
    label?: string | undefined;
    baseValue?: number | undefined;
    basic?: boolean | undefined;
    trainingBonus?: number | undefined;
    actorUuid?: string | undefined;
    characteristic?: string | undefined;
    charValue?: number | undefined;
    trained?: boolean | undefined;
    plus10?: boolean | undefined;
    plus20?: boolean | undefined;
    plus30?: boolean | undefined;
    current?: number | undefined;
    bonus?: number | undefined;
}

interface ArmorTooltipPayload {
    location?: string;
    total?: number;
    toughnessBonus?: number;
    traitBonus?: number;
    armorValue?: number;
    equipped?: Array<{ img: string; name: string; ap?: number }>;
}

interface WeaponTooltipPayload {
    name?: string;
    damage?: string;
    penetration?: number;
    range?: string;
    rof?: string;
    qualities?: string[];
}

interface ModifierTooltipPayload {
    title?: string;
    sources?: TooltipModifierSource[];
}

interface QualityTooltipPayload {
    label?: string;
    description?: string;
    level?: number | null;
    hasLevel?: boolean;
    category?: string;
    mechanicalEffect?: boolean;
    source?: string | null;
}

interface GenericTooltipPayload {
    title?: string;
    content?: string;
}

/** Union of all known tooltip payloads. */
type TooltipPayload =
    | CharacteristicTooltipPayload
    | SkillTooltipPayload
    | ArmorTooltipPayload
    | WeaponTooltipPayload
    | ModifierTooltipPayload
    | QualityTooltipPayload
    | GenericTooltipPayload;

/** Result returned by a doc's `richTooltip()` (when present). */
interface RichTooltipResult {
    content?: string;
    classes?: string[];
}

/** Optional surface for documents that publish their own rich tooltip body. */
interface RichTooltipProducer {
    richTooltip?: () => Promise<RichTooltipResult>;
}

/** game.wh40k.tooltips shape — just the lookup we use here. */
interface SkillDescriptionLookup {
    getSkillDescription?: (key: string) => CachedSkillInfo | null;
}

/** Foundry CONFIG bag — Rogue Trader extension used by the quality builder. */
interface RogueTraderConfigBag {
    ROGUE_TRADER?: {
        getQualityDefinition?: (id: string) => QualityDefinition | null;
    };
}

function getTooltipManager(): TooltipManager {
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry `game.tooltip` runtime singleton is not surfaced on the v13 type for `game`.
    return (game as unknown as { tooltip: TooltipManager }).tooltip;
}

function getRogueTraderConfig(): RogueTraderConfigBag['ROGUE_TRADER'] {
    // eslint-disable-next-line no-restricted-syntax -- boundary: CONFIG is Foundry's untyped runtime bag; per-system extensions are opaque to fvtt-types.
    return (CONFIG as unknown as RogueTraderConfigBag).ROGUE_TRADER;
}

function getSkillDescriptionLookup(): SkillDescriptionLookup | undefined {
    // eslint-disable-next-line no-restricted-syntax -- boundary: game.wh40k is the system's own namespace, attached after init; types are erased at the boundary.
    const wh40k = (game as { wh40k?: { tooltips?: unknown } }).wh40k;
    return wh40k?.tooltips as SkillDescriptionLookup | undefined;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: accepts heterogeneous doc / DataModel surfaces to extract an optional richTooltip(); type-erasing the parameter is the safest reading.
function getRichTooltipProducer(value: unknown): RichTooltipProducer {
    return value as RichTooltipProducer;
}

/**
 * A class responsible for orchestrating rich tooltips in the WH40K RPG system.
 */
export class TooltipsWH40K {
    #observer: MutationObserver | undefined;
    #tooltip: HTMLElement | null = null;
    readonly #skillDescriptions = new Map<string, CachedSkillInfo>();

    get tooltip(): HTMLElement | null {
        return this.#tooltip;
    }

    get skillDescriptions(): Map<string, CachedSkillInfo> {
        return this.#skillDescriptions;
    }

    async initialize(): Promise<void> {
        this.#tooltip = document.getElementById('tooltip');
        if (this.#tooltip === null) {
            console.warn('WH40K Tooltips | Could not find #tooltip element');
            return;
        }
        this.observe();
        await this._loadSkillDescriptions();
    }

    async _loadSkillDescriptions(): Promise<void> {
        try {
            const skillPackNames = ['wh40k-rpg.dh2-core-stats-skills', 'wh40k-rpg.rt-core-items-skills', 'wh40k-rpg.dw-core-items-skills'];
            const pack = skillPackNames.map((n) => game.packs.get(n)).find((p) => p !== undefined) ?? null;
            if (pack === null) {
                console.warn('WH40K Tooltips | Could not find skills compendium');
                return;
            }

            const index = await pack.getIndex();
            for (const entry of index) {
                // eslint-disable-next-line no-await-in-loop
                const item = (await pack.getDocument(entry._id)) as WH40KItem | null;
                if (item !== null) {
                    const entryName = entry.name ?? '';
                    const key = entryName.toLowerCase().replace(/\s+/g, '').replace(/-/g, '');
                    const system = item.system as {
                        descriptor?: string;
                        uses?: string;
                        useTime?: string;
                        isBasic?: boolean;
                        aptitudes?: string[];
                    };

                    this.#skillDescriptions.set(key, {
                        name: entry.name,
                        descriptor: system.descriptor ?? '',
                        uses: system.uses ?? '',
                        useTime: system.useTime ?? '',
                        isBasic: system.isBasic ?? true,
                        aptitudes: system.aptitudes ?? [],
                    });
                }
            }
        } catch (err) {
            console.warn('WH40K Tooltips | Failed to load skill descriptions:', err);
        }
    }

    getSkillDescription(skillKey: string): CachedSkillInfo | null {
        const normalizedKey = skillKey.toLowerCase().replace(/\s+/g, '').replace(/-/g, '');
        return this.#skillDescriptions.get(normalizedKey) ?? null;
    }

    observe(): void {
        this.#observer?.disconnect();
        if (this.#tooltip === null) return;

        this.#observer = new MutationObserver(this._onMutation.bind(this));
        this.#observer.observe(this.#tooltip, {
            attributeFilter: ['class'],
            attributeOldValue: true,
        });
    }

    _onMutation(mutationList: MutationRecord[]): void {
        let isActive = false;
        const tooltip = this.#tooltip;
        if (tooltip === null) return;

        for (const { type, attributeName, oldValue } of mutationList) {
            if (type === 'attributes' && attributeName === 'class') {
                const wasActive = oldValue?.includes('active') ?? false;
                const nowActive = tooltip.classList.contains('active');
                if (nowActive && !wasActive) isActive = true;
            }
        }

        if (isActive) void this._onTooltipActivate();
    }

    async _onTooltipActivate(): Promise<void> {
        const tooltipManager = getTooltipManager();
        const element = tooltipManager.element;
        if (element === null) return;

        const tooltipType = element.dataset['wh40kTooltip'];
        const tooltipDataAttr = element.dataset['wh40kTooltipData'];

        if (tooltipType !== undefined && tooltipType !== '' && tooltipDataAttr !== undefined && tooltipDataAttr !== '') {
            try {
                const data = JSON.parse(tooltipDataAttr) as TooltipPayload;
                const content = await this._buildTooltipContent(data, tooltipType);
                if (content !== '' && this.#tooltip !== null) {
                    this.#tooltip.innerHTML = content;
                    this.#tooltip.classList.add('wh40k-tooltip', `wh40k-tooltip--${tooltipType}`);
                    requestAnimationFrame(() => this._repositionTooltip());
                }
            } catch (err) {
                console.warn('WH40K Tooltips | Failed to parse tooltip data:', err, tooltipDataAttr);
            }
            return;
        }

        if (element.classList.contains('content-link') && element.dataset['uuid'] !== undefined) {
            const doc = await fromUuid(element.dataset['uuid']);
            if (doc !== null) {
                await this._onHoverContentLink(doc as WH40KItem);
            }
        }
    }

    async _onHoverContentLink(doc: WH40KItem): Promise<void> {
        const docWithTooltip = getRichTooltipProducer(doc);
        const sysWithTooltip = getRichTooltipProducer(doc.system);
        const result: RichTooltipResult = await (docWithTooltip.richTooltip?.() ?? sysWithTooltip.richTooltip?.() ?? {});
        const { content, classes } = result;

        if (content === undefined || content === '' || this.#tooltip === null) return;

        this.#tooltip.innerHTML = content;
        this.#tooltip.classList.add('wh40k-tooltip');
        if (classes !== undefined && classes.length > 0) {
            this.#tooltip.classList.add(...classes);
        }

        requestAnimationFrame(() => this._repositionTooltip());
    }

    async _buildTooltipContent(data: TooltipPayload, type: string): Promise<string> {
        switch (type) {
            case 'characteristic':
                return this._buildCharacteristicTooltip(data as CharacteristicTooltipPayload);
            case 'skill':
                return this._buildSkillTooltip(data as SkillTooltipPayload);
            case 'armor':
            case 'armour':
                return this._buildArmorTooltip(data as ArmorTooltipPayload);
            case 'weapon':
                return this._buildWeaponTooltip(data as WeaponTooltipPayload);
            case 'modifier':
                return this._buildModifierTooltip(data as ModifierTooltipPayload);
            case 'quality':
                return this._buildQualityTooltip(data as QualityTooltipPayload);
            default:
                return this._buildGenericTooltip(data as GenericTooltipPayload);
        }
    }

    _buildCharacteristicTooltip(data: CharacteristicTooltipPayload): string {
        const { name, label } = data;
        const base = data.base ?? 0;
        const advance = data.advance ?? 0;
        const modifier = data.modifier ?? 0;
        const unnatural = data.unnatural ?? 1;
        const total = data.total ?? 0;
        const bonus = data.bonus ?? 0;
        const sources = data.sources ?? [];

        let html = `
            <div class="wh40k-tooltip__header">
                <h4 class="wh40k-tooltip__title">${label ?? name ?? ''}</h4>
                <div class="wh40k-tooltip__total">${total}</div>
            </div>
            <div class="wh40k-tooltip__divider"></div>
            <div class="wh40k-tooltip__breakdown">
                <div class="wh40k-tooltip__line">
                    <span class="wh40k-tooltip__label">Base:</span>
                    <span class="wh40k-tooltip__value">${base}</span>
                </div>
                <div class="wh40k-tooltip__line">
                    <span class="wh40k-tooltip__label">Advances:</span>
                    <span class="wh40k-tooltip__value">${advance} (×5 = +${advance * 5})</span>
                </div>
        `;

        if (modifier !== 0) {
            html += `
                <div class="wh40k-tooltip__line wh40k-tooltip__line--modifier">
                    <span class="wh40k-tooltip__label">Modifiers:</span>
                    <span class="wh40k-tooltip__value">${modifier >= 0 ? '+' : ''}${modifier}</span>
                </div>
            `;
        }

        html += `</div>`;

        if (sources.length > 0) {
            html += `
                <div class="wh40k-tooltip__divider"></div>
                <div class="wh40k-tooltip__sources">
                    <div class="wh40k-tooltip__sources-title">Modifier Sources:</div>
            `;
            for (const source of sources) {
                html += `
                    <div class="wh40k-tooltip__source">
                        <span class="wh40k-tooltip__source-name">${source.name}</span>
                        <span class="wh40k-tooltip__source-value">${source.value >= 0 ? '+' : ''}${source.value}</span>
                    </div>
                `;
            }
            html += `</div>`;
        }

        html += `
            <div class="wh40k-tooltip__divider"></div>
            <div class="wh40k-tooltip__bonus">
                <span class="wh40k-tooltip__label">Bonus:</span>
                <span class="wh40k-tooltip__value wh40k-tooltip__value--bonus">${bonus}</span>
                <span class="wh40k-tooltip__bonus-calc">(${Math.floor(total / 10)}${unnatural > 1 ? ` × ${unnatural}` : ''})</span>
            </div>
            <div class="wh40k-tooltip__hint">
                <i class="fas fa-mouse-pointer"></i>
                Click characteristic to roll
            </div>
        `;

        return html;
    }

    // eslint-disable-next-line complexity -- single-function builder mixes config lookups, actor-derived overrides, and template-rank fallbacks; splitting them would obscure flow.
    async _buildSkillTooltip(data: SkillTooltipPayload): Promise<string> {
        const name = data.name ?? '';
        const { label } = data;
        const { baseValue } = data;
        const dataTB = data.trainingBonus;
        const actorUuid = data.actorUuid;

        let characteristic = data.characteristic ?? '';
        let charValue = data.charValue ?? 0;
        let trained = data.trained ?? false;
        let plus10 = data.plus10 ?? false;
        let plus20 = data.plus20 ?? false;
        let plus30 = data.plus30 ?? false;
        let current = data.current ?? 0;
        let dataBonus = data.bonus;
        let actor: WH40KBaseActor | null = null;

        if (actorUuid !== undefined && actorUuid !== '') {
            actor = await fromUuid(actorUuid);
            if (actor !== null) {
                // The `Record<string, WH40KSkill>` index access returns WH40KSkill per the
                // declared type, but the named key may not be present at runtime (compendium-
                // sourced actors can lack non-core skills); preserve the original undefined
                // guard at the boundary even though TS regards both lookups as defined.
                const skill: WH40KSkill | undefined = actor.system.skills[name];
                /* eslint-disable @typescript-eslint/no-unnecessary-condition -- boundary: index-access on Record<string, ...> can produce undefined at runtime; the declared type omits that. */
                const charKey = skill?.characteristic ?? characteristic;
                const char: WH40KCharacteristic | undefined = actor.system.characteristics[charKey];

                if (skill !== undefined && char !== undefined) {
                    trained = skill.trained;
                    plus10 = skill.plus10;
                    plus20 = skill.plus20;
                    plus30 = skill.plus30 ?? false;
                    current = skill.current;
                    charValue = char.total;
                    characteristic = char.label;
                    dataBonus = skill.bonus;
                }
                /* eslint-enable @typescript-eslint/no-unnecessary-condition */
            }
        }

        const actorGameSystem = (actor?.system as { gameSystem?: string } | undefined)?.gameSystem;
        const gameSystem = actorGameSystem ?? null;
        const systemConfig = gameSystem !== null ? SystemConfigRegistry.getOrNull(gameSystem) : null;
        const skillRanks: SkillRank[] = systemConfig?.getSkillRanks() ?? [
            { level: 1, key: 'trained', tooltip: 'Trained', bonus: 0 },
            { level: 2, key: 'plus10', tooltip: '+10', bonus: 10 },
            { level: 3, key: 'plus20', tooltip: '+20', bonus: 20 },
        ];
        if (plus30 && !skillRanks.some((rank) => rank.level === 4)) {
            skillRanks.push({ level: 4, key: 'plus30', tooltip: 'Veteran', bonus: 30 });
        }

        const level = plus30 ? 4 : plus20 ? 3 : plus10 ? 2 : trained ? 1 : 0;
        let training = localize('WH40K.Skills.Untrained');
        let trainingBonus = dataTB ?? 0;
        if (level > 0 && level <= skillRanks.length) {
            const rank = skillRanks[level - 1];
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess guard: array element may be undefined at runtime despite in-bounds check
            if (rank === undefined) throw new Error(`skillRanks[${level - 1}] is undefined; this should be unreachable.`);
            training = rank.tooltip;
            trainingBonus = dataTB ?? rank.bonus;
        }

        const calculatedBase = baseValue ?? (level > 0 ? charValue : Math.floor(charValue / 2));
        const bonus = dataBonus ?? 0;
        const tooltipSystem = getSkillDescriptionLookup();
        const skillInfo = tooltipSystem?.getSkillDescription?.(name) ?? null;
        const descriptor = typeof skillInfo?.descriptor === 'string' ? skillInfo.descriptor : '';

        let html = `
            <div class="wh40k-tooltip__header">
                <h4 class="wh40k-tooltip__title">${label ?? name}</h4>
                <div class="wh40k-tooltip__total">${current}</div>
            </div>
        `;

        if (descriptor !== '') {
            html += `
            <div class="wh40k-tooltip__description">
                ${descriptor}
            </div>
            `;
        }

        html += `
            <div class="wh40k-tooltip__divider"></div>
            <div class="wh40k-tooltip__breakdown">
                <div class="wh40k-tooltip__line">
                    <span class="wh40k-tooltip__label">${characteristic} ${localize('WH40K.Tooltip.Skill.CharacteristicValue')}:</span>
                    <span class="wh40k-tooltip__value">${charValue}</span>
                </div>
        `;

        // The half-characteristic untrained base is RT-specific (FFG Rogue Trader rule);
        // DH2e and other aptitude/career systems apply a flat -20 penalty rather than halving.
        if (level === 0 && gameSystem === 'rt') {
            html += `
                <div class="wh40k-tooltip__line">
                    <span class="wh40k-tooltip__label">${localize('WH40K.Tooltip.Skill.UntrainedBase')}:</span>
                    <span class="wh40k-tooltip__value">${calculatedBase}</span>
                </div>
            `;
        }

        // The standalone Training: line was previously rendered here; it duplicated the
        // information already shown in the Training Progression track below (current rank
        // highlighted). Dropped per issue #36 collaborator follow-up. The progression track
        // is now the single source of training-state display.
        void training;
        void trainingBonus;

        if (bonus !== 0) {
            html += `
                <div class="wh40k-tooltip__line wh40k-tooltip__line--modifier">
                    <span class="wh40k-tooltip__label">${localize('WH40K.Tooltip.Skill.Modifiers')}:</span>
                    <span class="wh40k-tooltip__value">${bonus >= 0 ? '+' : ''}${bonus}</span>
                </div>
            `;
        }

        html += `
            </div>
            <div class="wh40k-tooltip__divider"></div>
            <div class="wh40k-tooltip__training">
                <div class="wh40k-tooltip__training-title">${localize('WH40K.Tooltip.Skill.TrainingProgression')}:</div>
                <div class="wh40k-tooltip__training-track">
                    <span class="${level === 0 ? 'active' : ''}">${localize('WH40K.Skills.Untrained')}</span>
                    ${skillRanks
                        .map((rank, i) => `<i class="fas fa-arrow-right"></i><span class="${level === i + 1 ? 'active' : ''}">${rank.tooltip}</span>`)
                        .join('')}
                </div>
            </div>
            <div class="wh40k-tooltip__hint">
                <i class="fas fa-mouse-pointer"></i>
                ${localize('WH40K.Tooltip.Skill.ClickNameToRoll')}
            </div>
        `;

        return html;
    }

    _buildArmorTooltip(data: ArmorTooltipPayload): string {
        const { location } = data;
        const total = data.total ?? 0;
        const toughnessBonus = data.toughnessBonus ?? 0;
        const traitBonus = data.traitBonus ?? 0;
        const armorValue = data.armorValue ?? 0;
        const equipped = data.equipped ?? [];

        let html = `
            <div class="wh40k-tooltip__header">
                <h4 class="wh40k-tooltip__title">${location ?? 'Armour'}</h4>
                <div class="wh40k-tooltip__total">AP ${total}</div>
            </div>
            <div class="wh40k-tooltip__divider"></div>
            <div class="wh40k-tooltip__breakdown">
                <div class="wh40k-tooltip__line">
                    <span class="wh40k-tooltip__label">Toughness Bonus:</span>
                    <span class="wh40k-tooltip__value">${toughnessBonus}</span>
                </div>
        `;

        if (traitBonus > 0) {
            html += `
                <div class="wh40k-tooltip__line">
                    <span class="wh40k-tooltip__label">Trait Bonus:</span>
                    <span class="wh40k-tooltip__value">${traitBonus}</span>
                </div>
            `;
        }

        if (armorValue > 0) {
            html += `
                <div class="wh40k-tooltip__line">
                    <span class="wh40k-tooltip__label">Armour:</span>
                    <span class="wh40k-tooltip__value">${armorValue}</span>
                </div>
            `;
        }

        html += `</div>`;

        if (equipped.length > 0) {
            html += `
                <div class="wh40k-tooltip__divider"></div>
                <div class="wh40k-tooltip__equipped">
                    <div class="wh40k-tooltip__equipped-title">Equipped:</div>
            `;
            for (const item of equipped) {
                html += `
                    <div class="wh40k-tooltip__equipped-item">
                        <img src="${item.img}" alt="${item.name}" />
                        <span>${item.name}</span>
                        <span class="ap">+${item.ap ?? 0}</span>
                    </div>
                `;
            }
            html += `</div>`;
        }

        return html;
    }

    _buildWeaponTooltip(data: WeaponTooltipPayload): string {
        const name = data.name ?? '';
        const damage = data.damage ?? '—';
        const penetration = data.penetration ?? 0;
        const range = data.range ?? '—';
        const rof = data.rof ?? '—';
        const qualities = data.qualities ?? [];

        let html = `
            <div class="wh40k-tooltip__header">
                <h4 class="wh40k-tooltip__title">${name}</h4>
            </div>
            <div class="wh40k-tooltip__divider"></div>
            <div class="wh40k-tooltip__breakdown">
                <div class="wh40k-tooltip__line">
                    <span class="wh40k-tooltip__label">Damage:</span>
                    <span class="wh40k-tooltip__value">${damage}</span>
                </div>
                <div class="wh40k-tooltip__line">
                    <span class="wh40k-tooltip__label">Penetration:</span>
                    <span class="wh40k-tooltip__value">${penetration}</span>
                </div>
                <div class="wh40k-tooltip__line">
                    <span class="wh40k-tooltip__label">Range:</span>
                    <span class="wh40k-tooltip__value">${range}</span>
                </div>
                <div class="wh40k-tooltip__line">
                    <span class="wh40k-tooltip__label">Rate of Fire:</span>
                    <span class="wh40k-tooltip__value">${rof}</span>
                </div>
            </div>
        `;

        if (qualities.length > 0) {
            html += `
                <div class="wh40k-tooltip__divider"></div>
                <div class="wh40k-tooltip__qualities">
                    <div class="wh40k-tooltip__qualities-title">Qualities:</div>
            `;
            for (const quality of qualities) {
                html += `<div class="wh40k-tooltip__quality">${quality}</div>`;
            }
            html += `</div>`;
        }

        html += `
            <div class="wh40k-tooltip__action">
                <i class="fas fa-crosshairs"></i>
                Click to attack
            </div>
        `;

        return html;
    }

    _buildModifierTooltip(data: ModifierTooltipPayload): string {
        const { title } = data;
        const sources = data.sources ?? [];

        let html = `
            <div class="wh40k-tooltip__header">
                <h4 class="wh40k-tooltip__title">${title ?? 'Modifiers'}</h4>
            </div>
            <div class="wh40k-tooltip__divider"></div>
            <div class="wh40k-tooltip__sources">
        `;

        for (const source of sources) {
            html += `
                <div class="wh40k-tooltip__source">
                    <span class="wh40k-tooltip__source-name">${source.name}</span>
                    <span class="wh40k-tooltip__source-value">${source.value >= 0 ? '+' : ''}${source.value}</span>
                </div>
            `;
        }

        html += `</div>`;
        return html;
    }

    _buildQualityTooltip(data: QualityTooltipPayload): string {
        const label = data.label ?? '';
        const { description, level } = data;
        const hasLevel = data.hasLevel ?? false;
        const category = data.category ?? 'other';
        const mechanicalEffect = data.mechanicalEffect ?? false;
        const { source } = data;

        let html = `
            <div class="wh40k-tooltip__header">
                <h4 class="wh40k-tooltip__title">
                    ${label}${hasLevel && level !== null && level !== undefined ? ` (${level})` : ''}
                </h4>
        `;

        const categoryLabel =
            category === 'simple-modifier'
                ? 'Simple Modifier'
                : category === 'damage-modifier'
                ? 'Damage Modifier'
                : category
                      .split('-')
                      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                      .join(' ');

        html += `
                <span class="wh40k-tooltip__badge wh40k-tooltip__badge--${category}">
                    ${categoryLabel}
                </span>
            </div>
        `;

        if (description !== undefined && description !== '') {
            html += `
            <div class="wh40k-tooltip__description">
                ${description}
            </div>
            `;
        }

        if (mechanicalEffect) {
            html += `
            <div class="wh40k-tooltip__divider"></div>
            <div class="wh40k-tooltip__info">
                <i class="fas fa-cog"></i>
                <span>This quality has automated mechanical effects</span>
            </div>
            `;
        }

        if (source !== null && source !== undefined && source !== '') {
            html += `
            <div class="wh40k-tooltip__source-ref">
                <i class="fas fa-book"></i>
                <span>${source}</span>
            </div>
            `;
        }

        return html;
    }

    _buildGenericTooltip(data: GenericTooltipPayload): string {
        const { title, content } = data;
        return `
            <div class="wh40k-tooltip__header">
                <h4 class="wh40k-tooltip__title">${title ?? 'Information'}</h4>
            </div>
            <div class="wh40k-tooltip__content">
                ${content ?? ''}
            </div>
        `;
    }

    _repositionTooltip(): void {
        const tooltip = this.#tooltip;
        const tooltipManager = getTooltipManager();
        if (tooltip === null) return;

        const pos = tooltip.getBoundingClientRect();
        const { innerHeight, innerWidth } = window;

        let direction = tooltipManager.element?.dataset['tooltipDirection'];

        if (direction === undefined || direction === '') {
            direction = 'LEFT';
            tooltipManager._setAnchor?.(direction);
        }

        if (direction === 'LEFT' && pos.x < 0) {
            tooltipManager._setAnchor?.('RIGHT');
        } else if (direction === 'RIGHT' && pos.x + tooltip.offsetWidth > innerWidth) {
            tooltipManager._setAnchor?.('LEFT');
        } else if (direction === 'UP' && pos.y < 0) {
            tooltipManager._setAnchor?.('DOWN');
        } else if (direction === 'DOWN' && pos.y + tooltip.offsetHeight > innerHeight) {
            tooltipManager._setAnchor?.('UP');
        }
    }
}

export { TooltipsWH40K as WH40KTooltip };

/* -------------------------------------------- */
/*  Static Tooltip Data Helpers                  */
/* -------------------------------------------- */

export function prepareCharacteristicTooltipData(
    key: string,
    characteristic: WH40KCharacteristic,
    modifierSources: Record<string, WH40KModifierEntry[]> = {},
): string {
    const sources = modifierSources[key] ?? [];
    const data: CharacteristicTooltipPayload = {
        name: key,
        label: characteristic.label,
        base: characteristic.base,
        advance: characteristic.advance,
        modifier: characteristic.modifier,
        unnatural: characteristic.unnatural,
        total: characteristic.total,
        bonus: characteristic.bonus,
        sources: sources.map((s) => ({
            name: s.source,
            value: s.value,
        })),
    };
    return JSON.stringify(data);
}

/** Legacy specialist-entry skill shape sometimes seen in older data. */
interface LegacySkillFields {
    char?: string;
    name?: string;
}

export function prepareSkillTooltipData(key: string, skill: WH40KSkill, characteristics: Record<string, WH40KCharacteristic> = {}, actorUuid?: string): string {
    // eslint-disable-next-line no-restricted-syntax -- boundary: WH40KSkill may carry the legacy `char`/`name` fields from pre-DH2e data; surface them without widening the canonical type.
    const legacy = skill as unknown as LegacySkillFields;
    const charKey = skill.characteristic !== '' ? skill.characteristic : legacy.char ?? 'strength';
    /* eslint-disable @typescript-eslint/no-unnecessary-condition -- boundary: Record<string, WH40KCharacteristic> index access can produce undefined at runtime when a legacy actor lacks the key; the declared type omits that. */
    const char: WH40KCharacteristic | undefined = characteristics[charKey];
    const charTotal = char?.total ?? 0;
    const charLabel = char?.label ?? charKey;
    /* eslint-enable @typescript-eslint/no-unnecessary-condition */
    const trained = skill.trained;
    const plus10 = skill.plus10;
    const plus20 = skill.plus20;
    const plus30 = skill.plus30 ?? false;
    const basic = skill.basic ?? false;
    const level = plus30 ? 4 : plus20 ? 3 : plus10 ? 2 : trained ? 1 : 0;
    const baseValue = level > 0 ? charTotal : Math.floor(charTotal / 2);
    const trainingBonus = level >= 4 ? 30 : level >= 3 ? 20 : level >= 2 ? 10 : 0;
    const bonus = skill.bonus;
    const data: SkillTooltipPayload = {
        name: key,
        label: skill.label ?? legacy.name ?? key,
        characteristic: charLabel,
        charValue: charTotal,
        baseValue,
        trained,
        plus10,
        plus20,
        plus30,
        current: skill.current,
        basic,
        trainingBonus,
        bonus,
        actorUuid,
    };
    return JSON.stringify(data);
}

/** System bag for armour items — `system.armour` is a per-location map. */
interface ArmourItemSystem {
    armour?: Record<string, number>;
}

export function prepareArmorTooltipData(location: string, armorData: WH40KArmourLocation, equipped: WH40KItem[] = []): string {
    const locationLabels: Record<string, string> = {
        head: 'Head',
        rightArm: 'Right Arm',
        leftArm: 'Left Arm',
        body: 'Body',
        rightLeg: 'Right Leg',
        leftLeg: 'Left Leg',
    };
    const data: ArmorTooltipPayload = {
        location: locationLabels[location] ?? location,
        total: armorData.total,
        toughnessBonus: armorData.toughnessBonus,
        traitBonus: armorData.traitBonus,
        armorValue: armorData.value,
        equipped: equipped.map((item) => {
            const sys = item.system as ArmourItemSystem;
            return {
                name: item.name,
                img: item.img ?? '',
                ap: sys.armour?.[location] ?? 0,
            };
        }),
    };
    return JSON.stringify(data);
}

export function prepareWeaponTooltipData(weapon: WH40KItem): string {
    const sys = weapon.system as {
        damage?: string;
        penetration?: number;
        range?: string;
        rof?: string;
        qualities?: Array<{ name: string } | string>;
    };
    const data = {
        name: weapon.name,
        damage: sys.damage ?? '—',
        penetration: sys.penetration ?? 0,
        range: sys.range ?? '—',
        rof: sys.rof ?? '—',
        qualities: sys.qualities?.map((q) => (typeof q === 'string' ? q : q.name)) ?? [],
    };
    return JSON.stringify(data);
}

export interface ModifierTooltipSource {
    name?: string;
    source?: string;
    value?: number;
    modifier?: number;
}

export function prepareModifierTooltipData(title: string, sources: ModifierTooltipSource[]): string {
    const data = {
        title,
        sources: sources.map((s) => ({
            name: s.name ?? s.source ?? 'Unknown',
            value: s.value ?? s.modifier ?? 0,
        })),
    };
    return JSON.stringify(data);
}

export function prepareQualityTooltipData(identifier: string, level: number | null = null): string {
    const config = getRogueTraderConfig();
    if (config === undefined) return '{}';
    const def = config.getQualityDefinition?.(identifier) ?? null;
    if (def === null) return '{}';
    let resolvedLevel = level;
    if (resolvedLevel === null) {
        const match = identifier.match(/-(\d+)$/);
        const matchGroup = match?.[1];
        if (matchGroup !== undefined) resolvedLevel = parseInt(matchGroup);
    }
    const label = game.i18n.localize(def.label);
    const description = game.i18n.localize(def.description);
    const data = {
        type: 'quality',
        identifier,
        label,
        description,
        level: resolvedLevel,
        hasLevel: def.hasLevel ?? false,
        category: def.category ?? 'other',
        mechanicalEffect: def.mechanicalEffect ?? false,
        source: def.source ?? null,
    };
    return JSON.stringify(data);
}
