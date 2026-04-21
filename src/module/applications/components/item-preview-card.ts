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
import type { default as WeaponDataModel } from '../../data/item/weapon.ts';
import type { default as ArmourDataModel } from '../../data/item/armour.ts';
import type { WH40KItemModifiers } from '../../types/global.d.ts';

/**
 * Mixin that adds item preview card functionality to actor sheets
 */
export function ItemPreviewMixin<TBase extends typeof foundry.appv1.sheets.ActorSheet>(Base: TBase) {
    return class extends Base {
        /** @override */
        static DEFAULT_OPTIONS = {
            ...Base.DEFAULT_OPTIONS,
            actions: {
                ...Base.DEFAULT_OPTIONS.actions,
                toggleItemPreview: ItemPreviewMixin.toggleItemPreview,
            },
        };

        /**
         * Track open preview cards
         */
        #openPreviews = new Set<string>();

        /**
         * Toggle an item preview card
         */
        static toggleItemPreview(this: any, event: Event, target: HTMLElement): void {
            const itemId = target.dataset.itemId;
            if (!itemId) return;

            const item = this.actor.items.get(itemId);
            if (!item) return;

            // Find the item row
            const itemRow = this.element.querySelector(`[data-item-id="${itemId}"]`) as HTMLElement | null;
            if (!itemRow) return;

            const instance = this as any;
            // Check if preview is already open
            const isOpen = instance.#openPreviews.has(itemId);

            if (isOpen) {
                // Close preview
                instance.#closePreview(itemId);
            } else {
                // Open preview
                instance.#openPreview(item as WH40KItem, itemRow);
            }
        }

        /**
         * Open an item preview card
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
         */
        #generateWeaponPreview(item: WH40KItem): string {
            const sys = item.system as WeaponDataModel;
            const damage = (sys as any).damage as { formula?: string };
            const stats = (sys as any).stats as { penetration?: number; range?: string; rof?: string };

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
                        <span class="wh40k-stat-pill__value tw-font-semibold tw-text-[var(--color-text-primary)]">${(sys as any).clip?.current || 0}/${
                (sys as any).clip?.max || 0
            }</span>
                    </div>
                </div>
                ${this.#generateQualitiesHTML((sys as any).qualities)}
                ${(sys as any).description ? `<div class="wh40k-item-preview-description">${(sys as any).description}</div>` : ''}
            `;
        }

        /**
         * Generate armour preview
         */
        #generateArmourPreview(item: WH40KItem): string {
            const sys = item.system as ArmourDataModel;
            const locations = (sys as any).locations;

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
                ${this.#generateQualitiesHTML(Array.from((sys as any).properties))}
                ${(sys as any).description ? `<div class="wh40k-item-preview-description">${(sys as any).description}</div>` : ''}
            `;
        }

        /**
         * Generate talent preview
         */
        #generateTalentPreview(item: WH40KItem): string {
            const sys = item.system as any;

            let content = '';

            // Prerequisites
            if (sys.prerequisites?.text) {
                content += `
                    <div class="wh40k-item-preview-prereqs">
                        <strong>Prerequisites:</strong> ${sys.prerequisites.text}
                    </div>
                `;
            }

            // Benefit
            if (sys.benefit) {
                content += `<div class="wh40k-item-preview-benefit">${sys.benefit}</div>`;
            }

            // Modifiers
            if (sys.modifiers) {
                content += this.#generateModifiersHTML(sys.modifiers);
            }

            return content;
        }

        /**
         * Generate trait preview
         */
        #generateTraitPreview(item: WH40KItem): string {
            const sys = item.system as any;

            let content = '';

            if (sys.level) {
                content += `<div class="wh40k-trait-level"><strong>Level:</strong> ${sys.level}</div>`;
            }

            if (sys.description) {
                content += `<div class="wh40k-item-preview-description">${sys.description}</div>`;
            }

            return content;
        }

        /**
         * Generate condition preview
         */
        #generateConditionPreview(item: WH40KItem): string {
            const sys = item.system as any;

            let content = `
                <div class="wh40k-condition-preview-meta">
                    ${sys.nature ? `<span class="wh40k-badge wh40k-badge--${sys.nature}">${sys.nature}</span>` : ''}
                    ${sys.duration ? `<span class="wh40k-badge">Duration: ${sys.duration}</span>` : ''}
                    ${sys.stacks > 1 ? `<span class="wh40k-badge">×${sys.stacks}</span>` : ''}
                </div>
            `;

            if (sys.description) {
                content += `<div class="wh40k-item-preview-description">${sys.description}</div>`;
            }

            return content;
        }

        /**
         * Generate gear preview
         */
        #generateGearPreview(item: WH40KItem): string {
            const sys = item.system as any;

            let content = '';

            if (sys.quantity) {
                content += `<div class="wh40k-gear-quantity"><strong>Quantity:</strong> ${sys.quantity}</div>`;
            }

            if (sys.uses) {
                content += `<div class="wh40k-gear-uses"><strong>Uses:</strong> ${sys.uses.current}/${sys.uses.max}</div>`;
            }

            if (sys.description) {
                content += `<div class="wh40k-item-preview-description">${sys.description}</div>`;
            }

            return content;
        }

        /**
         * Generate power preview
         */
        #generatePowerPreview(item: WH40KItem): string {
            const sys = item.system as any;

            let content = '';

            if (sys.cost) {
                content += `<div class="wh40k-power-cost"><strong>Cost:</strong> ${sys.cost}</div>`;
            }

            if (sys.range) {
                content += `<div class="wh40k-power-range"><strong>Range:</strong> ${sys.range}</div>`;
            }

            if (sys.sustained !== undefined) {
                content += `<div class="wh40k-power-sustained"><strong>Sustained:</strong> ${sys.sustained ? 'Yes' : 'No'}</div>`;
            }

            if (sys.description) {
                content += `<div class="wh40k-item-preview-description">${sys.description}</div>`;
            }

            return content;
        }

        /**
         * Generate generic preview
         */
        #generateGenericPreview(item: WH40KItem): string {
            const sys = item.system as any;

            if (sys.description) {
                return `<div class="wh40k-item-preview-description">${sys.description}</div>`;
            }

            return '<div class="wh40k-item-preview-empty">No additional details available.</div>';
        }

        /**
         * Generate HTML for qualities/properties tags
         */
        #generateQualitiesHTML(qualities: unknown): string {
            if (!qualities) return '';

            let qualitiesArray: any[] = [];
            if (Array.isArray(qualities)) {
                qualitiesArray = qualities;
            } else if (typeof qualities === 'object') {
                qualitiesArray = Object.entries(qualities)
                    .filter(([_, value]) => value)
                    .map(([key]) => key);
            }

            if (qualitiesArray.length === 0) return '';

            const tagsHTML = qualitiesArray
                .map((q) => {
                    const name = typeof q === 'string' ? q : (q as any).name || q;
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
         */
        #generateModifiersHTML(modifiers: WH40KItemModifiers): string {
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

            if (modifiers.other && modifiers.other.length > 0) {
                for (const mod of modifiers.other) {
                    content += `<li>${mod.key}: ${mod.value > 0 ? '+' : ''}${mod.value}</li>`;
                }
            }

            content += '</ul></div>';
            return content;
        }
    };
}
