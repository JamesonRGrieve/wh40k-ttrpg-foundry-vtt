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

/* eslint-disable @typescript-eslint/no-explicit-any -- mixin constructor signature must use any[] per TS mixin rule */
// biome-ignore lint/suspicious/noExplicitAny: boundary - mixin constructor signature must use any[] per TS mixin rule
type ActorSheetCtor = new (...args: any[]) => foundry.appv1.sheets.ActorSheet;
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Mixin that adds item preview card functionality to actor sheets
 */
export function ItemPreviewMixin<TBase extends ActorSheetCtor>(Base: TBase): TBase {
    // eslint-disable-next-line no-restricted-syntax -- boundary: mixin host class lacks DEFAULT_OPTIONS in its declared type
    const baseOptions = (Base as unknown as { DEFAULT_OPTIONS?: { actions?: Record<string, unknown> } }).DEFAULT_OPTIONS;
    return class ItemPreviewMixinClass extends Base {
        /** @override */
        static DEFAULT_OPTIONS = {
            ...baseOptions,
            /* eslint-disable @typescript-eslint/unbound-method -- Foundry V2 actions table receives method references and rebinds `this` to the sheet instance at dispatch time */
            actions: {
                ...(baseOptions?.actions ?? {}),
                toggleItemPreview: ItemPreviewMixinClass.toggleItemPreview,
            },
            /* eslint-enable @typescript-eslint/unbound-method */
        };

        /**
         * Track open preview cards
         */
        readonly #openPreviews = new Set<string>();

        /**
         * Toggle an item preview card
         */
        /* eslint-disable @typescript-eslint/no-explicit-any -- mixin-internal action handler runs against host sheet whose concrete type is unknown to the mixin */
        // biome-ignore lint/suspicious/noExplicitAny: boundary - mixin action handler; host sheet type is unknown to the mixin
        static toggleItemPreview(this: any, _event: Event, target: HTMLElement): void {
            /* eslint-enable @typescript-eslint/no-explicit-any */
            const itemId = target.dataset['itemId'];
            if (itemId === undefined || itemId.length === 0) return;

            /* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/strict-boolean-expressions -- this is `any`-typed for mixin compat; actor/element/private fields are documented host sheet members reached through `any` */
            const item = this.actor.items.get(itemId);
            if (!item) return;

            // Find the item row
            const itemRow = this.element[0].querySelector(`[data-item-id="${itemId}"]`) as HTMLElement | null;
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
            /* eslint-enable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/strict-boolean-expressions */
        }

        /* eslint-disable
            @typescript-eslint/strict-boolean-expressions,
            no-restricted-syntax,
            @typescript-eslint/no-base-to-string,
            @typescript-eslint/restrict-template-expressions,
            @typescript-eslint/no-unnecessary-condition,
            @typescript-eslint/prefer-nullish-coalescing,
            @typescript-eslint/switch-exhaustiveness-check
            -- generate* methods build HTML from heterogeneous item.system shapes via narrow inline interfaces; the boundary cluster here is intentional and porting to Zod-validated DataModels is tracked separately */

        /**
         * Open an item preview card
         */
        #openPreview(item: WH40KItem, itemRow: HTMLElement): void {
            // Close any existing preview for this item
            this.#closePreview(item.id ?? '');

            // Generate preview content
            const previewHTML = this.#generatePreviewHTML(item);

            // Create preview element
            const preview = document.createElement('div');
            preview.classList.add(
                'wh40k-item-preview',
                `wh40k-item-preview--${item.type}`,
                'tw-hidden',
                'tw-opacity-0',
                'tw-max-h-0',
                'tw-overflow-hidden',
                'tw-m-0',
                'tw-p-0',
                'tw-transition-all',
                'tw-duration-300',
                'tw-bg-[var(--wh40k-panel-bg,rgba(0,0,0,0.3))]',
                'tw-border',
                'tw-border-[var(--wh40k-panel-border,rgba(255,255,255,0.1))]',
                'tw-rounded-[var(--wh40k-radius-md)]',
                'tw-shadow-[inset_0_1px_3px_rgba(0,0,0,0.2)]',
            );
            preview.dataset['previewId'] = item.id ?? undefined;
            preview.innerHTML = previewHTML;

            // Insert after item row
            itemRow.insertAdjacentElement('afterend', preview);

            // Track as open
            this.#openPreviews.add(item.id ?? '');

            // Add close button handler
            const closeBtn = preview.querySelector('[data-action="closeItemPreview"]');
            if (closeBtn) {
                closeBtn.addEventListener('click', () => this.#closePreview(item.id ?? ''));
            }

            // Animate in
            requestAnimationFrame(() => {
                preview.classList.add('wh40k-item-preview--open');
                preview.classList.remove('tw-hidden', 'tw-opacity-0', 'tw-max-h-0', 'tw-m-0', 'tw-p-0');
                preview.classList.add('tw-block', 'tw-opacity-100', 'tw-max-h-[1000px]', 'tw-my-2', 'tw-p-3');
            });
        }

        /**
         * Close an item preview card
         */
        #closePreview(itemId: string): void {
            const root = this.element[0];
            if (root === undefined) return;
            const preview = root.querySelector(`[data-preview-id="${itemId}"]`);
            if (!preview) return;

            preview.classList.remove('wh40k-item-preview--open');
            preview.classList.remove('tw-block', 'tw-opacity-100', 'tw-max-h-[1000px]', 'tw-my-2', 'tw-p-3');
            preview.classList.add('tw-opacity-0', 'tw-max-h-0');
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
            const actions = QuickActionsBar.getActionsForItem(item, { compact: false, inSheet: false, isGM: game.user?.isGM ?? false });
            const actionsHTML = QuickActionsBar.renderActions(actions, false);

            return `
                <div class="wh40k-item-preview-header tw-flex tw-justify-between tw-items-center tw-gap-[var(--wh40k-space-md)] tw-mb-3 tw-pb-2 tw-border-b tw-border-[var(--wh40k-panel-border,rgba(255,255,255,0.1))]">
                    <div class="wh40k-item-preview-title tw-flex tw-items-center tw-gap-[var(--wh40k-space-sm)] tw-flex-1 tw-text-[1.1em] tw-font-semibold tw-text-[color:var(--wh40k-text-primary,#fff)]">
                        <img src="${item.img}" alt="${item.name}" class="wh40k-item-preview-icon tw-w-8 tw-h-8 tw-rounded-[var(--wh40k-radius-md)] tw-border tw-border-[var(--wh40k-panel-border,rgba(255,255,255,0.1))]" />
                        <span>${item.name}</span>
                    </div>
                    <div class="wh40k-item-preview-actions tw-flex tw-gap-[var(--wh40k-space-xs)] tw-flex-wrap tw-justify-end">
                        ${actionsHTML}
                        <button type="button" class="wh40k-quick-action wh40k-quick-action--secondary" data-action="closeItemPreview" title="Collapse">
                            <i class="fa-solid fa-chevron-up"></i>
                        </button>
                    </div>
                </div>
                <div class="wh40k-item-preview-body tw-text-[0.95em]">
                    ${content}
                </div>
            `;
        }

        /**
         * Generate weapon preview
         */
        #generateWeaponPreview(item: WH40KItem): string {
            const sys = item.system as unknown as WeaponDataModel;
            const sysRec = sys as unknown as Record<string, unknown>;
            const damage = sys.damage;
            const stats = {
                penetration: sys.damage?.penetration ?? 0,
                range: sys.rangeLabel ?? 'N/A',
                rof: sys.rateOfFireLabel ?? 'N/A',
            };

            return `
                <div class="wh40k-weapon-preview-stats tw-flex tw-flex-wrap tw-gap-[var(--wh40k-space-sm)] tw-mb-2">
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
                            (sysRec['clip'] as Record<string, unknown> | undefined)?.['current'] || 0
                        }/${(sysRec['clip'] as Record<string, unknown> | undefined)?.['max'] || 0}</span>
                    </div>
                </div>
                ${this.#generateQualitiesHTML(sysRec['qualities'])}
                ${
                    sysRec['description']
                        ? `<div class="wh40k-item-preview-description tw-mt-2 tw-p-2 tw-bg-[rgba(0,0,0,0.2)] tw-rounded-[var(--wh40k-radius-md)] tw-text-[color:var(--wh40k-text-secondary,rgba(255,255,255,0.8))] tw-leading-[1.5] [&_p:first-child]:tw-mt-0 [&_p:last-child]:tw-mb-0">${String(
                              sysRec['description'],
                          )}</div>`
                        : ''
                }
            `;
        }

        /**
         * Generate armour preview
         */
        #generateArmourPreview(item: WH40KItem): string {
            const sys = item.system as unknown as ArmourDataModel;
            const sysRec = sys as unknown as Record<string, unknown>;
            const locations = (sysRec['locations'] as Record<string, number | undefined>) ?? {};

            return `
                <div class="wh40k-armour-preview-locations tw-grid tw-grid-cols-[repeat(auto-fit,minmax(120px,1fr))] tw-gap-[6px] tw-mb-2">
                    ${
                        locations['head']
                            ? `<div class="wh40k-armour-location tw-p-[6px_8px] tw-bg-[rgba(0,0,0,0.2)] tw-rounded-[var(--wh40k-radius-md)] tw-text-[0.9em]"><span class="wh40k-location-label tw-text-[color:var(--wh40k-text-secondary,rgba(255,255,255,0.7))] tw-mr-1">Head:</span> <strong class="tw-text-[color:var(--wh40k-stat-positive,#4ade80)]">${locations['head']}</strong></div>`
                            : ''
                    }
                    ${
                        locations['leftArm']
                            ? `<div class="wh40k-armour-location tw-p-[6px_8px] tw-bg-[rgba(0,0,0,0.2)] tw-rounded-[var(--wh40k-radius-md)] tw-text-[0.9em]"><span class="wh40k-location-label tw-text-[color:var(--wh40k-text-secondary,rgba(255,255,255,0.7))] tw-mr-1">L Arm:</span> <strong class="tw-text-[color:var(--wh40k-stat-positive,#4ade80)]">${locations['leftArm']}</strong></div>`
                            : ''
                    }
                    ${
                        locations['rightArm']
                            ? `<div class="wh40k-armour-location tw-p-[6px_8px] tw-bg-[rgba(0,0,0,0.2)] tw-rounded-[var(--wh40k-radius-md)] tw-text-[0.9em]"><span class="wh40k-location-label tw-text-[color:var(--wh40k-text-secondary,rgba(255,255,255,0.7))] tw-mr-1">R Arm:</span> <strong class="tw-text-[color:var(--wh40k-stat-positive,#4ade80)]">${locations['rightArm']}</strong></div>`
                            : ''
                    }
                    ${
                        locations['body']
                            ? `<div class="wh40k-armour-location tw-p-[6px_8px] tw-bg-[rgba(0,0,0,0.2)] tw-rounded-[var(--wh40k-radius-md)] tw-text-[0.9em]"><span class="wh40k-location-label tw-text-[color:var(--wh40k-text-secondary,rgba(255,255,255,0.7))] tw-mr-1">Body:</span> <strong class="tw-text-[color:var(--wh40k-stat-positive,#4ade80)]">${locations['body']}</strong></div>`
                            : ''
                    }
                    ${
                        locations['leftLeg']
                            ? `<div class="wh40k-armour-location tw-p-[6px_8px] tw-bg-[rgba(0,0,0,0.2)] tw-rounded-[var(--wh40k-radius-md)] tw-text-[0.9em]"><span class="wh40k-location-label tw-text-[color:var(--wh40k-text-secondary,rgba(255,255,255,0.7))] tw-mr-1">L Leg:</span> <strong class="tw-text-[color:var(--wh40k-stat-positive,#4ade80)]">${locations['leftLeg']}</strong></div>`
                            : ''
                    }
                    ${
                        locations['rightLeg']
                            ? `<div class="wh40k-armour-location tw-p-[6px_8px] tw-bg-[rgba(0,0,0,0.2)] tw-rounded-[var(--wh40k-radius-md)] tw-text-[0.9em]"><span class="wh40k-location-label tw-text-[color:var(--wh40k-text-secondary,rgba(255,255,255,0.7))] tw-mr-1">R Leg:</span> <strong class="tw-text-[color:var(--wh40k-stat-positive,#4ade80)]">${locations['rightLeg']}</strong></div>`
                            : ''
                    }
                </div>
                ${this.#generateQualitiesHTML(Array.from((sysRec['properties'] as Iterable<unknown>) ?? []))}
                ${
                    sysRec['description']
                        ? `<div class="wh40k-item-preview-description tw-mt-2 tw-p-2 tw-bg-[rgba(0,0,0,0.2)] tw-rounded-[var(--wh40k-radius-md)] tw-text-[color:var(--wh40k-text-secondary,rgba(255,255,255,0.8))] tw-leading-[1.5] [&_p:first-child]:tw-mt-0 [&_p:last-child]:tw-mb-0">${String(
                              sysRec['description'],
                          )}</div>`
                        : ''
                }
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
                    <div class="wh40k-item-preview-prereqs tw-mb-2 tw-p-[6px_8px] tw-bg-[rgba(168,85,247,0.1)] tw-border-l-[3px] tw-border-l-[rgba(168,85,247,0.5)] tw-rounded-[var(--wh40k-radius-md)] tw-text-[0.9em]">
                        <strong>Prerequisites:</strong> ${sys.prerequisites.text}
                    </div>
                `;
            }

            // Benefit
            if (sys.benefit) {
                content += `<div class="wh40k-item-preview-benefit tw-mb-2 tw-leading-[1.5] tw-text-[color:var(--wh40k-text-secondary,rgba(255,255,255,0.8))]">${sys.benefit}</div>`;
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
                content += `<div class="wh40k-trait-level tw-mb-2 tw-p-[6px_8px] tw-bg-[rgba(0,0,0,0.2)] tw-rounded-[var(--wh40k-radius-md)] tw-text-[0.95em]"><strong class="tw-text-[color:var(--wh40k-text-primary,#fff)] tw-mr-1">Level:</strong> ${sys.level}</div>`;
            }

            if (sys.description) {
                content += `<div class="wh40k-item-preview-description tw-mt-2 tw-p-2 tw-bg-[rgba(0,0,0,0.2)] tw-rounded-[var(--wh40k-radius-md)] tw-text-[color:var(--wh40k-text-secondary,rgba(255,255,255,0.8))] tw-leading-[1.5] [&_p:first-child]:tw-mt-0 [&_p:last-child]:tw-mb-0">${sys.description}</div>`;
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
                <div class="wh40k-condition-preview-meta tw-flex tw-flex-wrap tw-gap-[6px] tw-mb-2">
                    ${sys.nature ? `<span class="wh40k-badge wh40k-badge--${sys.nature}">${sys.nature}</span>` : ''}
                    ${sys.duration ? `<span class="wh40k-badge">Duration: ${sys.duration}</span>` : ''}
                    ${(sys.stacks ?? 0) > 1 ? `<span class="wh40k-badge">×${sys.stacks}</span>` : ''}
                </div>
            `;

            if (sys.description) {
                content += `<div class="wh40k-item-preview-description tw-mt-2 tw-p-2 tw-bg-[rgba(0,0,0,0.2)] tw-rounded-[var(--wh40k-radius-md)] tw-text-[color:var(--wh40k-text-secondary,rgba(255,255,255,0.8))] tw-leading-[1.5] [&_p:first-child]:tw-mt-0 [&_p:last-child]:tw-mb-0">${sys.description}</div>`;
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

            if (sys['description']) {
                return `<div class="wh40k-item-preview-description">${String(sys['description'])}</div>`;
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
                    const name = typeof q === 'string' ? q : (q as Record<string, unknown>)?.['name'] ?? q;
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

        /* eslint-enable */
    };
}
