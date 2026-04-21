/**
 * @file StatBreakdownPopover - Stat calculation breakdown system
 *
 * Shows detailed breakdown of where a calculated stat comes from,
 * including base values, modifiers from talents/traits/conditions,
 * and clickable source items.
 *
 * Usage:
 * - Add data-stat-breakdown="statKey" to stat displays
 * - Actor/Item DataModels implement getStatBreakdown(statKey)
 * - Popover shows breakdown with clickable source items
 */

type ApplicationV2 = foundry.applications.api.ApplicationV2.Any;
import type { WH40KBaseActorDocument } from '../../types/global.d.ts';

interface ModifierEntry {
    value: number;
    uuid?: string;
    icon?: string;
    source: string;
}

interface BreakdownData {
    label: string;
    base: number;
    modifiers: ModifierEntry[];
    total: number;
}

/**
 * Mixin for stat breakdown popover functionality
 * @template {ApplicationV2} T
 * @param {T} Base - The base class to extend
 * @returns {any} Extended class with stat breakdown support
 */
export default function StatBreakdownMixin<T extends new (...args: any[]) => ApplicationV2>(Base: T) {
    return class StatBreakdownApplication extends Base {
        /**
         * Currently open breakdown popover
         * @type {HTMLElement|null}
         * @private
         */
        #activePopover: HTMLElement | null = null;

        declare document: WH40KBaseActorDocument;

        /**
         * Add stat breakdown action handlers
         * @override
         */
        static DEFAULT_OPTIONS: Partial<ApplicationV2Config.DefaultOptions> = {
            ...Base.DEFAULT_OPTIONS,
            actions: {
                ...(Base.DEFAULT_OPTIONS as any).actions,
                showStatBreakdown: StatBreakdownApplication.#showStatBreakdown,
                viewBreakdownSource: StatBreakdownApplication.#viewBreakdownSource,
            },
        };

        /* -------------------------------------------- */
        /*  Action Handlers                             */
        /* -------------------------------------------- */

        /**
         * Show stat breakdown popover
         * @this {StatBreakdownApplication}
         * @param {Event} event - Triggering event
         * @param {HTMLElement} target - Action target
         * @private
         */
        static #showStatBreakdown(this: StatBreakdownApplication, event: Event, target: HTMLElement): void {
            event.preventDefault();
            event.stopPropagation();

            const statKey = target.dataset.statKey;
            if (!statKey) {
                console.warn('Stat breakdown element missing data-stat-key');
                return;
            }

            // Close existing popover if any
            if (this.#activePopover) {
                this.#closePopover();
            }

            // Get breakdown data from document
            const doc = this.document;
            let breakdown: BreakdownData | undefined;
            if (typeof (doc as any).getStatBreakdown === 'function') {
                breakdown = (doc as any).getStatBreakdown(statKey);
            } else {
                console.warn(`Document does not implement getStatBreakdown for ${statKey}`);
                return;
            }

            if (!breakdown) {
                console.warn(`No breakdown data available for ${statKey}`);
                return;
            }

            // Create and show popover
            this.#createPopover(target, breakdown);
        }

        /**
         * View a breakdown source item
         * @this {StatBreakdownApplication}
         * @param {Event} event - Triggering event
         * @param {HTMLElement} target - Action target
         * @private
         */
        static async #viewBreakdownSource(event: PointerEvent, target: HTMLElement): Promise<void> {
            event.preventDefault();
            event.stopPropagation();

            const uuid = target.dataset.sourceUuid;
            if (!uuid) return;

            const item = await fromUuid(uuid);
            if (item instanceof foundry.abstract.Document && item.sheet) {
                item.sheet.render(true);
            }
        }

        /* -------------------------------------------- */
        /*  Popover Management                          */
        /* -------------------------------------------- */

        /**
         * Create and display a stat breakdown popover
         * @param {HTMLElement} anchor - Element to anchor popover to
         * @param {BreakdownData} breakdown - Breakdown data
         * @private
         */
        #createPopover(anchor: HTMLElement, breakdown: BreakdownData): void {
            const popover = document.createElement('div');
            popover.className = 'wh40k-stat-breakdown-popover';

            const html = this.#buildPopoverHTML(breakdown);
            popover.innerHTML = html;

            this.#positionPopover(popover, anchor);

            document.body.appendChild(popover);
            this.#activePopover = popover;

            popover.addEventListener('click', (event: MouseEvent) => event.stopPropagation());

            setTimeout(() => {
                document.addEventListener('click', (event: MouseEvent) => this.#handleOutsideClick(event), { once: true });
            }, 0);

            document.addEventListener('keydown', this.#handleEscape.bind(this), { once: true });

            this.#attachPopoverListeners(popover);
        }

        /**
         * Build popover HTML content
         * @param {BreakdownData} breakdown - Breakdown data
         * @returns {string} HTML string
         * @private
         */
        #buildPopoverHTML(breakdown: BreakdownData): string {
            const { label, base, modifiers, total } = breakdown;

            let html = `
                <div class="wh40k-stat-breakdown-header">
                    <h4>${label}: ${total}</h4>
                    <button type="button" class="wh40k-stat-breakdown-close" data-action="closeBreakdown">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
                <div class="wh40k-stat-breakdown-body">
                    <div class="wh40k-stat-breakdown-row wh40k-stat-breakdown-row--base">
                        <span class="wh40k-stat-breakdown-source">Base</span>
                        <span class="wh40k-stat-breakdown-value">${base}</span>
                    </div>
            `;

            if (modifiers && modifiers.length > 0) {
                html += '<div class="wh40k-stat-breakdown-modifiers">';
                for (const modifier of modifiers) {
                    const valueClass = modifier.value > 0 ? 'wh40k-stat-breakdown-value--positive' : 'wh40k-stat-breakdown-value--negative';
                    const clickable = modifier.uuid ? 'wh40k-stat-breakdown-row--clickable' : '';

                    html += `
                        <div class="wh40k-stat-breakdown-row ${clickable}" 
                             ${modifier.uuid ? `data-action="viewBreakdownSource" data-source-uuid="${modifier.uuid}"` : ''}>
                            <span class="wh40k-stat-breakdown-source">
                                ${modifier.icon ? `<i class="${modifier.icon}"></i>` : ''}
                                ${modifier.source}
                            </span>
                            <span class="wh40k-stat-breakdown-value ${valueClass}">
                                ${modifier.value > 0 ? '+' : ''}${modifier.value}
                            </span>
                        </div>
                    `;
                }
                html += '</div>';
            }

            html += `
                    <div class="wh40k-stat-breakdown-row wh40k-stat-breakdown-row--total">
                        <span class="wh40k-stat-breakdown-source">Total</span>
                        <span class="wh40k-stat-breakdown-value">${total}</span>
                    </div>
                </div>
            `;

            return html;
        }

        /**
         * Position popover near anchor element
         * @param {HTMLElement} popover - Popover element
         * @param {HTMLElement} anchor - Anchor element
         * @private
         */
        #positionPopover(popover: HTMLElement, anchor: HTMLElement): void {
            const anchorRect = anchor.getBoundingClientRect();
            const popoverRect = popover.getBoundingClientRect();

            let top = anchorRect.bottom + 5;
            let left = anchorRect.left;

            if (left + popoverRect.width > window.innerWidth) {
                left = window.innerWidth - popoverRect.width - 10;
            }

            if (top + popoverRect.height > window.innerHeight) {
                top = anchorRect.top - popoverRect.height - 5;
            }

            popover.style.top = `${top}px`;
            popover.style.left = `${left}px`;
        }

        /**
         * Attach event listeners to popover
         * @param {HTMLElement} popover - Popover element
         * @private
         */
        #attachPopoverListeners(popover: HTMLElement): void {
            const closeBtn = popover.querySelector('[data-action="closeBreakdown"]');
            if (closeBtn) {
                closeBtn.addEventListener('click', () => this.#closePopover());
            }

            const sourceLinks = popover.querySelectorAll<HTMLElement>('[data-action="viewBreakdownSource"]');
            for (const link of sourceLinks) {
                link.addEventListener('click', (event: MouseEvent) => {
                    (this.constructor as any).#viewBreakdownSource.call(this, event, link);
                });
            }
        }

        /**
         * Close the active popover
         * @private
         */
        #closePopover(): void {
            if (this.#activePopover) {
                this.#activePopover.remove();
                this.#activePopover = null;
            }
        }

        /**
         * Handle click outside popover
         * @param {Event} event - Click event
         * @private
         */
        #handleOutsideClick(event: Event): void {
            if (this.#activePopover && !this.#activePopover.contains(event.target as Node)) {
                this.#closePopover();
            }
        }

        /**
         * Handle Escape key
         * @param {KeyboardEvent} event - Keyboard event
         * @private
         */
        #handleEscape(event: KeyboardEvent): void {
            if (event.key === 'Escape' && this.#activePopover) {
                event.preventDefault();
                this.#closePopover();
            }
        }

        /* -------------------------------------------- */
        /*  Lifecycle                                   */
        /* -------------------------------------------- */

        /**
         * @override
         */
        async close(options: Record<string, unknown> = {}): Promise<void> {
            this.#closePopover();
            return super.close(options);
        }
    };
}
