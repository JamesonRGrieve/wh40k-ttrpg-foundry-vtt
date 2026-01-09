/**
 * Rogue Trader Compendium Browser - ApplicationV2
 * Enhanced compendium browsing with filtering, searching, and type organization
 */

import ApplicationV2Mixin from "./api/application-v2-mixin.mjs";

const { ApplicationV2 } = foundry.applications.api;

/**
 * Compendium browser for browsing and filtering RT system compendiums.
 */
export class RTCompendiumBrowser extends ApplicationV2Mixin(ApplicationV2) {
    constructor(options = {}) {
        super(options);
        this._filters = {
            type: options.type || "all",
            search: "",
            source: "all",
            category: "all",
            groupBy: options.groupBy || "source"
        };
    }

    /* -------------------------------------------- */

    /** @override */
    static DEFAULT_OPTIONS = {
        id: "rt-compendium-browser",
        classes: ["rt-compendium-browser", "standard-form"],
        tag: "div",
        actions: {
            clearFilters: RTCompendiumBrowser.#clearFilters,
            openItem: RTCompendiumBrowser.#openItem
        },
        position: {
            width: 900,
            height: 700
        },
        window: {
            title: "RT Compendium Browser",
            resizable: true,
            minimizable: true
        }
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        browser: {
            template: "systems/rogue-trader/templates/applications/compendium-browser.hbs",
            scrollable: [".content"]
        }
    };

    /* -------------------------------------------- */

    /** @override */
    static TABS = [
        { id: "items", group: "primary", label: "Items" },
        { id: "actors", group: "primary", label: "Actors" }
    ];

    /* -------------------------------------------- */

    /** @override */
    tabGroups = {
        primary: "items"
    };

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @inheritDoc */
    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        
        const packs = game.packs.filter(p => p.metadata.system === "rogue-trader");
        
        context.tabs = {
            items: {
                label: "Items",
                packs: packs.filter(p => p.documentName === "Item"),
                icon: "fa-suitcase"
            },
            actors: {
                label: "Actors",
                packs: packs.filter(p => p.documentName === "Actor"),
                icon: "fa-users"
            }
        };

        context.sources = await this._getSources();
        context.categories = await this._getCategories();
        context.filters = this._filters;
        context.results = await this._getFilteredResults();
        context.groupByOptions = this._getGroupByOptions();
        context.groupedResults = this._groupResults(context.results);
        
        // Add armour-specific filters if filtering armour
        const hasArmour = context.results.some(r => r.type === "armour");
        if (hasArmour) {
            context.armourTypes = CONFIG.ROGUE_TRADER?.armourTypes || {};
            context.hasArmourFilters = true;
        }

        // Add armour modification filters if filtering armour mods
        const hasArmourMods = context.results.some(r => r.type === "armourModification");
        if (hasArmourMods) {
            context.hasArmourModFilters = true;
            context.armourTypesForMods = CONFIG.ROGUE_TRADER?.armourTypes || {};
        }

