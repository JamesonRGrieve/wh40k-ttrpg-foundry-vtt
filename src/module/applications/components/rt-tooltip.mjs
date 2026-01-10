/**
 * @file TooltipsRT - Rich tooltip system for Rogue Trader
 * Based on dnd5e's Tooltips5e pattern - uses Foundry's native TooltipManager
 * with MutationObserver to provide rich tooltip content.
 */

/**
 * A class responsible for orchestrating rich tooltips in the Rogue Trader system.
 * Uses Foundry's native TooltipManager and observes tooltip activation via MutationObserver.
 */
export class TooltipsRT {
    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * The currently registered observer.
     * @type {MutationObserver}
     */
    #observer;

    /**
     * The Foundry tooltip element.
     * @type {HTMLElement}
     */
    get tooltip() {
        return this.#tooltip;
    }

    #tooltip = null;

    /**
     * Cached skill descriptions from compendium.
     * @type {Map<string, object>}
     */
    #skillDescriptions = new Map();

    /**
     * Get skill descriptions cache.
     * @type {Map<string, object>}
     */
    get skillDescriptions() {
        return this.#skillDescriptions;
    }

    /* -------------------------------------------- */
    /*  Initialization                              */
    /* -------------------------------------------- */

    /**
     * Initialize the tooltip system. Call this once on system ready.
     */
    async initialize() {
        this.#tooltip = document.getElementById("tooltip");
        if (!this.#tooltip) {
            console.warn("RT Tooltips | Could not find #tooltip element");
            return;
        }
        console.log("RT Tooltips | Initialized - observing #tooltip element");
        this.observe();
        
        // Load skill descriptions from compendium
        await this._loadSkillDescriptions();
    }

