/**
 * @file ApplicationV2Mixin - Rogue Trader V2 Application mixin
 * Based on dnd5e's ApplicationV2Mixin pattern for Foundry V13+
 */

const { HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Mixin method for ApplicationV2-based Rogue Trader applications.
 * @template {ApplicationV2} T
 * @param {typeof T} Base   Application class being extended.
 * @returns {typeof BaseApplicationRT}
 * @mixin
 */
export default function ApplicationV2Mixin(Base) {
    class BaseApplicationRT extends HandlebarsApplicationMixin(Base) {
        /** @override */
        static DEFAULT_OPTIONS = {
            actions: {
                toggleCollapsed: BaseApplicationRT.#toggleCollapsed
            },
            classes: ["rogue-trader"],
            window: {
                subtitle: ""
            }
        };

        /* -------------------------------------------- */

        /**
         * @type {Record<string, HandlebarsTemplatePart>}
         */
        static PARTS = {};

        /* -------------------------------------------- */
        /*  Properties                                  */
        /* -------------------------------------------- */

        /**
         * Expanded states for collapsible sections to persist between renders.
         * @type {Map<string, boolean>}
         */
        #expandedSections = new Map();

        get expandedSections() {
            return this.#expandedSections;
        }

        /* -------------------------------------------- */

        /**
         * A reference to the window subtitle.
         * @type {string}
         */
        get subtitle() {
            return game.i18n.localize(this.options.window.subtitle ?? "");
        }

        /* -------------------------------------------- */
        /*  Rendering                                   */
        /* -------------------------------------------- */

        /** @inheritDoc */
        _configureRenderOptions(options) {
            super._configureRenderOptions(options);
            if (options.isFirstRender && this.hasFrame) {
                options.window ||= {};
                options.window.subtitle ||= this.subtitle;
            }
        }

        /* -------------------------------------------- */

        /** @inheritDoc */
        _onFirstRender(context, options) {
            super._onFirstRender(context, options);
            this._renderContainers(context, options);
        }

        /* -------------------------------------------- */

        /** @inheritDoc */
        async _prepareContext(options) {
            const context = await super._prepareContext(options);
            context.CONFIG = CONFIG.rt;
            return context;
        }

        /* -------------------------------------------- */

        /** @inheritDoc */
        async _preparePartContext(partId, context, options) {
            return { ...await super._preparePartContext(partId, context, options) };
        }

        /* -------------------------------------------- */

        /**
         * Lazily create containers and place parts appropriately.
         * @param {object} context  Render context.
         * @param {object} options  Render options.
         * @protected
         */
        _renderContainers(context, options) {
            const containerElements = Array.from(this.element.querySelectorAll("[data-container-id]"));
            const containers = Object.fromEntries(containerElements.map(el => [el.dataset.containerId, el]));
            for (const [part, config] of Object.entries(this.constructor.PARTS)) {
                if (!config.container?.id) continue;
                const element = this.element.querySelector(`[data-application-part="${part}"]`);
                if (!element) continue;
                let container = containers[config.container.id];
                if (!container) {
                    const div = document.createElement("div");
                    div.dataset.containerId = config.container.id;
                    div.classList.add(...config.container.classes ?? []);
                    container = containers[config.container.id] = div;
                    element.replaceWith(div);
                }
                if (element.parentElement !== container) container.append(element);
            }
        }

        /* -------------------------------------------- */

        /** @inheritDoc */
        _replaceHTML(result, content, options) {
            for (const part of Object.values(result)) {
                for (const element of part.querySelectorAll("[data-expand-id]")) {
                    element.querySelector(".collapsible")?.classList
                        .toggle("collapsed", !this.#expandedSections.get(element.dataset.expandId));
                }
            }
            super._replaceHTML(result, content, options);
        }

        /* -------------------------------------------- */

        /** @inheritDoc */
        _updateFrame(options) {
            super._updateFrame(options);
            if (options.window && ("subtitle" in options.window)) {
                const subtitle = this.element.querySelector(".window-header > .window-subtitle");
                if (subtitle) subtitle.innerText = options.window.subtitle;
            }
        }

        /* -------------------------------------------- */

        /** @inheritDoc */
        _onRender(context, options) {
            super._onRender(context, options);

            // Add special styling for multi-select tags
            this.element.querySelectorAll("multi-select").forEach(select => {
                if (select.disabled) return;
                select.querySelectorAll(".tag").forEach(tag => {
                    tag.classList.add("remove");
                    tag.querySelector(":scope > span")?.classList.add("remove");
                });
            });
        }

        /* -------------------------------------------- */

        /**
         * Disable form fields that aren't marked with the `always-interactive` class.
         */
        _disableFields() {
            const selector = `.window-content :is(${[
                "INPUT", "SELECT", "TEXTAREA", "BUTTON"
            ].join(", ")}):not(.always-interactive)`;
            for (const element of this.element.querySelectorAll(selector)) {
                if (element.tagName === "TEXTAREA") element.readOnly = true;
                else element.disabled = true;
            }
        }

        /* -------------------------------------------- */
        /*  Event Listeners and Handlers                */
        /* -------------------------------------------- */

        /**
         * Handle toggling the collapsed state of collapsible sections.
         * @this {BaseApplicationRT}
         * @param {Event} event         Triggering click event.
         * @param {HTMLElement} target  Button that was clicked.
         */
        static #toggleCollapsed(event, target) {
            const collapsible = target.closest(".collapsible");
            if (!collapsible || event.target.closest(".collapsible-content")) return;
            collapsible.classList.toggle("collapsed");
            this.#expandedSections.set(
                target.closest("[data-expand-id]")?.dataset.expandId,
                !collapsible.classList.contains("collapsed")
            );
        }
    }
    return BaseApplicationRT;
}
