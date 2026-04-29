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

import type { default as ArmourDataModel } from '../../data/item/armour.ts';
import type { default as WeaponDataModel } from '../../data/item/weapon.ts';
import type { WH40KItem } from '../../documents/item.ts';
import type { WH40KItemModifiers } from '../../types/global.d.ts';
import QuickActionsBar from './quick-actions-bar.ts';

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

            // Check if preview is already open.
            // this: any is declared on the function signature (Foundry action handler
            // pattern); the private fields are in-scope because this static method is
            // defined inside the mixin's class body.
            const isOpen = this.#openPreviews.has(itemId);

            if (isOpen) {
                // Close preview
                this.#closePreview(itemId);
            } else {
                // Open preview
                this.#openPreview(item as WH40KItem, itemRow);
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
            const sysRec = sys as unknown as Record<string, unknown>;
            const damage = sysRec.damage as { formula?: string };
            const stats = sysRec.stats as { penetration?: number; range?: string; rof?: string };

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
                        <span class="wh40k-stat-pill__value tw-font-semibold tw-text-[var(--color-text-primary)]">${
                            (sysRec.clip as Record<string, unknown> | undefined)?.current || 0
                        }/${(sysRec.clip as Record<string, unknown> | undefined)?.max || 0}</span>
                    </div>
                </div>
                ${this.#generateQualitiesHTML(sysRec.qualities)}
                ${sysRec.description ? `<div class="wh40k-item-preview-description">${String(sysRec.description)}</div>` : ''}
            `;
        }

        /**
         * Generate armour preview
         */
        #generateArmourPreview(item: WH40KItem): string {
            const sys = item.system as ArmourDataModel;
            const sysRec = sys as unknown as Record<string, unknown>;
            const locations = (sysRec.locations as Record<string, number | undefined>) ?? {};

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
                ${this.#generateQualitiesHTML(Array.from((sysRec.properties as Iterable<unknown>) ?? []))}
                ${sysRec.description ? `<div class="wh40k-item-preview-description">${String(sysRec.description)}</div>` : ''}
            `;
        }

        /**
         * Generate talent preview
         */
        #generateTalentPreview(item: WH40KItem): string {
            interface TalentSys {
                prerequisites?: { text?: string };
                benefit?: string;
                modifiers?: WH40KItemModifiers;
            }
            const sys = item.system as unknown as TalentSys;

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
            interface TraitSys {
                level?: string | number;
                description?: string;
            }
            const sys = item.system as unknown as TraitSys;

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
            interface ConditionSys {
                nature?: string;
                duration?: string | number;
                stacks?: number;
                description?: string;
            }
            const sys = item.system as unknown as ConditionSys;

            let content = `
                <div class="wh40k-condition-preview-meta">
                    ${sys.nature ? `<span class="wh40k-badge wh40k-badge--${sys.nature}">${sys.nature}</span>` : ''}
                    ${sys.duration ? `<span class="wh40k-badge">Duration: ${sys.duration}</span>` : ''}
                    ${(sys.stacks ?? 0) > 1 ? `<span class="wh40k-badge">×${sys.stacks}</span>` : ''}
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
            interface GearSys {
                quantity?: number;
                uses?: { current: number; max: number };
                description?: string;
            }
            const sys = item.system as unknown as GearSys;

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
            interface PowerSys {
                cost?: number | string;
                range?: string;
                sustained?: boolean;
                description?: string;
            }
            const sys = item.system as unknown as PowerSys;

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
            const sys = item.system as Record<string, unknown>;

            if (sys.description) {
                return `<div class="wh40k-item-preview-description">${String(sys.description)}</div>`;
            }

            return '<div class="wh40k-item-preview-empty">No additional details available.</div>';
        }

        /**
         * Generate HTML for qualities/properties tags
         */
        #generateQualitiesHTML(qualities: unknown): string {
            if (!qualities) return '';

            let qualitiesArray: unknown[] = [];
            if (Array.isArray(qualities)) {
                qualitiesArray = qualities;
            } else if (typeof qualities === 'object') {
                qualitiesArray = Object.entries(qualities as Record<string, unknown>)
                    .filter(([_, value]) => value)
                    .map(([key]) => key);
            }

            if (qualitiesArray.length === 0) return '';

            const tagsHTML = qualitiesArray
                .map((q) => {
                    const name = typeof q === 'string' ? q : (q as Record<string, unknown>)?.name ?? q;
                    return `<span class="wh40k-badge">${String(name)}</span>`;
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
