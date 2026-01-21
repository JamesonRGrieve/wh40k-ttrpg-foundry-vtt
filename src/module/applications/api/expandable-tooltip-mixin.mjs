/**
 * @file ExpandableTooltipMixin - Click-to-expand rich tooltips
 *
 * Adds support for click-to-expand information panels throughout item sheets.
 * Replaces hover tooltips with clickable panels that can contain rich HTML,
 * item links, and formatted text.
 *
 * Usage:
 * - Add to mixin stack in sheet class
 * - Use data-expandable="key" on trigger elements
 * - Define expandableContent() method to provide content
 *
 * @mixin
 */

/**
 * Mixin for expandable tooltip functionality
 * @param {*} Base - The base class to extend
 * @returns {*} Extended class with expandable tooltip support
 */
export default function ExpandableTooltipMixin(Base) {
    return class ExpandableTooltipMixin extends Base {
        /**
         * Storage for currently open expandable panels
         * @type {Set<string>}
         * @private
         */
        #openPanels = new Set();

        /**
         * Add expandable tooltip action handlers
         * @override
         */
        static DEFAULT_OPTIONS = {
            ...super.DEFAULT_OPTIONS,
            actions: {
                ...super.DEFAULT_OPTIONS.actions,
                toggleExpandable: ExpandableTooltipMixin.#toggleExpandable,
            },
        };

        /* -------------------------------------------- */
        /*  Action Handlers                             */
        /* -------------------------------------------- */

        /**
         * Toggle an expandable panel
         * @this {ExpandableTooltipMixin}
         * @param {PointerEvent} event - Triggering event
         * @param {HTMLElement} target - Action target
         * @private
         */
        static async #toggleExpandable(event, target) {
            event.preventDefault();
            event.stopPropagation();

            const panelId = target.dataset.targetId;
            if (!panelId) {
                console.warn('Expandable element missing data-target-id');
                return;
            }

            // Toggle the panel state
            if (this.#openPanels.has(panelId)) {
                this.#closePanel(panelId);
            } else {
                this.#openPanel(panelId);
            }
        }

        /* -------------------------------------------- */
        /*  Panel Management                            */
        /* -------------------------------------------- */

        /**
         * Open an expandable panel
         * @param {string} panelId - Panel identifier
         * @private
         */
        #openPanel(panelId) {
            const wrapper = this.element.querySelector(`[data-expandable-id="${panelId}"]`);
            if (!wrapper) return;

            const trigger = wrapper.querySelector('.rt-expandable');
            const panel = wrapper.querySelector('.rt-expansion-panel');

            if (trigger && panel) {
                trigger.classList.add('rt-expandable--expanded');
                panel.classList.add('rt-expansion-panel--open');
                this.#openPanels.add(panelId);

                // Enrich content if needed
                this.#enrichPanelContent(panel);
            }
        }

        /**
         * Close an expandable panel
         * @param {string} panelId - Panel identifier
         * @private
         */
        #closePanel(panelId) {
            const wrapper = this.element.querySelector(`[data-expandable-id="${panelId}"]`);
            if (!wrapper) return;

            const trigger = wrapper.querySelector('.rt-expandable');
            const panel = wrapper.querySelector('.rt-expansion-panel');

            if (trigger && panel) {
                trigger.classList.remove('rt-expandable--expanded');
                panel.classList.remove('rt-expansion-panel--open');
                this.#openPanels.delete(panelId);
            }
        }

        /**
         * Close all open panels
         * @private
         */
        #closeAllPanels() {
            for (const panelId of this.#openPanels) {
                this.#closePanel(panelId);
            }
            this.#openPanels.clear();
        }

        /**
         * Enrich panel content with text enrichers and item links
         * @param {HTMLElement} panel - Panel element
         * @private
         */
        async #enrichPanelContent(panel) {
            // Check if content needs enriching
            const unenriched = panel.querySelectorAll('[data-enrich="true"]');
            if (unenriched.length === 0) return;

            for (const element of unenriched) {
                const content = element.innerHTML;
                const enriched = await TextEditor.enrichHTML(content, {
                    async: true,
                    relativeTo: this.document,
                });
                element.innerHTML = enriched;
                element.removeAttribute('data-enrich');
            }
        }

        /* -------------------------------------------- */
        /*  Event Handlers                              */
        /* -------------------------------------------- */

        /**
         * @override
         */
        _attachPartListeners(partId, htmlElement, options) {
            super._attachPartListeners(partId, htmlElement, options);

            // Close panels on Escape key
            htmlElement.addEventListener('keydown', (event) => {
                if (event.key === 'Escape' && this.#openPanels.size > 0) {
                    event.preventDefault();
                    this.#closeAllPanels();
                }
            });

            // Close panels when clicking outside
            htmlElement.addEventListener('click', (event) => {
                // Don't close if clicking on trigger or inside panel
                const clickedExpandable = event.target.closest('.rt-expandable, .rt-expansion-panel');
                if (!clickedExpandable && this.#openPanels.size > 0) {
                    this.#closeAllPanels();
                }
            });
        }

        /* -------------------------------------------- */
        /*  Helper Methods                              */
        /* -------------------------------------------- */

        /**
         * Check if a panel is currently open
         * @param {string} panelId - Panel identifier
         * @returns {boolean}
         */
        isPanelOpen(panelId) {
            return this.#openPanels.has(panelId);
        }

        /**
         * Get all currently open panel IDs
         * @returns {string[]}
         */
        getOpenPanels() {
            return Array.from(this.#openPanels);
        }

        /**
         * Programmatically open a panel
         * @param {string} panelId - Panel identifier
         */
        openExpandable(panelId) {
            this.#openPanel(panelId);
        }

        /**
         * Programmatically close a panel
         * @param {string} panelId - Panel identifier
         */
        closeExpandable(panelId) {
            this.#closePanel(panelId);
        }
    };
}
