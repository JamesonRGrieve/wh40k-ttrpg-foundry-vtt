/**
 * WH40K RPG Compendium Browser - ApplicationV2
 * Enhanced compendium browsing with filtering, searching, and type organization
 */

import type { ApplicationV2Ctor } from './api/application-types.ts';
import ApplicationV2Mixin from './api/application-v2-mixin.ts';

/** A single result entry in the compendium browser list. */
interface BrowserResult extends CompendiumIndexEntry {
    pack: string;
    packId: string;
    sourceLabel: string;
    categoryLabel: string;
    uuid: string;
    system?: Record<string, unknown>;
    flags?: Record<string, unknown>;
    armourData?: Record<string, unknown>;
    armourModData?: Record<string, unknown>;
    qualityData?: Record<string, unknown>;
}

/** Minimal document interface returned by {@link fromUuid}. */
interface FoundryDocWithSheet {
    sheet: { render(force: boolean): void };
}

const { ApplicationV2 } = foundry.applications.api;

/**
 * Compendium browser for browsing and filtering WH40K system compendiums.
 */
export class RTCompendiumBrowser extends ApplicationV2Mixin(ApplicationV2 as unknown as ApplicationV2Ctor) {
    declare _filters: {
        type: string;
        search: string;
        source: string;
        category: string;
        groupBy: string;
        armourType?: string;
        minAP?: number;
        coverage?: string;
        modType?: string;
        hasModifiers?: boolean;
        hasProperties?: boolean;
    };

    constructor(options: Record<string, unknown> = {}) {
        super(options);
        this._filters = {
            type: (options['type'] as string) || 'all',
            search: '',
            source: 'all',
            category: 'all',
            groupBy: (options['groupBy'] as string) || 'source',
        };
    }

    /* -------------------------------------------- */

    /** @override */
    static override DEFAULT_OPTIONS = {
        id: 'wh40k-compendium-browser',
        classes: ['wh40k-rpg', 'wh40k-compendium-browser', 'standard-form'],
        tag: 'div',
        actions: {
            clearFilters: RTCompendiumBrowser.#clearFilters,
            openItem: RTCompendiumBrowser.#openItem,
        },
        position: {
            width: 900,
            height: 700,
        },
        window: {
            title: 'WH40K Compendium Browser',
            resizable: true,
            minimizable: true,
        },
    } as ApplicationV2Config.DefaultOptions;

    /* -------------------------------------------- */

    /** @override */
    static override PARTS = {
        browser: {
            template: 'systems/wh40k-rpg/templates/applications/compendium-browser.hbs',
            scrollable: ['.content'],
        },
    } as Record<string, ApplicationV2Config.PartConfiguration>;

    /* -------------------------------------------- */

    /** @override */
    static TABS = {
        primary: {
            tabs: {
                items: { tab: 'items', group: 'primary', label: 'Items' },
                actors: { tab: 'actors', group: 'primary', label: 'Actors' },
            },
        },
    };

    /* -------------------------------------------- */

    /** @override */
    declare tabGroups: HandlebarsApplicationV14.TabGroupsState;

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @inheritDoc */
    override async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<Record<string, unknown>> {
        const context = await super._prepareContext(options);

        const packs = game.packs.filter((p) => p.metadata.system === 'wh40k-rpg');

        context['tabs'] = {
            items: {
                label: 'Items',
                packs: packs.filter((p) => p.documentName === 'Item'),
                icon: 'fa-suitcase',
            },
            actors: {
                label: 'Actors',
                packs: packs.filter((p) => p.documentName === 'Actor'),
                icon: 'fa-users',
            },
        };

        context['sources'] = await this._getSources();
        context['categories'] = await this._getCategories();
        context['filters'] = this._filters;
        const results = await this._getFilteredResults();
        context['results'] = results;
        context['groupByOptions'] = this._getGroupByOptions();
        context['groupedResults'] = this._groupResults(results);

        // Add armour-specific filters if filtering armour
        const hasArmour = results.some((r) => r.type === 'armour');
        if (hasArmour) {
            context['armourTypes'] = (CONFIG.WH40K as unknown as Record<string, unknown> | undefined)?.['armourTypes'] ?? {};
            context['hasArmourFilters'] = true;
        }

        // Add armour modification filters if filtering armour mods
        const hasArmourMods = results.some((r) => r.type === 'armourModification');
        if (hasArmourMods) {
            context['hasArmourModFilters'] = true;
            context['armourTypesForMods'] = (CONFIG.WH40K as unknown as Record<string, unknown> | undefined)?.['armourTypes'] ?? {};
        }

        return context;
    }

