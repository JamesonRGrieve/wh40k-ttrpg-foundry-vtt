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

import type { WH40KItem } from '../../documents/item.ts';
import QuickActionsBar from './quick-actions-bar.ts';

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
        static #toggleItemPreview(this: any, event: Event, target: HTMLElement): void {
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
        #openPreview(item: WH40KItem, itemRow: HTMLElement): void {
            // Close any existing preview for this item
            this.#closePreview(item.id);

            // Generate preview content
            const previewHTML = this.#generatePreviewHTML(item);

            // Create preview element
            const preview = document.createElement('div');
            preview.classList.add('wh40k-item-preview', `wh40k-item-preview--${item.type}`);
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
                preview.classList.add('wh40k-item-preview--open');
            });
        }

        /**
         * Close an item preview card
         * @param {string} itemId - Item ID
         * @private
         */
        #closePreview(itemId: string): void {
            const preview = this.element.querySelector(`[data-preview-id="${itemId}"]`);
            if (!preview) return;

            preview.classList.remove('wh40k-item-preview--open');
            setTimeout(() => preview.remove(), 200); // Match CSS transition

            this.#openPreviews.delete(itemId);
        }

        /**
         * Generate HTML for item preview
         * @param {Item} item - Item to preview
         * @returns {string} HTML string
         * @private
         */
        #generatePreviewHTML(item: WH40KItem): string {
            const type = item.type;

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
                <div class="wh40k-item-preview-header">
                    <div class="wh40k-item-preview-title">
                        <img src="${item.img}" alt="${item.name}" class="wh40k-item-preview-icon" />
                        <span>${item.name}</span>
                    </div>
                    <div class="wh40k-item-preview-actions">
                        ${actionsHTML}
                        <button type="button" class="wh40k-quick-action wh40k-quick-action--secondary" data-action="closeItemPreview" title="Collapse">
                            <i class="fa-solid fa-chevron-up"></i>
                        </button>
                    </div>
                </div>
                <div class="wh40k-item-preview-body">
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
        #generateWeaponPreview(item: WH40KItem): string {
            const system = item.system;
            const damage = system.damage || {};
            const stats = system.stats || {};

            return `
                <div class="wh40k-weapon-preview-stats">
                    <div class="wh40k-stat-pill tw-inline-flex tw-items-center tw-gap-1 tw-rounded-md tw-border tw-border-[var(--wh40k-item-panel-border)] tw-bg-[var(--wh40k-item-panel-bg)] tw-px-2.5 tw-py-1 tw-text-sm">
                        <i class="fa-solid fa-burst tw-text-[var(--wh40k-stat-neutral)]"></i>
                        <span class="wh40k-stat-pill__label tw-text-xs tw-text-[var(--color-text-secondary)] tw-opacity-80">Damage</span>
                        <span class="wh40k-stat-pill__value tw-font-semibold tw-text-[var(--color-text-primary)]">${damage.formula || 'N/A'}</span>
                    </div>
                    <div class="wh40k-stat-pill tw-inline-flex tw-items-center tw-gap-1 tw-rounded-md tw-border tw-border-[var(--wh40k-item-panel-border)] tw-bg-[var(--wh40k-item-panel-bg)] tw-px-2.5 tw-py-1 tw-text-sm">
                        <i class="fa-solid fa-shield tw-text-[var(--wh40k-stat-neutral)]"></i>
                        <span class="wh40k-stat-pill__label tw-text-xs tw-text-[var(--color-text-secondary)] tw-opacity-80">Pen</span>
                        <span class="wh40k-stat-pill__value tw-font-semibold tw-text-[var(--color-text-primary)]">${stats.penetration || 0}</span>
                    </div>
                    <div class="wh40k-stat-pill tw-inline-flex tw-items-center tw-gap-1 tw-rounded-md tw-border tw-border-[var(--wh40k-item-panel-border)] tw-bg-[var(--wh40k-item-panel-bg)] tw-px-2.5 tw-py-1 tw-text-sm">
                        <i class="fa-solid fa-bullseye tw-text-[var(--wh40k-stat-neutral)]"></i>
                        <span class="wh40k-stat-pill__label tw-text-xs tw-text-[var(--color-text-secondary)] tw-opacity-80">Range</span>
                        <span class="wh40k-stat-pill__value tw-font-semibold tw-text-[var(--color-text-primary)]">${stats.range || 'N/A'}</span>
                    </div>
                    <div class="wh40k-stat-pill tw-inline-flex tw-items-center tw-gap-1 tw-rounded-md tw-border tw-border-[var(--wh40k-item-panel-border)] tw-bg-[var(--wh40k-item-panel-bg)] tw-px-2.5 tw-py-1 tw-text-sm">
                        <i class="fa-solid fa-gauge-high tw-text-[var(--wh40k-stat-neutral)]"></i>
                        <span class="wh40k-stat-pill__label tw-text-xs tw-text-[var(--color-text-secondary)] tw-opacity-80">RoF</span>
                        <span class="wh40k-stat-pill__value tw-font-semibold tw-text-[var(--color-text-primary)]">${stats.rof || 'N/A'}</span>
                    </div>
                    <div class="wh40k-stat-pill tw-inline-flex tw-items-center tw-gap-1 tw-rounded-md tw-border tw-border-[var(--wh40k-item-panel-border)] tw-bg-[var(--wh40k-item-panel-bg)] tw-px-2.5 tw-py-1 tw-text-sm">
                        <i class="fa-solid fa-box tw-text-[var(--wh40k-stat-neutral)]"></i>
                        <span class="wh40k-stat-pill__label tw-text-xs tw-text-[var(--color-text-secondary)] tw-opacity-80">Clip</span>
                        <span class="wh40k-stat-pill__value tw-font-semibold tw-text-[var(--color-text-primary)]">${system.clip?.current || 0}/${
                system.clip?.max || 0
            }</span>
                    </div>
                </div>
                ${this.#generateQualitiesHTML(system.qualities)}
                ${system.description ? `<div class="wh40k-item-preview-description">${system.description}</div>` : ''}
            `;
        }

        /**
         * Generate armour preview
         * @param {Item} item - Armour item
         * @returns {string} HTML string
         * @private
         */
        #generateArmourPreview(item: WH40KItem): string {
            const system = item.system;
            const locations = system.locations || {};

            return `
                <div class="wh40k-armour-preview-locations">
                    ${
                        locations.head
                            ? `<div class="wh40k-armour-location"><span class="wh40k-location-label">Head:</span> <strong>${locations.head}</strong></div>`
                            : ''
                    }
                    ${
                        locations.leftArm
                            ? `<div class="wh40k-armour-location"><span class="wh40k-location-label">L Arm:</span> <strong>${locations.leftArm}</strong></div>`
                            : ''
                    }
                    ${
                        locations.rightArm
                            ? `<div class="wh40k-armour-location"><span class="wh40k-location-label">R Arm:</span> <strong>${locations.rightArm}</strong></div>`
                            : ''
                    }
                    ${
                        locations.body
                            ? `<div class="wh40k-armour-location"><span class="wh40k-location-label">Body:</span> <strong>${locations.body}</strong></div>`
                            : ''
                    }
                    ${
                        locations.leftLeg
                            ? `<div class="wh40k-armour-location"><span class="wh40k-location-label">L Leg:</span> <strong>${locations.leftLeg}</strong></div>`
                            : ''
                    }
                    ${
                        locations.rightLeg
                            ? `<div class="wh40k-armour-location"><span class="wh40k-location-label">R Leg:</span> <strong>${locations.rightLeg}</strong></div>`
                            : ''
                    }
                </div>
                ${this.#generateQualitiesHTML(system.properties)}
                ${system.description ? `<div class="wh40k-item-preview-description">${system.description}</div>` : ''}
            `;
        }

        /**
         * Generate talent preview
         * @param {Item} item - Talent item
         * @returns {string} HTML string
         * @private
         */
        #generateTalentPreview(item: WH40KItem): string {
            const system = item.system;

            let content = '';

            // Prerequisites
            if (system.prerequisites?.text) {
                content += `
                    <div class="wh40k-item-preview-prereqs">
                        <strong>Prerequisites:</strong> ${system.prerequisites.text}
                    </div>
                `;
            }

            // Benefit
            if (system.benefit) {
                content += `<div class="wh40k-item-preview-benefit">${system.benefit}</div>`;
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
        #generateTraitPreview(item: WH40KItem): string {
            const system = item.system;

            let content = '';

            if (system.level) {
                content += `<div class="wh40k-trait-level"><strong>Level:</strong> ${system.level}</div>`;
            }

            if (system.description) {
                content += `<div class="wh40k-item-preview-description">${system.description}</div>`;
            }

            return content;
        }

        /**
         * Generate condition preview
         * @param {Item} item - Condition item
         * @returns {string} HTML string
         * @private
         */
        #generateConditionPreview(item: WH40KItem): string {
            const system = item.system;

            let content = `
                <div class="wh40k-condition-preview-meta">
                    ${system.nature ? `<span class="wh40k-badge wh40k-badge--${system.nature}">${system.nature}</span>` : ''}
                    ${system.duration ? `<span class="wh40k-badge">Duration: ${system.duration}</span>` : ''}
                    ${system.stacks > 1 ? `<span class="wh40k-badge">×${system.stacks}</span>` : ''}
                </div>
            `;

            if (system.description) {
                content += `<div class="wh40k-item-preview-description">${system.description}</div>`;
            }

            return content;
        }

        /**
         * Generate gear preview
         * @param {Item} item - Gear item
         * @returns {string} HTML string
         * @private
         */
        #generateGearPreview(item: WH40KItem): string {
            const system = item.system;

            let content = '';

            if (system.quantity) {
                content += `<div class="wh40k-gear-quantity"><strong>Quantity:</strong> ${system.quantity}</div>`;
            }

            if (system.uses) {
                content += `<div class="wh40k-gear-uses"><strong>Uses:</strong> ${system.uses.current}/${system.uses.max}</div>`;
            }

            if (system.description) {
                content += `<div class="wh40k-item-preview-description">${system.description}</div>`;
            }

            return content;
        }

        /**
         * Generate power preview
         * @param {Item} item - Power item
         * @returns {string} HTML string
         * @private
         */
        #generatePowerPreview(item: WH40KItem): string {
            const system = item.system;

            let content = '';

            if (system.cost) {
                content += `<div class="wh40k-power-cost"><strong>Cost:</strong> ${system.cost}</div>`;
            }

            if (system.range) {
                content += `<div class="wh40k-power-range"><strong>Range:</strong> ${system.range}</div>`;
            }

            if (system.sustained !== undefined) {
                content += `<div class="wh40k-power-sustained"><strong>Sustained:</strong> ${system.sustained ? 'Yes' : 'No'}</div>`;
            }

            if (system.description) {
                content += `<div class="wh40k-item-preview-description">${system.description}</div>`;
            }

            return content;
        }

        /**
         * Generate generic preview
         * @param {Item} item - Item
         * @returns {string} HTML string
         * @private
         */
        #generateGenericPreview(item: WH40KItem): string {
            const system = item.system;

            if (system.description) {
                return `<div class="wh40k-item-preview-description">${system.description}</div>`;
            }

            return '<div class="wh40k-item-preview-empty">No additional details available.</div>';
        }

        /**
         * Generate HTML for qualities/properties tags
         * @param {Array|Object} qualities - Qualities array or object
         * @returns {string} HTML string
         * @private
         */
        #generateQualitiesHTML(qualities: unknown[]): string {
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
                    return `<span class="wh40k-badge">${name}</span>`;
                })
                .join('');

            return `
                <div class="wh40k-item-preview-qualities">
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
        #generateModifiersHTML(modifiers: any): string {
            if (!modifiers) return '';

            let content = '<div class="wh40k-item-preview-modifiers"><strong>Modifiers:</strong><ul>';

            if (modifiers.characteristics) {
                for (const [char, value] of Object.entries(modifiers.characteristics)) {
                    if (value) {
                        const numVal = Number(value);
                        content += `<li>${char.toUpperCase()}: ${numVal > 0 ? '+' : ''}${numVal}</li>`;
                    }
                }
            }

            if (modifiers.skills) {
                for (const [skill, value] of Object.entries(modifiers.skills)) {
                    if (value) {
                        const numVal = Number(value);
                        content += `<li>${skill}: ${numVal > 0 ? '+' : ''}${numVal}</li>`;
                    }
                }
            }

            if (modifiers.combat) {
                for (const [type, value] of Object.entries(modifiers.combat)) {
                    if (value) {
                        const numVal = Number(value);
                        content += `<li>${type}: ${numVal > 0 ? '+' : ''}${numVal}</li>`;
                    }
                }
            }

            content += '</ul></div>';
            return content;
        }
    };
}