    /**
     * Load skill descriptions from the skills compendium.
     * @protected
     */
    async _loadSkillDescriptions() {
        try {
            const pack = game.packs.get("rogue-trader.rt-items-skills");
            if (!pack) {
                console.warn("RT Tooltips | Could not find skills compendium");
                return;
            }
            
            const index = await pack.getIndex();
            for (const entry of index) {
                const item = await pack.getDocument(entry._id);
                if (item) {
                    // Normalize the skill name to match skill keys
                    const key = entry.name.toLowerCase()
                        .replace(/\s+/g, '')
                        .replace(/-/g, '');
                    
                    this.#skillDescriptions.set(key, {
                        name: entry.name,
                        descriptor: item.system?.descriptor || "",
                        uses: item.system?.uses || "",
                        useTime: item.system?.useTime || "",
                        isBasic: item.system?.isBasic ?? true,
                        aptitudes: item.system?.aptitudes || []
                    });
                }
            }
            console.log(`RT Tooltips | Loaded ${this.#skillDescriptions.size} skill descriptions`);
        } catch (err) {
            console.warn("RT Tooltips | Failed to load skill descriptions:", err);
        }
    }

    /**
     * Get skill description data by skill key.
     * @param {string} skillKey  The skill key (e.g., "acrobatics", "commonLore").
     * @returns {object|null}    Skill description data or null.
     */
    getSkillDescription(skillKey) {
        // Try direct lookup first
        const normalizedKey = skillKey.toLowerCase().replace(/\s+/g, '').replace(/-/g, '');
        return this.#skillDescriptions.get(normalizedKey) || null;
    }

    /**
     * Start observing the tooltip element for activation.
     */
    observe() {
        this.#observer?.disconnect();
        if (!this.#tooltip) return;
        
        this.#observer = new MutationObserver(this._onMutation.bind(this));
        this.#observer.observe(this.#tooltip, { 
            attributeFilter: ["class"], 
            attributeOldValue: true 
        });
    }

    /* -------------------------------------------- */
    /*  Mutation Handling                           */
    /* -------------------------------------------- */

    /**
     * Handle a mutation event on the tooltip element.
     * @param {MutationRecord[]} mutationList  The list of mutations.
     * @protected
     */
    _onMutation(mutationList) {
        let isActive = false;
        const tooltip = this.#tooltip;
        
        for (const { type, attributeName, oldValue } of mutationList) {
            if ((type === "attributes") && (attributeName === "class")) {
                const wasActive = oldValue?.includes("active") ?? false;
                const nowActive = tooltip.classList.contains("active");
                console.log("RT Tooltips | Mutation detected", { wasActive, nowActive, oldValue, newClasses: tooltip.className });
                if (nowActive && !wasActive) isActive = true;
            }
        }
        
        if (isActive) this._onTooltipActivate();
    }

    /**
     * Handle tooltip activation - check if we need to render rich content.
     * @protected
     */
    async _onTooltipActivate() {
        const element = game.tooltip.element;
        if (!element) {
            console.log("RT Tooltips | Tooltip activated but no element found");
            return;
        }

        // Check for RT rich tooltip data
        const tooltipType = element.dataset.rtTooltip;
        const tooltipDataAttr = element.dataset.rtTooltipData;
        
        console.log("RT Tooltips | Tooltip activated", { tooltipType, hasData: !!tooltipDataAttr, element });
        
        if (tooltipType && tooltipDataAttr) {
            try {
                const data = JSON.parse(tooltipDataAttr);
                const content = await this._buildTooltipContent(data, tooltipType);
                if (content) {
                    this.#tooltip.innerHTML = content;
                    this.#tooltip.classList.add("rt-tooltip", `rt-tooltip--${tooltipType}`);
                    console.log("RT Tooltips | Rich tooltip rendered for", tooltipType);
                    // Reposition after content change
                    requestAnimationFrame(() => this._repositionTooltip());
                }
            } catch (err) {
                console.warn("RT Tooltips | Failed to parse tooltip data:", err, tooltipDataAttr);
            }
            return;
        }

        // Check for content links with UUID (for item/actor rich tooltips)
        if (element.classList.contains("content-link") && element.dataset.uuid) {
            const doc = await fromUuid(element.dataset.uuid);
            if (doc) {
                await this._onHoverContentLink(doc);
            }
        }
    }

    /* -------------------------------------------- */
    /*  Content Link Handling                       */
    /* -------------------------------------------- */

    /**
     * Handle hovering over a content link - render rich tooltip if available.
     * @param {Document} doc  The linked document.
     * @protected
     */
    async _onHoverContentLink(doc) {
        // Check if document has a richTooltip method
        const result = await (doc.richTooltip?.() ?? doc.system?.richTooltip?.() ?? {});
        const { content, classes } = result;
        
        if (!content) return;
        
        this.#tooltip.innerHTML = content;
        this.#tooltip.classList.add("rt-tooltip");
        if (classes?.length) {
            this.#tooltip.classList.add(...classes);
        }
        
        requestAnimationFrame(() => this._repositionTooltip());
    }

    /* -------------------------------------------- */
    /*  Tooltip Content Builders                    */
    /* -------------------------------------------- */

    /**
     * Build tooltip HTML content based on type.
     * @param {object} data  Tooltip data.
     * @param {string} type  Tooltip type.
     * @returns {Promise<string>}     HTML content.
     * @protected
     */
    async _buildTooltipContent(data, type) {
        switch (type) {
            case "characteristic":
                return this._buildCharacteristicTooltip(data);
            case "skill":
                return await this._buildSkillTooltip(data);
            case "armor":
            case "armour":
                return this._buildArmorTooltip(data);
            case "weapon":
                return this._buildWeaponTooltip(data);
            case "modifier":
                return this._buildModifierTooltip(data);
            default:
                return this._buildGenericTooltip(data);
        }
    }

    /**
     * Build characteristic tooltip content.
     * @param {object} data  Characteristic data.
     * @returns {string}     HTML content.
     * @protected
     */
    _buildCharacteristicTooltip(data) {
        const {
            name,
            label,
            base = 0,
            advance = 0,
            modifier = 0,
            unnatural = 1,
            total = 0,
            bonus = 0,
            sources = []
        } = data;

        let html = `
            <div class="rt-tooltip__header">
                <h4 class="rt-tooltip__title">${label || name}</h4>
                <div class="rt-tooltip__total">${total}</div>
            </div>
            <div class="rt-tooltip__divider"></div>
            <div class="rt-tooltip__breakdown">
                <div class="rt-tooltip__line">
                    <span class="rt-tooltip__label">Base:</span>
                    <span class="rt-tooltip__value">${base}</span>
                </div>
                <div class="rt-tooltip__line">
                    <span class="rt-tooltip__label">Advances:</span>
                    <span class="rt-tooltip__value">${advance} (×5 = +${advance * 5})</span>
                </div>
        `;

        if (modifier !== 0) {
            html += `
                <div class="rt-tooltip__line rt-tooltip__line--modifier">
                    <span class="rt-tooltip__label">Modifiers:</span>
                    <span class="rt-tooltip__value">${modifier >= 0 ? '+' : ''}${modifier}</span>
                </div>
            `;
        }

        html += `</div>`;

        // Show modifier sources
        if (sources?.length > 0) {
            html += `
                <div class="rt-tooltip__divider"></div>
                <div class="rt-tooltip__sources">
                    <div class="rt-tooltip__sources-title">Modifier Sources:</div>
            `;
            for (const source of sources) {
                html += `
                    <div class="rt-tooltip__source">
                        <span class="rt-tooltip__source-name">${source.name}</span>
                        <span class="rt-tooltip__source-value">${source.value >= 0 ? '+' : ''}${source.value}</span>
                    </div>
                `;
            }
            html += `</div>`;
        }

        // Bonus calculation
        html += `
            <div class="rt-tooltip__divider"></div>
            <div class="rt-tooltip__bonus">
                <span class="rt-tooltip__label">Bonus:</span>
                <span class="rt-tooltip__value rt-tooltip__value--bonus">${bonus}</span>
                <span class="rt-tooltip__bonus-calc">(${Math.floor(total / 10)}${unnatural > 1 ? ` × ${unnatural}` : ''})</span>
            </div>
            <div class="rt-tooltip__hint">
                <i class="fas fa-mouse-pointer"></i>
                Click characteristic to roll
            </div>
        `;

        return html;
    }

    /**
     * Build skill tooltip content.
     * @param {object} data  Skill data.
     * @returns {string}     HTML content.
     * @protected
     */
    async _buildSkillTooltip(data) {
        let {
            name,
            label,
            characteristic,
            charValue = 0,
            baseValue,
            trained = false,
            plus10 = false,
            plus20 = false,
            current = 0,
            basic = false,
            trainingBonus: dataTB,
            bonus: dataBonus,
            actorUuid
        } = data;

        // If actorUuid is provided, fetch live data from actor
        if (actorUuid) {
            const actor = await fromUuid(actorUuid);
            if (actor) {
                const skill = actor.system.skills?.[name];
                const charKey = skill?.characteristic || characteristic;
                const char = actor.system.characteristics?.[charKey];
                
                if (skill && char) {
                    // Update with live values
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

        // Determine training level
        const level = plus20 ? 3 : plus10 ? 2 : trained ? 1 : 0;
        let training = "Untrained";
        let trainingBonus = dataTB ?? 0;
        if (plus20) {
            training = "+20";
            trainingBonus = dataTB ?? 20;
        } else if (plus10) {
            training = "+10";
            trainingBonus = dataTB ?? 10;
        } else if (trained) {
            training = "Trained";
        } else if (basic) {
            training = "Basic (Untrained)";
        }

        // Use provided baseValue or calculate it
        const calculatedBase = baseValue ?? (level > 0 ? charValue : Math.floor(charValue / 2));
        const bonus = dataBonus ?? 0;

        // Get skill description from cache
        const skillInfo = game.rt?.tooltips?.getSkillDescription(name);
        const descriptor = skillInfo?.descriptor || "";

        let html = `
            <div class="rt-tooltip__header">
                <h4 class="rt-tooltip__title">${label || name}</h4>
                <div class="rt-tooltip__total">${current}</div>
            </div>
        `;

        // Add descriptor if available
        if (descriptor) {
            html += `
            <div class="rt-tooltip__description">
                ${descriptor}
            </div>
            `;
        }

        html += `
            <div class="rt-tooltip__divider"></div>
            <div class="rt-tooltip__breakdown">
                <div class="rt-tooltip__line">
                    <span class="rt-tooltip__label">${characteristic} Value:</span>
                    <span class="rt-tooltip__value">${charValue}</span>
                </div>
        `;

        // Show base calculation for untrained skills
        if (level === 0) {
            html += `
                <div class="rt-tooltip__line">
                    <span class="rt-tooltip__label">Base (÷2 untrained):</span>
                    <span class="rt-tooltip__value">${calculatedBase}</span>
                </div>
            `;
        }

        if (trainingBonus > 0) {
            html += `
                <div class="rt-tooltip__line">
                    <span class="rt-tooltip__label">Training (${training}):</span>
                    <span class="rt-tooltip__value">+${trainingBonus}</span>
                </div>
            `;
        } else if (level === 0) {
            html += `
                <div class="rt-tooltip__line">
                    <span class="rt-tooltip__label">Training:</span>
                    <span class="rt-tooltip__value">${training}</span>
                </div>
            `;
        }

        if (bonus !== 0) {
            html += `
                <div class="rt-tooltip__line rt-tooltip__line--modifier">
                    <span class="rt-tooltip__label">Modifiers:</span>
                    <span class="rt-tooltip__value">${bonus >= 0 ? '+' : ''}${bonus}</span>
                </div>
            `;
        }

        html += `
            </div>
            <div class="rt-tooltip__divider"></div>
            <div class="rt-tooltip__training">
                <div class="rt-tooltip__training-title">Training Progression:</div>
                <div class="rt-tooltip__training-track">
                    <span class="${level === 0 ? 'active' : ''}">Untrained</span>
                    <i class="fas fa-arrow-right"></i>
                    <span class="${level === 1 ? 'active' : ''}">Trained</span>
                    <i class="fas fa-arrow-right"></i>
                    <span class="${level === 2 ? 'active' : ''}">+10</span>
                    <i class="fas fa-arrow-right"></i>
                    <span class="${level === 3 ? 'active' : ''}">+20</span>
                </div>
            </div>
            <div class="rt-tooltip__hint">
                <i class="fas fa-mouse-pointer"></i>
                Click skill name to roll
            </div>
        `;

        return html;
    }

    /**
     * Build armor tooltip content.
     * @param {object} data  Armor data.
     * @returns {string}     HTML content.
     * @protected
     */
    _buildArmorTooltip(data) {
        const {
            location,
            total = 0,
            toughnessBonus = 0,
            traitBonus = 0,
            armorValue = 0,
            equipped = []
        } = data;

        let html = `
            <div class="rt-tooltip__header">
                <h4 class="rt-tooltip__title">${location || 'Armour'}</h4>
                <div class="rt-tooltip__total">AP ${total}</div>
            </div>
            <div class="rt-tooltip__divider"></div>
            <div class="rt-tooltip__breakdown">
                <div class="rt-tooltip__line">
                    <span class="rt-tooltip__label">Toughness Bonus:</span>
                    <span class="rt-tooltip__value">${toughnessBonus}</span>
                </div>
        `;

        if (traitBonus > 0) {
            html += `
                <div class="rt-tooltip__line">
                    <span class="rt-tooltip__label">Trait Bonus:</span>
                    <span class="rt-tooltip__value">${traitBonus}</span>
                </div>
            `;
        }

        if (armorValue > 0) {
            html += `
                <div class="rt-tooltip__line">
                    <span class="rt-tooltip__label">Armour:</span>
                    <span class="rt-tooltip__value">${armorValue}</span>
                </div>
            `;
        }

        html += `</div>`;

        if (equipped?.length > 0) {
            html += `
                <div class="rt-tooltip__divider"></div>
                <div class="rt-tooltip__equipped">
                    <div class="rt-tooltip__equipped-title">Equipped:</div>
            `;
            for (const item of equipped) {
                html += `
                    <div class="rt-tooltip__equipped-item">
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

    /**
     * Build weapon tooltip content.
     * @param {object} data  Weapon data.
     * @returns {string}     HTML content.
     * @protected
     */
    _buildWeaponTooltip(data) {
        const {
            name,
            damage,
            penetration = 0,
            range,
            rof,
            qualities = []
        } = data;

        let html = `
            <div class="rt-tooltip__header">
                <h4 class="rt-tooltip__title">${name}</h4>
            </div>
            <div class="rt-tooltip__divider"></div>
            <div class="rt-tooltip__breakdown">
                <div class="rt-tooltip__line">
                    <span class="rt-tooltip__label">Damage:</span>
                    <span class="rt-tooltip__value">${damage}</span>
                </div>
                <div class="rt-tooltip__line">
                    <span class="rt-tooltip__label">Penetration:</span>
                    <span class="rt-tooltip__value">${penetration}</span>
                </div>
                <div class="rt-tooltip__line">
                    <span class="rt-tooltip__label">Range:</span>
                    <span class="rt-tooltip__value">${range}</span>
                </div>
                <div class="rt-tooltip__line">
                    <span class="rt-tooltip__label">Rate of Fire:</span>
                    <span class="rt-tooltip__value">${rof}</span>
                </div>
            </div>
        `;

        if (qualities?.length > 0) {
            html += `
                <div class="rt-tooltip__divider"></div>
                <div class="rt-tooltip__qualities">
                    <div class="rt-tooltip__qualities-title">Qualities:</div>
            `;
            for (const quality of qualities) {
                html += `<div class="rt-tooltip__quality">${quality}</div>`;
            }
            html += `</div>`;
        }

        html += `
            <div class="rt-tooltip__action">
                <i class="fas fa-crosshairs"></i>
                Click to attack
            </div>
        `;

        return html;
    }

    /**
     * Build modifier tooltip content.
     * @param {object} data  Modifier data.
     * @returns {string}     HTML content.
     * @protected
     */
    _buildModifierTooltip(data) {
        const { title, sources = [] } = data;

        let html = `
            <div class="rt-tooltip__header">
                <h4 class="rt-tooltip__title">${title || 'Modifiers'}</h4>
            </div>
            <div class="rt-tooltip__divider"></div>
            <div class="rt-tooltip__sources">
        `;

        for (const source of sources) {
            html += `
                <div class="rt-tooltip__source">
                    <span class="rt-tooltip__source-name">${source.name}</span>
                    <span class="rt-tooltip__source-value">${source.value >= 0 ? '+' : ''}${source.value}</span>
                </div>
            `;
        }

        html += `</div>`;
        return html;
    }

    /**
     * Build generic tooltip content.
     * @param {object} data  Generic data.
     * @returns {string}     HTML content.
     * @protected
     */
    _buildGenericTooltip(data) {
        const { title, content } = data;
        return `
            <div class="rt-tooltip__header">
                <h4 class="rt-tooltip__title">${title || 'Information'}</h4>
            </div>
            <div class="rt-tooltip__content">
                ${content || ''}
            </div>
        `;
    }

    /* -------------------------------------------- */
    /*  Positioning                                 */
    /* -------------------------------------------- */

    /**
     * Reposition tooltip after content changes.
     * @protected
     */
    _repositionTooltip() {
        if (!this.#tooltip || !game.tooltip) return;

        const pos = this.#tooltip.getBoundingClientRect();
        const { innerHeight, innerWidth } = window;
        
        // Check if tooltip is going off screen and reposition if needed
        let direction = game.tooltip.element?.dataset.tooltipDirection;
        
        // Default to LEFT if no direction specified
        if (!direction) {
            direction = "LEFT";
            game.tooltip._setAnchor?.(direction);
        }

        // Adjust direction if tooltip would go off-screen
        if (direction === "LEFT" && pos.x < 0) {
            game.tooltip._setAnchor?.("RIGHT");
        } else if (direction === "RIGHT" && pos.x + this.#tooltip.offsetWidth > innerWidth) {
            game.tooltip._setAnchor?.("LEFT");
        } else if (direction === "UP" && pos.y < 0) {
            game.tooltip._setAnchor?.("DOWN");
        } else if (direction === "DOWN" && pos.y + this.#tooltip.offsetHeight > innerHeight) {
            game.tooltip._setAnchor?.("UP");
        }
    }
}

/* -------------------------------------------- */
/*  Static Helpers                              */
/* -------------------------------------------- */

/**
 * Prepare tooltip data for a characteristic.
 * @param {string} key              Characteristic key.
 * @param {object} characteristic   Characteristic data object.
 * @param {object} [modifierSources]  Optional modifier sources.
 * @returns {string}  JSON string for data-rt-tooltip-data attribute.
 */
export function prepareCharacteristicTooltipData(key, characteristic, modifierSources = {}) {
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
        sources: sources.map(s => ({
            name: s.name || s.source || "Unknown",
            value: s.value || s.modifier || 0
        }))
    };
    
    return JSON.stringify(data);
}

/**
 * Prepare tooltip data for a skill.
 * @param {string} key            Skill key.
 * @param {object} skill          Skill data object.
 * @param {object} characteristics  Actor characteristics.
 * @param {string} [actorUuid]    Optional actor UUID for dynamic updates.
 * @returns {string}  JSON string for data-rt-tooltip-data attribute.
 */
export function prepareSkillTooltipData(key, skill, characteristics = {}, actorUuid = null) {
    const charKey = skill.characteristic || skill.char || "strength";
    const char = characteristics[charKey] || {};
    const charTotal = char.total || 0;
    const charLabel = char.label || charKey;
    
    // Calculate training level and base value exactly as creature.mjs does
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
        label: skill.label || skill.name || key,
        characteristic: charLabel,
        charValue: charTotal,
        baseValue: baseValue,
        trained: trained,
        plus10: plus10,
        plus20: plus20,
        current: skill.current || 0,
        basic: basic,
        trainingBonus: trainingBonus,
        bonus: bonus,
        actorUuid: actorUuid  // Include actor UUID for dynamic updates
    };
    
    return JSON.stringify(data);
}

/**
 * Prepare tooltip data for an armor location.
 * @param {string} location    Armor location key.
 * @param {object} armorData   Armor data for this location.
 * @param {Array} [equipped]   Equipped armor pieces.
 * @returns {string}  JSON string for data-rt-tooltip-data attribute.
 */
export function prepareArmorTooltipData(location, armorData, equipped = []) {
    const locationLabels = {
        head: "Head",
        rightArm: "Right Arm",
        leftArm: "Left Arm",
        body: "Body",
        rightLeg: "Right Leg",
        leftLeg: "Left Leg"
    };
    
    const data = {
        location: locationLabels[location] || location,
        total: armorData.total || 0,
        toughnessBonus: armorData.toughnessBonus || 0,
        traitBonus: armorData.traitBonus || 0,
        armorValue: armorData.value || 0,
        equipped: equipped.map(item => ({
            name: item.name,
            img: item.img,
            ap: item.system?.armour?.[location] || 0
        }))
    };
    
    return JSON.stringify(data);
}

/**
 * Prepare tooltip data for a weapon.
 * @param {object} weapon  Weapon item.
 * @returns {string}  JSON string for data-rt-tooltip-data attribute.
 */
export function prepareWeaponTooltipData(weapon) {
    const data = {
        name: weapon.name,
        damage: weapon.system?.damage || "—",
        penetration: weapon.system?.penetration || 0,
        range: weapon.system?.range || "—",
        rof: weapon.system?.rof || "—",
        qualities: weapon.system?.qualities?.map(q => q.name || q) || []
    };
    
    return JSON.stringify(data);
}

/**
 * Prepare tooltip data for modifier sources.
 * @param {string} title    Tooltip title.
 * @param {Array} sources   Modifier sources array.
 * @returns {string}  JSON string for data-rt-tooltip-data attribute.
 */
export function prepareModifierTooltipData(title, sources) {
    const data = {
        title,
        sources: sources.map(s => ({
            name: s.name || s.source || "Unknown",
            value: s.value || s.modifier || 0
        }))
    };
    
    return JSON.stringify(data);
}

// Legacy export for backwards compatibility
export { TooltipsRT as RTTooltip };
