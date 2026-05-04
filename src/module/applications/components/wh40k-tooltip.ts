/**
 * @gulpfile.js TooltipsWH40K - Rich tooltip system for WH40K RPG
 * Based on dnd5e's Tooltips5e pattern - uses Foundry's native TooltipManager
 * with MutationObserver to provide rich tooltip content.
 */

import { SystemConfigRegistry } from '../../config/game-systems/index.ts';
import type { WH40KBaseActor } from '../../documents/base-actor.ts';
import type { WH40KItem } from '../../documents/item.ts';
import type { WH40KCharacteristic, WH40KModifierEntry, WH40KSkill, WH40KArmourLocation } from '../../types/global.d.ts';

/**
 * A class responsible for orchestrating rich tooltips in the WH40K RPG system.
 */
export class TooltipsWH40K {
    #observer: MutationObserver | undefined;
    #tooltip: HTMLElement | null = null;
    #skillDescriptions = new Map<string, Record<string, unknown>>();

    get tooltip() {
        return this.#tooltip;
    }

    get skillDescriptions() {
        return this.#skillDescriptions;
    }

    async initialize(): Promise<void> {
        this.#tooltip = document.getElementById('tooltip');
        if (!this.#tooltip) {
            console.warn('WH40K Tooltips | Could not find #tooltip element');
            return;
        }
        this.observe();
        await this._loadSkillDescriptions();
    }