    /* -------------------------------------------- */
    /*  Event Listeners                             */
    /* -------------------------------------------- */

    /** @inheritDoc */
    override async _onRender(context: Record<string, unknown>, options: ApplicationV2Config.RenderOptions): Promise<void> {
        await super._onRender(context, options);

        // Set up event listeners
        this.element.querySelector<HTMLInputElement>('.search-input')?.addEventListener('input', (e) => this._onSearch(e as InputEvent));
        this.element.querySelector<HTMLSelectElement>('.filter-source')?.addEventListener('change', (e) => this._onFilterSource(e));
        this.element.querySelector<HTMLSelectElement>('.filter-category')?.addEventListener('change', (e) => this._onFilterCategory(e));
        this.element.querySelector<HTMLSelectElement>('.filter-group-by')?.addEventListener('change', (e) => this._onGroupBy(e));

        // Armour-specific filters
        this.element.querySelector<HTMLSelectElement>('.filter-armour-type')?.addEventListener('change', (e) => this._onFilterArmourType(e));
        this.element.querySelector<HTMLInputElement>('.filter-min-ap')?.addEventListener('input', (e) => this._onFilterMinAP(e));
        this.element.querySelector<HTMLSelectElement>('.filter-coverage')?.addEventListener('change', (e) => this._onFilterCoverage(e));

        // Armour modification filters
        this.element.querySelector<HTMLSelectElement>('.filter-mod-type')?.addEventListener('change', (e) => this._onFilterModType(e));
        this.element.querySelector<HTMLInputElement>('.filter-has-modifiers')?.addEventListener('change', (e) => this._onFilterHasModifiers(e));
        this.element.querySelector<HTMLInputElement>('.filter-has-properties')?.addEventListener('change', (e) => this._onFilterHasProperties(e));

        // Set up drag handlers for compendium items
        this.element.querySelectorAll('.compendium-item').forEach((el) => {
            const hEl = el as HTMLElement;
            hEl.setAttribute('draggable', 'true');
            hEl.addEventListener('dragstart', this._onDragStart.bind(this));
            hEl.addEventListener('click', (e) => {
                void this._onItemClick(e);
            });
        });
    }

    /* -------------------------------------------- */
    /*  Data Methods                                */
    /* -------------------------------------------- */

    async _getSources(): Promise<unknown> {
        const sources = new Set();
        const packs = game.packs.filter((p) => p.metadata.system === 'wh40k-rpg' && p.documentName === 'Item');

        for (const pack of packs) {
            const index = await pack.getIndex({ fields: ['system.source'] });
            for (const entry of index) {
                const source = this._getEntrySource(entry as unknown as CompendiumIndexEntry & { system?: Record<string, unknown> });
                if (source) sources.add(source);
            }
        }

        return Array.from(sources).sort();
    }

    async _getCategories(): Promise<unknown> {
        const categories = new Set();
        const packs = game.packs.filter((p) => p.metadata.system === 'wh40k-rpg' && p.documentName === 'Item');

        for (const pack of packs) {
            const index = await pack.getIndex({ fields: ['system.category', 'flags'] });
            for (const entry of index) {
                const category = this._getEntryCategory(
                    entry as unknown as CompendiumIndexEntry & { system?: Record<string, unknown>; flags?: Record<string, unknown> },
                );
                if (category) categories.add(category);
            }
        }

        return Array.from(categories).sort();
    }

    async _getFilteredResults(): Promise<BrowserResult[]> {
        const results: BrowserResult[] = [];
        const packs = game.packs.filter((p) => p.metadata.system === 'wh40k-rpg');

        for (const pack of packs) {
            const index = await pack.getIndex({
                fields: [
                    'name',
                    'type',
                    'img',
                    'system.source',
                    'system.category',
                    'flags',
                    // Armour-specific fields
                    'system.type',
                    'system.armourPoints',
                    'system.coverage',
                    'system.maxAgility',
                    'system.properties',
                    // Armour modification fields
                    'system.restrictions.armourTypes',
                    'system.modifiers.armourPoints',
                    'system.modifiers.maxAgility',
                    'system.modifiers.weight',
                    'system.addedProperties',
                    'system.removedProperties',
                ],
            });

            for (const entry of index) {
                const e = entry as CompendiumIndexEntry & { system?: Record<string, unknown>; flags?: Record<string, unknown> };
                if (!this._passesFilters(e, pack as unknown as CompendiumPack)) continue;

                const sourceLabel = this._getEntrySource(e);
                const categoryLabel = this._getEntryCategory(e);

                const result: BrowserResult = {
                    ...e,
                    pack: pack.metadata.label,
                    packId: pack.metadata.id,
                    sourceLabel,
                    categoryLabel,
                    uuid: `Compendium.${pack.metadata.id}.${e._id}`,
                };

                // Add armour-specific metadata
                if (e.type === 'armour' && e.system) {
                    result.armourData = this._prepareArmourData(e.system);
                }

                // Add armour modification metadata
                if (e.type === 'armourModification' && e.system) {
                    result.armourModData = this._prepareArmourModData(e.system);
                }

                // Add weapon quality metadata
                if (e.type === 'weaponQuality' && e.system) {
                    result.qualityData = this._prepareQualityData(e.system);
                }

                results.push(result);
            }
        }

        results.sort((a, b) => a.name.localeCompare(b.name));
        return results;
    }

