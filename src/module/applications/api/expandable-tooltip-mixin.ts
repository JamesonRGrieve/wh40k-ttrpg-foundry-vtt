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

import type { ApplicationV2Ctor } from './application-types.ts';

/**
 * Mixin for expandable tooltip functionality
 * @template {ApplicationV2} T
 * @param {T} Base - The base class to extend
 * @returns {any} Extended class with expandable tooltip support
 */
export default function ExpandableTooltipMixin<T extends ApplicationV2Ctor>(Base: T) {
    return class ExpandableTooltipApplication extends Base {
        constructor(...args: any[]) {
            super(...args);
        }

        /**
         * Storage for currently open expandable panels
         * @type {Set<string>}
         * @private
         */
        readonly #openPanels: Set<string> = new Set();

        /**
         * Add expandable tooltip action handlers
         * @override
         */
        static DEFAULT_OPTIONS: Partial<ApplicationV2Config.DefaultOptions> = {
            ...((Base as unknown as { DEFAULT_OPTIONS?: Partial<ApplicationV2Config.DefaultOptions> }).DEFAULT_OPTIONS ?? {}),
            actions: {
                ...(((Base as unknown as { DEFAULT_OPTIONS?: { actions?: Record<string, unknown> } }).DEFAULT_OPTIONS?.actions as Record<string, unknown>) ??
                    {}),
                toggleExpandable: ExpandableTooltipApplication.#toggleExpandable,
            },
        };

        /* -------------------------------------------- */
        /*  Action Handlers                             */
        /* -------------------------------------------- */

        /**
         * Toggle an expandable panel
         * @this {ExpandableTooltipApplication}
         * @param {Event} event - Triggering event
         * @param {HTMLElement} target - Action target
         * @private
         */
        static #toggleExpandable(this: ExpandableTooltipApplication, event: Event, target: HTMLElement): void {
            event.preventDefault();
            event.stopPropagation();

            const panelId = target.dataset['targetId'];
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
        #openPanel(panelId: string): void {
            const wrapper = this.element.querySelector(`[data-expandable-id="${panelId}"]`);
            if (!wrapper) return;

            const trigger = wrapper.querySelector('.wh40k-expandable');
            const panel = wrapper.querySelector('.wh40k-expansion-panel');

            if (trigger && panel) {
                trigger.classList.add('wh40k-expandable--expanded');
                panel.classList.add('wh40k-expansion-panel--open', 'tw-animate-slideDown');
                this.#openPanels.add(panelId);

                // Enrich content if needed
                void this.#enrichPanelContent(panel as HTMLElement);
            }
        }

        /**
         * Close an expandable panel
         * @param {string} panelId - Panel identifier
         * @private
         */
        #closePanel(panelId: string): void {
            const wrapper = this.element.querySelector(`[data-expandable-id="${panelId}"]`);
            if (!wrapper) return;

            const trigger = wrapper.querySelector('.wh40k-expandable');
            const panel = wrapper.querySelector('.wh40k-expansion-panel');

            if (trigger && panel) {
                trigger.classList.remove('wh40k-expandable--expanded');
                panel.classList.remove('wh40k-expansion-panel--open', 'tw-animate-slideDown');
                this.#openPanels.delete(panelId);
            }
        }

        /**
         * Close all open panels
         * @private
         */
        #closeAllPanels(): void {
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
        async #enrichPanelContent(panel: HTMLElement): Promise<void> {
            const unenriched = panel.querySelectorAll<HTMLElement>('[data-enrich="true"]');
            if (unenriched.length === 0) return;

            for (const element of unenriched) {
                const content = element.innerHTML;
                const enriched = await TextEditor.enrichHTML(content, {
                    relativeTo: (this as unknown as { document: foundry.abstract.Document.Any }).document,
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
        _attachPartListeners(partId: string, htmlElement: HTMLElement, options: ApplicationV2Config.RenderOptions): void {
            const prototype = Object.getPrototypeOf(ExpandableTooltipApplication.prototype) as {
                _attachPartListeners?: (
                    this: ExpandableTooltipApplication,
                    partId: string,
                    htmlElement: HTMLElement,
                    options: ApplicationV2Config.RenderOptions,
                ) => void;
            };
            prototype._attachPartListeners?.call(this, partId, htmlElement, options);

            // Close panels on Escape key
            htmlElement.addEventListener('keydown', (event: KeyboardEvent) => {
                if (event.key === 'Escape' && this.#openPanels.size > 0) {
                    event.preventDefault();
                    this.#closeAllPanels();
                }
            });

            // Close panels when clicking outside
            htmlElement.addEventListener('click', (event: MouseEvent) => {
                const target = event.target as HTMLElement;
                const clickedExpandable = target.closest('.wh40k-expandable, .wh40k-expansion-panel');
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
        isPanelOpen(panelId: string): boolean {
            return this.#openPanels.has(panelId);
        }

        /**
         * Get all currently open panel IDs
         * @returns {string[]}
         */
        getOpenPanels(): string[] {
            return Array.from(this.#openPanels);
        }

        /**
         * Programmatically open a panel
         * @param {string} panelId - Panel identifier
         */
        openExpandable(panelId: string): void {
            this.#openPanel(panelId);
        }

        /**
         * Programmatically close a panel
         * @param {string} panelId - Panel identifier
         */
        closeExpandable(panelId: string): void {
            this.#closePanel(panelId);
        }
    };
}
