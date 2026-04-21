import type { WH40KNPCV2 } from '../../documents/npc-v2.ts';
import type { WH40KItem } from '../../documents/item.ts';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

interface FilterState {
    category: string;
    faction: string;
    search: string;
}

interface TemplateRow {
    uuid: string;
    name: string;
    img: string;
    category: string;
    faction: string;
    baseThreat: number;
    type: string;
    role: string;
    summary: string;
    selected: boolean;
}

/**
 * Dialog for browsing and selecting NPC templates.
 * @extends {ApplicationV2}
 */
export default class TemplateSelector extends HandlebarsApplicationMixin(ApplicationV2) {
    /* -------------------------------------------- */
    /*  Static Configuration                        */
    /* -------------------------------------------- */

    /** @override */
    static DEFAULT_OPTIONS = {
        id: 'template-selector-{id}',
        classes: ['wh40k-rpg', 'template-selector'],
        tag: 'div',
        window: {
            title: 'WH40K.NPC.Template.SelectTitle',
            icon: 'fa-solid fa-file-lines',
            minimizable: false,
            resizable: true,
            contentClasses: ['standard-form'],
        },
        position: {
            width: 800,
            height: 650,
        },
        actions: {
            selectTemplate: TemplateSelector.#selectTemplate,
            clearFilter: TemplateSelector.#clearFilter,
            create: TemplateSelector.#onCreate,
            cancel: TemplateSelector.#onCancel,
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        content: {
            template: 'systems/wh40k-rpg/templates/dialogs/template-selector.hbs',
        },
    };

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * Available templates (cached).
     * @type {WH40KItem[]}
     */
    #templates: WH40KItem[] = [];

    /**
     * Current filter settings.
     * @type {FilterState}
     */
    #filters: FilterState = {
        category: '',
        faction: '',
        search: '',
    };

    /**
     * Selected template UUID.
     * @type {string|null}
     */
    #selectedUuid: string | null = null;

    /**
     * Selected threat level.
     * @type {number}
     */
    #threatLevel: number = 5;

    /**
     * Whether to create as horde.
     * @type {boolean}
     */
    #isHorde: boolean = false;

    /**
     * Promise resolver.
     * @type {((value: WH40KNPCV2 | null) => void) | null}
     */
    #resolve: ((value: WH40KNPCV2 | null) => void) | null = null;

    /**
     * Whether submitted.
     * @type {boolean}
     */
    #submitted: boolean = false;