    /**
     * Prepare armour-specific display data.
     * @param {object} system  The armour system data
     * @returns {object}       Prepared armour data
     */
    _prepareArmourData(system: Record<string, unknown>): Record<string, unknown> {
        const ap = (system['armourPoints'] ?? {}) as Record<string, number>;
        const coverage = (system['coverage'] ?? []) as string[];

        // Calculate AP summary
        const locations: Array<'head' | 'body' | 'leftArm' | 'rightArm' | 'leftLeg' | 'rightLeg'> = [
            'head',
            'body',
            'leftArm',
            'rightArm',
            'leftLeg',
            'rightLeg',
        ];
        const values = locations.map((loc) => ap[loc] || 0);
        const allSame = values.every((v) => v === values[0]);

        let apSummary;
        if (allSame && (coverage.includes('all') || coverage.length === 6)) {
            apSummary = `All: ${values[0]}`;
        } else {
            const abbrs: Record<'head' | 'body' | 'leftArm' | 'rightArm' | 'leftLeg' | 'rightLeg', string> = {
                head: 'H',
                body: 'B',
                leftArm: 'LA',
                rightArm: 'RA',
                leftLeg: 'LL',
                rightLeg: 'RL',
            };
            const nonZero = locations.filter((loc) => (ap[loc] || 0) > 0);
            if (nonZero.length <= 3) {
                apSummary = nonZero.map((loc) => `${abbrs[loc]}:${ap[loc]}`).join(' ');
            } else {
                apSummary = `${Math.min(...values)}-${Math.max(...values)} AP`;
            }
        }

        // Calculate coverage icons
        let coverageIcons;
        if (coverage.includes('all')) {
            coverageIcons = '●●●●●●';
        } else {
            const icons = [];
            icons.push(coverage.includes('head') ? '●' : '○');
            icons.push(coverage.includes('body') ? '●' : '○');
            icons.push(coverage.includes('leftArm') || coverage.includes('rightArm') ? '●' : '○');
            icons.push(coverage.includes('leftLeg') || coverage.includes('rightLeg') ? '●' : '○');
            coverageIcons = icons.join('');
        }

        // Get type label — system.type is unknown, coerce to string safely
        const typeKey = (typeof system['type'] === 'string' ? system['type'] : 'flak')
            .split('-')
            .map((s: string) => s.capitalize())
            .join('');
        const typeLabel = game.i18n.localize(`WH40K.ArmourType.${typeKey}`);

        return {
            type: system['type'],
            typeLabel,
            apSummary,
            coverageIcons,
            maxAP: Math.max(...values),
            minAP: Math.min(...values),
            maxAgility: system['maxAgility'],
            properties: system['properties'] ?? [],
        };
    }

