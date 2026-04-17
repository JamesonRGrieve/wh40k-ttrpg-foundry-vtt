/**
 * @file ApplicationV2Mixin - WH40K RPG V2 Application mixin
 * Based on dnd5e's ApplicationV2Mixin pattern for Foundry V13+
 */

const { HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Mixin method for ApplicationV2-based WH40K RPG applications.
 * @template {ApplicationV2} T
 * @param {typeof T} Base   Application class being extended.
 * @returns {typeof BaseApplicationWH40K}
 * @mixin
 */
export default function ApplicationV2Mixin<T extends new (...args: any[]) => any>(Base: T) {
    // @ts-expect-error - Mixin chain loses type information
    class BaseApplicationWH40K extends HandlebarsApplicationMixin(Base) {
        [key: string]: any;
        /** @override */
        static DEFAULT_OPTIONS: Partial<ApplicationV2Config.DefaultOptions> = {
            /* eslint-disable @typescript-eslint/unbound-method */
            actions: {
                toggleCollapsed: BaseApplicationWH40K.#toggleCollapsed,
            },
            /* eslint-enable @typescript-eslint/unbound-method */
            classes: ['wh40k-rpg'],
            window: {
                subtitle: '',
            },
        };

        /* -------------------------------------------- */

        /**
         * @type {Record<string, HandlebarsTemplatePart>}
         */
        static PARTS: Record<string, ApplicationV2Config.PartConfiguration> = {};

        /* -------------------------------------------- */
        /*  Properties                                  */
        /* -------------------------------------------- */

        /**
         * Expanded states for collapsible sections to persist between renders.
         * @type {Map<string, boolean>}
         */
        #expandedSections: Map<string, boolean> = new Map();

        get expandedSections(): Map<string, boolean> {
            return this.#expandedSections;
        }

        /* -------------------------------------------- */

        /**
         * A reference to the window subtitle.
         * @type {string}
         */
        get subtitle(): string {
            return game.i18n.localize(this.options?.window?.subtitle ?? '');
        }

        /* -------------------------------------------- */
        /*  Rendering                                   */
        /* -------------------------------------------- */

        /** @inheritDoc */
        _configureRenderOptions(options: Record<string, unknown>): void {
            super._configureRenderOptions(options);
            if (options.isFirstRender && this.hasFrame) {
                options.window ||= {};
                (options.window as Record<string, string>).subtitle ||= this.subtitle;
            }
        }

        /* -------------------------------------------- */

        /** @inheritDoc */
        _onFirstRender(context: Record<string, unknown>, options: Record<string, unknown>): void {
            // @ts-expect-error - Mixin chain super access
            super._onFirstRender(context, options);
            this._renderContainers(context, options);
        }

        /* -------------------------------------------- */

        /** @inheritDoc */
        async _prepareContext(options: Record<string, unknown>): Promise<Record<string, unknown>> {
            // @ts-expect-error - Mixin chain super access
            const context = await super._prepareContext(options);
            context.CONFIG = CONFIG.wh40k;
            return context;
        }

        /* -------------------------------------------- */

        /** @inheritDoc */
        async _preparePartContext(partId: string, context: Record<string, unknown>, options: Record<string, unknown>): Promise<Record<string, unknown>> {
            return { ...(await super._preparePartContext(partId, context, options)) };
        }

        /* -------------------------------------------- */

        /**
         * Lazily create containers and place parts appropriately.
         * @param {object} context  Render context.
         * @param {object} options  Render options.
         * @protected
         */
        _renderContainers(context: Record<string, unknown>, options: Record<string, unknown>): void {
            const containerElements = Array.from(this.element.querySelectorAll('[data-container-id]'));
            const containers = Object.fromEntries(containerElements.map((el) => [(el as HTMLElement).dataset.containerId, el]));
            for (const [part, config] of Object.entries((this.constructor as any).PARTS) as [string, any][]) {
                if (!config.container?.id) continue;
                const element = this.element.querySelector(`[data-application-part="${part}"]`);
                if (!element) continue;
                let container = containers[config.container.id];
                if (!container) {
                    const div = document.createElement('div');
                    div.dataset.containerId = config.container.id;
                    div.classList.add(...(config.container.classes ?? []));
                    container = containers[config.container.id] = div;
                    element.replaceWith(div);
                }
                if (element.parentElement !== container) (container as HTMLElement).append(element);
            }
        }

        /* -------------------------------------------- */

        /** @inheritDoc */
        _replaceHTML(result: Record<string, HTMLElement>, content: HTMLElement, options: Record<string, unknown>): void {
            for (const part of Object.values(result)) {
                for (const element of part.querySelectorAll('[data-expand-id]')) {
                    element
                        .querySelector('.collapsible')
                        ?.classList.toggle('collapsed', !this.#expandedSections.get((element as HTMLElement).dataset.expandId));
                }
            }
            super._replaceHTML(result, content, options as any);
        }

        /* -------------------------------------------- */

        /** @inheritDoc */
        _updateFrame(options: Record<string, unknown>): void {
            // @ts-expect-error - Mixin chain super access
            super._updateFrame(options);
            if (options.window && 'subtitle' in (options.window as object)) {
                const subtitle = this.element.querySelector('.window-header > .window-subtitle');
                if (subtitle) subtitle.innerText = ((options as any).window as any).subtitle;
            }
        }

        /* -------------------------------------------- */

        /** @inheritDoc */
        _onRender(context: Record<string, unknown>, options: Record<string, unknown>): void | Promise<void> {
            // @ts-expect-error - Mixin chain super access
            super._onRender(context, options);

            // Add special styling for multi-select tags
            this.element.querySelectorAll('multi-select').forEach((select) => {
                if (select.disabled) return;
                select.querySelectorAll('.tag').forEach((tag) => {
                    tag.classList.add('remove');
                    tag.querySelector(':scope > span')?.classList.add('remove');
                });
            });
        }

        /* -------------------------------------------- */

        /**
         * Disable form fields that aren't marked with the `always-interactive` class.
         */
        _disableFields(): void {
            const selector = `.window-content :is(${['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].join(', ')}):not(.always-interactive)`;
            for (const element of this.element.querySelectorAll(selector)) {
                if (element.tagName === 'TEXTAREA') element.readOnly = true;
                else element.disabled = true;
            }
        }

        /* -------------------------------------------- */
        /*  Event Listeners and Handlers                */
        /* -------------------------------------------- */

        /**
         * Handle toggling the collapsed state of collapsible sections.
         * @this {BaseApplicationWH40K}
         * @param {Event} event         Triggering click event.
         * @param {HTMLElement} target  Button that was clicked.
         */
        static #toggleCollapsed(this: BaseApplicationWH40K, event: Event, target: HTMLElement): void {
            const collapsible = target.closest('.collapsible');
            if (!collapsible || (event.target as HTMLElement).closest('.collapsible-content')) return;
            collapsible.classList.toggle('collapsed');
            this.#expandedSections.set(
                (target.closest('[data-expand-id]') as HTMLElement | null)?.dataset.expandId,
                !collapsible.classList.contains('collapsed'),
            );
        }
    }
    return BaseApplicationWH40K;
}

/* -------------------------------------------- */

/**
 * Auto-select number input contents on focus for easy editing.
 * Call from _onRender in any ApplicationV2-based application.
 * @param {Element} element  The application's root element.
 */
export function setupNumberInputAutoSelect(element: Element): void {
    element.querySelectorAll('input[type="number"], input[data-dtype="Number"]').forEach((input) => {
        input.addEventListener('focus', (event) => {
            (event.target as HTMLInputElement).select();
        });
    });
}
