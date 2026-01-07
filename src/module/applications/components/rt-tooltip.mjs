/**
 * @file RTTooltip - Rich tooltip component for Rogue Trader
 * Provides contextual information with breakdowns, sources, and actions
 */

/**
 * Rich tooltip manager for Rogue Trader system.
 * Handles creation and positioning of detailed tooltips with breakdowns.
 */
export class RTTooltip {
    /**
     * Active tooltip element.
     * @type {HTMLElement|null}
     */
    static activeTooltip = null;

    /**
     * Tooltip positioning offset.
     * @type {{x: number, y: number}}
     */
    static offset = { x: 10, y: 10 };

    /**
     * Delay before showing tooltip (milliseconds).
     * @type {number}
     */
    static showDelay = 500;

    /**
     * Current timeout for delayed show.
     * @type {number|null}
     */
    static showTimeout = null;

    /* -------------------------------------------- */

    /**
     * Initialize tooltip listeners on a container element.
     * @param {HTMLElement} container  The container to attach listeners to.
     */
    static initialize(container) {
        // Find all elements with tooltip data
        const tooltipElements = container.querySelectorAll("[data-rt-tooltip]");

        tooltipElements.forEach(element => {
            element.addEventListener("mouseenter", (event) => {
                this.showTimeout = setTimeout(() => {
                    this.show(element, event);
                }, this.showDelay);
            });

            element.addEventListener("mouseleave", () => {
                if (this.showTimeout) {
                    clearTimeout(this.showTimeout);
                    this.showTimeout = null;
                }
                this.hide();
            });

            element.addEventListener("mousemove", (event) => {
                this.updatePosition(event);
            });
        });
    }

    /* -------------------------------------------- */

    /**
     * Show a tooltip for an element.
     * @param {HTMLElement} element  The element to show tooltip for.
     * @param {MouseEvent} event     The triggering mouse event.
     */
    static show(element, event) {
        // Get tooltip type and data
        const tooltipType = element.dataset.rtTooltip;
        const tooltipData = this.getTooltipData(element, tooltipType);

        if (!tooltipData) return;

        // Create tooltip element
        const tooltip = this.create(tooltipData, tooltipType);

        // Add to DOM
        document.body.appendChild(tooltip);

        // Position tooltip
        this.position(tooltip, event);

        // Store reference
        this.activeTooltip = tooltip;

        // Animate in
        requestAnimationFrame(() => {
            tooltip.classList.add("visible");
        });
    }

    /* -------------------------------------------- */

    /**
     * Hide the active tooltip.
     */
    static hide() {
        if (!this.activeTooltip) return;

        this.activeTooltip.classList.remove("visible");

        setTimeout(() => {
            this.activeTooltip?.remove();
            this.activeTooltip = null;
        }, 200); // Match CSS transition
    }

    /* -------------------------------------------- */

    /**
     * Get tooltip data from element.
     * @param {HTMLElement} element       The element.
     * @param {string} tooltipType        Type of tooltip.
     * @returns {object|null}
     */
    static getTooltipData(element, tooltipType) {
        try {
            const dataAttr = element.dataset.rtTooltipData;
            if (dataAttr) {
                return JSON.parse(dataAttr);
            }

            // Fallback to dataset properties
            return { ...element.dataset };
        } catch (err) {
            console.warn("RT Tooltip | Failed to parse tooltip data:", err);
            return null;
        }
    }

    /* -------------------------------------------- */

    /**
     * Create tooltip HTML element.
     * @param {object} data           Tooltip data.
     * @param {string} type           Tooltip type.
     * @returns {HTMLElement}
     */
    static create(data, type) {
        const tooltip = document.createElement("div");
        tooltip.className = `rt-tooltip rt-tooltip--${type}`;

        // Build content based on type
        let content = "";
        switch (type) {
            case "characteristic":
                content = this.buildCharacteristicTooltip(data);
                break;
            case "skill":
                content = this.buildSkillTooltip(data);
                break;
            case "armor":
                content = this.buildArmorTooltip(data);
                break;
            case "weapon":
                content = this.buildWeaponTooltip(data);
                break;
            case "modifier":
                content = this.buildModifierTooltip(data);
                break;
            default:
                content = this.buildGenericTooltip(data);
        }

        tooltip.innerHTML = content;

        return tooltip;
    }