    /**
     * Prepare armour modification-specific display data.
     * @param {object} system  The armour modification system data
     * @returns {object}       Prepared armour mod data
     */
    _prepareArmourModData(system: Record<string, unknown>): Record<string, unknown> {
        const restrictions = (system['restrictions'] ?? {}) as { armourTypes?: string[] };
        const modifiers = (system['modifiers'] ?? {}) as { armourPoints?: number; maxAgility?: number; weight?: number };

        // Restriction summary
        const armourTypes = restrictions.armourTypes ?? [];
        let restrictionLabel = game.i18n.localize('WH40K.Modification.AnyArmour');
        if (armourTypes.length > 0 && !armourTypes.includes('any')) {
            interface ArmourTypeConfig {
                label: string;
            }
            const wh40kArmourTypes = (CONFIG.WH40K as unknown as Record<string, Record<string, ArmourTypeConfig>> | undefined)?.['armourTypes'];
            const labels = armourTypes.map((type: string) => {
                const config = wh40kArmourTypes?.[type];
                return config !== undefined ? game.i18n.localize(config.label) : type;
            });
            restrictionLabel = labels.join(', ');
        }

        // Modifier badges
        const modifierBadges = [];
        if (modifiers.armourPoints !== undefined && modifiers.armourPoints !== 0) {
            modifierBadges.push({
                type: 'ap',
                label: `AP ${modifiers.armourPoints >= 0 ? '+' : ''}${modifiers.armourPoints}`,
                positive: modifiers.armourPoints > 0,
            });
        }
        if (modifiers.maxAgility !== undefined && modifiers.maxAgility !== 0) {
            modifierBadges.push({
                type: 'agility',
                label: `Ag ${modifiers.maxAgility >= 0 ? '+' : ''}${modifiers.maxAgility}`,
                positive: modifiers.maxAgility > 0,
            });
        }
        if (modifiers.weight !== undefined && modifiers.weight !== 0) {
            modifierBadges.push({
                type: 'weight',
                label: `${modifiers.weight >= 0 ? '+' : ''}${modifiers.weight}kg`,
                positive: modifiers.weight <= 0, // Lighter is better
            });
        }

        // Properties summary
        const addedCount = (system['addedProperties'] as unknown[] | undefined)?.length ?? 0;
        const removedCount = (system['removedProperties'] as unknown[] | undefined)?.length ?? 0;
        let propertiesSummary = '';
        if (addedCount > 0 || removedCount > 0) {
            const parts = [];
            if (addedCount > 0) parts.push(`+${addedCount}`);
            if (removedCount > 0) parts.push(`-${removedCount}`);
            propertiesSummary = `${parts.join(' ')} props`;
        }

        return {
            restrictionLabel,
            modifierBadges,
            propertiesSummary,
            hasModifiers: modifierBadges.length > 0,
            hasProperties: addedCount + removedCount > 0,
        };
    }

    /**
     * Prepare weapon quality display data.
     * @param {object} system  The weapon quality system data
     * @returns {object}       Prepared quality data
     */
    _prepareQualityData(system: Record<string, unknown>): Record<string, unknown> {
        interface QualityDef {
            label: string;
            description: string;
            hasLevel?: boolean;
        }
        interface WH40KConfigShape {
            weaponQualities?: Record<string, QualityDef>;
            armourTypes?: Record<string, { label: string }>;
        }
        // Access CONFIG.WH40K (set during init hook)
        const wh40kConfig = CONFIG.WH40K as unknown as WH40KConfigShape | undefined;

        if (wh40kConfig === undefined) {
            console.warn('WH40K | CONFIG.WH40K not available in compendium browser');
            return {
                identifier: system['identifier'] ?? '',
                label: system['name'] ?? 'Unknown Quality',
                description: '',
            };
        }

        // Try to get quality definition from CONFIG
        const identifier = typeof system['identifier'] === 'string' ? system['identifier'] : '';
        const def: QualityDef | undefined = wh40kConfig.weaponQualities?.[identifier];

        // Get localized label
        let label: unknown;
        if (def !== undefined) {
            label = game.i18n.localize(def.label);
        } else {
            // Fallback to system name
            label = system['name'] ?? 'Unknown Quality';
        }

        // Get description (truncated for browser display)
        let description: string;
        if (def !== undefined) {
            description = game.i18n.localize(def.description);
        } else if (typeof system['effect'] === 'string' && system['effect'] !== '') {
            // Legacy: system.effect might be HTML or page number
            const effectStr = system['effect'] as string;
            if (!effectStr.match(/^\d+$/)) {
                description = effectStr.replace(/<[^>]*>/g, ''); // Strip HTML
            } else {
                description = `See rulebook page ${effectStr}`;
            }
        } else {
            description = 'No description available';
        }

        // Truncate description for list view
        const maxLength = 120;
        if (description.length > maxLength) {
            description = `${description.substring(0, maxLength)}...`;
        }

        // Check if quality has level parameter
        const hasLevel = def?.hasLevel === true || system['hasLevel'] === true;
        const level = system['level'] ?? null;

        return {
            identifier,
            label,
            description,
            hasLevel,
            level,
            effectText: system['effect'],
        };
    }

