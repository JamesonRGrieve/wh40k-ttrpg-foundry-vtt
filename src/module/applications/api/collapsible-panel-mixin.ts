/**
 * @file CollapsiblePanelMixin - Enhanced collapsible panels with state persistence
 * Provides collapsible sections that remember their state across sessions
 */

import type { ApplicationV2Ctor } from './application-types.ts';
import type { BaseActorSheetMixins } from './sheet-mixin-types.js';

interface CollapsiblePanelConfig {
    label: string;
    icon: string;
    panels: Record<string, boolean>;
}

/**
 * Mixin to add enhanced collapsible panel capabilities.
 * @template {ApplicationV2} T
 * @param {T} Base   Application class being extended.
 * @returns {any}
 * @mixin
 */
export default function CollapsiblePanelMixin<T extends ApplicationV2Ctor>(Base: T) {
    class CollapsiblePanelApplication extends Base {
        constructor(...args: any[]) {
            super(...args);
        }

        /* -------------------------------------------- */
        /*  Properties                                  */
        /* -------------------------------------------- */

        /**
         * The flag scope for storing panel states.
         * @type {string}
         * @protected
         */
        static PANEL_FLAG_SCOPE: string = 'wh40k-rpg.panels';

        /* -------------------------------------------- */

        /**
         * Preset panel configurations for quick access.
         * @type {Object<string, CollapsiblePanelConfig>}
         * @protected
         */
        static PANEL_PRESETS: Record<string, CollapsiblePanelConfig> = {
            combat: {
                label: 'Combat Mode',
                icon: 'fa-sword',
                panels: {
                    'characteristics': true,
                    'skills': false,
                    'weapons': true,
                    'armor': true,
                    'talents': false,
                    'equipment': false,
                    'psychic-powers': false,
                    'biography': false,
                },
            },
            social: {
                label: 'Social Mode',
                icon: 'fa-users',
                panels: {
                    'characteristics': true,
                    'skills': true,
                    'weapons': false,
                    'armor': false,
                    'talents': true,
                    'equipment': false,
                    'psychic-powers': false,
                    'biography': true,
                },
            },
            exploration: {
                label: 'Exploration Mode',
                icon: 'fa-map',
                panels: {
                    'characteristics': true,
                    'skills': true,
                    'weapons': true,
                    'armor': true,
                    'talents': false,
                    'equipment': true,
                    'psychic-powers': false,
                    'biography': false,
                },
            },
            all: {
                label: 'Expand All',
                icon: 'fa-expand',
                panels: {}, // Will expand all panels
            },
            none: {
                label: 'Collapse All',
                icon: 'fa-compress',
                panels: {}, // Will collapse all panels
            },
        };

        /* -------------------------------------------- */
        /*  Lifecycle Methods                           */
        /* -------------------------------------------- */

        /** @override */
        async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<Record<string, unknown>> {
            const context = (await super._prepareContext(options as never)) as Record<string, unknown>;

            // Load saved panel states
            this._loadPanelStates();

            // Add panel state to context
            context.panelStates = this._getPanelStates();
            context.panelPresets = (this.constructor as typeof CollapsiblePanelApplication).PANEL_PRESETS;

            return context;
        }

        /* -------------------------------------------- */

        /** @override */
        async _onRender(context: Record<string, unknown>, options: ApplicationV2Config.RenderOptions): Promise<void> {
            await super._onRender(context, options);

            // Apply saved panel states to DOM
            this._applyPanelStates();

            // Setup keyboard shortcuts if first render
            if (options.isFirstRender) {
                this._setupPanelKeyboardShortcuts();
            }
        }

        /* -------------------------------------------- */
        /*  Panel State Management                      */
        /* -------------------------------------------- */

        /**
         * Load panel states from user flags.
         * @returns {void}
         * @protected
         */
        _loadPanelStates(): void {
            if (!game.user) return;

            const flagKey = this._getPanelFlagKey();
            const savedStates = (game.user.getFlag('wh40k-rpg', flagKey) as Record<string, boolean> | undefined) || {};

            // Merge with current states
            const actorSheet = this as unknown as BaseActorSheetMixins;
            Object.entries(savedStates).forEach(([panelId, isExpanded]) => {
                if (actorSheet.expandedSections) {
                    actorSheet.expandedSections.set(panelId, isExpanded);
                }
            });
        }

        /* -------------------------------------------- */

        /**
         * Save panel state to user flags.
         * @param {string} panelId      Panel identifier
         * @param {boolean} isExpanded  Whether panel is expanded
         * @returns {Promise<void>}
         * @protected
         */
        async _savePanelState(panelId: string, isExpanded: boolean): Promise<void> {
            if (!game.user || !panelId) return;

            const flagKey = this._getPanelFlagKey();
            const currentStates = (game.user.getFlag('wh40k-rpg', flagKey) as Record<string, boolean> | undefined) || {};

            currentStates[panelId] = isExpanded;

            await game.user.setFlag('wh40k-rpg', flagKey, currentStates);
        }

        /* -------------------------------------------- */

        /**
         * Get the flag key for this application's panel states.
         * @returns {string}
         * @protected
         */
        _getPanelFlagKey(): string {
            const sheet = this as unknown as BaseActorSheetMixins;
            // Use document UUID if available for per-actor settings
            if (sheet.document) {
                return `panelStates.${sheet.document.documentName}.${sheet.document.id}`;
            }
            // Otherwise use application ID for global settings
            return `panelStates.${(this as unknown as { id?: string | number }).id ?? 'global'}`;
        }

        /* -------------------------------------------- */

        /**
         * Get current panel states.
         * @returns {Record<string, boolean>}
         * @protected
         */
        _getPanelStates(): Record<string, boolean> {
            const sheet = this as unknown as BaseActorSheetMixins;
            if (!sheet.expandedSections) return {};

            const states: Record<string, boolean> = {};
            sheet.expandedSections.forEach((isExpanded: boolean, panelId: string) => {
                states[panelId] = isExpanded;
            });

            return states;
        }

        /* -------------------------------------------- */

        /**
         * Apply saved panel states to DOM elements.
         * @protected
         */
        _applyPanelStates(): void {
            const sheet = this as unknown as BaseActorSheetMixins;
            if (!sheet.expandedSections) return;

            sheet.expandedSections.forEach((isExpanded, panelId) => {
                const panel = this.element.querySelector(`[data-panel-id="${panelId}"]`);
                if (!panel) return;

                if (isExpanded) {
                    panel.classList.remove('collapsed');
                } else {
                    panel.classList.add('collapsed');
                }
            });
        }

        /* -------------------------------------------- */
        /*  Panel Actions                               */
        /* -------------------------------------------- */

        /**
         * Toggle a collapsible panel.
         * @param {string} panelId          Panel identifier
         * @param {boolean} [forceState]    Force expand (true) or collapse (false)
         * @returns {Promise<void>}
         */
        async togglePanel(panelId: string, forceState?: boolean): Promise<void> {
            const panel = this.element.querySelector(`[data-panel-id="${panelId}"]`) as HTMLElement | null;
            if (!panel) return;

            const isCurrentlyExpanded = !panel.classList.contains('collapsed');
            const willBeExpanded = forceState ?? !isCurrentlyExpanded;

            // Animate the transition
            await this._animatePanelToggle(panel, willBeExpanded);

            // Update state
            const sheet = this as unknown as BaseActorSheetMixins;
            if (sheet.expandedSections) {
                sheet.expandedSections.set(panelId, willBeExpanded);
            }

            // Save to user flags
            await this._savePanelState(panelId, willBeExpanded);
        }

        /* -------------------------------------------- */

        /**
         * Expand all panels.
         * @returns {Promise<void>}
         */
        async expandAllPanels(): Promise<void> {
            const panels = this.element.querySelectorAll<HTMLElement>('[data-panel-id]');

            for (const panel of panels) {
                const panelId = panel.dataset.panelId;
                if (panelId) await this.togglePanel(panelId, true);
            }
        }

        /* -------------------------------------------- */

        /**
         * Collapse all panels.
         * @returns {Promise<void>}
         */
        async collapseAllPanels(): Promise<void> {
            const panels = this.element.querySelectorAll<HTMLElement>('[data-panel-id]');

            for (const panel of panels) {
                const panelId = panel.dataset.panelId;
                if (panelId) await this.togglePanel(panelId, false);
            }
        }

        /* -------------------------------------------- */

        /**
         * Apply a preset panel configuration.
         * @param {string} presetName   Name of preset ("combat", "social", etc.)
         * @returns {Promise<void>}
         */
        async applyPanelPreset(presetName: string): Promise<void> {
            const preset = (this.constructor as typeof CollapsiblePanelApplication).PANEL_PRESETS[presetName];
            if (!preset) return;

            // Special handling for "all" and "none"
            if (presetName === 'all') {
                await this.expandAllPanels();
                return;
            }
            if (presetName === 'none') {
                await this.collapseAllPanels();
                return;
            }

            // Apply preset states
            const panels = this.element.querySelectorAll<HTMLElement>('[data-panel-id]');

            for (const panel of panels) {
                const panelId = panel.dataset.panelId;
                if (panelId) {
                    const shouldExpand = preset.panels[panelId] ?? false;
                    await this.togglePanel(panelId, shouldExpand);
                }
            }

            // Show notification
            ui.notifications.info(`Applied ${preset.label} panel layout`);
        }

        /* -------------------------------------------- */

        /**
         * Collapse all panels except the specified one.
         * @param {string} exceptPanelId    Panel ID to keep expanded
         * @returns {Promise<void>}
         */
        async collapseAllExcept(exceptPanelId: string): Promise<void> {
            const panels = this.element.querySelectorAll<HTMLElement>('[data-panel-id]');

            for (const panel of panels) {
                const panelId = panel.dataset.panelId;
                if (panelId) {
                    const shouldExpand = panelId === exceptPanelId;
                    await this.togglePanel(panelId, shouldExpand);
                }
            }
        }

        /* -------------------------------------------- */
        /*  Animation                                   */
        /* -------------------------------------------- */

        /**
         * Animate panel expand/collapse transition.
         * @param {HTMLElement} panel       Panel element
         * @param {boolean} willBeExpanded  Target state
         * @returns {Promise<void>}
         * @protected
         */
        async _animatePanelToggle(panel: HTMLElement, willBeExpanded: boolean): Promise<void> {
            const content = panel.querySelector('.panel-content, .collapsible-content') as HTMLElement | null;
            if (!content) {
                // No animated content, just toggle class
                panel.classList.toggle('collapsed', !willBeExpanded);
                return;
            }

            // Get height for animation
            const startHeight = content.scrollHeight;

            if (willBeExpanded) {
                // Expanding: remove collapsed class first
                panel.classList.remove('collapsed');

                // Animate from 0 to full height
                content.style.maxHeight = '0px';
                content.style.overflow = 'hidden';

                // Force reflow
                void content.offsetHeight;

                // Animate
                content.style.transition = 'max-height 0.3s ease-out';
                content.style.maxHeight = `${startHeight}px`;

                // Wait for animation
                await new Promise((resolve) => {
                    setTimeout(resolve, 300);
                });

                // Clean up
                content.style.maxHeight = '';
                content.style.overflow = '';
                content.style.transition = '';
            } else {
                // Collapsing: animate to 0 then add collapsed class
                content.style.maxHeight = `${startHeight}px`;
                content.style.overflow = 'hidden';

                // Force reflow
                void content.offsetHeight;

                // Animate
                content.style.transition = 'max-height 0.3s ease-out';
                content.style.maxHeight = '0px';

                // Wait for animation
                await new Promise((resolve) => {
                    setTimeout(resolve, 300);
                });

                // Add collapsed class
                panel.classList.add('collapsed');

                // Clean up
                content.style.maxHeight = '';
                content.style.overflow = '';
                content.style.transition = '';
            }
        }

        /* -------------------------------------------- */
        /*  Keyboard Shortcuts                          */
        /* -------------------------------------------- */

        /**
         * Setup keyboard shortcuts for panel navigation.
         * @protected
         */
        _setupPanelKeyboardShortcuts(): void {
            // Alt+1-9 for quick panel access
            this.element.addEventListener('keydown', (event: KeyboardEvent) => {
                if (!event.altKey || event.ctrlKey || event.shiftKey || event.metaKey) return;

                const num = parseInt(event.key);
                if (isNaN(num) || num < 1 || num > 9) return;

                event.preventDefault();
                event.stopPropagation();

                // Get the Nth panel
                const panels = Array.from(this.element.querySelectorAll<HTMLElement>('[data-panel-id]'));
                const panelEl = panels[num - 1];

                if (panelEl) {
                    const panelId = panelEl.dataset.panelId;
                    if (panelId) {
                        void this.togglePanel(panelId);

                        // Scroll into view
                        panelEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    }
                }
            });
        }

        /* -------------------------------------------- */
        /*  Static Action Handlers                     */
        /* -------------------------------------------- */

        /**
         * Handle panel toggle action.
         * @this {CollapsiblePanelApplication}
         * @param {Event} event         Triggering event
         * @param {HTMLElement} target  Target element
         * @returns {Promise<void>}
         * @protected
         */
        static async _onTogglePanel(this: CollapsiblePanelApplication, event: Event, target: HTMLElement): Promise<void> {
            const panel = target.closest<HTMLElement>('[data-panel-id]');
            if (!panel) return;

            const panelId = panel.dataset.panelId;
            if (!panelId) return;

            // Shift+Click = Collapse all except this one
            if ((event as MouseEvent).shiftKey) {
                await this.collapseAllExcept(panelId);
                return;
            }

            // Regular click = Toggle this panel
            await this.togglePanel(panelId);
        }

        /* -------------------------------------------- */

        /**
         * Handle panel preset application.
         * @this {CollapsiblePanelApplication}
         * @param {Event} event         Triggering event
         * @param {HTMLElement} target  Target element
         * @returns {Promise<void>}
         * @protected
         */
        static async _onApplyPreset(this: CollapsiblePanelApplication, event: Event, target: HTMLElement): Promise<void> {
            const presetName = target.dataset.preset;
            if (!presetName) return;

            await this.applyPanelPreset(presetName);
        }
    }

    return CollapsiblePanelApplication;
}