    /* -------------------------------------------- */

    /**
     * Build characteristic tooltip content.
     * @param {object} data  Characteristic data.
     * @returns {string}     HTML content.
     */
    static buildCharacteristicTooltip(data) {
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

        html += `
            </div>
        `;

        // Show modifier sources
        if (sources && sources.length > 0) {
            html += `
                <div class="rt-tooltip__divider"></div>
                <div class="rt-tooltip__sources">
                    <div class="rt-tooltip__sources-title">Modifier Sources:</div>
            `;

            sources.forEach(source => {
                html += `
                    <div class="rt-tooltip__source">
                        <span class="rt-tooltip__source-name">${source.name}</span>
                        <span class="rt-tooltip__source-value">${source.value >= 0 ? '+' : ''}${source.value}</span>
                    </div>
                `;
            });

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
        `;

        // Action hint
        html += `
            <div class="rt-tooltip__action">
                <i class="fas fa-dice-d20"></i>
                Click to roll test
            </div>
        `;

        return html;
    }

    /* -------------------------------------------- */

    /**
     * Build skill tooltip content.
     * @param {object} data  Skill data.
     * @returns {string}     HTML content.
     */
    static buildSkillTooltip(data) {
        const {
            name,
            label,
            characteristic,
            charValue = 0,
            trained = false,
            plus10 = false,
            plus20 = false,
            current = 0,
            basic = false
        } = data;

        // Determine training level
        let training = "Untrained";
        let trainingBonus = 0;
        if (plus20) {
            training = "+20";
            trainingBonus = 20;
        } else if (plus10) {
            training = "+10";
            trainingBonus = 10;
        } else if (trained) {
            training = "Trained";
            trainingBonus = 0;
        } else if (basic) {
            training = "Basic (Untrained)";
        }

        let html = `
            <div class="rt-tooltip__header">
                <h4 class="rt-tooltip__title">${label || name}</h4>
                <div class="rt-tooltip__total">${current}</div>
            </div>
            <div class="rt-tooltip__divider"></div>
            <div class="rt-tooltip__breakdown">
                <div class="rt-tooltip__line">
                    <span class="rt-tooltip__label">${characteristic || 'Characteristic'}:</span>
                    <span class="rt-tooltip__value">${charValue}${!trained && !basic ? ' ÷ 2' : ''}</span>
                </div>
                <div class="rt-tooltip__line">
                    <span class="rt-tooltip__label">Training:</span>
                    <span class="rt-tooltip__value">${training}${trainingBonus > 0 ? ` (+${trainingBonus})` : ''}</span>
                </div>
            </div>
        `;

        // Training progression
        html += `
            <div class="rt-tooltip__divider"></div>
            <div class="rt-tooltip__training">
                <div class="rt-tooltip__training-title">Training Progression:</div>
                <div class="rt-tooltip__training-track">
                    <span class="${!trained && !basic ? 'active' : ''}">Untrained</span>
                    <i class="fas fa-arrow-right"></i>
                    <span class="${trained && !plus10 && !plus20 ? 'active' : ''}">Trained</span>
                    <i class="fas fa-arrow-right"></i>
                    <span class="${plus10 && !plus20 ? 'active' : ''}">+10</span>
                    <i class="fas fa-arrow-right"></i>
                    <span class="${plus20 ? 'active' : ''}">+20</span>
                </div>
            </div>
        `;

        // Action hint
        html += `
            <div class="rt-tooltip__action">
                <i class="fas fa-dice-d20"></i>
                Click to roll test
            </div>
        `;

        return html;
    }

    /* -------------------------------------------- */

    /**
     * Build armor tooltip content.
     * @param {object} data  Armor data.
     * @returns {string}     HTML content.
     */
    static buildArmorTooltip(data) {
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
                <h4 class="rt-tooltip__title">${location || 'Armor'}</h4>
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
                    <span class="rt-tooltip__label">Armor:</span>
                    <span class="rt-tooltip__value">${armorValue}</span>
                </div>
            `;
        }

        html += `</div>`;

        // Show equipped armor pieces
        if (equipped && equipped.length > 0) {
            html += `
                <div class="rt-tooltip__divider"></div>
                <div class="rt-tooltip__equipped">
                    <div class="rt-tooltip__equipped-title">Equipped:</div>
            `;

            equipped.forEach(item => {
                html += `
                    <div class="rt-tooltip__equipped-item">
                        <img src="${item.img}" alt="${item.name}" />
                        <span>${item.name}</span>
                        <span class="ap">+${item.ap || 0}</span>
                    </div>
                `;
            });

            html += `</div>`;
        }

        return html;
    }

