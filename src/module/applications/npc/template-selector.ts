import type { WH40KItem } from '../../documents/item.ts';
import type { WH40KNPC } from '../../documents/npc.ts';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

interface FilterState {
    category: string;
    faction: string;
    search: string;
}

/** Shape of system data for NPC-template items. */
interface NpcTemplateSys {
    category: string;
    faction: string;
    baseThreatLevel: number;
    type: string;
    role: string;
    summary: string;
    traits?: Array<{ uuid?: string }>;
    talents?: Array<{ uuid?: string }>;
    /* eslint-disable no-restricted-syntax -- boundary: NpcTemplateSys is a structural adapter for untyped item.system; Record<string,unknown> is the Foundry data-prep return shape */
    previewAtThreat(threatLevel: number): Record<string, unknown>;
    generateAtThreat(threatLevel: number, options: { isHorde: boolean }): Record<string, unknown>;
    /* eslint-enable no-restricted-syntax */
}

interface TemplateRow {
    uuid: string | null;
    name: string | null;
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
    static override DEFAULT_OPTIONS = {
        id: 'template-selector-{id}',
        classes: ['wh40k-rpg', 'template-selector'],
        tag: 'div',
        window: {
            // eslint-disable-next-line no-restricted-syntax -- boundary: title is a WH40K.* localization key, not a hardcoded string; lint rule cannot distinguish
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
            // eslint-disable-next-line @typescript-eslint/unbound-method -- ApplicationV2 actions accept method references and bind `this` itself
            selectTemplate: TemplateSelector.#selectTemplate,
            // eslint-disable-next-line @typescript-eslint/unbound-method -- ApplicationV2 actions accept method references and bind `this` itself
            clearFilter: TemplateSelector.#clearFilter,
            // eslint-disable-next-line @typescript-eslint/unbound-method -- ApplicationV2 actions accept method references and bind `this` itself
            create: TemplateSelector.#onCreate,
            // eslint-disable-next-line @typescript-eslint/unbound-method -- ApplicationV2 actions accept method references and bind `this` itself
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
     * @type {((value: WH40KNPC | null) => void) | null}
     */
    #resolve: ((value: WH40KNPC | null) => void) | null = null;

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
    // eslint-disable-next-line no-restricted-syntax -- boundary: _prepareContext/Record<string,unknown> is the ApplicationV2 override signature
    override async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<Record<string, unknown>> {
        const context = await super._prepareContext(options);

        // Load templates if not cached
        if (this.#templates.length === 0) {
            await this._loadTemplates();
        }

        // Apply filters
        const filteredTemplates = this._filterTemplates();

        // Get selected template details
        let selectedTemplate: WH40KItem | undefined;
        /* eslint-disable no-restricted-syntax -- boundary: item.system is untyped at runtime; cast to NpcTemplateSys for data-prep access */
        let preview: Record<string, unknown> | null = null;
        if (this.#selectedUuid !== null) {
            selectedTemplate = this.#templates.find((t) => t.uuid === this.#selectedUuid);
            if (selectedTemplate) {
                preview = (selectedTemplate.system as unknown as NpcTemplateSys).previewAtThreat(this.#threatLevel);
            }
        }

        // Get unique categories and factions for filter dropdowns
        const categories = [...new Set(this.#templates.map((t) => (t.system as unknown as NpcTemplateSys).category))].sort();
        const factions = [...new Set(this.#templates.map((t) => (t.system as unknown as NpcTemplateSys).faction).filter((f) => f))].sort();

        return {
            ...context,

            // Templates
            templates: filteredTemplates.map(
                (t): TemplateRow => ({
                    uuid: t.uuid,
                    name: t.name,
                    img: t.img ?? '',
                    category: (t.system as unknown as NpcTemplateSys).category,
                    faction: (t.system as unknown as NpcTemplateSys).faction,
                    baseThreat: (t.system as unknown as NpcTemplateSys).baseThreatLevel,
                    type: (t.system as unknown as NpcTemplateSys).type,
                    role: (t.system as unknown as NpcTemplateSys).role,
                    summary: (t.system as unknown as NpcTemplateSys).summary,
                    selected: t.uuid === this.#selectedUuid,
                }),
            ),
            /* eslint-enable no-restricted-syntax */
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
    // eslint-disable-next-line no-restricted-syntax -- boundary: _onRender/Record<string,unknown> is the ApplicationV2 override signature
    override _onRender(context: Record<string, unknown>, options: ApplicationV2Config.RenderOptions): void {
        void super._onRender(context, options);

        // Filter inputs
        const categorySelect = this.element.querySelector<HTMLSelectElement>('[name="filterCategory"]');
        const factionSelect = this.element.querySelector<HTMLSelectElement>('[name="filterFaction"]');
        const searchInput = this.element.querySelector<HTMLInputElement>('[name="filterSearch"]');

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
        const threatSlider = this.element.querySelector<HTMLInputElement>('[name="threatLevel"]');
        const threatValue = this.element.querySelector('.threat-value');
        if (threatSlider) {
            threatSlider.addEventListener('input', () => {
                this.#threatLevel = parseInt(threatSlider.value, 10);
                if (threatValue) threatValue.textContent = String(this.#threatLevel);
                this._debounceRender();
            });
        }

        // Horde checkbox
        const hordeCheckbox = this.element.querySelector<HTMLInputElement>('[name="isHorde"]');
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access -- Foundry game.items filter callback receives untyped Item documents at runtime
        // biome-ignore lint/suspicious/noExplicitAny: Foundry game.items filter callback receives untyped Item documents at runtime
        const worldTemplates = game.items.filter((i: any) => i.type === 'npcTemplate') as WH40KItem[];
        this.#templates.push(...worldTemplates);

        // Load from compendiums
        const eligiblePacks = game.packs.filter((pack) => pack.documentName === 'Item' && !(pack.locked && !pack.visible));
        await Promise.all(
            eligiblePacks.map(async (pack) => {
                try {
                    const index = await pack.getIndex({ fields: ['type', 'system.category', 'system.faction'] });
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access -- Foundry pack.getIndex returns untyped index entries at runtime
                    // biome-ignore lint/suspicious/noExplicitAny: Foundry pack.getIndex returns untyped index entries at runtime
                    const templateEntries = index.filter((e: any) => e.type === 'npcTemplate');

                    const items = await Promise.all(templateEntries.map(async (entry) => (await pack.getDocument(entry._id)) as WH40KItem | null));
                    for (const item of items) {
                        if (item) this.#templates.push(item);
                    }
                } catch (err) {
                    console.warn(`Failed to load templates from pack ${pack.collection}:`, err);
                }
            }),
        );
    }

    /**
     * Filter templates based on current filter settings.
     * @returns {WH40KItem[]}
     * @private
     */
    _filterTemplates(): WH40KItem[] {
        return this.#templates.filter((t) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: item.system is untyped at runtime; cast to NpcTemplateSys for filter access
            const system = t.system as unknown as NpcTemplateSys;
            // Category filter
            if (this.#filters.category !== '' && system.category !== this.#filters.category) {
                return false;
            }

            // Faction filter
            if (this.#filters.faction !== '' && system.faction !== this.#filters.faction) {
                return false;
            }

            // Search filter
            if (this.#filters.search !== '') {
                const search = this.#filters.search.toLowerCase();
                const name = t.name.toLowerCase();
                const faction = (system.faction !== '' ? system.faction : '').toLowerCase();
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
    static #selectTemplate(this: TemplateSelector, _event: PointerEvent, target: HTMLElement): void {
        const uuid = target.dataset['uuid'];
        if (uuid === undefined || uuid === '') return;

        this.#selectedUuid = uuid;
        void this.render({ parts: ['content'] });
    }

    /**
     * Clear all filters.
     * @param {TemplateSelector} this
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static #clearFilter(this: TemplateSelector, _event: PointerEvent, _target: HTMLElement): void {
        this.#filters = { category: '', faction: '', search: '' };
        void this.render({ parts: ['content'] });
    }

    /**
     * Create NPC from selected template.
     * @param {TemplateSelector} this
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async #onCreate(this: TemplateSelector, _event: PointerEvent, _target: HTMLElement): Promise<void> {
        if (this.#selectedUuid === null) {
            // eslint-disable-next-line no-restricted-syntax -- boundary: i18n key to be added in a follow-up i18n pass
            ui.notifications.warn('Select a template first.');
            return;
        }

        const template = this.#templates.find((t) => t.uuid === this.#selectedUuid);
        if (!template) return;

        try {
            // eslint-disable-next-line no-restricted-syntax -- boundary: item.system is untyped at runtime; cast to NpcTemplateSys for method access
            const templateSys = template.system as unknown as NpcTemplateSys;
            const systemData = templateSys.generateAtThreat(this.#threatLevel, {
                isHorde: this.#isHorde,
            });

            const actorData = {
                name: template.name,
                type: 'npcV2',
                img: template.img ?? 'icons/svg/mystery-man.svg',
                system: systemData,
            };

            // eslint-disable-next-line no-restricted-syntax -- boundary: Actor.create params are untyped in Foundry V14; cast required to pass structured actorData
            const actor = (await Actor.create(actorData as unknown as Parameters<typeof Actor.create>[0])) as WH40KNPC | undefined;

            if (actor) {
                // Create embedded traits and talents
                // eslint-disable-next-line no-restricted-syntax -- boundary: createEmbeddedDocuments payload is an untyped Foundry API shape
                const itemsToCreate: Record<string, unknown>[] = [];

                /** Shape of Foundry documents returned by fromUuid for item embedding. */
                interface EmbeddableItem {
                    name: string;
                    type: string;
                    img: string;
                    system: object;
                }

                const traitUuids = (templateSys.traits ?? []).map((t) => t.uuid).filter((u): u is string => u !== undefined && u !== '');
                const talentUuids = (templateSys.talents ?? []).map((t) => t.uuid).filter((u): u is string => u !== undefined && u !== '');
                const allUuids = [...traitUuids, ...talentUuids];
                const resolvedItems = await Promise.all(allUuids.map(async (uuid) => (await fromUuid(uuid)) as EmbeddableItem | null));
                for (const item of resolvedItems) {
                    if (item) {
                        itemsToCreate.push({
                            name: item.name,
                            type: item.type,
                            img: item.img,
                            system: foundry.utils.deepClone(item.system),
                        });
                    }
                }

                if (itemsToCreate.length > 0) {
                    // eslint-disable-next-line no-restricted-syntax -- boundary: createEmbeddedDocuments params are untyped in Foundry V14
                    await actor.createEmbeddedDocuments('Item', itemsToCreate as unknown as Parameters<typeof actor.createEmbeddedDocuments<'Item'>>[1]);
                }

                // eslint-disable-next-line no-restricted-syntax -- boundary: i18n key to be added in a follow-up i18n pass
                ui.notifications.info(`Created NPC: ${actor.name}`);
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry V14 marks Document.sheet.render legacy in typedefs; minimal local interface mirrors the V2 runtime contract
                const actorSheet = (actor as unknown as { sheet?: { render(force: boolean): void } }).sheet;
                actorSheet?.render(true);

                this.#submitted = true;
                if (this.#resolve) this.#resolve(actor);
                await this.close();
            }
        } catch (err) {
            console.error('Failed to create NPC from template:', err);
            // eslint-disable-next-line no-restricted-syntax -- boundary: i18n key to be added in a follow-up i18n pass
            ui.notifications.error('Failed to create NPC from template');
        }
    }

    /**
     * Cancel and close.
     * @param {TemplateSelector} this
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async #onCancel(this: TemplateSelector, _event: PointerEvent, _target: HTMLElement): Promise<void> {
        this.#submitted = false;
        if (this.#resolve) this.#resolve(null);
        await this.close();
    }

    /* -------------------------------------------- */
    /*  Lifecycle                                   */
    /* -------------------------------------------- */

    /** @override */
    // eslint-disable-next-line no-restricted-syntax -- boundary: close/Record<string,unknown> is the ApplicationV2 override signature
    override async close(options: Record<string, unknown> = {}): Promise<unknown> {
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
     * @returns {Promise<WH40KNPC | null>} Created actor or null.
     */
    async wait(): Promise<WH40KNPC | null> {
        return new Promise((resolve) => {
            this.#resolve = resolve;
            void this.render(true);
        });
    }

    /**
     * Open the template selector.
     * @param {Partial<FilterState>} [options] - Options.
     * @returns {Promise<WH40KNPC | null>} Created actor or null.
     */
    static async open(options: Partial<FilterState> = {}): Promise<WH40KNPC | null> {
        const selector = new this();

        if (options.category !== undefined && options.category !== '') selector.#filters.category = options.category;
        if (options.faction !== undefined && options.faction !== '') selector.#filters.faction = options.faction;

        return selector.wait();
    }
}