    async _loadSkillDescriptions(): Promise<void> {
        try {
            const skillPackNames = ['wh40k-rpg.dh2-core-stats-skills', 'wh40k-rpg.rt-core-items-skills', 'wh40k-rpg.dw-core-items-skills'];
            const pack = skillPackNames.map((n) => game.packs.get(n)).find((p) => !!p) as {
                getIndex: () => Promise<Array<{ _id: string; name: string }>>;
                getDocument: (id: string) => Promise<WH40KItem | null>;
            } | undefined;
            if (!pack) {
                console.warn('WH40K Tooltips | Could not find skills compendium');
                return;
            }

            const index = await pack.getIndex();
            for (const entry of index) {
                const item = await pack.getDocument(entry._id);
                if (item) {
                    const key = entry.name.toLowerCase().replace(/\s+/g, '').replace(/-/g, '');
                    const system = item.system as {
                        descriptor?: string;
                        uses?: string;
                        useTime?: string;
                        isBasic?: boolean;
                        aptitudes?: string[];
                    };

                    this.#skillDescriptions.set(key, {
                        name: entry.name,
                        descriptor: system.descriptor || '',
                        uses: system.uses || '',
                        useTime: system.useTime || '',
                        isBasic: system.isBasic ?? true,
                        aptitudes: system.aptitudes || [],
                    });
                }
            }
        } catch (err) {
            console.warn('WH40K Tooltips | Failed to load skill descriptions:', err);
        }
    }

    getSkillDescription(skillKey: string): Record<string, unknown> | null {
        const normalizedKey = skillKey.toLowerCase().replace(/\s+/g, '').replace(/-/g, '');
        return this.#skillDescriptions.get(normalizedKey) || null;
    }

    observe(): void {
        this.#observer?.disconnect();
        if (!this.#tooltip) return;

        this.#observer = new MutationObserver(this._onMutation.bind(this));
        this.#observer.observe(this.#tooltip, {
            attributeFilter: ['class'],
            attributeOldValue: true,
        });
    }

    _onMutation(mutationList: MutationRecord[]): void {
        let isActive = false;
        const tooltip = this.#tooltip;
        if (!tooltip) return;

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
        const element = game.tooltip.element as HTMLElement;
        if (!element) return;

        const tooltipType = element.dataset.wh40kTooltip;
        const tooltipDataAttr = element.dataset.wh40kTooltipData;

        if (tooltipType && tooltipDataAttr) {
            try {
                const data = JSON.parse(tooltipDataAttr);
                const content = await this._buildTooltipContent(data, tooltipType);
                if (content && this.#tooltip) {
                    this.#tooltip.innerHTML = content;
                    this.#tooltip.classList.add('wh40k-tooltip', `wh40k-tooltip--${tooltipType}`);
                    requestAnimationFrame(() => this._repositionTooltip());
                }
            } catch (err) {
                console.warn('WH40K Tooltips | Failed to parse tooltip data:', err, tooltipDataAttr);
            }
            return;
        }

        if (element.classList.contains('content-link') && element.dataset.uuid) {
            const doc = await fromUuid(element.dataset.uuid);
            if (doc) {
                await this._onHoverContentLink(doc as WH40KItem);
            }
        }
    }

    async _onHoverContentLink(doc: WH40KItem): Promise<void> {
        const result = (await (
            (doc as { richTooltip?: () => Promise<Record<string, unknown>> }).richTooltip?.() ??
            (doc.system as { richTooltip?: () => Promise<Record<string, unknown>> } | null)?.richTooltip?.() ??
            {}
        )) as { content?: string; classes?: string[] };
        const { content, classes } = result;

        if (!content || !this.#tooltip) return;

        this.#tooltip.innerHTML = content;
        this.#tooltip.classList.add('wh40k-tooltip');
        if (classes?.length) {
            this.#tooltip.classList.add(...(classes as string[]));
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

    _buildCharacteristicTooltip(data: Record<string, any>): string {
        const { name, label, base = 0, advance = 0, modifier = 0, unnatural = 1, total = 0, bonus = 0, sources = [] } = data;

        let html = `
            <div class="wh40k-tooltip__header">
                <h4 class="wh40k-tooltip__title">${label || name}</h4>
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

        if (sources?.length > 0) {
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

    async _buildSkillTooltip(data: Record<string, any>): Promise<string> {
        const { name, label, baseValue, basic = false, trainingBonus: dataTB, actorUuid } = data;
        let { characteristic, charValue = 0, trained = false, plus10 = false, plus20 = false, current = 0, bonus: dataBonus } = data;

        if (actorUuid) {
            const actor = (await fromUuid(actorUuid)) as WH40KBaseActor;
            if (actor) {
                const skill = actor.system.skills?.[name];
                const charKey = skill?.characteristic || characteristic;
                const char = actor.system.characteristics?.[charKey];

                if (skill && char) {
                    trained = skill.trained || false;
                    plus10 = skill.plus10 || false;
                    plus20 = skill.plus20 || false;
                    current = skill.current || 0;
                    charValue = char.total || 0;
                    characteristic = char.label || characteristic;
                    dataBonus = skill.bonus || 0;
                }
            }
        }

        let gameSystem: string | null = null;
        if (actorUuid) {
            const actor = (await fromUuid(actorUuid)) as WH40KBaseActor;
            gameSystem = (actor?.system as { gameSystem?: string } | null)?.gameSystem ?? null;
        }
        const systemConfig = gameSystem ? SystemConfigRegistry.getOrNull(gameSystem) : null;
        const skillRanks: any[] = systemConfig?.getSkillRanks() ?? [
            { level: 1, key: 'trained', tooltip: 'Trained', bonus: 0 },
            { level: 2, key: 'plus10', tooltip: '+10', bonus: 10 },
            { level: 3, key: 'plus20', tooltip: '+20', bonus: 20 },
        ];

        const level = plus20 ? 3 : plus10 ? 2 : trained ? 1 : 0;
        let training = basic ? 'Basic (Untrained)' : 'Untrained';
        let trainingBonus = dataTB ?? 0;
        if (level > 0 && level <= skillRanks.length) {
            const rank = skillRanks[level - 1];
            training = rank.tooltip;
            trainingBonus = dataTB ?? rank.bonus;
        }

        const calculatedBase = baseValue ?? (level > 0 ? charValue : Math.floor(charValue / 2));
        const bonus = dataBonus ?? 0;
        const skillInfo = this.getSkillDescription(name);
        const descriptor = (skillInfo?.descriptor as string) || '';

        let html = `
            <div class="wh40k-tooltip__header">
                <h4 class="wh40k-tooltip__title">${label || name}</h4>
                <div class="wh40k-tooltip__total">${current}</div>
            </div>
        `;

        if (descriptor) {
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
                    <span class="wh40k-tooltip__label">${characteristic} Value:</span>
                    <span class="wh40k-tooltip__value">${charValue}</span>
                </div>
        `;

        if (level === 0) {
            html += `
                <div class="wh40k-tooltip__line">
                    <span class="wh40k-tooltip__label">Base (÷2 untrained):</span>
                    <span class="wh40k-tooltip__value">${calculatedBase}</span>
                </div>
            `;
        }

        if (trainingBonus > 0) {
            html += `
                <div class="wh40k-tooltip__line">
                    <span class="wh40k-tooltip__label">Training (${training}):</span>
                    <span class="wh40k-tooltip__value">+${trainingBonus}</span>
                </div>
            `;
        } else if (level === 0) {
            html += `
                <div class="wh40k-tooltip__line">
                    <span class="wh40k-tooltip__label">Training:</span>
                    <span class="wh40k-tooltip__value">${training}</span>
                </div>
            `;
        }

        if (bonus !== 0) {
            html += `
                <div class="wh40k-tooltip__line wh40k-tooltip__line--modifier">
                    <span class="wh40k-tooltip__label">Modifiers:</span>
                    <span class="wh40k-tooltip__value">${bonus >= 0 ? '+' : ''}${bonus}</span>
                </div>
            `;
        }

        html += `
            </div>
            <div class="wh40k-tooltip__divider"></div>
            <div class="wh40k-tooltip__training">
                <div class="wh40k-tooltip__training-title">Training Progression:</div>
                <div class="wh40k-tooltip__training-track">
                    <span class="${level === 0 ? 'active' : ''}">Untrained</span>
                    ${skillRanks
                        .map(
                            (rank: any, i: number) =>
                                `<i class="fas fa-arrow-right"></i><span class="${level === i + 1 ? 'active' : ''}">${rank.tooltip}</span>`,
                        )
                        .join('')}
                </div>
            </div>
            <div class="wh40k-tooltip__hint">
                <i class="fas fa-mouse-pointer"></i>
                Click skill name to roll
            </div>
        `;

        return html;
    }

    _buildArmorTooltip(data: Record<string, any>): string {
        const { location, total = 0, toughnessBonus = 0, traitBonus = 0, armorValue = 0, equipped = [] } = data;

        let html = `
            <div class="wh40k-tooltip__header">
                <h4 class="wh40k-tooltip__title">${location || 'Armour'}</h4>
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

        if (equipped?.length > 0) {
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
                        <span class="ap">+${item.ap || 0}</span>
                    </div>
                `;
            }
            html += `</div>`;
        }

        return html;
    }

    _buildWeaponTooltip(data: Record<string, any>): string {
        const { name, damage, penetration = 0, range, rof, qualities = [] } = data;

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

        if (qualities?.length > 0) {
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

    _buildModifierTooltip(data: Record<string, any>): string {
        const { title, sources = [] } = data;

        let html = `
            <div class="wh40k-tooltip__header">
                <h4 class="wh40k-tooltip__title">${title || 'Modifiers'}</h4>
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

    _buildQualityTooltip(data: Record<string, any>): string {
        const { label, description, level = null, hasLevel = false, category = 'other', mechanicalEffect = false, source = null } = data;

        let html = `
            <div class="wh40k-tooltip__header">
                <h4 class="wh40k-tooltip__title">
                    ${label}${hasLevel && level !== null ? ` (${level})` : ''}
                </h4>
        `;

        const categoryLabel =
            category === 'simple-modifier'
                ? 'Simple Modifier'
                : category === 'damage-modifier'
                ? 'Damage Modifier'
                : category
                      .split('-')
                      .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
                      .join(' ');

        html += `
                <span class="wh40k-tooltip__badge wh40k-tooltip__badge--${category}">
                    ${categoryLabel}
                </span>
            </div>
        `;

        if (description) {
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

        if (source) {
            html += `
            <div class="wh40k-tooltip__source-ref">
                <i class="fas fa-book"></i>
                <span>${source}</span>
            </div>
            `;
        }

        return html;
    }

    _buildGenericTooltip(data: Record<string, any>): string {
        const { title, content } = data;
        return `
            <div class="wh40k-tooltip__header">
                <h4 class="wh40k-tooltip__title">${title || 'Information'}</h4>
            </div>
            <div class="wh40k-tooltip__content">
                ${content || ''}
            </div>
        `;
    }

    _repositionTooltip(): void {
        const tooltip = this.#tooltip;
        const tooltipManager = (game as any).tooltip;
        if (!tooltip || !tooltipManager) return;

        const pos = tooltip.getBoundingClientRect();
        const { innerHeight, innerWidth } = window;

        let direction = tooltipManager.element?.dataset.tooltipDirection;

        if (!direction) {
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
    const sources = modifierSources[key] || [];
    const data = {
        name: key,
        label: characteristic.label || key,
        base: characteristic.base || 0,
        advance: characteristic.advance || 0,
        modifier: characteristic.modifier || 0,
        unnatural: characteristic.unnatural || 1,
        total: characteristic.total || 0,
        bonus: characteristic.bonus || 0,
        sources: sources.map((s) => ({
            name: s.source || 'Unknown',
            value: s.value || 0,
        })),
    };
    return JSON.stringify(data);
}

export function prepareSkillTooltipData(
    key: string,
    skill: WH40KSkill,
    characteristics: Record<string, WH40KCharacteristic> = {},
    _actorUuid?: string,
): string {
    const charKey = skill.characteristic || (skill as { char?: string }).char || 'strength';
    const char = characteristics[charKey] || {};
    const charTotal = char.total || 0;
    const charLabel = char.label || charKey;
    const trained = skill.trained || false;
    const plus10 = skill.plus10 || false;
    const plus20 = skill.plus20 || false;
    const basic = skill.basic || false;
    const level = plus20 ? 3 : plus10 ? 2 : trained ? 1 : 0;
    const baseValue = level > 0 ? charTotal : Math.floor(charTotal / 2);
    const trainingBonus = level >= 3 ? 20 : level >= 2 ? 10 : 0;
    const bonus = skill.bonus || 0;
    const data = {
        name: key,
        label: skill.label || (skill as { name?: string }).name || key,
        characteristic: charLabel,
        charValue: charTotal,
        baseValue,
        trained,
        plus10,
        plus20,
        current: skill.current || 0,
        basic,
        trainingBonus,
        bonus,
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
        location: locationLabels[location] || location,
        total: armorData.total || 0,
        toughnessBonus: armorData.toughnessBonus || 0,
        traitBonus: armorData.traitBonus || 0,
        armorValue: armorData.value || 0,
        equipped: equipped.map((item) => ({
            name: item.name,
            img: item.img,
            ap: ((item.system as Record<string, unknown>)?.armour as Record<string, number>)?.[location] || 0,
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
        damage: sys?.damage || '—',
        penetration: sys?.penetration || 0,
        range: sys?.range || '—',
        rof: sys?.rof || '—',
        qualities: sys?.qualities?.map((q) => (typeof q === 'string' ? q : q.name)) || [],
    };
    return JSON.stringify(data);
}

export function prepareModifierTooltipData(title: string, sources: any[]): string {
    const data = {
        title,
        sources: sources.map((s: any) => ({
            name: s.name || s.source || 'Unknown',
            value: s.value || s.modifier || 0,
        })),
    };
    return JSON.stringify(data);
}

export function prepareQualityTooltipData(identifier: string, level: number | null = null): string {
    const config = (CONFIG as Record<string, any>).ROGUE_TRADER;
    if (!config) return '{}';
    const def = config.getQualityDefinition?.(identifier);
    if (!def) return '{}';
    if (level === null) {
        const match = identifier.match(/-(\d+)$/);
        if (match) level = parseInt(match[1]);
    }
    const label = game.i18n.localize(def.label);
    const description = game.i18n.localize(def.description);
    const data = {
        type: 'quality',
        identifier,
        label,
        description,
        level,
        hasLevel: def.hasLevel ?? false,
        category: def.category || 'other',
        mechanicalEffect: def.mechanicalEffect ?? false,
        source: def.source || null,
    };
    return JSON.stringify(data);
}