    /* -------------------------------------------- */

    /**
     * Build weapon tooltip content.
     * @param {object} data  Weapon data.
     * @returns {string}     HTML content.
     */
    static buildWeaponTooltip(data) {
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

        if (qualities && qualities.length > 0) {
            html += `
                <div class="rt-tooltip__divider"></div>
                <div class="rt-tooltip__qualities">
                    <div class="rt-tooltip__qualities-title">Qualities:</div>
            `;

            qualities.forEach(quality => {
                html += `<div class="rt-tooltip__quality">${quality}</div>`;
            });

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

    /* -------------------------------------------- */

    /**
     * Build modifier tooltip content.
     * @param {object} data  Modifier data.
     * @returns {string}     HTML content.
     */
    static buildModifierTooltip(data) {
        const { title, sources = [] } = data;

        let html = `
            <div class="rt-tooltip__header">
                <h4 class="rt-tooltip__title">${title || 'Modifiers'}</h4>
            </div>
            <div class="rt-tooltip__divider"></div>
            <div class="rt-tooltip__sources">
        `;

        sources.forEach(source => {
            html += `
                <div class="rt-tooltip__source">
                    <span class="rt-tooltip__source-name">${source.name}</span>
                    <span class="rt-tooltip__source-value">${source.value >= 0 ? '+' : ''}${source.value}</span>
                </div>
            `;
        });

        html += `</div>`;

        return html;
    }

    /* -------------------------------------------- */

    /**
     * Build generic tooltip content.
     * @param {object} data  Generic data.
     * @returns {string}     HTML content.
     */
    static buildGenericTooltip(data) {
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

    /**
     * Position tooltip relative to mouse.
     * @param {HTMLElement} tooltip  The tooltip element.
     * @param {MouseEvent} event     The mouse event.
     */
    static position(tooltip, event) {
        const x = event.clientX + this.offset.x;
        const y = event.clientY + this.offset.y;

        // Get tooltip dimensions
        const rect = tooltip.getBoundingClientRect();
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;

        // Adjust if would go off-screen
        let finalX = x;
        let finalY = y;

        if (x + rect.width > windowWidth) {
            finalX = event.clientX - rect.width - this.offset.x;
        }

        if (y + rect.height > windowHeight) {
            finalY = event.clientY - rect.height - this.offset.y;
        }

        tooltip.style.left = `${finalX}px`;
        tooltip.style.top = `${finalY}px`;
    }

    /* -------------------------------------------- */

    /**
     * Update tooltip position on mouse move.
     * @param {MouseEvent} event  The mouse move event.
     */
    static updatePosition(event) {
        if (!this.activeTooltip) return;
        this.position(this.activeTooltip, event);
    }
}