        return context;
    }

    /* -------------------------------------------- */
    /*  Event Listeners                             */
    /* -------------------------------------------- */

    /** @inheritDoc */
    async _onRender(context, options) {
        await super._onRender(context, options);

        // Set up event listeners
        this.element.querySelector(".search-input")?.addEventListener("input", this._onSearch.bind(this));
        this.element.querySelector(".filter-source")?.addEventListener("change", this._onFilterSource.bind(this));
        this.element.querySelector(".filter-category")?.addEventListener("change", this._onFilterCategory.bind(this));
        this.element.querySelector(".filter-group-by")?.addEventListener("change", this._onGroupBy.bind(this));
        
        // Armour-specific filters
        this.element.querySelector(".filter-armour-type")?.addEventListener("change", this._onFilterArmourType.bind(this));
        this.element.querySelector(".filter-min-ap")?.addEventListener("input", this._onFilterMinAP.bind(this));
        this.element.querySelector(".filter-coverage")?.addEventListener("change", this._onFilterCoverage.bind(this));

        // Armour modification filters
        this.element.querySelector(".filter-mod-type")?.addEventListener("change", this._onFilterModType.bind(this));
        this.element.querySelector(".filter-has-modifiers")?.addEventListener("change", this._onFilterHasModifiers.bind(this));
        this.element.querySelector(".filter-has-properties")?.addEventListener("change", this._onFilterHasProperties.bind(this));

        // Set up drag handlers for compendium items
        this.element.querySelectorAll(".compendium-item").forEach(el => {
            el.setAttribute("draggable", true);
            el.addEventListener("dragstart", this._onDragStart.bind(this));
            el.addEventListener("click", this._onItemClick.bind(this));
        });
    }

    /* -------------------------------------------- */
    /*  Data Methods                                */
    /* -------------------------------------------- */

    async _getSources() {
        const sources = new Set();
        const packs = game.packs.filter(p => p.metadata.system === "rogue-trader" && p.documentName === "Item");
        
        for (const pack of packs) {
            const index = await pack.getIndex({ fields: ["system.source"] });
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
                fields: [
                    'name', 'type', 'img', 
                    'system.source', 'system.category', 'flags',
                    // Armour-specific fields
                    'system.type', 'system.armourPoints', 'system.coverage', 
                    'system.maxAgility', 'system.properties',
                    // Armour modification fields
                    'system.restrictions.armourTypes', 'system.modifiers.armourPoints',
                    'system.modifiers.maxAgility', 'system.modifiers.weight',
                    'system.addedProperties', 'system.removedProperties'
                ] 
            });
            
            for (const entry of index) {
                if (!this._passesFilters(entry, pack)) continue;
                
                const sourceLabel = this._getEntrySource(entry);
                const categoryLabel = this._getEntryCategory(entry);
                
                const result = {
                    ...entry,
                    pack: pack.metadata.label,
                    packId: pack.metadata.id,
                    sourceLabel,
                    categoryLabel,
                    uuid: `Compendium.${pack.collection}.${entry._id}`
                };
                
                // Add armour-specific metadata
                if (entry.type === "armour" && entry.system) {
                    result.armourData = this._prepareArmourData(entry.system);
                }
                
                // Add armour modification metadata
                if (entry.type === "armourModification" && entry.system) {
                    result.armourModData = this._prepareArmourModData(entry.system);
                }
                
                // Add weapon quality metadata
                if (entry.type === "weaponQuality" && entry.system) {
                    result.qualityData = this._prepareQualityData(entry.system);
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
    _prepareArmourData(system) {
        const ap = system.armourPoints || {};
        const coverage = system.coverage || [];
        
        // Calculate AP summary
        const locations = ["head", "body", "leftArm", "rightArm", "leftLeg", "rightLeg"];
        const values = locations.map(loc => ap[loc] || 0);
        const allSame = values.every(v => v === values[0]);
        
        let apSummary;
        if (allSame && (coverage.includes("all") || coverage.length === 6)) {
            apSummary = `All: ${values[0]}`;
        } else {
            const abbrs = { head: "H", body: "B", leftArm: "LA", rightArm: "RA", leftLeg: "LL", rightLeg: "RL" };
            const nonZero = locations.filter(loc => (ap[loc] || 0) > 0);
            if (nonZero.length <= 3) {
                apSummary = nonZero.map(loc => `${abbrs[loc]}:${ap[loc]}`).join(" ");
            } else {
                apSummary = `${Math.min(...values)}-${Math.max(...values)} AP`;
            }
        }
        
        // Calculate coverage icons
        let coverageIcons;
        if (coverage.includes("all")) {
            coverageIcons = "●●●●●●";
        } else {
            const icons = [];
            icons.push(coverage.includes("head") ? "●" : "○");
            icons.push(coverage.includes("body") ? "●" : "○");
            icons.push(coverage.includes("leftArm") || coverage.includes("rightArm") ? "●" : "○");
            icons.push(coverage.includes("leftLeg") || coverage.includes("rightLeg") ? "●" : "○");
            coverageIcons = icons.join("");
        }
        
        // Get type label
        const typeKey = (system.type || "flak").split("-").map(s => s.capitalize()).join("");
        const typeLabel = game.i18n.localize(`RT.ArmourType.${typeKey}`);
        
        return {
            type: system.type,
            typeLabel,
            apSummary,
            coverageIcons,
            maxAP: Math.max(...values),
            minAP: Math.min(...values),
            maxAgility: system.maxAgility,
            properties: system.properties || []
        };
    }

    /**
     * Prepare armour modification-specific display data.
     * @param {object} system  The armour modification system data
     * @returns {object}       Prepared armour mod data
     */
    _prepareArmourModData(system) {
        const restrictions = system.restrictions || {};
        const modifiers = system.modifiers || {};
        
        // Restriction summary
        const armourTypes = restrictions.armourTypes || [];
        let restrictionLabel = game.i18n.localize("RT.Modification.AnyArmour");
        if (armourTypes.length && !armourTypes.includes('any')) {
            const labels = armourTypes.map(type => {
                const config = CONFIG.ROGUE_TRADER?.armourTypes?.[type];
                return config ? game.i18n.localize(config.label) : type;
            });
            restrictionLabel = labels.join(", ");
        }
        
        // Modifier badges
        const modifierBadges = [];
        if (modifiers.armourPoints !== undefined && modifiers.armourPoints !== 0) {
            modifierBadges.push({
                type: 'ap',
                label: `AP ${modifiers.armourPoints >= 0 ? '+' : ''}${modifiers.armourPoints}`,
                positive: modifiers.armourPoints > 0
            });
        }
        if (modifiers.maxAgility !== undefined && modifiers.maxAgility !== 0) {
            modifierBadges.push({
                type: 'agility',
                label: `Ag ${modifiers.maxAgility >= 0 ? '+' : ''}${modifiers.maxAgility}`,
                positive: modifiers.maxAgility > 0
            });
        }
        if (modifiers.weight !== undefined && modifiers.weight !== 0) {
            modifierBadges.push({
                type: 'weight',
                label: `${modifiers.weight >= 0 ? '+' : ''}${modifiers.weight}kg`,
                positive: modifiers.weight <= 0 // Lighter is better
            });
        }
        
        // Properties summary
        const addedCount = system.addedProperties?.length || 0;
        const removedCount = system.removedProperties?.length || 0;
        let propertiesSummary = "";
        if (addedCount || removedCount) {
            const parts = [];
            if (addedCount) parts.push(`+${addedCount}`);
            if (removedCount) parts.push(`-${removedCount}`);
            propertiesSummary = parts.join(" ") + " props";
        }
        
        return {
            restrictionLabel,
            modifierBadges,
            propertiesSummary,
            hasModifiers: modifierBadges.length > 0,
            hasProperties: addedCount + removedCount > 0
        };
    }

    /**
     * Prepare weapon quality display data.
     * @param {object} system  The weapon quality system data
     * @returns {object}       Prepared quality data
     */
    _prepareQualityData(system) {
        // Access CONFIG.rt (set during init hook)
        const rtConfig = CONFIG?.rt;
        
        if (!rtConfig) {
            console.warn("RT | CONFIG.rt not available in compendium browser");
            return {
                identifier: system.identifier || "",
                label: system.name || "Unknown Quality",
                description: ""
            };
        }
        
        // Try to get quality definition from CONFIG
        const identifier = system.identifier || "";
        const def = rtConfig.weaponQualities?.[identifier];
        
        // Get localized label
        let label;
        if (def) {
            label = game.i18n.localize(def.label);
        } else {
            // Fallback to system name
            label = system.name || "Unknown Quality";
        }
        
        // Get description (truncated for browser display)
        let description;
        if (def) {
            description = game.i18n.localize(def.description);
        } else if (system.effect) {
            // Legacy: system.effect might be HTML or page number
            if (typeof system.effect === 'string' && !system.effect.match(/^\d+$/)) {
                description = system.effect.replace(/<[^>]*>/g, ''); // Strip HTML
            } else {
                description = `See rulebook page ${system.effect}`;
            }
        } else {
            description = "No description available";
        }
        
        // Truncate description for list view
        const maxLength = 120;
        if (description.length > maxLength) {
            description = description.substring(0, maxLength) + '...';
        }
        
        // Check if quality has level parameter
        const hasLevel = def?.hasLevel || system.hasLevel || false;
        const level = system.level || null;
        
        return {
            identifier,
            label,
            description,
            hasLevel,
            level,
            effectText: system.effect
        };
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
        // Search filter
        if (this._filters.search) {
            const searchLower = this._filters.search.toLowerCase();
            if (!entry.name.toLowerCase().includes(searchLower)) return false;
        }
        
        // Source filter
        if (this._filters.source !== 'all') {
            if (this._getEntrySource(entry) !== this._filters.source) return false;
        }
        
        // Category filter
        if (this._filters.category !== "all") {
            if (this._getEntryCategory(entry) !== this._filters.category) return false;
        }
        
        // Armour-specific filters
        if (entry.type === "armour" && entry.system) {
            // Armour type filter
            if (this._filters.armourType && this._filters.armourType !== "all") {
                if (entry.system.type !== this._filters.armourType) return false;
            }
            
            // Minimum AP filter
            if (this._filters.minAP && this._filters.minAP > 0) {
                const ap = entry.system.armourPoints || {};
                const maxAP = Math.max(
                    ap.head || 0, ap.body || 0, 
                    ap.leftArm || 0, ap.rightArm || 0, 
                    ap.leftLeg || 0, ap.rightLeg || 0
                );
                if (maxAP < this._filters.minAP) return false;
            }
            
            // Coverage filter
            if (this._filters.coverage && this._filters.coverage !== "all") {
                const coverage = entry.system.coverage || [];
                if (this._filters.coverage === "full") {
                    if (!coverage.includes("all")) return false;
                } else if (this._filters.coverage === "partial") {
                    if (coverage.includes("all")) return false;
                }
            }
        }
        
        // Armour modification filters
        if (entry.type === "armourModification" && entry.system) {
            // Filter by applicable armour type
            if (this._filters.modType && this._filters.modType !== 'all') {
                const types = entry.system?.restrictions?.armourTypes || [];
                if (!types.includes('any') && !types.includes(this._filters.modType)) {
                    return false;
                }
            }
            
            // Filter by has modifiers
            if (this._filters.hasModifiers) {
                const mods = entry.system?.modifiers || {};
                const hasAny = (mods.armourPoints !== undefined && mods.armourPoints !== 0) || 
                              (mods.maxAgility !== undefined && mods.maxAgility !== 0) || 
                              (mods.weight !== undefined && mods.weight !== 0);
                if (!hasAny) return false;
            }
            
            // Filter by has properties
            if (this._filters.hasProperties) {
                const added = entry.system?.addedProperties?.length || 0;
                const removed = entry.system?.removedProperties?.length || 0;
                if (added === 0 && removed === 0) return false;
            }
        }
        
        return true;
    }

    /* -------------------------------------------- */
    /*  Instance Event Handlers                     */
    /* -------------------------------------------- */

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

    _onFilterArmourType(event) {
        this._filters.armourType = event.target.value;
        this.render();
    }

    _onFilterMinAP(event) {
        this._filters.minAP = parseInt(event.target.value) || 0;
        this.render();
    }

    _onFilterCoverage(event) {
        this._filters.coverage = event.target.value;
        this.render();
    }

    _onFilterModType(event) {
        this._filters.modType = event.target.value;
        this.render();
    }

    _onFilterHasModifiers(event) {
        this._filters.hasModifiers = event.target.checked;
        this.render();
    }

    _onFilterHasProperties(event) {
        this._filters.hasProperties = event.target.checked;
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
        event.dataTransfer.setData("text/plain", JSON.stringify({
            type: "Item",
            uuid: uuid
        }));
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
    static #clearFilters(event, target) {
        this._filters = { type: "all", search: "", source: "all", category: "all", groupBy: "source" };
        this.render();
    }

    /**
     * Handle opening an item from the browser.
     * @this {RTCompendiumBrowser}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #openItem(event, target) {
        const uuid = target.dataset.uuid;
        const doc = await fromUuid(uuid);
        if (doc) doc.sheet.render(true);
    }

    /* -------------------------------------------- */
    /*  Static Methods                              */
    /* -------------------------------------------- */

    /**
     * Open a new compendium browser instance.
     * @param {object} options  Options to pass to the browser.
     * @returns {RTCompendiumBrowser}
     */
    static open(options = {}) {
        return new RTCompendiumBrowser(options).render(true);
    }
}
