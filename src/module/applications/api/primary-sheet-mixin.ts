/**
 * @file PrimarySheetMixin - Adds V2 sheet functionality shared between primary document sheets
 * Based on dnd5e's PrimarySheetMixin pattern
 *
 * BOUNDARY FILE: this mixin wraps the Foundry V14 ApplicationV2 lifecycle, whose
 * options / context payloads are untyped. Per CLAUDE.md, framework-boundary points
 * (super._prepareContext options, render-context / mode hooks, slide-toggle DOM
 * shape) are permitted to use `Record<string, unknown>` and `any`. The
 * `mixin-constructor-args` and `slide-toggle` boundaries are localised below; the
 * rest of the file is typed normally.
 */
/* eslint-disable no-restricted-syntax -- mixin chain is a Foundry V14 framework boundary; super-prototype payloads are untyped */

import type { WH40KBaseActorDocument, WH40KItemDocument } from '../../types/global.d.ts';
import type { ApplicationV2Ctor } from './application-types.ts';
import DragDropMixin from './drag-drop-api-mixin.ts';
import type { PrimarySheetMixinAPI } from './sheet-mixin-types.js';

interface SheetTab {
    tab: string;
    label: string;
    icon?: string;
    group?: string;
    condition?: (doc: WH40KBaseActorDocument | WH40KItemDocument) => boolean;
}

