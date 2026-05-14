/**
 * @file ApplicationV2Mixin - WH40K RPG V2 Application mixin
 * Based on dnd5e's ApplicationV2Mixin pattern for Foundry V13+
 */

import type { ApplicationV2Ctor, FoundryApplicationApiLike } from './application-types.ts';

// eslint-disable-next-line no-restricted-syntax -- boundary: foundry.applications is untyped; cast required to reach api surface
const applicationAPI = (foundry.applications as unknown as { api: FoundryApplicationApiLike }).api;
// eslint-disable-next-line @typescript-eslint/unbound-method -- destructured from framework API object; used as a mixin factory, not as a method call
const { HandlebarsApplicationMixin } = applicationAPI;

/**
 * Mixin method for ApplicationV2-based WH40K RPG applications.
 * @template {ApplicationV2} T
 * @param {T} Base   Application class being extended.
 * @returns {typeof BaseApplicationWH40K}
 * @mixin
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- mixin factory: return type is the inner class, which cannot be named at the outer function scope
export default function ApplicationV2Mixin<T extends ApplicationV2Ctor>(Base: T) {
    class BaseApplicationWH40K extends HandlebarsApplicationMixin(Base) {
        /* eslint-disable @typescript-eslint/no-explicit-any -- mixin constructor must accept any[] to satisfy TS2545 mixin constraint */
        // biome-ignore lint/complexity/noUselessConstructor: required to forward any[] args per TS mixin rule (TS2545)
        // biome-ignore lint/suspicious/noExplicitAny: mixin constructor requires any[] per TS mixin rule (TS2545)
        constructor(...args: any[]) {
            /* eslint-enable @typescript-eslint/no-explicit-any */
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- spreading any[] is inherent to the mixin pattern (TS2545)
            super(...args);
        }

        /** @override */
        static DEFAULT_OPTIONS: Partial<ApplicationV2Config.DefaultOptions> = {
            actions: {
                // eslint-disable-next-line @typescript-eslint/unbound-method -- ApplicationV2 action map binds `this` at click-time; private static methods are safe here
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
        readonly #expandedSections: Map<string, boolean> = new Map();

        get expandedSections(): Map<string, boolean> {
            return this.#expandedSections;
        }

        /* -------------------------------------------- */

        /**
         * A reference to the window subtitle.
         * @type {string}
         */
        get subtitle(): string {
            // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 options are untyped; cast required to access window.subtitle
            const options = (this as unknown as { options: { window?: { subtitle?: string } } }).options;
            return game.i18n.localize(options.window?.subtitle ?? '');
        }

        /* -------------------------------------------- */
        /*  Rendering                                   */
        /* -------------------------------------------- */

        /** @inheritDoc */
        override _configureRenderOptions(options: ApplicationV2Config.RenderOptions): void {
            const prototype = Object.getPrototypeOf(BaseApplicationWH40K.prototype) as {
                _configureRenderOptions?: (this: BaseApplicationWH40K, options: ApplicationV2Config.RenderOptions) => void;
            };
            prototype._configureRenderOptions?.call(this, options);
            // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions, no-restricted-syntax -- boundary: isFirstRender is non-nullable in V14; hasFrame is a Foundry runtime property not in our types
            if (options.isFirstRender && (this as unknown as { hasFrame: boolean }).hasFrame) {
                // eslint-disable-next-line no-restricted-syntax -- boundary: ??= on options.window is Foundry V14 render-options init pattern
                options.window ??= {};
                // eslint-disable-next-line no-restricted-syntax -- boundary: ??= on options.window.subtitle is Foundry V14 render-options init pattern
                options.window.subtitle ??= this.subtitle;
            }
        }

        /* -------------------------------------------- */

        /** @inheritDoc */
        /* eslint-disable no-restricted-syntax -- boundary: prototype traversal casts; unknown in callback signatures is inherent to the mixin pattern */
        override async _onFirstRender(context: Record<string, unknown>, options: ApplicationV2Config.RenderOptions): Promise<void> {
            const prototype = Object.getPrototypeOf(BaseApplicationWH40K.prototype) as {
                _onFirstRender?: (this: BaseApplicationWH40K, context: Record<string, unknown>, options: ApplicationV2Config.RenderOptions) => Promise<void>;
            };
            /* eslint-enable no-restricted-syntax */
            await prototype._onFirstRender?.call(this, context, options);
            this._renderContainers(context, options);
        }

        /* -------------------------------------------- */

        /** @inheritDoc */
        /* eslint-disable no-restricted-syntax -- boundary: _prepareContext returns Foundry untyped context; Record<string,unknown> is the correct type at this API seam */
        override async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<Record<string, unknown>> {
            const context = (await super._prepareContext(options as never)) as Record<string, unknown>;
            /* eslint-enable no-restricted-syntax */
            context['CONFIG'] = CONFIG.wh40k;
            return context;
        }

        /* -------------------------------------------- */

        /** @inheritDoc */
        /* eslint-disable no-restricted-syntax -- boundary: _preparePartContext uses prototype traversal; unknown in signatures is inherent to the mixin pattern */
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
            /* eslint-enable no-restricted-syntax */
            return { ...((await prototype._preparePartContext?.call(this, partId, context, options)) ?? {}) };
        }

        /* -------------------------------------------- */

        /**
         * Lazily create containers and place parts appropriately.
         * @param {object} context  Render context.
         * @param {object} options  Render options.
         * @protected
         */
        // eslint-disable-next-line no-restricted-syntax -- boundary: _context is the Foundry render context object; Record<string, unknown> is the correct type at this API seam
        _renderContainers(_context: Record<string, unknown>, _options: ApplicationV2Config.RenderOptions): void {
            // eslint-disable-next-line no-restricted-syntax -- boundary: this.element is not on ApplicationV2Ctor; cast required to access runtime element
            const root = (this as unknown as { element: HTMLElement }).element;
            const containerElements = Array.from(root.querySelectorAll<HTMLElement>('[data-container-id]'));
            const containers: Record<string, HTMLElement> = Object.fromEntries(
                containerElements.flatMap((el) => {
                    const id = el.dataset['containerId'];
                    return id !== undefined ? ([[id, el]] as const) : [];
                }),
            );
            for (const [part, config] of Object.entries((this.constructor as typeof BaseApplicationWH40K).PARTS)) {
                if (config.container?.id === undefined || config.container.id === '') continue;
                const element = root.querySelector<HTMLElement>(`[data-application-part="${part}"]`);
                if (element === null) continue;
                let container = containers[config.container.id];
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess: Record lookup may return undefined
                if (container === undefined) {
                    const div = document.createElement('div');
                    div.dataset['containerId'] = config.container.id;
                    if (config.container.classes) div.classList.add(...config.container.classes);
                    container = containers[config.container.id] = div;
                    element.replaceWith(div);
                }
                if (element.parentElement !== container) container.append(element);
            }
        }

        /* -------------------------------------------- */

        /** @inheritDoc */
        override _replaceHTML(result: Record<string, HTMLElement>, content: HTMLElement, options: ApplicationV2Config.RenderOptions): void {
            for (const part of Object.values(result)) {
                for (const element of part.querySelectorAll<HTMLElement>('[data-expand-id]')) {
                    const expandId = element.dataset['expandId'];
                    if (expandId !== undefined && expandId !== '') {
                        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions -- Map.get returns T|undefined; boolean coerce is intentional toggle
                        element.querySelector('.collapsible')?.classList.toggle('collapsed', !this.#expandedSections.get(expandId));
                    }
                }
            }
            const prototype = Object.getPrototypeOf(BaseApplicationWH40K.prototype) as {
                _replaceHTML?: (
                    this: BaseApplicationWH40K,
                    result: Record<string, HTMLElement>,
                    content: HTMLElement,
                    options: ApplicationV2Config.RenderOptions,
                ) => void;
            };
            prototype._replaceHTML?.call(this, result, content, options);
        }

        /* -------------------------------------------- */

        /** @inheritDoc */
        override _updateFrame(options: ApplicationV2Config.RenderOptions): void {
            const prototype = Object.getPrototypeOf(BaseApplicationWH40K.prototype) as {
                _updateFrame?: (this: BaseApplicationWH40K, options: ApplicationV2Config.RenderOptions) => void;
            };
            prototype._updateFrame?.call(this, options);
            if (options.window?.subtitle !== undefined && options.window.subtitle !== '') {
                // eslint-disable-next-line no-restricted-syntax -- boundary: this.element is a Foundry runtime property not in ApplicationV2Ctor types
                const subtitle = (this as unknown as { element: HTMLElement }).element.querySelector<HTMLElement>('.window-header > .window-subtitle');
                if (subtitle !== null) subtitle.innerText = options.window.subtitle;
            }
        }

        /* -------------------------------------------- */

        /** @inheritDoc */
        // eslint-disable-next-line no-restricted-syntax -- boundary: _onRender context is the Foundry render object; Record<string,unknown> is the correct type at this API seam
        override async _onRender(context: Record<string, unknown>, options: ApplicationV2Config.RenderOptions): Promise<void> {
            await super._onRender(context, options);

            // Shared PARTS containers (for example the player-sheet sidebar)
            // can be replaced during later full renders, so rebuild them every
            // render instead of only on first render.
            this._renderContainers(context, options);

            // Add special styling for multi-select tags
            // eslint-disable-next-line no-restricted-syntax -- boundary: this.element is a Foundry runtime property not in ApplicationV2Ctor types
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
            // eslint-disable-next-line no-restricted-syntax -- boundary: this.element is a Foundry runtime property not in ApplicationV2Ctor types
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
            if (collapsible === null || (event.target as HTMLElement).closest('.collapsible-content') !== null) return;
            collapsible.classList.toggle('collapsed');
            const expandId = target.closest<HTMLElement>('[data-expand-id]')?.dataset['expandId'];
            if (expandId !== undefined && expandId !== '') {
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