    /**
     * Render timeout handle.
     * @type {ReturnType<typeof setTimeout> | null}
     */
    _renderTimeout: ReturnType<typeof setTimeout> | null = null;

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @override */
    async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<Record<string, unknown>> {
        const context = await super._prepareContext(options);

        // Load templates if not cached
        if (this.#templates.length === 0) {
            await this._loadTemplates();
        }

        // Apply filters
        const filteredTemplates = this._filterTemplates();

        // Get selected template details
        let selectedTemplate: WH40KItem | undefined;
        let preview = null;
        if (this.#selectedUuid) {
            selectedTemplate = this.#templates.find((t) => t.uuid === this.#selectedUuid);
            if (selectedTemplate) {
                preview = (selectedTemplate.system as any).previewAtThreat(this.#threatLevel);
            }
        }

        // Get unique categories and factions for filter dropdowns
        const categories = [...new Set(this.#templates.map((t) => (t.system as any).category))].sort();
        const factions = [...new Set(this.#templates.map((t) => (t.system as any).faction).filter((f) => f))].sort();

        return {
            ...context,

            // Templates
            templates: filteredTemplates.map(
                (t): TemplateRow => ({
                    uuid: t.uuid,
                    name: t.name,
                    img: t.img ?? '',
                    category: (t.system as any).category,
                    faction: (t.system as any).faction,
                    baseThreat: (t.system as any).baseThreatLevel,
                    type: (t.system as any).type,
                    role: (t.system as any).role,
                    summary: (t.system as any).summary,
                    selected: t.uuid === this.#selectedUuid,
                }),
            ),
            hasTemplates: filteredTemplates.length > 0,
            templateCount: filteredTemplates.length,

            // Filters
            filters: this.#filters,
            categories: categories.map((c) => ({ key: c, label: String(c).titleCase(), selected: c === this.#filters.category })),
            factions: factions.map((f) => ({ key: f, label: f, selected: f === this.#filters.faction })),

            // Selection
            selectedTemplate,
            hasSelection: !!selectedTemplate,
            preview,
            threatLevel: this.#threatLevel,
            isHorde: this.#isHorde,

            // Buttons
            buttons: [
                {
                    action: 'create',
                    icon: 'fa-solid fa-plus',
                    label: 'WH40K.NPC.Template.CreateFromTemplate',
                    cssClass: 'primary',
                    disabled: !selectedTemplate,
                },
                { action: 'cancel', icon: 'fa-solid fa-times', label: 'Cancel' },
            ],
        };
    }

    /** @override */
    _onRender(context: Record<string, unknown>, options: ApplicationV2Config.RenderOptions): void {
        void super._onRender(context, options);

        // Filter inputs
        const categorySelect = this.element.querySelector('[name="filterCategory"]') as HTMLSelectElement | null;
        const factionSelect = this.element.querySelector('[name="filterFaction"]') as HTMLSelectElement | null;
        const searchInput = this.element.querySelector('[name="filterSearch"]') as HTMLInputElement | null;

        if (categorySelect) {
            categorySelect.addEventListener('change', () => {
                this.#filters.category = categorySelect.value;
                void this.render({ parts: ['content'] });
            });
        }

        if (factionSelect) {
            factionSelect.addEventListener('change', () => {
                this.#filters.faction = factionSelect.value;
                void this.render({ parts: ['content'] });
            });
        }

        if (searchInput) {
            searchInput.addEventListener('input', () => {
                this.#filters.search = searchInput.value;
                this._debounceRender();
            });
        }

        // Threat level slider
        const threatSlider = this.element.querySelector('[name="threatLevel"]') as HTMLInputElement | null;
        const threatValue = this.element.querySelector('.threat-value');
        if (threatSlider) {
            threatSlider.addEventListener('input', () => {
                this.#threatLevel = parseInt(threatSlider.value, 10);
                if (threatValue) threatValue.textContent = String(this.#threatLevel);
                this._debounceRender();
            });
        }

        // Horde checkbox
        const hordeCheckbox = this.element.querySelector('[name="isHorde"]') as HTMLInputElement | null;
        if (hordeCheckbox) {
            hordeCheckbox.addEventListener('change', () => {
                this.#isHorde = hordeCheckbox.checked;
            });
        }
    }

    /**
     * Debounced render.
     * @private
     */
    _debounceRender(): void {
        if (this._renderTimeout) clearTimeout(this._renderTimeout);
        this._renderTimeout = setTimeout(() => {
            void this.render({ parts: ['content'] });
        }, 150);
    }

    /* -------------------------------------------- */
    /*  Template Loading                            */
    /* -------------------------------------------- */

    /**
     * Load all NPC templates from compendiums and world.
     * @private
     */
    async _loadTemplates(): Promise<void> {
        this.#templates = [];

        // Load from world items
        const worldTemplates = game.items.filter((i: any) => i.type === 'npcTemplate') as WH40KItem[];
        this.#templates.push(...worldTemplates);

        // Load from compendiums
        for (const pack of game.packs) {
            if (pack.documentName !== 'Item') continue;
            if (pack.locked && !pack.visible) continue;

            try {
                const index = await pack.getIndex({ fields: ['type', 'system.category', 'system.faction'] });
                const templateEntries = index.filter((e: any) => e.type === 'npcTemplate');

                for (const entry of templateEntries) {
                    const item = (await pack.getDocument(entry._id)) as WH40KItem | null;
                    if (item) this.#templates.push(item);
                }
            } catch (err) {
                console.warn(`Failed to load templates from pack ${pack.collection}:`, err);
            }
        }
    }

    /**
     * Filter templates based on current filter settings.
     * @returns {WH40KItem[]}
     * @private
     */
    _filterTemplates(): WH40KItem[] {
        return this.#templates.filter((t) => {
            const system = t.system as any;
            // Category filter
            if (this.#filters.category && system.category !== this.#filters.category) {
                return false;
            }

            // Faction filter
            if (this.#filters.faction && system.faction !== this.#filters.faction) {
                return false;
            }

            // Search filter
            if (this.#filters.search) {
                const search = this.#filters.search.toLowerCase();
                const name = t.name.toLowerCase();
                const faction = (system.faction || '').toLowerCase();
                if (!name.includes(search) && !faction.includes(search)) {
                    return false;
                }
            }

            return true;
        });
    }

    /* -------------------------------------------- */
    /*  Event Handlers                              */
    /* -------------------------------------------- */

    /**
     * Select a template.
     * @param {TemplateSelector} this
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static #selectTemplate(this: TemplateSelector, event: PointerEvent, target: HTMLElement): void {
        const uuid = target.dataset.uuid;
        if (!uuid) return;

        this.#selectedUuid = uuid;
        this.render({ parts: ['content'] });
    }

    /**
     * Clear all filters.
     * @param {TemplateSelector} this
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static #clearFilter(this: TemplateSelector, event: PointerEvent, target: HTMLElement): void {
        this.#filters = { category: '', faction: '', search: '' };
        this.render({ parts: ['content'] });
    }

    /**
     * Create NPC from selected template.
     * @param {TemplateSelector} this
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async #onCreate(this: TemplateSelector, event: PointerEvent, target: HTMLElement): Promise<void> {
        if (!this.#selectedUuid) {
            ui.notifications.warn('Select a template first.');
            return;
        }

        const template = this.#templates.find((t) => t.uuid === this.#selectedUuid);
        if (!template) return;

        try {
            const systemData = (template.system as any).generateAtThreat(this.#threatLevel, {
                isHorde: this.#isHorde,
            });

            const actorData = {
                name: template.name,
                type: 'npcV2',
                img: template.img || 'icons/svg/mystery-man.svg',
                system: systemData,
            };

            const actor = (await Actor.create(actorData)) as WH40KNPCV2 | undefined;

            if (actor) {
                // Create embedded traits and talents
                const itemsToCreate: Record<string, unknown>[] = [];

                for (const trait of (template.system as any).traits || []) {
                    if (trait.uuid) {
                        const item = (await fromUuid(trait.uuid)) as any;
                        if (item) {
                            itemsToCreate.push({
                                name: item.name,
                                type: item.type,
                                img: item.img,
                                system: foundry.utils.deepClone(item.system),
                            });
                        }
                    }
                }

                for (const talent of (template.system as any).talents || []) {
                    if (talent.uuid) {
                        const item = (await fromUuid(talent.uuid)) as any;
                        if (item) {
                            itemsToCreate.push({
                                name: item.name,
                                type: item.type,
                                img: item.img,
                                system: foundry.utils.deepClone(item.system),
                            });
                        }
                    }
                }

                if (itemsToCreate.length > 0) {
                    await actor.createEmbeddedDocuments('Item', itemsToCreate);
                }

                ui.notifications.info(`Created NPC: ${actor.name}`);
                actor.sheet?.render(true);

                this.#submitted = true;
                if (this.#resolve) this.#resolve(actor);
                await this.close();
            }
        } catch (err) {
            console.error('Failed to create NPC from template:', err);
            ui.notifications.error('Failed to create NPC from template');
        }
    }

    /**
     * Cancel and close.
     * @param {TemplateSelector} this
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async #onCancel(this: TemplateSelector, event: PointerEvent, target: HTMLElement): Promise<void> {
        this.#submitted = false;
        if (this.#resolve) this.#resolve(null);
        await this.close();
    }

    /* -------------------------------------------- */
    /*  Lifecycle                                   */
    /* -------------------------------------------- */

    /** @override */
    async close(options: Record<string, unknown> = {}): Promise<void> {
        if (this._renderTimeout) clearTimeout(this._renderTimeout);

        if (!this.#submitted && this.#resolve) {
            this.#resolve(null);
        }

        return super.close(options);
    }

    /* -------------------------------------------- */
    /*  Public API                                  */
    /* -------------------------------------------- */

    /**
     * Wait for selection.
     * @returns {Promise<WH40KNPCV2 | null>} Created actor or null.
     */
    async wait(): Promise<WH40KNPCV2 | null> {
        return new Promise((resolve) => {
            this.#resolve = resolve;
            void this.render(true);
        });
    }

    /**
     * Open the template selector.
     * @param {Partial<FilterState>} [options] - Options.
     * @returns {Promise<WH40KNPCV2 | null>} Created actor or null.
     */
    static async open(options: Partial<FilterState> = {}): Promise<WH40KNPCV2 | null> {
        const selector = new this();

        if (options.category) selector.#filters.category = options.category;
        if (options.faction) selector.#filters.faction = options.faction;

        return selector.wait();
    }
}