/**
 * Adds V2 sheet functionality shared between primary document sheets (Actors & Items).
 * @template {ApplicationV2} T
 * @param {T} Base  The base class being mixed.
 * @returns {any}
 * @mixin
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- factory returns an anonymous mixin class; explicit return type defeats the mixin's inferred shape
export default function PrimarySheetMixin<T extends ApplicationV2Ctor>(Base: T) {
    return class PrimarySheetWH40K extends DragDropMixin(Base) implements PrimarySheetMixinAPI {
        /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument -- mixin idiom: constructor receives whatever the base class accepts; cannot be narrowed without breaking the mixin chain */
        // biome-ignore lint/complexity/noUselessConstructor: required to forward any[] args per TS mixin rule (TS2545)
        constructor(...args: any[]) {
            super(...args);
        }
        /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument */

        /** @override */
        static DEFAULT_OPTIONS: Partial<ApplicationV2Config.DefaultOptions> = {
            actions: {
                /* eslint-disable @typescript-eslint/unbound-method -- ApplicationV2 action handlers are dispatched with the sheet as `this` by Foundry's action system */
                editDocument: PrimarySheetWH40K.#showDocument,
                deleteDocument: PrimarySheetWH40K.#deleteDocument,
                showDocument: PrimarySheetWH40K.#showDocument,
                /* eslint-enable @typescript-eslint/unbound-method */
            },
        };

        /* -------------------------------------------- */

        /**
         * Sheet tabs.
         * @type {SheetTab[]}
         */
        static TABS: SheetTab[] = [];

        /* -------------------------------------------- */

        /**
         * Available sheet modes.
         */
        static MODES = {
            PLAY: 1,
            EDIT: 2,
        };

        /* -------------------------------------------- */
        /*  Properties                                  */
        /* -------------------------------------------- */

        /**
         * Filters for applied inventory sections.
         * @type {Record<string, Record<string, unknown>>}
         */
        _filters: Record<string, Record<string, unknown>> = {};

        /* -------------------------------------------- */

        /**
         * The mode the sheet is currently in.
         * @protected
         */
        _mode: number | null = null;

        declare document: WH40KBaseActorDocument | WH40KItemDocument;
        declare isEditable: boolean;
        declare tabGroups: HandlebarsApplicationV14.TabGroupsState;

        /* -------------------------------------------- */
        /*  Rendering                                   */
        /* -------------------------------------------- */

        /** @inheritDoc */
        override _configureRenderOptions(options: ApplicationV2Config.RenderOptions): void {
            const prototype = Object.getPrototypeOf(PrimarySheetWH40K.prototype) as {
                _configureRenderOptions?: (this: PrimarySheetWH40K, options: ApplicationV2Config.RenderOptions) => void;
            };
            prototype._configureRenderOptions?.call(this, options);

            const v14Options = options as ApplicationV2Config.RenderOptions & { renderContext?: string; mode?: number };
            const renderContext = v14Options.renderContext;
            let mode = v14Options.mode;
            if (mode === undefined && renderContext === 'createItem') mode = PrimarySheetWH40K.MODES.EDIT;
            this._mode = mode ?? this._mode ?? PrimarySheetWH40K.MODES.PLAY;
        }

        /* -------------------------------------------- */

        /** @inheritDoc */
        _configureRenderParts(options: ApplicationV2Config.RenderOptions): Record<string, ApplicationV2Config.PartConfiguration> {
            const prototype = Object.getPrototypeOf(PrimarySheetWH40K.prototype) as {
                _configureRenderParts?: (
                    this: PrimarySheetWH40K,
                    options: ApplicationV2Config.RenderOptions,
                ) => Record<string, ApplicationV2Config.PartConfiguration>;
            };
            const parts = prototype._configureRenderParts?.call(this, options) ?? {};
            for (const key of Object.keys(parts)) {
                const tab = (this.constructor as typeof PrimarySheetWH40K).TABS.find((t) => t.tab === key);
                if (tab?.condition && !tab.condition(this.document)) delete parts[key];
            }
            return parts;
        }

        /* -------------------------------------------- */

        /** @inheritDoc */
        override async _renderFrame(options: ApplicationV2Config.RenderOptions): Promise<HTMLElement> {
            const prototype = Object.getPrototypeOf(PrimarySheetWH40K.prototype) as {
                _renderFrame?: (this: PrimarySheetWH40K, options: ApplicationV2Config.RenderOptions) => Promise<HTMLElement>;
            };
            const html = prototype._renderFrame ? await prototype._renderFrame.call(this, options) : this.element;
            if (!game.user.isGM && this.document.limited) html.classList.add('limited');
            return html;
        }

        /* -------------------------------------------- */

        /**
         * Handle re-rendering the mode toggle on ownership changes.
         * @protected
         */
        _renderModeToggle(): void {
            const header = this.element.querySelector('.window-header');
            const toggle = header?.querySelector<HTMLInputElement>('.mode-slider');

            if (this.isEditable && !toggle) {
                const newToggle = document.createElement('slide-toggle') as HTMLElement & { checked: boolean };
                newToggle.checked = this._mode === PrimarySheetWH40K.MODES.EDIT;
                newToggle.classList.add('mode-slider');
                newToggle.dataset['tooltip'] = 'WH40K.SheetModeEdit';
                newToggle.setAttribute('aria-label', game.i18n.localize('WH40K.SheetModeEdit'));
                newToggle.addEventListener('change', this._onChangeSheetMode.bind(this) as EventListener);
                newToggle.addEventListener('dblclick', (event: MouseEvent) => event.stopPropagation());
                newToggle.addEventListener('pointerdown', (event: PointerEvent) => event.stopPropagation());
                header?.prepend(newToggle);
            } else if (this.isEditable && toggle) {
                toggle.checked = this._mode === PrimarySheetWH40K.MODES.EDIT;
            } else if (!this.isEditable && toggle) {
                toggle.remove();
            }
        }

        /* -------------------------------------------- */

        /** @inheritDoc */
        override async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<Record<string, unknown>> {
            const context = (await super._prepareContext(options as never)) as Record<string, unknown>;
            const doc = this.document;
            context['owner'] = doc.isOwner;
            context['locked'] = !this.isEditable;
            context['editable'] = this.isEditable && this._mode === PrimarySheetWH40K.MODES.EDIT;
            context['tabs'] = this._getTabs();
            return context;
        }

        /* -------------------------------------------- */

        /** @inheritDoc */
        async _preparePartContext(
            partId: string,
            context: Record<string, unknown>,
            options: ApplicationV2Config.RenderOptions,
        ): Promise<Record<string, unknown>> {
            const prototype = Object.getPrototypeOf(PrimarySheetWH40K.prototype) as {
                _preparePartContext?: (
                    this: PrimarySheetWH40K,
                    partId: string,
                    context: Record<string, unknown>,
                    options: ApplicationV2Config.RenderOptions,
                ) => Promise<Record<string, unknown>>;
            };
            const partContext = (await prototype._preparePartContext?.call(this, partId, context, options)) ?? {};
            partContext['tab'] = (context['tabs'] as Record<string, unknown>)[partId];
            return partContext;
        }

        /* -------------------------------------------- */

        /**
         * Prepare the tab information for the sheet.
         * @returns {Record<string, Record<string, unknown>>}
         * @protected
         */
        _getTabs(): Record<string, Record<string, unknown>> {
            return (this.constructor as typeof PrimarySheetWH40K).TABS.reduce(
                (tabs: Record<string, Record<string, unknown>>, { tab, condition, ...config }) => {
                    if (!condition || condition(this.document))
                        tabs[tab] = {
                            ...config,
                            id: tab,
                            group: 'primary',
                            active: this.tabGroups['primary'] === tab,
                            cssClass: this.tabGroups['primary'] === tab ? 'active' : '',
                        };
                    return tabs;
                },
                {},
            );
        }

        /* -------------------------------------------- */
        /*  Life-Cycle Handlers                         */
        /* -------------------------------------------- */

        /** @inheritDoc */
        override async _onFirstRender(context: Record<string, unknown>, options: ApplicationV2Config.RenderOptions): Promise<void> {
            const prototype = Object.getPrototypeOf(PrimarySheetWH40K.prototype) as {
                _onFirstRender?: (this: PrimarySheetWH40K, context: Record<string, unknown>, options: ApplicationV2Config.RenderOptions) => Promise<void>;
            };
            await prototype._onFirstRender?.call(this, context, options);
            if (this.tabGroups['primary']) this.element.classList.add(`tab-${this.tabGroups['primary']}`);
        }

        /* -------------------------------------------- */

        /** @inheritDoc */
        override async _onRender(context: Record<string, unknown>, options: ApplicationV2Config.RenderOptions): Promise<void> {
            await super._onRender(context, options);

            // Surface the active game-system id on the sheet root so per-system
            // Tailwind variants (`bc:`, `dh1e:`, `dh2e:`, `dw:`, `ow:`, `rt:`,
            // `im:`) can resolve via `[data-wh40k-system="<id>"] &`.
            // `_gameSystemId` is set on the prototype by `makeSystemVariant()`
            // (see actor/game-system-sheets.ts); fall back to the document's
            // own `system.gameSystem` field for sheets that don't go through
            // the variant factory.
            const sheetWithSystem = this as unknown as {
                _gameSystemId?: string;
                document?: { system?: { gameSystem?: string } };
            };
            const systemId = sheetWithSystem._gameSystemId ?? sheetWithSystem.document?.system?.gameSystem;
            if (systemId !== undefined && systemId !== '') this.element.dataset['wh40kSystem'] = systemId;

            this._renderModeToggle();
            const ctor = this.constructor as typeof PrimarySheetWH40K;
            this.element.classList.toggle('editable', this.isEditable && this._mode === ctor.MODES.EDIT);
            this.element.classList.toggle('interactable', this.isEditable && this._mode === ctor.MODES.PLAY);
            this.element.classList.toggle('locked', !this.isEditable);

            if (this.isEditable) {
                this.element.querySelectorAll('input').forEach((e) => e.addEventListener('focus', () => e.select()));
            }

            this.element.querySelectorAll('.draggable input').forEach((el) => {
                const input = el as HTMLInputElement;
                input.draggable = true;
                input.ondragstart = (event: DragEvent) => {
                    event.preventDefault();
                    event.stopPropagation();
                };
            });

            this._activateTabs();
        }

        /* -------------------------------------------- */

        /**
         * Activate tabs using data-tab and data-group attributes.
         * @protected
         */
        _activateTabs(): void {
            interface TabsConfigEntry {
                navSelector: string;
                contentSelector: string;
                initial?: string;
            }
            const optionsWithTabs = this.options as unknown as ApplicationV2Config.DefaultOptions & { tabs?: TabsConfigEntry[] };
            const tabsConfig: TabsConfigEntry[] = optionsWithTabs.tabs ?? [];
            for (const config of tabsConfig) {
                const { navSelector, contentSelector, initial } = config;
                const nav = this.element.querySelector<HTMLElement>(navSelector);
                const content = this.element.querySelector<HTMLElement>(contentSelector);
                if (!nav || !content) continue;

                const group = nav.dataset['group'] ?? 'primary';
                const activeTab = this.tabGroups[group] ?? initial;

                for (const tabLink of nav.querySelectorAll<HTMLElement>('[data-tab]')) {
                    tabLink.addEventListener('click', (event) => {
                        event.preventDefault();
                        const tab = tabLink.dataset['tab'];
                        if (tab !== undefined && tab !== '') this._activateTab(tab, group, nav, content);
                    });
                }

                if (activeTab !== undefined && activeTab !== '') {
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
        _activateTab(tab: string, group: string, nav: HTMLElement, content: HTMLElement): void {
            this.tabGroups[group] = tab;

            for (const link of nav.querySelectorAll<HTMLElement>('[data-tab]')) {
                const isActive = link.dataset['tab'] === tab;
                link.classList.toggle('active', isActive);
                link.closest('.wh40k-navigation__item, .wh40k-nav-item')?.classList.toggle('active', isActive);
            }

            for (const tabContent of content.querySelectorAll<HTMLElement>(':scope > [data-tab]')) {
                const isActive = tabContent.dataset['tab'] === tab;
                tabContent.classList.toggle('active', isActive);
            }

            this.element.className = this.element.className.replace(/\btab-\w+/g, '');
            this.element.classList.add(`tab-${tab}`);
        }

        /* -------------------------------------------- */

        /**
         * Animate a stat element to show a value change.
         */
        animateStatChange(element: HTMLElement, type: string = 'changed'): void {
            const animClass = `wh40k-stat-${type}`;
            element.classList.remove('wh40k-stat-increase', 'wh40k-stat-decrease', 'wh40k-stat-changed', 'wh40k-stat-critical', 'wh40k-stat-success');
            void element.offsetWidth;
            element.classList.add(animClass);
            if (type !== 'critical') {
                element.addEventListener('animationend', () => element.classList.remove(animClass), { once: true });
            }
        }

        /* -------------------------------------------- */

        animateValueChange(element: HTMLElement, oldValue: number, newValue: number): void {
            if (oldValue === newValue) return;
            const type = newValue > oldValue ? 'increase' : 'decrease';
            this.animateStatChange(element, type);
        }

        /* -------------------------------------------- */

        _addDocument(_event: Event, _target: HTMLElement): void {}

        /* -------------------------------------------- */

        /** @inheritDoc */
        override changeTab(tab: string, group: string, options: Record<string, unknown>): void {
            const prototype = Object.getPrototypeOf(PrimarySheetWH40K.prototype) as {
                changeTab?: (this: PrimarySheetWH40K, tab: string, group: string, options: Record<string, unknown>) => void;
            };
            prototype.changeTab?.call(this, tab, group, options);
            if (group !== 'primary') return;
            this.element.className = this.element.className.replace(/tab-\w+/g, '');
            this.element.classList.add(`tab-${tab}`);
            const activeTab = this.element.querySelector<HTMLElement>(`.wh40k-tab.active[data-tab="${tab}"]`);
            if (activeTab) {
                activeTab.querySelectorAll<HTMLElement>('.wh40k-panel').forEach((panel, i) => {
                    panel.classList.remove('tw-animate-wh40k-panel-in');
                    void panel.offsetWidth;
                    panel.classList.add('tw-animate-wh40k-panel-in');
                    panel.style.animationDelay = `${i * 0.03}s`;
                });
            }
        }

        /* -------------------------------------------- */

        /**
         * Handle removing a document.
         * @this {PrimarySheetWH40K}
         * @param {Event} event         Triggering click event.
         * @param {HTMLElement} target  Button that was clicked.
         */
        static async #deleteDocument(this: PrimarySheetWH40K, event: Event, target: HTMLElement): Promise<void> {
            if ((await this._deleteDocument(event, target)) === false) return;
            const uuid = target.closest<HTMLElement>('[data-uuid]')?.dataset['uuid'];
            const doc = await fromUuid(uuid ?? '');
            if (doc instanceof foundry.abstract.Document) {
                await (doc as foundry.abstract.Document.Any & { deleteDialog?: () => Promise<unknown> }).deleteDialog?.();
            }
        }

        /* -------------------------------------------- */

        // eslint-disable-next-line @typescript-eslint/require-await -- subclasses override with awaited bodies; the base returns a sentinel
        async _deleteDocument(event: Event, target: HTMLElement): Promise<unknown> {
            return true;
        }

        /* -------------------------------------------- */

        async _onChangeSheetMode(event: Event): Promise<void> {
            const { MODES } = PrimarySheetWH40K;
            const toggle = event.currentTarget as HTMLInputElement;
            const label = game.i18n.localize(`WH40K.SheetMode${toggle.checked ? 'Play' : 'Edit'}`);
            toggle.dataset['tooltip'] = label;
            toggle.setAttribute('aria-label', label);
            this._mode = toggle.checked ? MODES.EDIT : MODES.PLAY;
            await this.submit();
            void this.render();
        }

        /* -------------------------------------------- */

        override _onClickAction(event: Event, target: HTMLElement): void {
            if (target.dataset['action'] === 'addDocument') this._addDocument(event, target);
            else {
                const prototype = Object.getPrototypeOf(PrimarySheetWH40K.prototype) as {
                    _onClickAction?: (this: PrimarySheetWH40K, event: PointerEvent, target: HTMLElement) => void;
                };
                prototype._onClickAction?.call(this, event as PointerEvent, target);
            }
        }

        /* -------------------------------------------- */

        /**
         * Handle opening a document sheet.
         * @this {PrimarySheetWH40K}
         * @param {Event} event         Triggering click event.
         * @param {HTMLElement} target  Button that was clicked.
         */
        static async #showDocument(this: PrimarySheetWH40K, event: Event, target: HTMLElement): Promise<void> {
            if ((await this._showDocument(event, target)) === false) return;
            if ([HTMLInputElement, HTMLSelectElement].some((el) => event.target instanceof el)) return;
            const uuid = target.closest<HTMLElement>('[data-uuid]')?.dataset['uuid'];
            const doc = await fromUuid(uuid ?? '');
            if (doc instanceof foundry.abstract.Document) {
                (doc as foundry.abstract.Document.Any & { sheet?: { render: (options?: Record<string, unknown> | boolean) => unknown } }).sheet?.render({
                    force: true,
                });
            }
        }

        /* -------------------------------------------- */

        // eslint-disable-next-line @typescript-eslint/require-await -- subclasses override with awaited bodies; the base returns a sentinel
        async _showDocument(event: Event, target: HTMLElement): Promise<unknown> {
            return true;
        }

        /* -------------------------------------------- */

        _sortChildren(collection: string, mode: string): unknown[] {
            return [];
        }

        /* -------------------------------------------- */

        _sortItems<TItem extends { sort: number }>(items: TItem[], mode: string): TItem[] {
            return items.sort((a, b) => a.sort - b.sort);
        }
    };
}
