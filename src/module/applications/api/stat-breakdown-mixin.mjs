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

/**
 * Mixin for stat breakdown popover functionality
 * @param {*} Base - The base class to extend
 * @returns {*} Extended class with stat breakdown support
 */
export default function StatBreakdownMixin(Base) {
    return class StatBreakdownMixin extends Base {
        /**
         * Currently open breakdown popover
         * @type {HTMLElement|null}
         * @private
         */
        #activePopover = null;

        /**
         * Add stat breakdown action handlers
         * @override
         */
        static DEFAULT_OPTIONS = {
            ...super.DEFAULT_OPTIONS,
            actions: {
                ...super.DEFAULT_OPTIONS.actions,
                showStatBreakdown: StatBreakdownMixin.#showStatBreakdown,
                viewBreakdownSource: StatBreakdownMixin.#viewBreakdownSource,
            },
        };

        /* -------------------------------------------- */
        /*  Action Handlers                             */
        /* -------------------------------------------- */

        /**
         * Show stat breakdown popover
         * @this {StatBreakdownMixin}
         * @param {PointerEvent} event - Triggering event
         * @param {HTMLElement} target - Action target
         * @private
         */
        static async #showStatBreakdown(event, target) {
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
            let breakdown;
            if (typeof this.document.getStatBreakdown === 'function') {
                breakdown = this.document.getStatBreakdown(statKey);
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
         * @this {StatBreakdownMixin}
         * @param {PointerEvent} event - Triggering event
         * @param {HTMLElement} target - Action target
         * @private
         */
        static async #viewBreakdownSource(event, target) {
            event.preventDefault();
            event.stopPropagation();

            const uuid = target.dataset.sourceUuid;
            if (!uuid) return;

            // Fetch and render the item
            const item = await fromUuid(uuid);
            if (item) {
                item.sheet.render(true);
            }
        }

        /* -------------------------------------------- */
        /*  Popover Management                          */
        /* -------------------------------------------- */

        /**
         * Create and display a stat breakdown popover
         * @param {HTMLElement} anchor - Element to anchor popover to
         * @param {Object} breakdown - Breakdown data
         * @private
         */
        #createPopover(anchor, breakdown) {
            // Create popover element
            const popover = document.createElement('div');
            popover.className = 'rt-stat-breakdown-popover';

            // Build popover content
            const html = this.#buildPopoverHTML(breakdown);
            popover.innerHTML = html;

            // Position popover
            this.#positionPopover(popover, anchor);

            // Add to DOM
            document.body.appendChild(popover);
            this.#activePopover = popover;

            // Add event listeners
            popover.addEventListener('click', (event) => event.stopPropagation());

            // Close on click outside
            setTimeout(() => {
                document.addEventListener('click', this.#handleOutsideClick.bind(this), { once: true });
            }, 0);

            // Close on Escape
            document.addEventListener('keydown', this.#handleEscape.bind(this), { once: true });

            // Attach action handlers for source items
            this.#attachPopoverListeners(popover);
        }

        /**
         * Build popover HTML content
         * @param {Object} breakdown - Breakdown data
         * @returns {string} HTML string
         * @private
         */
        #buildPopoverHTML(breakdown) {
            const { label, base, modifiers, total } = breakdown;

            let html = `
                <div class="rt-stat-breakdown-header">
                    <h4>${label}: ${total}</h4>
                    <button type="button" class="rt-stat-breakdown-close" data-action="closeBreakdown">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
                <div class="rt-stat-breakdown-body">
                    <div class="rt-stat-breakdown-row rt-stat-breakdown-row--base">
                        <span class="rt-stat-breakdown-source">Base</span>
                        <span class="rt-stat-breakdown-value">${base}</span>
                    </div>
            `;

            // Add modifiers
            if (modifiers && modifiers.length > 0) {
                html += '<div class="rt-stat-breakdown-modifiers">';
                for (const modifier of modifiers) {
                    const valueClass = modifier.value > 0 ? 'rt-stat-breakdown-value--positive' : 'rt-stat-breakdown-value--negative';
                    const clickable = modifier.uuid ? 'rt-stat-breakdown-row--clickable' : '';

                    html += `
                        <div class="rt-stat-breakdown-row ${clickable}" 
                             ${modifier.uuid ? `data-action="viewBreakdownSource" data-source-uuid="${modifier.uuid}"` : ''}>
                            <span class="rt-stat-breakdown-source">
                                ${modifier.icon ? `<i class="${modifier.icon}"></i>` : ''}
                                ${modifier.source}
                            </span>
                            <span class="rt-stat-breakdown-value ${valueClass}">
                                ${modifier.value > 0 ? '+' : ''}${modifier.value}
                            </span>
                        </div>
                    `;
                }
                html += '</div>';
            }

            // Add total
            html += `
                    <div class="rt-stat-breakdown-row rt-stat-breakdown-row--total">
                        <span class="rt-stat-breakdown-source">Total</span>
                        <span class="rt-stat-breakdown-value">${total}</span>
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
        #positionPopover(popover, anchor) {
            const anchorRect = anchor.getBoundingClientRect();
            const popoverRect = popover.getBoundingClientRect();

            let top = anchorRect.bottom + 5;
            let left = anchorRect.left;

            // Keep popover in viewport
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
        #attachPopoverListeners(popover) {
            // Close button
            const closeBtn = popover.querySelector('[data-action="closeBreakdown"]');
            if (closeBtn) {
                closeBtn.addEventListener('click', () => this.#closePopover());
            }

            // Source item links
            const sourceLinks = popover.querySelectorAll('[data-action="viewBreakdownSource"]');
            for (const link of sourceLinks) {
                link.addEventListener('click', (event) => {
                    StatBreakdownMixin.#viewBreakdownSource.call(this, event, link);
                });
            }
        }

        /**
         * Close the active popover
         * @private
         */
        #closePopover() {
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
        #handleOutsideClick(event) {
            if (this.#activePopover && !this.#activePopover.contains(event.target)) {
                this.#closePopover();
            }
        }

        /**
         * Handle Escape key
         * @param {KeyboardEvent} event - Keyboard event
         * @private
         */
        #handleEscape(event) {
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
        async close(options = {}) {
            this.#closePopover();
            return super.close(options);
        }
    };
}
