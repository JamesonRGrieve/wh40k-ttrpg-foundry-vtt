/**
 * Rogue Trader Compendium Browser
 * Enhanced compendium browsing with filtering, searching, and type organization
 */

export class RTCompendiumBrowser extends Application {
    constructor(options = {}) {
        super(options);
        this._filters = {
            type: options.type || 'all',
            search: '',
            source: 'all',
            category: 'all',
            groupBy: options.groupBy || 'source'
        };
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: 'rt-compendium-browser',
            classes: ['rt-compendium-browser'],
            template: 'systems/rogue-trader/templates/applications/compendium-browser.hbs',
            width: 900,
            height: 700,
            resizable: true,
            title: 'RT Compendium Browser',
            tabs: [{
                navSelector: '.tabs',
                contentSelector: '.content',
                initial: 'items'
            }]
        });
    }

    async getData() {
        const data = await super.getData();
        
        const packs = game.packs.filter(p => p.metadata.system === 'rogue-trader');
        
        data.tabs = {
            items: {
                label: 'Items',
                packs: packs.filter(p => p.documentName === 'Item'),
                icon: 'fa-suitcase'
            },
            actors: {
                label: 'Actors',
                packs: packs.filter(p => p.documentName === 'Actor'),
                icon: 'fa-users'
            }
        };

        data.sources = await this._getSources();
        data.categories = await this._getCategories();
        data.filters = this._filters;
        data.results = await this._getFilteredResults();
        data.groupByOptions = this._getGroupByOptions();
        data.groupedResults = this._groupResults(data.results);
        
        return data;
    }

    activateListeners(html) {
        super.activateListeners(html);
        html.find('.search-input').on('input', this._onSearch.bind(this));
        html.find('.filter-source').on('change', this._onFilterSource.bind(this));
        html.find('.filter-category').on('change', this._onFilterCategory.bind(this));
        html.find('.filter-group-by').on('change', this._onGroupBy.bind(this));
        html.find('.clear-filters').on('click', this._onClearFilters.bind(this));
        html.find('.compendium-item').on('click', this._onItemClick.bind(this));
        html.find('.compendium-item').on('dragstart', this._onDragStart.bind(this));
    }

    async _getSources() {
        const sources = new Set();
        const packs = game.packs.filter(p => p.metadata.system === 'rogue-trader' && p.documentName === 'Item');
        
        for (const pack of packs) {
            const index = await pack.getIndex({ fields: ['system.source'] });
            for (const entry of index) {
                const source = this._getEntrySource(entry);
                if (source) sources.add(source);
            }
        }
        
        return Array.from(sources).sort();
    }

    async _getCategories() {
        const categories = new Set();
        const packs = game.packs.filter(p => p.metadata.system === 'rogue-trader' && p.documentName === 'Item');
        
        for (const pack of packs) {
            const index = await pack.getIndex({ fields: ['system.category', 'flags'] });
            for (const entry of index) {
                const category = this._getEntryCategory(entry);
                if (category) categories.add(category);
            }
        }
        
        return Array.from(categories).sort();
    }

    async _getFilteredResults() {
        const results = [];
        const packs = game.packs.filter(p => p.metadata.system === 'rogue-trader');
        
        for (const pack of packs) {
            const index = await pack.getIndex({ 
                fields: ['name', 'type', 'img', 'system.source', 'system.category', 'flags'] 
            });
            
            for (const entry of index) {
                if (!this._passesFilters(entry, pack)) continue;
                const sourceLabel = this._getEntrySource(entry);
                const categoryLabel = this._getEntryCategory(entry);
                
                results.push({
                    ...entry,
                    pack: pack.metadata.label,
                    packId: pack.metadata.id,
                    sourceLabel,
                    categoryLabel,
                    uuid: `Compendium.${pack.collection}.${entry._id}`
                });
            }
        }
        
        results.sort((a, b) => a.name.localeCompare(b.name));
        return results;
    }

    _getGroupByOptions() {
        return [
            { value: 'source', label: 'Source' },
            { value: 'category', label: 'Category' },
            { value: 'type', label: 'Type' },
            { value: 'pack', label: 'Pack' }
        ];
    }

    _groupResults(results) {
        const groups = new Map();
        for (const entry of results) {
            const label = this._getGroupLabel(entry);
            if (!groups.has(label)) {
                groups.set(label, []);
            }
            groups.get(label).push(entry);
        }

        return Array.from(groups.entries())
            .sort(([labelA], [labelB]) => labelA.localeCompare(labelB))
            .map(([label, items]) => ({ label, items }));
    }

    _getGroupLabel(entry) {
        switch (this._filters.groupBy) {
            case 'pack':
                return entry.pack || 'Unknown Pack';
            case 'type':
                return entry.type || 'Unknown Type';
            case 'category':
                return entry.categoryLabel || 'Uncategorized';
            case 'source':
            default:
                return entry.sourceLabel || 'Unknown Source';
        }
    }

    _getEntrySource(entry) {
        const rawSource = entry.system?.source;
        if (!rawSource) return '';
        if (typeof rawSource === 'string') return rawSource;
        if (typeof rawSource === 'object') {
            return rawSource.book || rawSource.custom || '';
        }
        return '';
    }

    _getEntryCategory(entry) {
        if (entry.system?.category) return entry.system.category;
        if (entry.flags?.rt?.kind) return entry.flags.rt.kind;
        if (entry.type === 'skill' && entry.system?.skillType) {
            return entry.system.skillType;
        }
        return '';
    }

    _passesFilters(entry, pack) {
        if (this._filters.search) {
            const searchLower = this._filters.search.toLowerCase();
            if (!entry.name.toLowerCase().includes(searchLower)) return false;
        }
        
        if (this._filters.source !== 'all') {
            if (this._getEntrySource(entry) !== this._filters.source) return false;
        }
        
        if (this._filters.category !== 'all') {
            if (this._getEntryCategory(entry) !== this._filters.category) return false;
        }
        
        return true;
    }

    _onSearch(event) {
        this._filters.search = event.target.value;
        this.render();
    }

    _onFilterSource(event) {
        this._filters.source = event.target.value;
        this.render();
    }

    _onFilterCategory(event) {
        this._filters.category = event.target.value;
        this.render();
    }

    _onGroupBy(event) {
        this._filters.groupBy = event.target.value;
        this.render();
    }

    _onClearFilters() {
        this._filters = { type: 'all', search: '', source: 'all', category: 'all', groupBy: 'source' };
        this.render();
    }

    async _onItemClick(event) {
        event.preventDefault();
        const uuid = event.currentTarget.dataset.uuid;
        const doc = await fromUuid(uuid);
        if (doc) doc.sheet.render(true);
    }

    _onDragStart(event) {
        const uuid = event.currentTarget.dataset.uuid;
        event.dataTransfer.setData('text/plain', JSON.stringify({
            type: 'Item',
            uuid: uuid
        }));
    }

    static open(options = {}) {
        return new RTCompendiumBrowser(options).render(true);
    }
}
