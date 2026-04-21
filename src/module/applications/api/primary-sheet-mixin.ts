/**
 * @file PrimarySheetMixin - Adds V2 sheet functionality shared between primary document sheets
 * Based on dnd5e's PrimarySheetMixin pattern
 */

type ApplicationV2 = foundry.applications.api.ApplicationV2.Any;
import DragDropMixin from './drag-drop-api-mixin.ts';
import type { WH40KBaseActorDocument, WH40KItemDocument } from '../../types/global.d.ts';
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
export default function PrimarySheetMixin<T extends new (...args: any[]) => ApplicationV2>(Base: T) {
    return class PrimarySheetWH40K extends DragDropMixin(Base) implements PrimarySheetMixinAPI {
        /** @override */
        static DEFAULT_OPTIONS: Partial<ApplicationV2Config.DefaultOptions> = {
            actions: {
                editDocument: PrimarySheetWH40K.#showDocument,
                deleteDocument: PrimarySheetWH40K.#deleteDocument,
                showDocument: PrimarySheetWH40K.#showDocument,
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
        _configureRenderOptions(options: ApplicationV2Config.RenderOptions): void {
            super._configureRenderOptions(options);

            const renderContext = (options as any).renderContext;
            let mode = (options as any).mode;
            if (mode === undefined && renderContext === 'createItem') mode = PrimarySheetWH40K.MODES.EDIT;
            this._mode = mode ?? this._mode ?? PrimarySheetWH40K.MODES.PLAY;
        }

        /* -------------------------------------------- */

        /** @inheritDoc */
        _configureRenderParts(options: ApplicationV2Config.RenderOptions): Record<string, ApplicationV2Config.PartConfiguration> {
            const parts = super._configureRenderParts(options);
            for (const key of Object.keys(parts)) {
                const tab = (this.constructor as typeof PrimarySheetWH40K).TABS.find((t) => t.tab === key);
                if (tab?.condition && !tab.condition(this.document)) delete parts[key];
            }
            return parts;
        }

        /* -------------------------------------------- */

        /** @inheritDoc */
        async _renderFrame(options: ApplicationV2Config.RenderOptions): Promise<HTMLElement> {
            const html = await super._renderFrame(options);
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
                const newToggle = document.createElement('slide-toggle');
                (newToggle as any).checked = this._mode === PrimarySheetWH40K.MODES.EDIT;
                newToggle.classList.add('mode-slider');
                newToggle.dataset.tooltip = 'WH40K.SheetModeEdit';
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
        async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<Record<string, unknown>> {
            const context = await super._prepareContext(options);
            const doc = this.document;
            context.owner = doc.isOwner;
            context.locked = !this.isEditable;
            context.editable = this.isEditable && this._mode === PrimarySheetWH40K.MODES.EDIT;
            context.tabs = this._getTabs();
            return context;
        }

        /* -------------------------------------------- */

        /** @inheritDoc */
        async _preparePartContext(
            partId: string,
            context: Record<string, unknown>,
            options: ApplicationV2Config.RenderOptions,
        ): Promise<Record<string, unknown>> {
            const partContext = await super._preparePartContext(partId, context, options);
            (partContext as any).tab = (context.tabs as Record<string, unknown>)[partId];
            return partContext;
        }

        /* -------------------------------------------- */

        /**
         * Prepare the tab information for the sheet.
         * @returns {Record<string, Record<string, unknown>>}
         * @protected
         */
        _getTabs(): Record<string, Record<string, unknown>> {
            return (this.constructor as typeof PrimarySheetWH40K).TABS.reduce((tabs: Record<string, unknown>, { tab, condition, ...config }) => {
                if (!condition || condition(this.document))
                    tabs[tab] = {
                        ...config,
                        id: tab,
                        group: 'primary',
                        active: this.tabGroups.primary === tab,
                        cssClass: this.tabGroups.primary === tab ? 'active' : '',
                    };
                return tabs;
            }, {});
        }

        /* -------------------------------------------- */
        /*  Life-Cycle Handlers                         */
        /* -------------------------------------------- */

        /** @inheritDoc */
        async _onFirstRender(context: Record<string, unknown>, options: ApplicationV2Config.RenderOptions): Promise<void> {
            await super._onFirstRender(context, options);
            if (this.tabGroups.primary) this.element.classList.add(`tab-${this.tabGroups.primary}`);
        }

        /* -------------------------------------------- */

        /** @inheritDoc */
        async _onRender(context: Record<string, unknown>, options: ApplicationV2Config.RenderOptions): Promise<void> {
            await super._onRender(context, options);

            this._renderModeToggle();
            this.element.classList.toggle('editable', this.isEditable && this._mode === (this.constructor as any).MODES.EDIT);
            this.element.classList.toggle('interactable', this.isEditable && this._mode === (this.constructor as any).MODES.PLAY);
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

            this._activateLegacyTabs();
        }

        /* -------------------------------------------- */

        /**
         * Activate legacy V1-style tabs that use data-tab and data-group attributes.
         * @protected
         */
        _activateLegacyTabs(): void {
            const tabsConfig = (this.options as any).tabs ?? [];
            for (const config of tabsConfig) {
                const { navSelector, contentSelector, initial } = config;
                const nav = this.element.querySelector<HTMLElement>(navSelector);
                const content = this.element.querySelector<HTMLElement>(contentSelector);
                if (!nav || !content) continue;

                const group = nav.dataset.group || 'primary';
                const activeTab = this.tabGroups?.[group] ?? initial;

                for (const tabLink of nav.querySelectorAll<HTMLElement>('[data-tab]')) {
                    tabLink.addEventListener('click', (event) => {
                        event.preventDefault();
                        const tab = tabLink.dataset.tab;
                        if (tab) this._activateTab(tab, group, nav, content);
                    });
                }

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
        _activateTab(tab: string, group: string, nav: HTMLElement, content: HTMLElement): void {
            if (this.tabGroups) this.tabGroups[group] = tab;

            for (const link of nav.querySelectorAll<HTMLElement>('[data-tab]')) {
                const isActive = link.dataset.tab === tab;
                link.classList.toggle('active', isActive);
                link.closest('.wh40k-navigation__item, .wh40k-nav-item')?.classList.toggle('active', isActive);
            }

            for (const tabContent of content.querySelectorAll<HTMLElement>(':scope > [data-tab]')) {
                const isActive = tabContent.dataset.tab === tab;
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
            if (!element) return;
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
            if (!element || oldValue === newValue) return;
            const type = newValue > oldValue ? 'increase' : 'decrease';
            this.animateStatChange(element, type);
        }

        /* -------------------------------------------- */

        _addDocument(event: Event, target: HTMLElement): void {}

        /* -------------------------------------------- */

        /** @inheritDoc */
        changeTab(tab: string, group: string, options: Record<string, unknown>): void {
            super.changeTab(tab, group, options);
            if (group !== 'primary') return;
            this.element.className = this.element.className.replace(/tab-\w+/g, '');
            this.element.classList.add(`tab-${tab}`);
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
            const uuid = target.closest<HTMLElement>('[data-uuid]')?.dataset.uuid;
            const doc = await fromUuid(uuid ?? '');
            if (doc instanceof foundry.abstract.Document) doc.deleteDialog();
        }

        /* -------------------------------------------- */

        async _deleteDocument(event: Event, target: HTMLElement): Promise<unknown> {
            return true;
        }

        /* -------------------------------------------- */

        async _onChangeSheetMode(event: Event): Promise<void> {
            const { MODES } = PrimarySheetWH40K;
            const toggle = event.currentTarget as HTMLInputElement;
            const label = game.i18n.localize(`WH40K.SheetMode${toggle.checked ? 'Play' : 'Edit'}`);
            toggle.dataset.tooltip = label;
            toggle.setAttribute('aria-label', label);
            this._mode = toggle.checked ? MODES.EDIT : MODES.PLAY;
            await this.submit();
            this.render();
        }

        /* -------------------------------------------- */

        _onClickAction(event: Event, target: HTMLElement): void {
            if (target.dataset.action === 'addDocument') this._addDocument(event, target);
            else super._onClickAction(event, target);
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
            const uuid = target.closest<HTMLElement>('[data-uuid]')?.dataset.uuid;
            const doc = await fromUuid(uuid ?? '');
            if (doc instanceof foundry.abstract.Document && doc.sheet) doc.sheet.render({ force: true });
        }

        /* -------------------------------------------- */

        async _showDocument(event: Event, target: HTMLElement): Promise<unknown> {
            return true;
        }

        /* -------------------------------------------- */

        _sortChildren(collection: string, mode: string): unknown[] {
            return [];
        }

        /* -------------------------------------------- */

        _sortItems(items: any[], mode: string): any[] {
            return items.sort((a: { sort: number }, b: { sort: number }) => a.sort - b.sort);
        }
    };
}
