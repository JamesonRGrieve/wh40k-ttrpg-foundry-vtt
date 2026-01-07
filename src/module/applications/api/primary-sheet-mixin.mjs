/**
 * @file PrimarySheetMixin - Adds V2 sheet functionality shared between primary document sheets
 * Based on dnd5e's PrimarySheetMixin pattern
 */

import DragDropMixin from "./drag-drop-mixin.mjs";

/**
 * Adds V2 sheet functionality shared between primary document sheets (Actors & Items).
 * @param {typeof DocumentSheet} Base  The base class being mixed.
 * @returns {typeof PrimarySheetRT}
 * @mixin
 */
export default function PrimarySheetMixin(Base) {
    return class PrimarySheetRT extends DragDropMixin(Base) {
        /** @override */
        static DEFAULT_OPTIONS = {
            actions: {
                editDocument: PrimarySheetRT.#showDocument,
                deleteDocument: PrimarySheetRT.#deleteDocument,
                showDocument: PrimarySheetRT.#showDocument
            }
        };

        /* -------------------------------------------- */

        /**
         * Sheet tabs.
         * @type {Array<{tab: string, label: string, icon?: string}>}
         */
        static TABS = [];

        /* -------------------------------------------- */

        /**
         * Available sheet modes.
         * @enum {number}
         */
        static MODES = {
            PLAY: 1,
            EDIT: 2
        };

        /* -------------------------------------------- */
        /*  Properties                                  */
        /* -------------------------------------------- */

        /**
         * Filters for applied inventory sections.
         * @type {Record<string, object>}
         */
        _filters = {};

        /* -------------------------------------------- */

        /**
         * The mode the sheet is currently in.
         * @type {PrimarySheetRT.MODES|null}
         * @protected
         */
        _mode = null;

        /* -------------------------------------------- */
        /*  Rendering                                   */
        /* -------------------------------------------- */

        /** @inheritDoc */
        _configureRenderOptions(options) {
            super._configureRenderOptions(options);

            // Set initial mode
            let { mode, renderContext } = options;
            if ((mode === undefined) && (renderContext === "createItem")) mode = this.constructor.MODES.EDIT;
            this._mode = mode ?? this._mode ?? this.constructor.MODES.PLAY;
        }

        /* -------------------------------------------- */

        /** @inheritDoc */
        _configureRenderParts(options) {
            const parts = super._configureRenderParts(options);
            for (const key of Object.keys(parts)) {
                const tab = this.constructor.TABS.find(t => t.tab === key);
                if (tab?.condition && !tab.condition(this.document)) delete parts[key];
            }
            return parts;
        }

        /* -------------------------------------------- */

        /** @inheritDoc */
        async _renderFrame(options) {
            const html = await super._renderFrame(options);
            if (!game.user.isGM && this.document.limited) html.classList.add("limited");
            return html;
        }

        /* -------------------------------------------- */

        /**
         * Handle re-rendering the mode toggle on ownership changes.
         * @protected
         */
        _renderModeToggle() {
            const header = this.element.querySelector(".window-header");
            const toggle = header?.querySelector(".mode-slider");
            if (this.isEditable && !toggle) {
                const newToggle = document.createElement("slide-toggle");
                newToggle.checked = this._mode === this.constructor.MODES.EDIT;
                newToggle.classList.add("mode-slider");
                newToggle.dataset.tooltip = "RT.SheetModeEdit";
                newToggle.setAttribute("aria-label", game.i18n.localize("RT.SheetModeEdit"));
                newToggle.addEventListener("change", this._onChangeSheetMode.bind(this));
                newToggle.addEventListener("dblclick", event => event.stopPropagation());
                newToggle.addEventListener("pointerdown", event => event.stopPropagation());
                header.prepend(newToggle);
            } else if (this.isEditable && toggle) {
                toggle.checked = this._mode === this.constructor.MODES.EDIT;
            } else if (!this.isEditable && toggle) {
                toggle.remove();
            }
        }

        /* -------------------------------------------- */

        /** @inheritDoc */
        async _prepareContext(options) {
            const context = await super._prepareContext(options);
            context.owner = this.document.isOwner;
            context.locked = !this.isEditable;
            context.editable = this.isEditable && (this._mode === this.constructor.MODES.EDIT);
            context.tabs = this._getTabs();
            return context;
        }

        /* -------------------------------------------- */

        /** @inheritDoc */
        async _preparePartContext(partId, context, options) {
            context = await super._preparePartContext(partId, context, options);
            context.tab = context.tabs[partId];
            return context;
        }

        /* -------------------------------------------- */

        /**
         * Prepare the tab information for the sheet.
         * @returns {Record<string, object>}
         * @protected
         */
        _getTabs() {
            return this.constructor.TABS.reduce((tabs, { tab, condition, ...config }) => {
                if (!condition || condition(this.document)) tabs[tab] = {
                    ...config,
                    id: tab,
                    group: "primary",
                    active: this.tabGroups.primary === tab,
                    cssClass: this.tabGroups.primary === tab ? "active" : ""
                };
                return tabs;
            }, {});
        }

        /* -------------------------------------------- */
        /*  Life-Cycle Handlers                         */
        /* -------------------------------------------- */

        /** @inheritDoc */
        async _onFirstRender(context, options) {
            await super._onFirstRender(context, options);
            if (this.tabGroups.primary) this.element.classList.add(`tab-${this.tabGroups.primary}`);
        }

        /* -------------------------------------------- */

        /** @inheritDoc */
        async _onRender(context, options) {
            await super._onRender(context, options);

            // Set toggle state and add status class to frame
            this._renderModeToggle();
            this.element.classList.toggle("editable", this.isEditable && (this._mode === this.constructor.MODES.EDIT));
            this.element.classList.toggle("interactable", this.isEditable && (this._mode === this.constructor.MODES.PLAY));
            this.element.classList.toggle("locked", !this.isEditable);

            if (this.isEditable) {
                // Automatically select input contents when focused
                this.element.querySelectorAll("input").forEach(e => e.addEventListener("focus", e.select));
            }

            // Prevent inputs from firing drag listeners.
            this.element.querySelectorAll(".draggable input").forEach(el => {
                el.draggable = true;
                el.ondragstart = event => {
                    event.preventDefault();
                    event.stopPropagation();
                };
            });
            
            // Activate legacy V1-style tabs for templates that use data-tab/data-group
            this._activateLegacyTabs();
        }

        /* -------------------------------------------- */
        
        /**
         * Activate legacy V1-style tabs that use data-tab and data-group attributes.
         * This provides compatibility for templates not yet migrated to V2 tab patterns.
         * @protected
         */
        _activateLegacyTabs() {
            const tabsConfig = this.options.tabs ?? [];
            for (const config of tabsConfig) {
                const { navSelector, contentSelector, initial } = config;
                const nav = this.element.querySelector(navSelector);
                const content = this.element.querySelector(contentSelector);
                if (!nav || !content) continue;
                
                // Get current active tab from tabGroups or use initial
                const group = nav.dataset.group || "primary";
                const activeTab = this.tabGroups?.[group] ?? initial;
                
                // Set up tab click handlers
                nav.querySelectorAll("[data-tab]").forEach(tabLink => {
                    tabLink.addEventListener("click", event => {
                        event.preventDefault();
                        const tab = tabLink.dataset.tab;
                        this._activateTab(tab, group, nav, content);
                    });
                });
                
                // Activate initial tab
                if (activeTab) {
                    this._activateTab(activeTab, group, nav, content);
                }
            }
        }
        
        /**
         * Activate a specific tab.
         * @param {string} tab         The tab identifier.
         * @param {string} group       The tab group.
         * @param {HTMLElement} nav    The navigation element.
         * @param {HTMLElement} content The content container.
         * @protected
         */
        _activateTab(tab, group, nav, content) {
            // Update tabGroups tracking
            if (this.tabGroups) this.tabGroups[group] = tab;
            
            // Update nav active states
            nav.querySelectorAll("[data-tab]").forEach(link => {
                const isActive = link.dataset.tab === tab;
                link.classList.toggle("active", isActive);
                link.closest(".rt-navigation__item, .rt-nav-item")?.classList.toggle("active", isActive);
            });
            
            // Update content tab visibility
            content.querySelectorAll(":scope > [data-tab]").forEach(tabContent => {
                const isActive = tabContent.dataset.tab === tab;
                tabContent.classList.toggle("active", isActive);
            });
            
            // Update application element class
            this.element.className = this.element.className.replace(/\btab-\w+/g, "");
            this.element.classList.add(`tab-${tab}`);
        }

        /* -------------------------------------------- */

        /**
         * Animate a stat element to show a value change.
         * @param {HTMLElement} element  The element to animate.
         * @param {string} type          Animation type: "increase", "decrease", "changed", "critical", "success".
         */
        animateStatChange(element, type = "changed") {
            if (!element) return;
            
            const animClass = `rt-stat-${type}`;
            
            // Remove any existing animation classes
            element.classList.remove("rt-stat-increase", "rt-stat-decrease", "rt-stat-changed", "rt-stat-critical", "rt-stat-success");
            
            // Force reflow to restart animation
            void element.offsetWidth;
            
            // Add the animation class
            element.classList.add(animClass);
            
            // Remove the class after animation completes (unless it's a persistent one)
            if (type !== "critical") {
                element.addEventListener("animationend", () => {
                    element.classList.remove(animClass);
                }, { once: true });
            }
        }

        /* -------------------------------------------- */

        /**
         * Animate a numeric value change with direction detection.
         * @param {HTMLElement} element  The element containing the value.
         * @param {number} oldValue      The previous value.
         * @param {number} newValue      The new value.
         */
        animateValueChange(element, oldValue, newValue) {
            if (!element || oldValue === newValue) return;
            
            const type = newValue > oldValue ? "increase" : "decrease";
            this.animateStatChange(element, type);
        }

        /* -------------------------------------------- */
        /*  Event Listeners & Handlers                  */
        /* -------------------------------------------- */

        /**
         * Handle creating a new embedded child.
         * @param {Event} event         Triggering click event.
         * @param {HTMLElement} target  Button that was clicked.
         * @returns {any}
         * @protected
         * @abstract
         */
        _addDocument(event, target) {}

        /* -------------------------------------------- */

        /** @inheritDoc */
        changeTab(tab, group, options) {
            super.changeTab(tab, group, options);
            if (group !== "primary") return;
            this.element.className = this.element.className.replace(/tab-\w+/g, "");
            this.element.classList.add(`tab-${tab}`);
        }

        /* -------------------------------------------- */

        /**
         * Handle removing a document.
         * @this {PrimarySheetRT}
         * @param {Event} event         Triggering click event.
         * @param {HTMLElement} target  Button that was clicked.
         */
        static async #deleteDocument(event, target) {
            if (await this._deleteDocument(event, target) === false) return;
            const uuid = target.closest("[data-uuid]")?.dataset.uuid;
            const doc = await fromUuid(uuid);
            doc?.deleteDialog();
        }

        /* -------------------------------------------- */

        /**
         * Handle removing a document.
         * @param {Event} event         Triggering click event.
         * @param {HTMLElement} target  Button that was clicked.
         * @returns {any}               Return `false` to prevent default behavior.
         */
        async _deleteDocument(event, target) {}

        /* -------------------------------------------- */

        /**
         * Handle the user toggling the sheet mode.
         * @param {Event} event  The triggering event.
         * @protected
         */
        async _onChangeSheetMode(event) {
            const { MODES } = this.constructor;
            const toggle = event.currentTarget;
            const label = game.i18n.localize(`RT.SheetMode${toggle.checked ? "Play" : "Edit"}`);
            toggle.dataset.tooltip = label;
            toggle.setAttribute("aria-label", label);
            this._mode = toggle.checked ? MODES.EDIT : MODES.PLAY;
            await this.submit();
            this.render();
        }

        /* -------------------------------------------- */

        /** @inheritDoc */
        _onClickAction(event, target) {
            if (target.dataset.action === "addDocument") this._addDocument(event, target);
            else super._onClickAction(event, target);
        }

        /* -------------------------------------------- */

        /**
         * Handle opening a document sheet.
         * @this {PrimarySheetRT}
         * @param {Event} event         Triggering click event.
         * @param {HTMLElement} target  Button that was clicked.
         */
        static async #showDocument(event, target) {
            if (await this._showDocument(event, target) === false) return;
            if ([HTMLInputElement, HTMLSelectElement].some(el => event.target instanceof el)) return;
            const uuid = target.closest("[data-uuid]")?.dataset.uuid;
            const doc = await fromUuid(uuid);
            doc?.sheet?.render({ force: true });
        }

        /* -------------------------------------------- */

        /**
         * Handle opening a document sheet.
         * @param {Event} event         Triggering click event.
         * @param {HTMLElement} target  Button that was clicked.
         * @returns {any}               Return `false` to prevent default behavior.
         */
        async _showDocument(event, target) {}

        /* -------------------------------------------- */
        /*  Sorting                                     */
        /* -------------------------------------------- */

        /**
         * Sort child embedded documents by the given sort mode.
         * @param {string} collection  The embedded collection name.
         * @param {string} mode        The sort mode.
         * @returns {Document[]}
         * @protected
         */
        _sortChildren(collection, mode) {
            return [];
        }

        /* -------------------------------------------- */

        /**
         * Sort Items by the given sort mode.
         * @param {Item[]} items  The items to sort.
         * @param {string} mode   The sort mode.
         * @returns {Item[]}
         * @protected
         */
        _sortItems(items, mode) {
            return items.sort((a, b) => a.sort - b.sort);
        }
    };
}