    _getGroupByOptions(): Record<string, unknown>[] {
        return [
            { value: 'source', label: 'Source' },
            { value: 'category', label: 'Category' },
            { value: 'type', label: 'Type' },
            { value: 'pack', label: 'Pack' },
        ];
    }

    _groupResults(results: BrowserResult[]): { label: string; items: BrowserResult[] }[] {
        const groups = new Map<string, BrowserResult[]>();
        for (const entry of results) {
            const label = this._getGroupLabel(entry);
            if (!groups.has(label)) {
                groups.set(label, []);
            }
            const groupItems = groups.get(label);
            if (groupItems !== undefined) groupItems.push(entry);
        }

        return Array.from(groups.entries())
            .sort(([labelA], [labelB]) => labelA.localeCompare(labelB))
            .map(([label, items]) => ({ label, items }));
    }

    _getGroupLabel(entry: BrowserResult): string {
        switch (this._filters.groupBy) {
            case 'pack':
                return entry.pack !== '' ? entry.pack : 'Unknown Pack';
            case 'type':
                return entry.type !== undefined && entry.type !== '' ? entry.type : 'Unknown Type';
            case 'category':
                return entry.categoryLabel !== '' ? entry.categoryLabel : 'Uncategorized';
            case 'source':
            default:
                return entry.sourceLabel !== '' ? entry.sourceLabel : 'Unknown Source';
        }
    }

    _getEntrySource(entry: CompendiumIndexEntry & { system?: Record<string, unknown> }): string {
        const rawSource = entry.system?.['source'];
        if (rawSource === undefined || rawSource === null) return '';
        if (typeof rawSource === 'string') return rawSource;
        if (typeof rawSource === 'object') {
            const src = rawSource as Record<string, unknown>;
            const val = src['book'] ?? src['custom'];
            return typeof val === 'string' ? val : '';
        }
        return '';
    }

    _getEntryCategory(entry: CompendiumIndexEntry & { system?: Record<string, unknown>; flags?: Record<string, unknown> }): string {
        const category = entry.system?.['category'];
        if (typeof category === 'string' && category !== '') return category;
        const flags = entry.flags as Record<string, Record<string, unknown>> | undefined;
        if (flags?.['rt']?.['kind'] !== undefined) {
            const kind = flags['wh40k']?.['kind'];
            return typeof kind === 'string' ? kind : '';
        }
        const skillType = entry.system?.['skillType'];
        if (entry.type === 'skill' && typeof skillType === 'string' && skillType !== '') {
            return skillType;
        }
        return '';
    }

    _passesFilters(entry: CompendiumIndexEntry & { system?: Record<string, unknown>; flags?: Record<string, unknown> }, pack: CompendiumPack): boolean {
        // Search filter
        if (this._filters.search !== '') {
            const searchLower = this._filters.search.toLowerCase();
            if (!entry.name.toLowerCase().includes(searchLower)) return false;
        }

        // Source filter
        if (this._filters.source !== 'all') {
            if (this._getEntrySource(entry) !== this._filters.source) return false;
        }

        // Category filter
        if (this._filters.category !== 'all') {
            if (this._getEntryCategory(entry) !== this._filters.category) return false;
        }

        // Armour-specific filters
        if (entry.type === 'armour' && entry.system !== undefined) {
            // Armour type filter
            if (this._filters.armourType !== undefined && this._filters.armourType !== 'all') {
                if (entry.system['type'] !== this._filters.armourType) return false;
            }

            // Minimum AP filter
            if (this._filters.minAP !== undefined && this._filters.minAP > 0) {
                const ap = (entry.system['armourPoints'] ?? {}) as Record<string, number>;
                const maxAP = Math.max(ap['head'] || 0, ap['body'] || 0, ap['leftArm'] || 0, ap['rightArm'] || 0, ap['leftLeg'] || 0, ap['rightLeg'] || 0);
                if (maxAP < this._filters.minAP) return false;
            }

            // Coverage filter
            if (this._filters.coverage !== undefined && this._filters.coverage !== 'all') {
                const coverage = (entry.system['coverage'] ?? []) as string[];
                if (this._filters.coverage === 'full') {
                    if (!coverage.includes('all')) return false;
                } else if (this._filters.coverage === 'partial') {
                    if (coverage.includes('all')) return false;
                }
            }
        }

        // Armour modification filters
        if (entry.type === 'armourModification' && entry.system !== undefined) {
            // Filter by applicable armour type
            if (this._filters.modType !== undefined && this._filters.modType !== 'all') {
                const restrictions = (entry.system['restrictions'] ?? {}) as { armourTypes?: string[] };
                const types = restrictions.armourTypes ?? [];
                if (!types.includes('any') && !types.includes(this._filters.modType)) {
                    return false;
                }
            }

            // Filter by has modifiers
            if (this._filters.hasModifiers === true) {
                const mods = (entry.system['modifiers'] ?? {}) as { armourPoints?: number; maxAgility?: number; weight?: number };
                const hasAny =
                    (mods.armourPoints !== undefined && mods.armourPoints !== 0) ||
                    (mods.maxAgility !== undefined && mods.maxAgility !== 0) ||
                    (mods.weight !== undefined && mods.weight !== 0);
                if (!hasAny) return false;
            }

            // Filter by has properties
            if (this._filters.hasProperties === true) {
                const added = (entry.system['addedProperties'] as unknown[] | undefined)?.length ?? 0;
                const removed = (entry.system['removedProperties'] as unknown[] | undefined)?.length ?? 0;
                if (added === 0 && removed === 0) return false;
            }
        }

        return true;
    }

