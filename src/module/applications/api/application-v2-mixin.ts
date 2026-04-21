/**
 * @file ApplicationV2Mixin - WH40K RPG V2 Application mixin
 * Based on dnd5e's ApplicationV2Mixin pattern for Foundry V13+
 */

import type { ApplicationV2Ctor, FoundryApplicationApiLike } from './application-types.ts';

const applicationAPI = (foundry.applications as unknown as { api: FoundryApplicationApiLike }).api;
const { HandlebarsApplicationMixin } = applicationAPI;

/**
 * Mixin method for ApplicationV2-based WH40K RPG applications.
 * @template {ApplicationV2} T
 * @param {T} Base   Application class being extended.
 * @returns {typeof BaseApplicationWH40K}
 * @mixin
 */
export default function ApplicationV2Mixin<T extends ApplicationV2Ctor>(Base: T) {
    class BaseApplicationWH40K extends HandlebarsApplicationMixin(Base) {
        constructor(...args: any[]) {
            super(...args);
        }

        /** @override */
        static DEFAULT_OPTIONS: Partial<ApplicationV2Config.DefaultOptions> = {
            actions: {
                toggleCollapsed: BaseApplicationWH40K.#toggleCollapsed,
            },
            classes: ['wh40k-rpg'],
            window: {
                subtitle: '',
            },
        };

        /* -------------------------------------------- */

        /**
         * @type {Record<string, ApplicationV2Config.PartConfiguration>}
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
            const options = (this as unknown as { options: { window?: { subtitle?: string } } }).options;
            return game.i18n.localize(options?.window?.subtitle ?? '');
        }

        /* -------------------------------------------- */
        /*  Rendering                                   */
        /* -------------------------------------------- */

        /** @inheritDoc */
        _configureRenderOptions(options: ApplicationV2Config.RenderOptions): void {
            super._configureRenderOptions(options);
            if (options.isFirstRender && (this as unknown as { hasFrame: boolean }).hasFrame) {
                options.window ||= {};
                options.window.subtitle ||= this.subtitle;
            }
        }

        /* -------------------------------------------- */

        /** @inheritDoc */
        async _onFirstRender(context: Record<string, unknown>, options: ApplicationV2Config.RenderOptions): Promise<void> {
            await super._onFirstRender(context, options);
            this._renderContainers(context, options);
        }

        /* -------------------------------------------- */

        /** @inheritDoc */
        async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<Record<string, unknown>> {
            const context = (await super._prepareContext(options as never)) as Record<string, unknown>;
            context.CONFIG = CONFIG.wh40k;
            return context;
        }

        /* -------------------------------------------- */

        /** @inheritDoc */
        async _preparePartContext(
            partId: string,
            context: Record<string, unknown>,
            options: ApplicationV2Config.RenderOptions,
        ): Promise<Record<string, unknown>> {
            const prototype = Object.getPrototypeOf(BaseApplicationWH40K.prototype) as {
                _preparePartContext?: (
                    this: BaseApplicationWH40K,
                    partId: string,
                    context: Record<string, unknown>,
                    options: ApplicationV2Config.RenderOptions,
                ) => Promise<Record<string, unknown>>;
            };
            return { ...((await prototype._preparePartContext?.call(this, partId, context, options)) ?? {}) };
        }

        /* -------------------------------------------- */

        /**
         * Lazily create containers and place parts appropriately.
         * @param {object} context  Render context.
         * @param {object} options  Render options.
         * @protected
         */
        _renderContainers(context: Record<string, unknown>, options: ApplicationV2Config.RenderOptions): void {
            const root = (this as unknown as { element: HTMLElement }).element;
            const containerElements = Array.from(root.querySelectorAll<HTMLElement>('[data-container-id]'));
            const containers: Record<string, HTMLElement> = Object.fromEntries(containerElements.map((el) => [el.dataset.containerId!, el]));
            for (const [part, config] of Object.entries((this.constructor as typeof BaseApplicationWH40K).PARTS)) {
                if (!config.container?.id) continue;
                const element = root.querySelector<HTMLElement>(`[data-application-part="${part}"]`);
                if (!element) continue;
                let container = containers[config.container.id];
                if (!container) {
                    const div = document.createElement('div');
                    div.dataset.containerId = config.container.id;
                    if (config.container.classes) div.classList.add(...config.container.classes);
                    container = containers[config.container.id] = div;
                    element.replaceWith(div);
                }
                if (element.parentElement !== container) container.append(element);
            }
        }

        /* -------------------------------------------- */

        /** @inheritDoc */
        _replaceHTML(result: Record<string, HTMLElement>, content: HTMLElement, options: ApplicationV2Config.RenderOptions): void {
            for (const part of Object.values(result)) {
                for (const element of part.querySelectorAll<HTMLElement>('[data-expand-id]')) {
                    const expandId = element.dataset.expandId;
                    if (expandId) {
                        element.querySelector('.collapsible')?.classList.toggle('collapsed', !this.#expandedSections.get(expandId));
                    }
                }
            }
            super._replaceHTML(result, content, options);
        }

        /* -------------------------------------------- */

        /** @inheritDoc */
        _updateFrame(options: ApplicationV2Config.RenderOptions): void {
            super._updateFrame(options);
            if (options.window?.subtitle) {
                const subtitle = (this as unknown as { element: HTMLElement }).element.querySelector('.window-header > .window-subtitle') as HTMLElement | null;
                if (subtitle) subtitle.innerText = options.window.subtitle;
            }
        }

        /* -------------------------------------------- */

        /** @inheritDoc */
        async _onRender(context: Record<string, unknown>, options: ApplicationV2Config.RenderOptions): Promise<void> {
            await super._onRender(context, options);

            // Add special styling for multi-select tags
            for (const select of (this as unknown as { element: HTMLElement }).element.querySelectorAll('multi-select')) {
                const multiSelect = select as HTMLInputElement;
                if (multiSelect.disabled) continue;
                for (const tag of select.querySelectorAll('.tag')) {
                    tag.classList.add('remove');
                    tag.querySelector(':scope > span')?.classList.add('remove');
                }
            }
        }

        /* -------------------------------------------- */

        /**
         * Disable form fields that aren't marked with the `always-interactive` class.
         */
        _disableFields(): void {
            const selector = `.window-content :is(${['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].join(', ')}):not(.always-interactive)`;
            for (const element of (this as unknown as { element: HTMLElement }).element.querySelectorAll<HTMLElement>(selector)) {
                if (element instanceof HTMLTextAreaElement) element.readOnly = true;
                else if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLButtonElement)
                    element.disabled = true;
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
            const expandId = (target.closest('[data-expand-id]') as HTMLElement | null)?.dataset.expandId;
            if (expandId) {
                this.#expandedSections.set(expandId, !collapsible.classList.contains('collapsed'));
            }
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
