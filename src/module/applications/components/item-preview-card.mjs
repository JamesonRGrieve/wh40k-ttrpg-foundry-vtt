/**
 * @file ItemPreviewCard - Inline expandable preview cards for items on character sheets
 *
 * Shows item details in-place without opening the full item sheet.
 * Integrates with QuickActionsBar for inline actions.
 *
 * Usage:
 * - Apply ItemPreviewMixin to actor sheets
 * - Add data-action="toggleItemPreview" data-item-id="xxx" to item rows
 * - Preview content renders below the item row
 */

import QuickActionsBar from './quick-actions-bar.mjs';

/**
 * Mixin that adds item preview card functionality to actor sheets
 * @param {typeof Application} Base - Base class to extend
 * @returns {typeof Application} Extended class
 */
export function ItemPreviewMixin(Base) {
    return class extends Base {
        /** @override */
        static DEFAULT_OPTIONS = {
            actions: {
                ...super.DEFAULT_OPTIONS?.actions,
                toggleItemPreview: this.#toggleItemPreview,
            },
        };

        /**
         * Track open preview cards
         * @type {Set<string>}
         */
        #openPreviews = new Set();

        /**
         * Toggle an item preview card
         * @this {Application}
         * @param {PointerEvent} event - Triggering event
         * @param {HTMLElement} target - Action target
         */
        static async #toggleItemPreview(event, target) {
            const itemId = target.dataset.itemId;
            if (!itemId) return;

            const item = this.actor.items.get(itemId);
            if (!item) return;

            // Find the item row
            const itemRow = this.element.querySelector(`[data-item-id="${itemId}"]`);
            if (!itemRow) return;

            // Check if preview is already open
            const isOpen = this.#openPreviews.has(itemId);

            if (isOpen) {
                // Close preview
                this.#closePreview(itemId);
            } else {
                // Open preview
                this.#openPreview(item, itemRow);
            }
        }

        /**
         * Open an item preview card
         * @param {Item} item - Item to preview
         * @param {HTMLElement} itemRow - Item row element
         * @private
         */
        #openPreview(item, itemRow) {
            // Close any existing preview for this item
            this.#closePreview(item.id);

            // Generate preview content
            const previewHTML = this.#generatePreviewHTML(item);

            // Create preview element
            const preview = document.createElement('div');
            preview.classList.add('rt-item-preview', `rt-item-preview--${item.type}`);
            preview.dataset.previewId = item.id;
            preview.innerHTML = previewHTML;

            // Insert after item row
            itemRow.insertAdjacentElement('afterend', preview);

            // Track as open
            this.#openPreviews.add(item.id);

            // Add close button handler
            const closeBtn = preview.querySelector('[data-action="closeItemPreview"]');
            if (closeBtn) {
                closeBtn.addEventListener('click', () => this.#closePreview(item.id));
            }

            // Animate in
            requestAnimationFrame(() => {
                preview.classList.add('rt-item-preview--open');
            });
        }

        /**
         * Close an item preview card
         * @param {string} itemId - Item ID
         * @private
         */
        #closePreview(itemId) {
            const preview = this.element.querySelector(`[data-preview-id="${itemId}"]`);
            if (!preview) return;

            preview.classList.remove('rt-item-preview--open');
            setTimeout(() => preview.remove(), 200); // Match CSS transition

            this.#openPreviews.delete(itemId);
        }

        /**
         * Generate HTML for item preview
         * @param {Item} item - Item to preview
         * @returns {string} HTML string
         * @private
         */
        #generatePreviewHTML(item) {
            const type = item.type;
            const system = item.system;

            // Get type-specific content
            let content = '';
            switch (type) {
                case 'weapon':
                    content = this.#generateWeaponPreview(item);
                    break;
                case 'armour':
                    content = this.#generateArmourPreview(item);
                    break;
                case 'talent':
                    content = this.#generateTalentPreview(item);
                    break;
                case 'trait':
                    content = this.#generateTraitPreview(item);
                    break;
                case 'condition':
                    content = this.#generateConditionPreview(item);
                    break;
                case 'gear':
                case 'consumable':
                case 'drug':
                    content = this.#generateGearPreview(item);
                    break;
                case 'psychicPower':
                case 'navigatorPower':
                    content = this.#generatePowerPreview(item);
                    break;
                default:
                    content = this.#generateGenericPreview(item);
            }

            // Get quick actions
            const actions = QuickActionsBar.getActionsForItem(item, { compact: false, inSheet: false });
            const actionsHTML = QuickActionsBar.renderActions(actions, false);

            return `
                <div class="rt-item-preview-header">
                    <div class="rt-item-preview-title">
                        <img src="${item.img}" alt="${item.name}" class="rt-item-preview-icon" />
                        <span>${item.name}</span>
                    </div>
                    <div class="rt-item-preview-actions">
                        ${actionsHTML}
                        <button type="button" class="rt-quick-action rt-quick-action--secondary" data-action="closeItemPreview" title="Collapse">
                            <i class="fa-solid fa-chevron-up"></i>
                        </button>
                    </div>
                </div>
                <div class="rt-item-preview-body">
                    ${content}
                </div>
            `;
        }

        /**
         * Generate weapon preview
         * @param {Item} item - Weapon item
         * @returns {string} HTML string
         * @private
         */
        #generateWeaponPreview(item) {
            const system = item.system;
            const damage = system.damage || {};
            const stats = system.stats || {};

            return `
                <div class="rt-weapon-preview-stats">
                    <div class="rt-stat-pill">
                        <i class="fa-solid fa-burst"></i>
                        <span class="rt-stat-pill__label">Damage</span>
                        <span class="rt-stat-pill__value">${damage.formula || 'N/A'}</span>
                    </div>
                    <div class="rt-stat-pill">
                        <i class="fa-solid fa-shield"></i>
                        <span class="rt-stat-pill__label">Pen</span>
                        <span class="rt-stat-pill__value">${stats.penetration || 0}</span>
                    </div>
                    <div class="rt-stat-pill">
                        <i class="fa-solid fa-bullseye"></i>
                        <span class="rt-stat-pill__label">Range</span>
                        <span class="rt-stat-pill__value">${stats.range || 'N/A'}</span>
                    </div>
                    <div class="rt-stat-pill">
                        <i class="fa-solid fa-gauge-high"></i>
                        <span class="rt-stat-pill__label">RoF</span>
                        <span class="rt-stat-pill__value">${stats.rof || 'N/A'}</span>
                    </div>
                    <div class="rt-stat-pill">
                        <i class="fa-solid fa-box"></i>
                        <span class="rt-stat-pill__label">Clip</span>
                        <span class="rt-stat-pill__value">${system.clip?.current || 0}/${system.clip?.max || 0}</span>
                    </div>
                </div>
                ${this.#generateQualitiesHTML(system.qualities)}
                ${system.description ? `<div class="rt-item-preview-description">${system.description}</div>` : ''}
            `;
        }

        /**
         * Generate armour preview
         * @param {Item} item - Armour item
         * @returns {string} HTML string
         * @private
         */
        #generateArmourPreview(item) {
            const system = item.system;
            const locations = system.locations || {};

            return `
                <div class="rt-armour-preview-locations">
                    ${
                        locations.head
                            ? `<div class="rt-armour-location"><span class="rt-location-label">Head:</span> <strong>${locations.head}</strong></div>`
                            : ''
                    }
                    ${
                        locations.leftArm
                            ? `<div class="rt-armour-location"><span class="rt-location-label">L Arm:</span> <strong>${locations.leftArm}</strong></div>`
                            : ''
                    }
                    ${
                        locations.rightArm
                            ? `<div class="rt-armour-location"><span class="rt-location-label">R Arm:</span> <strong>${locations.rightArm}</strong></div>`
                            : ''
                    }
                    ${
                        locations.body
                            ? `<div class="rt-armour-location"><span class="rt-location-label">Body:</span> <strong>${locations.body}</strong></div>`
                            : ''
                    }
                    ${
                        locations.leftLeg
                            ? `<div class="rt-armour-location"><span class="rt-location-label">L Leg:</span> <strong>${locations.leftLeg}</strong></div>`
                            : ''
                    }
                    ${
                        locations.rightLeg
                            ? `<div class="rt-armour-location"><span class="rt-location-label">R Leg:</span> <strong>${locations.rightLeg}</strong></div>`
                            : ''
                    }
                </div>
                ${this.#generateQualitiesHTML(system.properties)}
                ${system.description ? `<div class="rt-item-preview-description">${system.description}</div>` : ''}
            `;
        }

        /**
         * Generate talent preview
         * @param {Item} item - Talent item
         * @returns {string} HTML string
         * @private
         */
        #generateTalentPreview(item) {
            const system = item.system;

            let content = '';

            // Prerequisites
            if (system.prerequisites?.text) {
                content += `
                    <div class="rt-item-preview-prereqs">
                        <strong>Prerequisites:</strong> ${system.prerequisites.text}
                    </div>
                `;
            }

            // Benefit
            if (system.benefit) {
                content += `<div class="rt-item-preview-benefit">${system.benefit}</div>`;
            }

            // Modifiers
            if (system.modifiers) {
                content += this.#generateModifiersHTML(system.modifiers);
            }

            return content;
        }

        /**
         * Generate trait preview
         * @param {Item} item - Trait item
         * @returns {string} HTML string
         * @private
         */
        #generateTraitPreview(item) {
            const system = item.system;

            let content = '';

            if (system.level) {
                content += `<div class="rt-trait-level"><strong>Level:</strong> ${system.level}</div>`;
            }

            if (system.description) {
                content += `<div class="rt-item-preview-description">${system.description}</div>`;
            }

            return content;
        }

        /**
         * Generate condition preview
         * @param {Item} item - Condition item
         * @returns {string} HTML string
         * @private
         */
        #generateConditionPreview(item) {
            const system = item.system;

            let content = `
                <div class="rt-condition-preview-meta">
                    ${system.nature ? `<span class="rt-badge rt-badge--${system.nature}">${system.nature}</span>` : ''}
                    ${system.duration ? `<span class="rt-badge">Duration: ${system.duration}</span>` : ''}
                    ${system.stacks > 1 ? `<span class="rt-badge">×${system.stacks}</span>` : ''}
                </div>
            `;

            if (system.description) {
                content += `<div class="rt-item-preview-description">${system.description}</div>`;
            }

            return content;
        }

        /**
         * Generate gear preview
         * @param {Item} item - Gear item
         * @returns {string} HTML string
         * @private
         */
        #generateGearPreview(item) {
            const system = item.system;

            let content = '';

            if (system.quantity) {
                content += `<div class="rt-gear-quantity"><strong>Quantity:</strong> ${system.quantity}</div>`;
            }

            if (system.uses) {
                content += `<div class="rt-gear-uses"><strong>Uses:</strong> ${system.uses.current}/${system.uses.max}</div>`;
            }

            if (system.description) {
                content += `<div class="rt-item-preview-description">${system.description}</div>`;
            }

            return content;
        }

        /**
         * Generate power preview
         * @param {Item} item - Power item
         * @returns {string} HTML string
         * @private
         */
        #generatePowerPreview(item) {
            const system = item.system;

            let content = '';

            if (system.cost) {
                content += `<div class="rt-power-cost"><strong>Cost:</strong> ${system.cost}</div>`;
            }

            if (system.range) {
                content += `<div class="rt-power-range"><strong>Range:</strong> ${system.range}</div>`;
            }

            if (system.sustained !== undefined) {
                content += `<div class="rt-power-sustained"><strong>Sustained:</strong> ${system.sustained ? 'Yes' : 'No'}</div>`;
            }

            if (system.description) {
                content += `<div class="rt-item-preview-description">${system.description}</div>`;
            }

            return content;
        }

        /**
         * Generate generic preview
         * @param {Item} item - Item
         * @returns {string} HTML string
         * @private
         */
        #generateGenericPreview(item) {
            const system = item.system;

            if (system.description) {
                return `<div class="rt-item-preview-description">${system.description}</div>`;
            }

            return '<div class="rt-item-preview-empty">No additional details available.</div>';
        }

        /**
         * Generate HTML for qualities/properties tags
         * @param {Array|Object} qualities - Qualities array or object
         * @returns {string} HTML string
         * @private
         */
        #generateQualitiesHTML(qualities) {
            if (!qualities) return '';

            let qualitiesArray = [];
            if (Array.isArray(qualities)) {
                qualitiesArray = qualities;
            } else if (typeof qualities === 'object') {
                qualitiesArray = Object.entries(qualities)
                    .filter(([key, value]) => value)
                    .map(([key]) => key);
            }

            if (qualitiesArray.length === 0) return '';

            const tagsHTML = qualitiesArray
                .map((q) => {
                    const name = typeof q === 'string' ? q : q.name || q;
                    return `<span class="rt-badge">${name}</span>`;
                })
                .join('');

            return `
                <div class="rt-item-preview-qualities">
                    ${tagsHTML}
                </div>
            `;
        }

        /**
         * Generate HTML for modifiers
         * @param {Object} modifiers - Modifiers object
         * @returns {string} HTML string
         * @private
         */
        #generateModifiersHTML(modifiers) {
            if (!modifiers) return '';

            let content = '<div class="rt-item-preview-modifiers"><strong>Modifiers:</strong><ul>';

            if (modifiers.characteristics) {
                for (const [char, value] of Object.entries(modifiers.characteristics)) {
                    if (value) {
                        content += `<li>${char.toUpperCase()}: ${value > 0 ? '+' : ''}${value}</li>`;
                    }
                }
            }

            if (modifiers.skills) {
                for (const [skill, value] of Object.entries(modifiers.skills)) {
                    if (value) {
                        content += `<li>${skill}: ${value > 0 ? '+' : ''}${value}</li>`;
                    }
                }
            }

            if (modifiers.combat) {
                for (const [type, value] of Object.entries(modifiers.combat)) {
                    if (value) {
                        content += `<li>${type}: ${value > 0 ? '+' : ''}${value}</li>`;
                    }
                }
            }

            content += '</ul></div>';
            return content;
        }
    };
}
