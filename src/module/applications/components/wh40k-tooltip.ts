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
    element: HTMLElement & { dataset: DOMStringMap };
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

/**
 * A class responsible for orchestrating rich tooltips in the WH40K RPG system.
 */
export class TooltipsWH40K {
    #observer: MutationObserver | undefined;
    #tooltip: HTMLElement | null = null;
    #skillDescriptions = new Map<string, Record<string, unknown>>();

    get tooltip(): HTMLElement | null {
        return this.#tooltip;
    }

    get skillDescriptions(): Map<string, Record<string, unknown>> {
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
            const pack = skillPackNames.map((n) => game.packs.get(n)).find((p) => p != null) ?? null;
            if (pack === null) {
                console.warn('WH40K Tooltips | Could not find skills compendium');
                return;
            }

            const index = await pack.getIndex();
            for (const entry of index) {
                // eslint-disable-next-line no-await-in-loop
                const item = (await pack.getDocument(entry._id)) as WH40KItem | null;
                if (item !== null) {
                    const entryName = (entry.name as string | undefined) ?? '';
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

    getSkillDescription(skillKey: string): Record<string, unknown> | null {
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
        const tooltipManager = (game as unknown as { tooltip: TooltipManager }).tooltip;
        const element = tooltipManager.element;
        if (element == null) return;

        const tooltipType = element.dataset.wh40kTooltip;
        const tooltipDataAttr = element.dataset.wh40kTooltipData;

        if (tooltipType !== undefined && tooltipType !== '' && tooltipDataAttr !== undefined && tooltipDataAttr !== '') {
            try {
                const data = JSON.parse(tooltipDataAttr) as Record<string, unknown>;
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

        if (element.classList.contains('content-link') && element.dataset.uuid !== undefined) {
            const doc = await fromUuid(element.dataset.uuid);
            if (doc !== null) {
                await this._onHoverContentLink(doc as WH40KItem);
            }
        }
    }

    async _onHoverContentLink(doc: WH40KItem): Promise<void> {
        type RichTooltipResult = { content?: string; classes?: string[] };
        const docWithTooltip = doc as unknown as { richTooltip?: () => Promise<RichTooltipResult> };
        const sysWithTooltip = doc.system as unknown as { richTooltip?: () => Promise<RichTooltipResult> };
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

    async _buildTooltipContent(data: Record<string, unknown>, type: string): Promise<string> {
        switch (type) {
            case 'characteristic':
                return this._buildCharacteristicTooltip(data);
            case 'skill':
                return await this._buildSkillTooltip(data);
            case 'armor':
            case 'armour':
                return this._buildArmorTooltip(data);
            case 'weapon':
                return this._buildWeaponTooltip(data);
            case 'modifier':
                return this._buildModifierTooltip(data);
            case 'quality':
                return this._buildQualityTooltip(data);
            default:
                return this._buildGenericTooltip(data);
        }
    }

    _buildCharacteristicTooltip(data: Record<string, unknown>): string {
        const name = data.name as string | undefined;
        const label = data.label as string | undefined;
        const base = (data.base as number | undefined) ?? 0;
        const advance = (data.advance as number | undefined) ?? 0;
        const modifier = (data.modifier as number | undefined) ?? 0;
        const unnatural = (data.unnatural as number | undefined) ?? 1;
        const total = (data.total as number | undefined) ?? 0;
        const bonus = (data.bonus as number | undefined) ?? 0;
        const sources = (data.sources as TooltipModifierSource[] | undefined) ?? [];

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

    async _buildSkillTooltip(data: Record<string, unknown>): Promise<string> {
        const name = (data.name as string | undefined) ?? '';
        const label = data.label as string | undefined;
        const baseValue = data.baseValue as number | undefined;
        const basic = (data.basic as boolean | undefined) ?? false;
        const dataTB = data.trainingBonus as number | undefined;
        const actorUuid = data.actorUuid as string | undefined;

        let characteristic = (data.characteristic as string | undefined) ?? '';
        let charValue = (data.charValue as number | undefined) ?? 0;
        let trained = (data.trained as boolean | undefined) ?? false;
        let plus10 = (data.plus10 as boolean | undefined) ?? false;
        let plus20 = (data.plus20 as boolean | undefined) ?? false;
        let plus30 = (data.plus30 as boolean | undefined) ?? false;
        let current = (data.current as number | undefined) ?? 0;
        let dataBonus = data.bonus as number | undefined;
        let actor: WH40KBaseActor | null = null;

        if (actorUuid !== undefined && actorUuid !== '') {
            actor = (await fromUuid(actorUuid)) as WH40KBaseActor | null;
            if (actor !== null) {
                const skill = actor.system.skills?.[name] as WH40KSkill | undefined;
                const charKey = skill?.characteristic ?? characteristic;
                const char = actor.system.characteristics?.[charKey] as WH40KCharacteristic | undefined;

                if (skill !== undefined && char !== undefined) {
                    trained = skill.trained ?? false;
                    plus10 = skill.plus10 ?? false;
                    plus20 = skill.plus20 ?? false;
                    plus30 = skill.plus30 ?? false;
                    current = skill.current ?? 0;
                    charValue = char.total ?? 0;
                    characteristic = char.label ?? characteristic;
                    dataBonus = skill.bonus ?? 0;
                }
            }
        }

        const gameSystem = (actor?.system as { gameSystem?: string } | undefined)?.gameSystem ?? null;
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
        let training = basic ? localize('WH40K.Tooltip.Skill.BasicUntrained') : localize('WH40K.Skills.Untrained');
        let trainingBonus = dataTB ?? 0;
        if (level > 0 && level <= skillRanks.length) {
            const rank = skillRanks[level - 1];
            training = rank.tooltip;
            trainingBonus = dataTB ?? rank.bonus;
        }

        const calculatedBase = baseValue ?? (level > 0 ? charValue : Math.floor(charValue / 2));
        const bonus = dataBonus ?? 0;
        const tooltipSystem = game.wh40k?.tooltips as unknown as { getSkillDescription?: (key: string) => Record<string, unknown> | null } | undefined;
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

        if (level === 0) {
            html += `
                <div class="wh40k-tooltip__line">
                    <span class="wh40k-tooltip__label">${localize('WH40K.Tooltip.Skill.UntrainedBase')}:</span>
                    <span class="wh40k-tooltip__value">${calculatedBase}</span>
                </div>
            `;
        }

        if (trainingBonus > 0) {
            html += `
                <div class="wh40k-tooltip__line">
                    <span class="wh40k-tooltip__label">${localize('WH40K.Skills.Training')} (${training}):</span>
                    <span class="wh40k-tooltip__value">+${trainingBonus}</span>
                </div>
            `;
        } else if (level === 0) {
            html += `
                <div class="wh40k-tooltip__line">
                    <span class="wh40k-tooltip__label">${localize('WH40K.Skills.Training')}:</span>
                    <span class="wh40k-tooltip__value">${training}</span>
                </div>
            `;
        }

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

    _buildArmorTooltip(data: Record<string, unknown>): string {
        const location = data.location as string | undefined;
        const total = (data.total as number | undefined) ?? 0;
        const toughnessBonus = (data.toughnessBonus as number | undefined) ?? 0;
        const traitBonus = (data.traitBonus as number | undefined) ?? 0;
        const armorValue = (data.armorValue as number | undefined) ?? 0;
        const equipped = (data.equipped as Array<{ img: string; name: string; ap?: number }> | undefined) ?? [];

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

    _buildWeaponTooltip(data: Record<string, unknown>): string {
        const name = (data.name as string | undefined) ?? '';
        const damage = (data.damage as string | undefined) ?? '—';
        const penetration = (data.penetration as number | undefined) ?? 0;
        const range = (data.range as string | undefined) ?? '—';
        const rof = (data.rof as string | undefined) ?? '—';
        const qualities = (data.qualities as string[] | undefined) ?? [];

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

    _buildModifierTooltip(data: Record<string, unknown>): string {
        const title = data.title as string | undefined;
        const sources = (data.sources as TooltipModifierSource[] | undefined) ?? [];

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

    _buildQualityTooltip(data: Record<string, unknown>): string {
        const label = (data.label as string | undefined) ?? '';
        const description = data.description as string | undefined;
        const level = data.level as number | null | undefined;
        const hasLevel = (data.hasLevel as boolean | undefined) ?? false;
        const category = (data.category as string | undefined) ?? 'other';
        const mechanicalEffect = (data.mechanicalEffect as boolean | undefined) ?? false;
        const source = data.source as string | null | undefined;

        let html = `
            <div class="wh40k-tooltip__header">
                <h4 class="wh40k-tooltip__title">
                    ${label}${hasLevel && level != null ? ` (${level})` : ''}
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

        if (source != null && source !== '') {
            html += `
            <div class="wh40k-tooltip__source-ref">
                <i class="fas fa-book"></i>
                <span>${source}</span>
            </div>
            `;
        }

        return html;
    }

    _buildGenericTooltip(data: Record<string, unknown>): string {
        const title = data.title as string | undefined;
        const content = data.content as string | undefined;
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
        const tooltipManager = (game as unknown as { tooltip: TooltipManager | null }).tooltip;
        if (tooltip === null || tooltipManager === null) return;

        const pos = tooltip.getBoundingClientRect();
        const { innerHeight, innerWidth } = window;

        let direction = tooltipManager.element?.dataset.tooltipDirection;

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
    const data = {
        name: key,
        label: characteristic.label ?? key,
        base: characteristic.base ?? 0,
        advance: characteristic.advance ?? 0,
        modifier: characteristic.modifier ?? 0,
        unnatural: characteristic.unnatural ?? 1,
        total: characteristic.total ?? 0,
        bonus: characteristic.bonus ?? 0,
        sources: sources.map((s) => ({
            name: s.source ?? 'Unknown',
            value: s.value ?? 0,
        })),
    };
    return JSON.stringify(data);
}

export function prepareSkillTooltipData(key: string, skill: WH40KSkill, characteristics: Record<string, WH40KCharacteristic> = {}, actorUuid?: string): string {
    const charKey = skill.characteristic ?? (skill as unknown as { char?: string }).char ?? 'strength';
    const char = characteristics[charKey] ?? {};
    const charTotal = char.total ?? 0;
    const charLabel = char.label ?? charKey;
    const trained = skill.trained ?? false;
    const plus10 = skill.plus10 ?? false;
    const plus20 = skill.plus20 ?? false;
    const plus30 = skill.plus30 ?? false;
    const basic = skill.basic ?? false;
    const level = plus30 ? 4 : plus20 ? 3 : plus10 ? 2 : trained ? 1 : 0;
    const baseValue = level > 0 ? charTotal : Math.floor(charTotal / 2);
    const trainingBonus = level >= 4 ? 30 : level >= 3 ? 20 : level >= 2 ? 10 : 0;
    const bonus = skill.bonus ?? 0;
    const data = {
        name: key,
        label: skill.label ?? (skill as unknown as { name?: string }).name ?? key,
        characteristic: charLabel,
        charValue: charTotal,
        baseValue,
        trained,
        plus10,
        plus20,
        plus30,
        current: skill.current ?? 0,
        basic,
        trainingBonus,
        bonus,
        actorUuid,
    };
    return JSON.stringify(data);
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
    const data = {
        location: locationLabels[location] ?? location,
        total: armorData.total ?? 0,
        toughnessBonus: armorData.toughnessBonus ?? 0,
        traitBonus: armorData.traitBonus ?? 0,
        armorValue: armorData.value ?? 0,
        equipped: equipped.map((item) => ({
            name: item.name,
            img: item.img,
            ap: ((item.system as Record<string, unknown>).armour as Record<string, number> | undefined)?.[location] ?? 0,
        })),
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
    const config = (CONFIG as unknown as { ROGUE_TRADER?: { getQualityDefinition?: (id: string) => QualityDefinition | null } }).ROGUE_TRADER;
    if (config == null) return '{}';
    const def = config.getQualityDefinition?.(identifier) ?? null;
    if (def === null) return '{}';
    let resolvedLevel = level;
    if (resolvedLevel === null) {
        const match = identifier.match(/-(\d+)$/);
        if (match !== null) resolvedLevel = parseInt(match[1]);
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