    /* -------------------------------------------- */
    /*  Instance Event Handlers                     */
    /* -------------------------------------------- */

    _onSearch(event: InputEvent): void {
        this._filters.search = (event.target as HTMLInputElement).value;
        void this.render();
    }

    _onFilterSource(event: Event): void {
        this._filters.source = (event.target as HTMLSelectElement).value;
        void this.render();
    }

    _onFilterCategory(event: Event): void {
        this._filters.category = (event.target as HTMLSelectElement).value;
        void this.render();
    }

    _onGroupBy(event: Event): void {
        this._filters.groupBy = (event.target as HTMLSelectElement).value;
        void this.render();
    }

    _onFilterArmourType(event: Event): void {
        this._filters.armourType = (event.target as HTMLSelectElement).value;
        void this.render();
    }

    _onFilterMinAP(event: Event): void {
        this._filters.minAP = parseInt((event.target as HTMLInputElement).value) || 0;
        void this.render();
    }

    _onFilterCoverage(event: Event): void {
        this._filters.coverage = (event.target as HTMLSelectElement).value;
        void this.render();
    }

    _onFilterModType(event: Event): void {
        this._filters.modType = (event.target as HTMLSelectElement).value;
        void this.render();
    }

    _onFilterHasModifiers(event: Event): void {
        this._filters.hasModifiers = (event.target as HTMLInputElement).checked;
        void this.render();
    }

    _onFilterHasProperties(event: Event): void {
        this._filters.hasProperties = (event.target as HTMLInputElement).checked;
        void this.render();
    }

    async _onItemClick(event: PointerEvent): Promise<void> {
        event.preventDefault();
        const uuid = (event.currentTarget as HTMLElement).dataset['uuid'];
        if (uuid === undefined) return;
        const doc = await fromUuid(uuid);
        if (doc !== null) (doc as unknown as FoundryDocWithSheet).sheet.render(true);
    }

    _onDragStart(event: DragEvent): void {
        const uuid = (event.currentTarget as HTMLElement).dataset['uuid'];
        if (uuid === undefined || event.dataTransfer === null) return;
        event.dataTransfer.setData(
            'text/plain',
            JSON.stringify({
                type: 'Item',
                uuid: uuid,
            }),
        );
    }

    /* -------------------------------------------- */
    /*  Static Action Handlers                      */
    /* -------------------------------------------- */

    /**
     * Handle clearing all filters.
     * @this {RTCompendiumBrowser}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static #clearFilters(this: RTCompendiumBrowser, event: Event, target: HTMLElement): void {
        this._filters = { type: 'all', search: '', source: 'all', category: 'all', groupBy: 'source' };
        void this.render();
    }

    /**
     * Handle opening an item from the browser.
     * @this {RTCompendiumBrowser}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #openItem(event: Event, target: HTMLElement): Promise<void> {
        const uuid = target.dataset['uuid'];
        if (uuid === undefined) return;
        const doc = await fromUuid(uuid);
        if (doc !== null) (doc as unknown as FoundryDocWithSheet).sheet.render(true);
    }

    /* -------------------------------------------- */
    /*  Static Methods                              */
    /* -------------------------------------------- */

    /**
     * Open a new compendium browser instance.
     * @param {object} options  Options to pass to the browser.
     * @returns {RTCompendiumBrowser}
     */
    static open(options: Record<string, unknown> = {}): RTCompendiumBrowser {
        const browser = new RTCompendiumBrowser(options);
        void browser.render(true);
        return browser;
    }
}
